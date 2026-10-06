import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const sourceRoot = process.argv[2]
const outputRoot = process.argv[3] || 'publish-root'
if (!sourceRoot) throw new Error('Usage: node scripts/import-math-chapters-3-5.mjs <extracted-folder> [output-root]')
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => { const full = path.join(dir, entry.name); return entry.isDirectory() ? walk(full) : [full] })
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const seen = new Set(), groups = new Map()
let parsedFiles = 0, emptyFiles = 0, invalidFiles = 0, duplicateQuestions = 0, unmappedQuestions = 0

const chapterOf = file => file.includes(`${path.sep}3   رياضيات${path.sep}`) ? 3 : file.includes(`${path.sep}رياضيات 4${path.sep}`) ? 4 : file.match(new RegExp(`\\${path.sep}5\\${path.sep}`)) ? 5 : null
const topicOf = (chapter, file, question) => {
  const text = `${path.basename(file)} ${question.question_text || ''} ${(question.interactive_steps || []).map(step => `${step.step_explanation || ''} ${step.related_topics || ''}`).join(' ')}`.toLowerCase()
  if (chapter === 3) {
    if (/رول|القيمة المتوسطة|mean.value|mvt/.test(text)) return 1
    if (/معدل|معدلات|rate|related/.test(text) && !/عظمى|صغرى/.test(text)) return 0
    return 2
  }
  if (chapter === 4) {
    if (/مساح|حجم|حجوم|دوران|area|volume/.test(text)) return 2
    if (/محدد|حدود|ريمان|riemann|definite|unknown.limits/.test(text)) return 0
    return 1
  }
  if (/فصل المتغيرات|قابلة للفصل|separable|مرتبة أولى/.test(text)) return 1
  return 0
}
const fallbackPage = file => Number(path.basename(file).match(/(?:page_|صفحة_|_p)(\d+)/i)?.[1] || 0) || null

for (const file of walk(sourceRoot)) {
  const chapter = chapterOf(file)
  if (!chapter) continue
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); parsedFiles += 1 } catch { invalidFiles += 1; continue }
  const records = Array.isArray(parsed) ? parsed : [parsed]
  const questions = records.flatMap(record => Array.isArray(record?.questions) ? record.questions : record?.interactive_steps ? [record] : [])
  if (!questions.length) { emptyFiles += 1; continue }
  for (const question of questions) {
    if (!Array.isArray(question?.interactive_steps) || !question.interactive_steps.length) continue
    const fingerprint = hash(question)
    if (seen.has(fingerprint)) { duplicateQuestions += 1; continue }
    seen.add(fingerprint)
    const page = Number(question.page_number || parsed.page_number || fallbackPage(file))
    if (!page) { unmappedQuestions += 1; continue }
    const topic = topicOf(chapter, file, question), key = `${chapter}:${topic}:${page}`
    if (!groups.has(key)) groups.set(key, { chapter, topic, page, questions: [] })
    const questionIndex = groups.get(key).questions.length + 1
    const questionKey = `${chapter}_${topic}_${page}_${questionIndex}`
    const steps = question.interactive_steps.map((step, stepIndex) => {
      const inputs = (step.inputs || []).map((input, inputIndex) => ({ id: `q_${questionKey}_s${stepIndex + 1}_i${inputIndex + 1}`, correct_value: String(input.correct_answer ?? ''), label: `القيمة ${inputIndex + 1}`, allowed_keys: (input.options || [input.correct_answer]).map(String), hint: step.hint || 'راجع شرح الخطوة ثم حاول مرة أخرى.' }))
      let structure = String(step.equation_template || '')
      inputs.forEach((input, inputIndex) => { structure = structure.replaceAll(`{input_${inputIndex + 1}}`, `{${input.id}}`) })
      return { step_id: `math_${questionKey}_step_${stepIndex + 1}`, title: `الخطوة ${step.step_number || stepIndex + 1}`, explanation: step.step_explanation || '', think: step.hint || '', html_structure: structure, inputs }
    })
    groups.get(key).questions.push({ title: question.question_text || `سؤال ${question.question_number || ''}`, steps, model_solution: question.full_model_solution || '', number: question.question_number || questionIndex, page_number: page, image_url: question.image_url || null })
  }
}

const curriculumPath = path.join(outputRoot, 'curriculum.json')
const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'))
for (const chapterNumber of [3, 4, 5]) {
  const chapter = curriculum.find(item => item.id === `ch${chapterNumber}`)
  if (!chapter) continue
  chapter.topics.forEach(topic => { topic.files = [] })
  const chapterGroups = [...groups.values()].filter(group => group.chapter === chapterNumber).sort((a, b) => a.topic - b.topic || a.page - b.page)
  for (const group of chapterGroups) {
    const file = `page_${group.page}_ch${chapterNumber}_t${group.topic + 1}.json`
    fs.writeFileSync(path.join(outputRoot, 'data', file), JSON.stringify(group.questions, null, 2))
    chapter.topics[group.topic].files.push(file)
  }
}
fs.writeFileSync(curriculumPath, JSON.stringify(curriculum, null, 2))
console.log(JSON.stringify({ parsedFiles, emptyFiles, invalidFiles, duplicateQuestions, unmappedQuestions, exportedPages: groups.size, questions: seen.size - unmappedQuestions, chapters: curriculum.filter(item => ['ch3','ch4','ch5'].includes(item.id)).map(chapter => ({ id: chapter.id, topics: chapter.topics.map(topic => ({ name: topic.name, pages: topic.files.length })) })) }, null, 2))
