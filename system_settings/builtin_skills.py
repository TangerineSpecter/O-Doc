import logging
import threading
from pathlib import Path

from django.db import OperationalError, ProgrammingError, close_old_connections

from .models import Skill

logger = logging.getLogger(__name__)

AGENT_POST_MARKDOWN_SKILL_KEY = 'odoc_agent_post_markdown_guide'
AGENT_POST_MARKDOWN_GUIDE_PATH = Path(__file__).resolve().parent.parent / 'docs' / 'config' / 'agent_post_markdown_guide.md'
PHOTO_REVIEW_SKILL_KEY = 'odoc_photo_review'
PHOTO_REVIEW_SKILL_PATH = Path(__file__).resolve().parent.parent / 'docs' / 'config' / 'photo_review_skill.md'
_sync_timer_started = False
DEFAULT_AGENT_POST_MARKDOWN_SKILL_META = {
    'name': 'O-Doc Markdown 格式指南',
    'description': '让 Agent 了解 O-Doc 文章、帖子与对话支持的扩展 Markdown 格式。',
    'version': 'md-sync',
}


def read_agent_post_markdown_guide():
    try:
        content = AGENT_POST_MARKDOWN_GUIDE_PATH.read_text(encoding='utf-8')
        _, prompt = parse_markdown_skill_document(content)
        return prompt
    except OSError:
        logger.warning('Agent post markdown guide missing: %s', AGENT_POST_MARKDOWN_GUIDE_PATH)
        return ''


def parse_markdown_skill_document(content, fallback_meta=None):
    text = (content or '').strip()
    meta = (fallback_meta or DEFAULT_AGENT_POST_MARKDOWN_SKILL_META).copy()
    if not text.startswith('---'):
        return meta, text

    lines = text.splitlines()
    end_index = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == '---':
            end_index = index
            break

    if end_index is None:
        return meta, text

    for line in lines[1:end_index]:
        key, separator, value = line.partition(':')
        if not separator:
            continue
        key = key.strip()
        if key not in meta:
            continue
        value = value.strip().strip('"\'')
        if value:
            meta[key] = value

    prompt = '\n'.join(lines[end_index + 1:]).strip()
    return meta, prompt


BUILTIN_SKILL_SPECS = (
    {
        'skill_key': AGENT_POST_MARKDOWN_SKILL_KEY,
        'path': AGENT_POST_MARKDOWN_GUIDE_PATH,
        'fallback_meta': DEFAULT_AGENT_POST_MARKDOWN_SKILL_META,
        'manifest_kind': 'markdown_guide',
    },
    {
        'skill_key': PHOTO_REVIEW_SKILL_KEY,
        'path': PHOTO_REVIEW_SKILL_PATH,
        'fallback_meta': {
            'name': '照片评价',
            'description': '根据照片观察记录和创建人自己的说明，按 Agent 的性格写评价并打分。',
            'version': '1.0.0',
        },
        'manifest_kind': 'photo_review',
    },
)


def sync_builtin_skills():
    try:
        close_old_connections()
        for spec in BUILTIN_SKILL_SPECS:
            _sync_builtin_skill(spec)
    except (OperationalError, ProgrammingError):
        return
    except Exception:
        logger.exception('Failed to sync built-in skills')
    finally:
        close_old_connections()


def _sync_builtin_skill(spec):
    try:
        content = spec['path'].read_text(encoding='utf-8')
    except OSError:
        logger.warning('Built-in skill file missing: %s', spec['path'])
        return

    meta, prompt = parse_markdown_skill_document(content, spec['fallback_meta'])
    if not prompt:
        return

    defaults = {
        'name': meta['name'],
        'description': meta['description'],
        'version': meta['version'],
        'source': 'built_in',
        'entry': str(spec['path']),
        'prompt': prompt,
        'is_system': True,
        'manifest': {
            'kind': spec['manifest_kind'],
            'path': str(spec['path']),
        },
    }
    skill = Skill.objects.filter(skill_key=spec['skill_key']).first()
    if not skill:
        skill = Skill.objects.filter(name=defaults['name']).first()
    if not skill:
        Skill.objects.create(
            skill_key=spec['skill_key'],
            enabled=True,
            available_in_chat=False,
            **defaults,
        )
        return

    changed_fields = []
    if skill.skill_key != spec['skill_key']:
        skill.skill_key = spec['skill_key']
        changed_fields.append('skill_key')
    for field, value in defaults.items():
        if getattr(skill, field) != value:
            setattr(skill, field, value)
            changed_fields.append(field)
    if changed_fields:
        skill.save(update_fields=[*changed_fields, 'updated_at'])


def start_builtin_skill_sync():
    global _sync_timer_started

    if _sync_timer_started:
        return

    from .sync_scheduler import _is_server_process, get_scheduler_initial_delay_seconds

    if not _is_server_process():
        return

    _sync_timer_started = True
    timer = threading.Timer(get_scheduler_initial_delay_seconds(), sync_builtin_skills)
    timer.daemon = True
    timer.start()
