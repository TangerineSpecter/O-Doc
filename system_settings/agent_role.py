"""Authoritative character fields and deterministic, scene-specific projections."""
import re

FIELDS = {'age': '年龄', 'mbti': '人格参考', 'identity': '身份与背景',
          'personality': '性格与判断倾向', 'preferences': '兴趣与生活偏好',
          'expression': '表达与相处方式', 'appearance': '外貌与服饰'}
SCENES = {
    'decision': ('identity', 'personality', 'preferences'),
    'social': ('identity', 'personality', 'preferences', 'expression'),
    'planning': ('personality', 'preferences'),
    'expression': ('age', 'identity', 'personality', 'preferences', 'expression'),
    'image': ('identity', 'appearance'),
    'memory': ('identity', 'personality', 'preferences'),
    'repair': (),
    'full': tuple(FIELDS),
}


def validate_profile(value: object) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) - set(FIELDS):
        raise ValueError('角色设定包含未知字段或不是对象')
    result = {}
    for key, text in value.items():
        limit = 100 if key == 'age' else 4 if key == 'mbti' else 6000
        if not isinstance(text, str) or len(text) > limit:
            raise ValueError(f'{FIELDS[key]}须为不超过{limit}字的文本')
        result[key] = text.strip()
    if result.get('mbti'):
        result['mbti'] = result['mbti'].upper()
    if result.get('mbti') and not re.fullmatch('[IE][NS][TF][JP]', result['mbti']):
        raise ValueError('请选择有效的 MBTI 或留空')
    return result


def role_text(agent, scene: str = 'expression') -> str:
    """Never mutate the source or silently truncate legacy instructions."""
    keys = SCENES[scene]
    profile = getattr(agent, 'role_profile', {}) or {}
    parts = [f'当前 Agent：{agent.name}']
    for key in keys:
        value = profile.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(f'## {FIELDS[key]}\n{value.strip()}')
    if scene in ('decision', 'social') and profile.get('mbti'):
        parts.append(f'人格参考：{profile["mbti"]}；具体性格优先，不按标签机械判断。')
    extra = getattr(agent, 'prompt', '') or ''
    if extra.strip():
        parts.append('## 补充提示词\n' + extra.strip())
    return '\n\n'.join(parts)


def profile_version(agent) -> tuple:
    profile = getattr(agent, 'role_profile', {}) or {}
    return (agent.model_id, agent.name, agent.prompt, tuple((key, profile.get(key, '')) for key in FIELDS))
