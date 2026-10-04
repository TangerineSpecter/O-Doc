"""Validate references before rebuilding only the exact server list grammar."""
import re

from utils.markdown_links import is_top_level_paragraph, markdown_link_targets
from utils.source_urls import canonical_url

SOURCE_HEADING = '\n\n参考来源：\n'


def rebuild_references(content: str, urls: list[str]) -> str:
    body, marker, tail = content.rpartition(SOURCE_HEADING)
    heading_line = body.count('\n') + 2
    if marker and is_top_level_paragraph(content, heading_line, '参考来源：'):
        rows = tail.splitlines()
        matches = [re.fullmatch(r'- \[(\d+)\]\((.+)\)', row) for row in rows]
        # Validate the entire block shape before treating any line as metadata.
        managed = bool(rows) and all(match and match[1] == str(number)
                                     for number, match in enumerate(matches, 1))
        if managed:
            for number, match in enumerate(matches, 1):
                target = canonical_url(match[2])
                if not target or target not in urls:
                    raise ValueError(f'参考来源第 {number} 条引用损坏或不属于采用的素材；请核对完整 URL，草稿未发布')
            content = body.rstrip()
    for number, target in enumerate(markdown_link_targets(content), 1):
        if canonical_url(target) not in urls:
            raise ValueError(f'正文引用不属于采用的素材（第 {number} 个链接）；请核对完整 URL，草稿未发布')
    return content + SOURCE_HEADING + '\n'.join(f'- [{number}]({url})' for number, url in enumerate(urls, 1))
