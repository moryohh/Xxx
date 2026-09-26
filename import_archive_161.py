"""Import all questions from 161.zip into the existing interactive whiteboard.

Keeps a source-by-source audit, repairs invalid LaTeX JSON escaping, and
publishes one small JSON asset per page/topic for on-demand loading.
"""
import collections
import json
import re
import sys
import zipfile
from pathlib import Path

from convert_archive import CHAPTERS, ROOT, SOURCE, normalize_question

TOPICS = {
    1: [('توسيع مجموعة الأعداد الحقيقية وقوى i', 6),
        ('العمليات على الأعداد المركبة', 15),
        ('المرافق والقسمة في الأعداد المركبة', 22),
        ('قيم المتغيرات الحقيقية في المعادلات المركبة', 36),
        ('الجذور التربيعية للعدد المركب', 43),
        ('حل المعادلة التربيعية في C', 60),
        ('الجذور التكعيبية للواحد الصحيح', 68),
        ('التمثيل الهندسي للأعداد المركبة', 74),
        ('الصيغة القطبية', 83),
        ('مبرهنة ديموافر والجذور', 108)],
    2: [('تعريف القطوع المخروطية', 109),
        ('القطع المكافئ', 118),
        ('القطع المكافئ وانسحاب المحاور', 133),
        ('القطع الناقص', 142),
        ('القطع الناقص وانسحاب المحاور', 169),
        ('القطع الزائد', 177),
        ('القطع الزائد وتطبيقات القطوع', 214)],
    3: [('المعدلات المرتبطة', 999), ('مبرهنتا رول والقيمة المتوسطة', 999),
        ('رسم الدوال والقيم العظمى والصغرى', 999)],
    4: [('التكامل المحدد', 999), ('التكامل غير المحدد', 999),
        ('المساحات والحجوم الدورانية', 999)],
    5: [('مقدمة وحل المعادلات التفاضلية', 999),
        ('المعادلات التفاضلية من المرتبة الأولى', 999)],
    6: [('المستقيمات والمستويات المتعامدة', 233),
        ('الإسقاط العمودي والزاوية الزوجية', 999)],
}


def repaired_json(raw):
    content = raw.decode('utf-8-sig', errors='replace')
    # A few exports contain three or five slashes before a TeX delimiter.
    content = re.sub(r'\\+(?=[()\[\]])',
                     lambda m: m.group() if len(m.group()) % 2 == 0 else m.group() + '\\', content)
    content = re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', lambda m: '\\\\', content)
    return json.loads(content, strict=False)


def collect(value):
    if isinstance(value, list):
        return [q for item in value for q in collect(item)]
    if not isinstance(value, dict):
        return []
    if 'interactive_steps' in value:
        return [value]
    for key in ('exam_questions', 'questions', 'content', 'pages', 'merged_lessons'):
        if key in value:
            return collect(value[key])
    return []


def salvage_interrupted_export(raw):
    # One exporter pasted a new complete JSON array inside an unfinished
    # equation_template. The complete inner array contains its full questions.
    content = raw.decode('utf-8-sig', errors='replace')
    marker = '```json\n'
    if marker not in content:
        raise ValueError('No recoverable JSON section')
    return repaired_json(content[content.index(marker) + len(marker):].encode())


def topic_for(page, question):
    if page <= 108:
        chapter = 1
    elif page <= 214:
        chapter = 2
    else:
        chapter = 6
    if chapter == 2:
        title = str(question.get('question_text') or '')
        # The later pages contain mixed conic exercises; classify each question
        # by its requested result before considering prerequisites in its text.
        beginning = title[:115]
        targets = [(beginning.find(term), term) for term in ('القطع الناقص', 'القطع الزائد', 'القطع المكافئ') if term in beginning]
        if targets:
            primary = min(targets)[1]
            if primary == 'القطع المكافئ':
                return chapter, 2 if page >= 119 and page < 134 else 1
            if primary == 'القطع الناقص':
                return chapter, 4 if page >= 143 else 3
            return chapter, 6 if page >= 178 else 5
    topics = TOPICS[chapter]
    index = next((i for i, (_, upper) in enumerate(topics) if page <= upper), len(topics)-1)
    return chapter, index


def build(archive):
    curriculum = [
        {'id': f'ch{i}', 'title': title, 'icon': icon, 'color': color,
         'topics': [{'name': name, 'files': []} for name, _ in TOPICS[i]]}
        for i, (title, icon, color, _) in enumerate(CHAPTERS, 1)
    ]
    source_report = []
    candidates = []
    with zipfile.ZipFile(archive) as zipped:
        members = [n for n in zipped.namelist() if not n.endswith('/')]
        for name in members:
            try:
                try:
                    value = repaired_json(zipped.read(name))
                    status = 'parsed'
                except (json.JSONDecodeError, UnicodeError):
                    value = salvage_interrupted_export(zipped.read(name))
                    status = 'recovered nested JSON'
                questions = collect(value)
                if not questions:
                    raise ValueError('No interactive questions in file')
                candidates.extend((name, q) for q in questions)
                source_report.append({'file': name, 'status': status, 'questions': len(questions)})
            except (ValueError, TypeError, KeyError) as error:
                source_report.append({'file': name, 'status': 'error', 'reason': str(error)})

    grouped = collections.defaultdict(list)
    seen = {}
    duplicates = []
    for source, question in candidates:
        page = int(question.get('page_number') or re.search(r'p(\d+)', str(question.get('id_number'))).group(1))
        title = re.sub(r'\s+', '', str(question.get('question_text') or ''))
        identity = (page, title)
        if identity in seen:
            # A repeated question from two exports is one student exercise.
            old_source, old_question = seen[identity]
            if len(question.get('interactive_steps') or []) > len(old_question.get('interactive_steps') or []):
                seen[identity] = (source, question)
                duplicates.append({'page': page, 'discarded': old_source, 'kept': source})
            else:
                duplicates.append({'page': page, 'discarded': source, 'kept': old_source})
        else:
            seen[identity] = (source, question)
    for (page, _), (_, question) in seen.items():
        chapter, topic = topic_for(page, question)
        grouped[(chapter, topic, page)].append(question)

    data_dir = ROOT / 'data'
    data_dir.mkdir(exist_ok=True)
    for old in data_dir.glob('page_*.json'):
        old.unlink()
    total_steps = total_inputs = 0
    for (chapter, topic, page), questions in sorted(grouped.items()):
        filename = f'page_{page}_ch{chapter}_t{topic+1}.json'
        normalized = [normalize_question(q, filename, chapter, page, i)
                      for i, q in enumerate(questions, 1)]
        expected = sum(len(s.get('inputs') or []) for q in questions for s in q.get('interactive_steps') or [])
        actual = sum(len(s['inputs']) for q in normalized for s in q['steps'])
        if expected != actual:
            raise ValueError(f'{filename}: lost {expected - actual} inputs')
        for item in normalized:
            for step in item['steps']:
                for field in step['inputs']:
                    if step['html_structure'].count('{' + field['id'] + '}') != 1:
                        raise ValueError(f'{filename}: missing square {field["id"]}')
        total_inputs += actual
        total_steps += sum(len(q['steps']) for q in normalized)
        curriculum[chapter-1]['topics'][topic]['files'].append(filename)
        (data_dir / filename).write_text(json.dumps(normalized, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    raw = SOURCE.read_text(encoding='utf-8')
    raw = raw[:raw.lower().rfind('</html>') + len('</html>')] + '\n'
    start = raw.index('        const curriculum = [')
    end = raw.index('        function showScreen(screenId)', start)
    js = json.dumps(curriculum, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e')
    raw = raw[:start] + '        const curriculum = ' + js + ';\n        const PROBLEMS_DATABASE = {};\n\n' + raw[end:]
    (ROOT / 'index.html').write_text(raw, encoding='utf-8')
    report = {
        'source_files': len(source_report), 'parsed_files': sum(x['status'] != 'error' for x in source_report),
        'questions_in_sources': len(candidates), 'unique_questions': len(seen),
        'duplicate_questions': duplicates, 'steps': total_steps, 'boxes': total_inputs,
        'pages': len({key[2] for key in grouped}), 'lesson_files': len(grouped),
        'questions_per_chapter': {str(i): sum(len(v) for (ch, _, _), v in grouped.items() if ch == i)
                                  for i in range(1, 7)},
        'sources': source_report,
    }
    (ROOT / 'conversion-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    result = build(Path(sys.argv[1]))
    print(json.dumps({k: v for k, v in result.items() if k not in ('sources', 'duplicate_questions')}, ensure_ascii=False))
