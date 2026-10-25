"""Versioned, deterministic snapshot checks shared by writes and sync."""
import hashlib
import json


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def legacy_markdown(result: dict) -> str:
    sections = [('explanation', '代码解释'), ('assumptions', '分析假设'),
                ('dependencies', '所需依赖'), ('limitations', '限制与待验证事项'),
                ('differences', '实现差异')]
    return '\n\n'.join(f'## {title}\n\n{result[key]}' for key, title in sections
                       if isinstance(result.get(key), str) and result[key].strip())
