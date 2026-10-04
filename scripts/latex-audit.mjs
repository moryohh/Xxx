import fs from 'node:fs'
import path from 'node:path'
import katex from 'katex'

const root = process.argv[2] || 'publish-root/data'
const normalize = value => String(value || '')
  .replace(/\u000c(?=rac\b)/g, '\\f')
  .replace(/&(?:amp;)?lt;/gi, '<')
  .replace(/&(?:amp;)?gt;/gi, '>')
  .replace(/&(?:amp;)?#x27;|&#39;|&apos;/gi, "'")
  .replace(/&amp;/gi, '&')
  .replace(/\\{2,}(?=[()[\]A-Za-z])/g, '\\')
  .replace(/\\+\s+(?=[()[\]])/g, '\\')
const delimiters = /\\\((.*?)\\\)|\\\[(.*?)\\\]|\$\$(.*?)\$\$|\$(.*?)\$/gs
const failures = []
let files = 0
let questions = 0
let formulas = 0

const render = (formula, location) => {
  formulas += 1
  try {
    katex.renderToString(normalize(formula).replace(/\\[()[\]]/g, ''), { throwOnError: true, strict: false, trust: true })
  } catch (error) {
    failures.push(`${location}: ${error.message}`)
  }
}

for (const name of fs.readdirSync(root).filter(name => name.endsWith('.json')).sort()) {
  files += 1
  const records = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
  for (const [questionIndex, question] of records.entries()) {
    questions += 1
    const fields = [
      ['title', question.title],
      ['model_solution', question.model_solution],
      ...question.steps.flatMap((step, stepIndex) => [
        [`steps[${stepIndex}].explanation`, step.explanation],
        [`steps[${stepIndex}].think`, step.think]
      ])
    ]
    for (const [field, value] of fields) {
      const text = normalize(value)
      for (const match of text.matchAll(delimiters)) {
        render(match[1] ?? match[2] ?? match[3] ?? match[4], `${name} q${questionIndex + 1} ${field}`)
      }
    }
    for (const [stepIndex, step] of question.steps.entries()) {
      const formula = normalize(step.html_structure).replace(/\{q[^{}]+\}/g, '1')
      render(formula, `${name} q${questionIndex + 1} steps[${stepIndex}].html_structure`)
      for (const [inputIndex, input] of step.inputs.entries()) {
        for (const [optionIndex, option] of input.allowed_keys.entries()) {
          if (!/[\u0600-\u06ff]/.test(String(option))) {
            render(option, `${name} q${questionIndex + 1} steps[${stepIndex}].inputs[${inputIndex}].allowed_keys[${optionIndex}]`)
          }
        }
      }
    }
  }
}

console.log(JSON.stringify({ files, questions, formulas, failures: failures.length }, null, 2))
if (failures.length) {
  console.error(failures.slice(0, 100).join('\n'))
  process.exitCode = 1
}
