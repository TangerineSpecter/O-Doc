"""Conservative, line-local heading detection independent of storage and AI."""
import re
from dataclasses import dataclass

PARSER_VERSION = 2
NUMBER = r'[零〇一二三四五六七八九十百千万两\d]+'
CHINESE = re.compile(rf'^第{NUMBER}(?P<unit>[章回节卷部篇])(?P<title>.{{0,60}})$')
ENGLISH = re.compile(r'^(chapter|part|section)[ \t]+(?:\d+|[ivxlc]+)(?:[ \t:：.\-]+.{1,60})?$', re.I)
NUMBERED = re.compile(r'^(?P<number>\d+(?:\.\d+)*)(?:[、.． \t]+(?P<title>.{1,60}))?$')
SENTENCE = re.compile(r'[。！？!?；;，“”「」『』]')


@dataclass(frozen=True)
class Heading:
    start: int
    end: int
    title: str
    family: str


def find_headings(text: str) -> list[Heading]:
    candidates = []
    offset = 0
    for line in text.splitlines(keepends=True):
        title = line.strip()
        family = ''
        if title and not SENTENCE.search(title):
            chinese = CHINESE.fullmatch(title)
            english = ENGLISH.fullmatch(title)
            numbered = NUMBERED.fullmatch(title)
            if chinese:
                family = chinese['unit']
            elif english:
                family = english[1].lower()
            elif numbered:
                family = 'numbered' if numbered['title'] else 'bare'
            if family:
                candidates.append(Heading(offset, offset + len(line.rstrip('\r\n')), title, family))
        offset += len(line)

    # Chapter-level headings override numbered scenes and subordinate sections.
    # Prefer repeated families: an isolated reference must not decide a whole book.
    priority = ('章', '回', 'chapter', '部', '卷', '篇', 'part', '节', 'section', 'numbered')
    families = {family: [h for h in candidates if h.family == family] for family in priority}
    family = next((f for f in priority if len(families[f]) >= 2), None)
    if family is None:
        family = next((f for f in priority if families[f]), None)
    if family:
        headings = families[family]
    else:
        headings = [h for h in candidates if h.family == 'bare']
        numbers = [int(h.title) for h in headings]
        # Bare scene numbers often restart in each chapter. Require a coherent
        # sequence when there is no explicit heading hierarchy to disambiguate.
        if len(numbers) < 3 or numbers[0] != 1 or any(b != a + 1 for a, b in zip(numbers, numbers[1:])):
            return []

    # Dense contents listings are not body boundaries. Retain short final chapters.
    return [h for i, h in enumerate(headings) if i == len(headings) - 1 or headings[i + 1].start - h.end >= 80]
