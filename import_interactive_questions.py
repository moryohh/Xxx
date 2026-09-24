"""Replace the whiteboard lessons with the supplied interactive question set."""
import collections
import json
import re
import sys
from pathlib import Path

from convert_archive import CHAPTERS, ROOT, SOURCE, normalize_question


def main(path):
    questions = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if not isinstance(questions, list):
        raise ValueError('Expected a list of questions')

    curriculum = [
        {'id': f'ch{i}', 'title': title, 'icon': icon, 'color': color,
         'topics': [{'name': topic, 'files': []} for topic, _ in topics]}
        for i, (title, icon, color, topics) in enumerate(CHAPTERS, 1)
    ]
    by_page = collections.defaultdict(list)
    for question in questions:
        page = int(question['page_number'])
        by_page[page].append(question)

    database = {}
    for page, entries in sorted(by_page.items()):
        chapter = next((i for i, upper in enumerate((44, 90, 145, 190, 220, 999), 1) if page <= upper), 6)
        filename = f'page_{page}.json'
        database[filename] = [normalize_question(q, filename, chapter, page, i)
                              for i, q in enumerate(entries, 1)]
        topics = CHAPTERS[chapter - 1][3]
        topic_index = next((i for i, (_, upper) in enumerate(topics) if page <= upper), len(topics)-1)
        curriculum[chapter-1]['topics'][topic_index]['files'].append(filename)

    total_inputs = sum(len(s.get('inputs', [])) for q in questions for s in q.get('interactive_steps', []))
    actual_inputs = sum(len(s['inputs']) for entries in database.values() for q in entries for s in q['steps'])
    if total_inputs != actual_inputs:
        raise ValueError(f'Lost {total_inputs - actual_inputs} choice inputs during import')
    for entries in database.values():
        for q in entries:
            for step in q['steps']:
                for entry in step['inputs']:
                    marker = '{' + entry['id'] + '}'
                    if step['html_structure'].count(marker) != 1:
                        raise ValueError(f'Expected one square for {entry["id"]}')

    raw = SOURCE.read_text(encoding='utf-8')
    raw = raw[:raw.lower().rfind('</html>') + len('</html>')] + '\n'
    start = raw.index('        const curriculum = [')
    end = raw.index('        function showScreen(screenId)', start)
    def js(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    raw = raw[:start] + '        const curriculum = ' + js(curriculum) + ';\n        const PROBLEMS_DATABASE = ' + js(database) + ';\n\n' + raw[end:]
    ROOT.joinpath('index.html').write_text(raw, encoding='utf-8')
    report = {'questions': len(questions), 'pages': len(by_page),
              'steps': sum(len(q.get('interactive_steps', [])) for q in questions),
              'boxes': actual_inputs, 'page_numbers': sorted(by_page)}
    ROOT.joinpath('conversion-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1])
