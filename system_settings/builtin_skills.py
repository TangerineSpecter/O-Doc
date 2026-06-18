import logging
import threading
from pathlib import Path

from django.db import OperationalError, ProgrammingError, close_old_connections

from .models import Skill

logger = logging.getLogger(__name__)

AGENT_POST_MARKDOWN_SKILL_KEY = 'odoc_agent_post_markdown_guide'
AGENT_POST_MARKDOWN_GUIDE_PATH = Path(__file__).resolve().parent.parent / 'docs' / 'config' / 'agent_post_markdown_guide.md'
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


def parse_markdown_skill_document(content):
    text = (content or '').strip()
    meta = DEFAULT_AGENT_POST_MARKDOWN_SKILL_META.copy()
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


def sync_builtin_skills():
    try:
        content = AGENT_POST_MARKDOWN_GUIDE_PATH.read_text(encoding='utf-8')
    except OSError:
        logger.warning('Agent post markdown guide missing: %s', AGENT_POST_MARKDOWN_GUIDE_PATH)
        return

    meta, prompt = parse_markdown_skill_document(content)
    if not prompt:
        return

    defaults = {
        'name': meta['name'],
        'description': meta['description'],
        'version': meta['version'],
        'source': 'built_in',
        'entry': str(AGENT_POST_MARKDOWN_GUIDE_PATH),
        'prompt': prompt,
        'is_system': True,
        'manifest': {
            'kind': 'markdown_guide',
            'path': str(AGENT_POST_MARKDOWN_GUIDE_PATH),
        },
    }

    try:
        close_old_connections()
        skill = Skill.objects.filter(skill_key=AGENT_POST_MARKDOWN_SKILL_KEY).first()
        if not skill:
            skill = Skill.objects.filter(name=defaults['name']).first()

        if not skill:
            Skill.objects.create(
                skill_key=AGENT_POST_MARKDOWN_SKILL_KEY,
                enabled=True,
                available_in_chat=False,
                **defaults,
            )
            return

        changed_fields = []
        if skill.skill_key != AGENT_POST_MARKDOWN_SKILL_KEY:
            skill.skill_key = AGENT_POST_MARKDOWN_SKILL_KEY
            changed_fields.append('skill_key')

        for field, value in defaults.items():
            if getattr(skill, field) != value:
                setattr(skill, field, value)
                changed_fields.append(field)

        if changed_fields:
            skill.save(update_fields=[*changed_fields, 'updated_at'])
    except (OperationalError, ProgrammingError):
        return
    except Exception:
        logger.exception('Failed to sync built-in skills')
    finally:
        close_old_connections()


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
