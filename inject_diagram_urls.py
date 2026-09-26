"""Copy only diagram URLs from old page JSON into the current lesson assets.

Questions match on (page_id or page_number, question_number). A missing or
null old diagram supplies a null image_url. Other question data is untouched.
"""
import collections
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent


def match_key(page, number):
    return str(page).strip(), str(number).strip()


def old_images(archive):
    images = {}
    sources = collections.defaultdict(list)
    with zipfile.ZipFile(archive) as zipped:
        for name in zipped.namelist():
            if not name.lower().endswith('.json'):
                continue
            data = json.loads(zipped.read(name).decode('utf-8-sig'))
            page = data.get('page_id')
            if page is None:
                page = data.get('page_number')
            for question in data.get('exam_questions', []):
                key = match_key(page, question.get('question_number'))
                diagram = question.get('diagram')
                image = diagram.get('image_url') if isinstance(diagram, dict) else None
                if key in images and images[key] != image:
                    raise ValueError(f'Conflicting image URLs for {key}')
                images[key] = image
                sources[key].append(name)
    return images, sources


def inject(archive):
    images, sources = old_images(archive)
    report = {'old_json_files': 0, 'old_question_keys': len(images),
              'new_questions': 0, 'matched_questions': 0,
              'questions_with_images': 0, 'matched_without_image': 0,
              'unmatched_questions': [], 'changed_lesson_files': [],
              'old_images_without_matching_new_question': []}
    with zipfile.ZipFile(archive) as zipped:
        report['old_json_files'] = sum(x.filename.lower().endswith('.json') for x in zipped.infolist())
    used = set()
    for path in sorted((ROOT / 'data').glob('page_*.json')):
        page = re.search(r'^page_(\d+)', path.name).group(1)
        questions = json.loads(path.read_text(encoding='utf-8'))
        before = json.loads(json.dumps(questions, ensure_ascii=False))
        changed = False
        for question in questions:
            report['new_questions'] += 1
            key = match_key(page, question.get('number'))
            if key not in images:
                report['unmatched_questions'].append({'page': page, 'question_number': key[1], 'lesson_file': path.name})
                continue
            used.add(key)
            image = images[key]
            question['image_url'] = image
            # The existing whiteboard reads diagram_url to display the image.
            if image is not None:
                question['diagram_url'] = image
                report['questions_with_images'] += 1
            else:
                report['matched_without_image'] += 1
            report['matched_questions'] += 1
            changed = True
        for original, updated in zip(before, questions):
            without_images = dict(updated)
            original.pop('image_url', None)
            original.pop('diagram_url', None)
            without_images.pop('image_url', None)
            without_images.pop('diagram_url', None)
            if original != without_images:
                raise ValueError(f'Unexpected non-image change in {path.name}')
        if changed:
            path.write_text(json.dumps(questions, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
            report['changed_lesson_files'].append(path.name)
    report['old_images_without_matching_new_question'] = [
        {'page': key[0], 'question_number': key[1], 'old_files': sources[key]}
        for key, value in images.items() if value and key not in used
    ]
    (ROOT / 'image-injection-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    result = inject(Path(sys.argv[1]))
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in result.items()}, ensure_ascii=False))
