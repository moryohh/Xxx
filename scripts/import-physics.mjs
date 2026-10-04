import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const sourceRoot = process.argv[2]
const outputRoot = process.argv[3] || 'publish-root'
if (!sourceRoot) throw new Error('Usage: node scripts/import-physics.mjs <extracted-folder> [output-root]')
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => { const full = path.join(dir, entry.name); return entry.isDirectory() ? walk(full) : [full] })
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const arabicNumber = number => String(number).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])
const lessons = new Map(), seenQuestions = new Set()
let parsedFiles = 0, emptyFiles = 0, invalidFiles = 0, unmappedQuestions = 0

const addQuestion = (lessonId, question) => {
  const chapterMatch = String(lessonId || '').match(/_ch(\d+)/i), lessonMatch = String(lessonId || '').match(/_(?:segment|lesson)(\d+)/i)
  if (!chapterMatch || !lessonMatch) { unmappedQuestions += 1; return }
  if (!Array.isArray(question?.interactive_steps) || !question.interactive_steps.length) return
  const chapter = Number(chapterMatch[1]), lesson = Number(lessonMatch[1]), key = `${chapter}:${lesson}`
  if (!lessons.has(key)) lessons.set(key, { chapter, lesson, questions: [] })
  const questionHash = hash(question)
  if (seenQuestions.has(questionHash)) return
  seenQuestions.add(questionHash)
  const questionKey = `${chapter}_${lesson}_${lessons.get(key).questions.length + 1}`
  const steps = question.interactive_steps.map((step, stepIndex) => {
    const inputs = (step.inputs || []).map((input, inputIndex) => ({ id: `q_${questionKey}_s${stepIndex + 1}_i${inputIndex + 1}`, correct_value: String(input.correct_answer ?? ''), label: `القيمة ${inputIndex + 1}`, allowed_keys: (input.options || [input.correct_answer]).map(String), hint: step.hint || 'راجع شرح الخطوة ثم حاول مرة أخرى.' }))
    let structure = String(step.equation_template || '')
    inputs.forEach((input, inputIndex) => { structure = structure.replaceAll(`{input_${inputIndex + 1}}`, `{${input.id}}`) })
    return { step_id: `physics_${questionKey}_step_${stepIndex + 1}`, title: `الخطوة ${arabicNumber(step.step_number || stepIndex + 1)}`, explanation: step.step_explanation || '', think: step.hint || '', html_structure: structure, inputs }
  })
  lessons.get(key).questions.push({ title: question.question_text || `سؤال ${question.question_number || ''}`, steps, model_solution: question.full_model_solution || '', number: question.question_number || lessons.get(key).questions.length + 1, page_number: question.page_number || null, image_url: question.image_url || null })
}

for (const filePath of walk(sourceRoot)) {
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); parsedFiles += 1 } catch { invalidFiles += 1; continue }
  if (Array.isArray(parsed)) { if (!parsed.length) { emptyFiles += 1; continue }; parsed.forEach(question => addQuestion(question.lesson_id, question)); continue }
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : []
  if (!questions.length) { emptyFiles += 1; continue }
  questions.forEach(question => addQuestion(parsed.lesson_id || question.lesson_id, question))
}

const dataDir = path.join(outputRoot, 'data'); fs.mkdirSync(dataDir, { recursive: true })
const chapters = new Map()
for (const data of [...lessons.values()].sort((a, b) => a.chapter - b.chapter || a.lesson - b.lesson)) {
  if (!data.questions.length) continue
  const file = `physics_ch${data.chapter}_lesson${data.lesson}.json`
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(data.questions, null, 2))
  if (!chapters.has(data.chapter)) chapters.set(data.chapter, [])
  chapters.get(data.chapter).push({ name: `الدرس ${arabicNumber(data.lesson)}`, files: [{ file, label: `الدرس ${arabicNumber(data.lesson)}` }] })
}
const curriculum = [...chapters.entries()].sort(([a], [b]) => a - b).map(([chapter, topics]) => ({ id: `physics-ch${chapter}`, title: `الفصل ${arabicNumber(chapter)}`, topics }))
fs.writeFileSync(path.join(outputRoot, 'physics-curriculum.json'), JSON.stringify(curriculum, null, 2))
console.log(JSON.stringify({ parsedFiles, emptyFiles, invalidFiles, unmappedQuestions, exportedLessons: curriculum.reduce((n, c) => n + c.topics.length, 0), questions: seenQuestions.size }, null, 2))
