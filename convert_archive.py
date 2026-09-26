"""Build the existing whiteboard's content from the user's كامل.zip archive."""
import collections
import html
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / 'source.html'
CHAPTERS = [
    ('الفصل الأول: الأعداد المركبة', 'fa-infinity', 'bg-purple-500',
     [('العمليات الأساسية ومفهوم i', 30), ('قيم x و y الحقيقيتين والتحليل', 999)]),
    ('الفصل الثاني: القطوع المخروطية', 'fa-bezier-curve', 'bg-sky-500',
     [('القطع المكافئ والقطع الناقص', 70), ('القطع الزائد والربط بين القطوع', 999)]),
    ('الفصل الثالث: تطبيقات التفاضل', 'fa-chart-line', 'bg-emerald-500',
     [('المعدلات المرتبطة بالزمن', 118), ('مبرهنة رول والقيمة المتوسطة والتقريب', 133), ('رسم الدوال والتطبيقات العملية', 999)]),
    ('الفصل الرابع: التكامل', 'fa-square-root-variable', 'bg-orange-500',
     [('التكامل غير المحدد والدوال الدائرية', 171), ('التكامل المحدد والمساحات والمسافة', 999)]),
    ('الفصل الخامس: المعادلات التفاضلية الاعتيادية', 'fa-superscript', 'bg-rose-500',
     [('الرتبة والدرجة وبيان حل المعادلة', 205), ('فصل المتغيرات والمعادلات المتجانسة', 999)]),
    ('الفصل السادس: الهندسة الفضائية المجسمة', 'fa-cube', 'bg-indigo-500',
     [('المبردات والمستويات المتعامدة', 227), ('الزاوية الزوجية ومبرهنات الفضاء', 999)]),
]


def decode(raw):
    source = raw.decode('utf-8-sig')
    decoder = json.JSONDecoder()
    try:
        return json.loads(source), None
    except json.JSONDecodeError as error:
        if error.msg == 'Invalid \\escape':
            # Exported LaTeX commands like \sqrt were not JSON escaped.
            source = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', source)
        parsed, end = decoder.raw_decode(source)
        if source[end:].strip():
            if not re.fullmatch(r'[\s\]\},]*', source[end:]):
                raise ValueError('Unexpected content after JSON value')
            return parsed, 'Discarded unmatched closing delimiters after complete JSON'
        return parsed, None


def extract_questions(value):
    if isinstance(value, list):
        return [q for item in value for q in extract_questions(item)]
    if not isinstance(value, dict):
        return []
    if 'merged_lessons' in value:
        return extract_questions(value['merged_lessons'])
    if 'content' in value:
        return extract_questions(value['content'])
    for key in ('exam_questions', 'questions', 'exams'):
        if isinstance(value.get(key), list):
            return extract_questions(value[key])
    if 'interactive_steps' in value or 'full_model_solution' in value:
        return [value]
    # The 'exam/branches' format in some exports contains unrelated biology
    # prompts and has no math choices; never invent an interactive question.
    return []


def clean(value):
    return html.escape(str(value or ''), quote=True)


def normalize_question(question, filename, chapter, page, ordinal):
    category = CHAPTERS[chapter - 1][0]
    title = question.get('question_text') or f"السؤال {question.get('question_number') or ordinal} من صفحة {page}"
    normalized = {
        'file_name': filename,
        'category': category,
        'title': clean(title),
        'latex_formula': '',
        'diagram_url': None,
        'steps': [],
        'model_solution': clean(question.get('full_model_solution')),
        'number': str(question.get('question_number') or ordinal),
    }
    diagram = question.get('diagram')
    if isinstance(diagram, dict):
        url = diagram.get('image_url')
        if isinstance(url, str):
            match = re.search(r'https://[^\s)\]]+', url)
            normalized['diagram_url'] = match.group(0) if match else None
    for step_index, source_step in enumerate(question.get('interactive_steps') or [], 1):
        if not isinstance(source_step, dict):
            continue
        inputs = []
        id_map = {}
        for index, original in enumerate(source_step.get('inputs') or [], 1):
            if not isinstance(original, dict):
                continue
            correct = str(original.get('correct_answer', '')).strip()
            options = [str(choice).strip() for choice in original.get('options', [])]
            if not correct or correct not in options or len(options) < 2:
                continue
            options = list(dict.fromkeys(options))
            if len(options) < 2:
                continue
            identifier = f'q{ordinal}s{step_index}i{index}'
            id_map[f'input_{index}'] = identifier
            if original.get('input_id'):
                id_map[str(original['input_id'])] = identifier
            hint = original.get('hint') or source_step.get('hint') or ''
            if isinstance(hint, dict):
                topics = hint.get('related_topics') or []
                hint = hint.get('step_hint_text') or ''
            else:
                topics = source_step.get('related_topics') or []
            details = []
            for topic in topics:
                if isinstance(topic, dict):
                    details.append(' — '.join(str(topic.get(k)) for k in ('topic_title', 'explanation') if topic.get(k)))
                elif isinstance(topic, str):
                    details.append(topic)
            if details:
                hint = str(hint) + ' | مواضيع ذات صلة: ' + '؛ '.join(details)
            inputs.append({
                'id': identifier, 'correct_value': correct,
                'label': clean(original.get('label') or f'القيمة {index}'),
                'allowed_keys': options, 'hint': clean(hint),
            })
        template = str(source_step.get('equation_template') or source_step.get('step_assistant_solution') or '')
        used = set()

        def place(match):
            key = match.group(1)
            identifier = id_map.get(key)
            if not identifier:
                return clean(match.group(0))
            if identifier in used:
                return clean(next(item['correct_value'] for item in inputs if item['id'] == identifier))
            used.add(identifier)
            return '{' + identifier + '}'

        rendered = re.sub(r'\{([^{}]+)\}', place, html.escape(template, quote=False))
        # If a template omits an input, it must still have a visible square.
        for item in inputs:
            if item['id'] not in used:
                rendered += f'　{item["label"]}: {{{item["id"]}}}'
        if not rendered.strip():
            rendered = '　'.join(f'{item["label"]}: {{{item["id"]}}}' for item in inputs)
        hint = source_step.get('hint') or ''
        if isinstance(hint, dict):
            hint = hint.get('step_hint_text') or ''
        normalized['steps'].append({
            'step_id': step_index, 'title': f'الخطوة {step_index}',
            'explanation': clean(source_step.get('step_explanation')),
            'think': clean(source_step.get('step_explanation') or hint),
            'html_structure': rendered, 'inputs': inputs,
        })
    return normalized


def build(archive):
    curriculum = [
        {'id': f'ch{i}', 'title': title, 'icon': icon, 'color': color,
         'topics': [{'name': topic, 'files': []} for topic, _ in topics]}
        for i, (title, icon, color, topics) in enumerate(CHAPTERS, 1)
    ]
    database = {}
    report = {'files': 0, 'questions': 0, 'boxes': 0, 'pages_without_interactive_questions': [], 'recovered': [], 'errors': []}
    with zipfile.ZipFile(archive) as zipped:
        for name in sorted(zipped.namelist(), key=lambda n: int(re.search(r'page_(\d+)', n).group(1))):
            page_match = re.search(r'page_(\d+)\.json$', name)
            chapter_match = re.search(r'فصل\s*([١٢٣٤٥٦1-6])/', name)
            if not page_match or not chapter_match:
                report['errors'].append({'file': name, 'reason': 'Missing chapter or page filename'})
                continue
            page = int(page_match.group(1))
            chapter = int(chapter_match.group(1).translate(str.maketrans('١٢٣٤٥٦', '123456')))
            filename = f'page_{page}.json'
            try:
                source, note = decode(zipped.read(name))
                if note:
                    report['recovered'].append({'file': name, 'note': note})
                questions = extract_questions(source)
                normalized = [normalize_question(q, filename, chapter, page, i)
                              for i, q in enumerate(questions, 1)]
                normalized = [q for q in normalized if q['steps'] or q['model_solution']]
                if not normalized:
                    report['pages_without_interactive_questions'].append(page)
                report['files'] += 1
                report['questions'] += len(normalized)
                report['boxes'] += sum(len(s['inputs']) for q in normalized for s in q['steps'])
                database[filename] = normalized
                topics = CHAPTERS[chapter - 1][3]
                index = next((i for i, (_, upper) in enumerate(topics) if page <= upper), len(topics)-1)
                curriculum[chapter-1]['topics'][index]['files'].append(filename)
            except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
                report['errors'].append({'file': name, 'reason': str(error)})
                database[filename] = []
                report['pages_without_interactive_questions'].append(page)
                topics = CHAPTERS[chapter - 1][3]
                index = next((i for i, (_, upper) in enumerate(topics) if page <= upper), len(topics)-1)
                curriculum[chapter-1]['topics'][index]['files'].append(filename)
    for chapter in curriculum:
        for topic in chapter['topics']:
            topic['files'].sort(key=lambda f: int(re.search(r'\d+', f).group()))
    return curriculum, database, report


def main(archive):
    curriculum, data, report = build(archive)
    raw = SOURCE.read_text(encoding='utf-8')
    raw = raw[:raw.lower().rfind('</html>')+len('</html>')] + '\n'
    start = raw.index('        const curriculum = [')
    end = raw.index('        function showScreen(screenId)', start)
    js = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    content = '        const curriculum = ' + js(curriculum) + ';\n        const PROBLEMS_DATABASE = ' + js(data) + ';\n\n'
    raw = raw[:start] + content + raw[end:]
    ROOT.joinpath('index.html').write_text(raw, encoding='utf-8')
    ROOT.joinpath('conversion-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v if not isinstance(v,list) else len(v) for k,v in report.items()},ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1])
