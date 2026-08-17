import json
import re

FINDING_TYPES = ('theme', 'tension', 'gap', 'clue')
MAX_FINDINGS = 6
MAX_QUESTIONS = 6
JSON_FENCE_RE = re.compile(r'```(?:json)?\s*([\s\S]*?)```', re.IGNORECASE)
META_BOARD_RE = re.compile(
    r'白板.{0,8}(未提及|没有连接|没有连|未连接|没有说明)|'
    r'画布上没有|'
    r'用户.{0,6}(没有表态|没有说明|未表态)|'
    r'卡片还没连|还没连线'
)


def extract_json_object(text):
    raw = (text or '').strip()
    if not raw:
        raise ValueError('empty insight payload')

    fenced = JSON_FENCE_RE.search(raw)
    if fenced:
        raw = fenced.group(1).strip()

    start = raw.find('{')
    end = raw.rfind('}')
    if start < 0 or end <= start:
        raise ValueError('insight payload is not a JSON object')

    return json.loads(raw[start:end + 1])


def _as_string_list(value):
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        text = str(item or '').strip()
        text = text.replace('[', '').replace(']', '')
        if text:
            result.append(text)
    return list(dict.fromkeys(result))


def _normalize_finding(item):
    if not isinstance(item, dict):
        return None
    finding_type = str(item.get('type') or '').strip().lower()
    if finding_type not in FINDING_TYPES:
        return None
    title = str(item.get('title') or '').strip()
    detail = str(item.get('detail') or '').strip()
    if not title and not detail:
        return None
    return {
        'type': finding_type,
        'title': title or detail[:24],
        'detail': detail,
        'node_ids': _as_string_list(item.get('node_ids') or item.get('nodeIds')),
    }


def _normalize_question(item):
    if not isinstance(item, dict):
        return None
    text = str(item.get('text') or item.get('question') or '').strip()
    if not text or META_BOARD_RE.search(text):
        return None
    why = str(item.get('why') or '').strip()
    if META_BOARD_RE.search(why):
        why = ''
    return {
        'text': text,
        'why': why,
        'node_ids': _as_string_list(item.get('node_ids') or item.get('nodeIds')),
    }


def normalize_insight_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError('insight payload must be an object')

    findings = []
    for item in payload.get('findings') or []:
        finding = _normalize_finding(item)
        if finding:
            findings.append(finding)
        if len(findings) >= MAX_FINDINGS:
            break

    questions = []
    for item in payload.get('questions') or []:
        question = _normalize_question(item)
        if question:
            questions.append(question)
        if len(questions) >= MAX_QUESTIONS:
            break

    if not findings and not questions:
        raise ValueError('insight payload is empty')

    return {
        'findings': findings,
        'questions': questions,
    }
