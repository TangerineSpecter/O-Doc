"""Offset-preserving lexical outlines for Pine, MQL4 and Tongdaxin.

These are explicitly partial structural hints, not platform compiler ASTs.
"""
import re
from .common import Outline, MAX_TOKENS, source_lines

WORD = re.compile(r'[^\W\d]\w*\Z', re.UNICODE)
TOKENS = re.compile(r'[^\W\d]\w*|\d+(?:\.\d+)?|=>|:=|::|[^\s]', re.UNICODE)
CONTROL = {'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof'}


def mask(code: str, language: str) -> tuple[str, list[str]]:
    chars, index, errors = list(code), 0, []
    while index < len(code):
        start = index
        if code.startswith('//', index):
            end = re.search(r'[\r\n]', code[index:])
            index = index + end.start() if end else len(code)
        elif code.startswith('/*', index) or language == 'tongdaxin' and code[index] == '{':
            close = '*/' if code.startswith('/*', index) else '}'
            end = code.find(close, index + (2 if close == '*/' else 1))
            if end < 0: errors.append('存在未闭合的注释。')
            index = len(code) if end < 0 else end + len(close)
        elif code[index] in ('"', "'"):
            quote = code[index]; index += 1
            closed = False
            while index < len(code):
                if code[index] == '\\': index += 2
                elif code[index] == quote:
                    index += 1; closed = True; break
                else: index += 1
            if not closed: errors.append('存在未闭合的字符串。')
        else:
            index += 1
            continue
        for at in range(start, min(index, len(code))):
            if code[at] not in '\r\n': chars[at] = ' '
    # Preserve offsets while making CR-only sources visible to multiline regexes.
    for at, char in enumerate(chars):
        if char == '\r': chars[at] = ' ' if at + 1 < len(chars) and chars[at + 1] == '\n' else '\n'
    return ''.join(chars), errors


def parse(outline: Outline) -> tuple[str, str]:
    masked, errors = mask(outline.code, outline.language)
    for error in errors: outline.warn(error)
    if outline.language == 'mql4':
        physical = re.sub(r'\r(?=\n)', ' ', outline.code).replace('\r', '\n')
        for match in re.finditer(r'^[ \t]*#(?:include|import)[ \t]*[<"]([^>"\r\n]+)[>"]', physical, re.M):
            # Only active lexical directives, not include-looking text in comments.
            if '#' in masked[match.start():match.end()]:
                outline.imported(match.group(1), '', outline.line(match.start()))
        prepared, continued = [], False
        for line in source_lines(masked):
            directive = continued or line.lstrip().startswith('#')
            continued = directive and line.rstrip().endswith('\\')
            prepared.append(''.join(c if c in '\r\n' else ' ' for c in line) if directive else line)
        masked = ''.join(prepared)
    elif outline.language == 'pine':
        for match in re.finditer(r'^[ \t]*import[ \t]+([^\r\n]+)', masked, re.M):
            name, _, alias = match.group(1).strip().partition(' as ')
            outline.imported(name.strip(), alias.strip(), outline.line(match.start()))
    tokens = list(TOKENS.finditer(masked))
    if len(tokens) > MAX_TOKENS:
        outline.warn('词法单元超过 50000 项；保留全部原文片段，不建立不完整的函数边界。')
        return 'limited', 'lexical-v1'
    values = [token[0] for token in tokens]
    pairs, stack = {}, []
    for index, value in enumerate(values):
        if value in ('(', '[', '{'): stack.append(index)
        elif value in (')', ']', '}'):
            if not stack or values[stack[-1]] != {')': '(', ']': '[', '}': '{'}[value]:
                outline.warn('括号不配对；只能保留原文，不能可靠定位函数边界。', outline.line(tokens[index].start()))
                return 'unparsed', 'lexical-v1'
            start = stack.pop(); pairs[start] = index; pairs[index] = start
    if stack or errors:
        outline.warn('词法结构未闭合，保留原文片段。')
        return 'unparsed', 'lexical-v1'
    root = outline.node('<module>', 'module', 0, len(outline.code), '', 'lexical_candidate')
    definitions = set()
    if outline.language == 'tongdaxin':
        start = 0
        for end, value in enumerate(values):
            if value != ';': continue
            if end - start >= 2 and WORD.fullmatch(values[start]) and values[start + 1] in (':', ':='):
                outline.node(values[start], 'formula', tokens[start].start(), tokens[end].end(), root, 'lexical_candidate')
                definitions.add(start)
            start = end + 1
        if start < len(tokens): outline.warn('末尾没有分号的内容保留在源码片段中，未识别为公式定义。')
    else:
        for index, value in enumerate(values):
            if value != '(' or index < 1 or not WORD.fullmatch(values[index - 1]) or values[index - 1] in CONTROL: continue
            end = pairs[index]
            if end + 1 >= len(tokens): continue
            name, first = values[index - 1], outline.line(tokens[index - 1].start())
            if outline.language == 'mql4' and values[end + 1] == '{':
                close = pairs[end + 1]
                outline.node(name, 'function', outline.offsets[first - 1], tokens[close].end(), root, 'lexical_candidate')
                definitions.add(index - 1)
            elif outline.language == 'pine' and values[end + 1] == '=>':
                header_end = outline.line(tokens[end + 1].end() - 1)
                indent = len(outline.lines[first - 1]) - len(outline.lines[first - 1].lstrip(' \t'))
                last = header_end
                lines = source_lines(masked)
                for row in range(header_end, len(lines)):
                    if not lines[row].strip(): continue
                    depth = len(lines[row]) - len(lines[row].lstrip(' \t'))
                    if depth <= indent: break
                    last = row + 1
                outline.node(name, 'function', outline.offsets[first - 1], outline.offsets[last], root, 'lexical_candidate')
                definitions.add(index - 1)
        if outline.language == 'pine':
            pattern = r'^(?:(?:var|varip|const)\s+)?(?:(?:int|float|bool|string|color)\s+)?(?P<name>[^\W\d]\w*)[ \t]*(?:=|:=)(?!=)'
        else:
            pattern = r'^[ \t]*(?:(?P<input>input|extern)[ \t]+)?(?:const[ \t]+)?(?:int|double|float|bool|string|color|datetime|ENUM_\w+)[ \t]+(?P<name>[^\W\d]\w*)[ \t]*(?=[=;\[])'
        for declaration in re.finditer(pattern, masked, re.M):
            start = declaration.start()
            if outline.owner(start) != root: continue
            line = outline.line(start)
            if outline.language == 'mql4':
                end = masked.find(';', declaration.end())
                if end < 0 or '{' in masked[declaration.end():end]: continue
                end += 1
                kind = 'parameter' if declaration.group('input') else 'variable'
            else:
                end = outline.offsets[line]
                # Retain a continued initializer without swallowing the next
                # top-level statement. Exact Pine semantics still need its compiler.
                for at, text in enumerate(source_lines(masked)[line:], line):
                    if not text.strip(): continue
                    if text == text.lstrip(' \t'): break
                    end = outline.offsets[at + 1]
                kind = 'parameter' if re.match(r'[ \t]*input(?:\.|\()', masked[declaration.end():]) else 'variable'
            outline.node(declaration.group('name'), kind, start, end, root, 'lexical_candidate')
            definitions.update(index for index, token in enumerate(tokens) if token.start() == declaration.start('name'))
    for index, token in enumerate(tokens):
        if index in definitions or not WORD.fullmatch(token[0]) or token[0] in CONTROL: continue
        call = index + 1 < len(tokens) and values[index + 1] == '('
        # Qualified calls retain their spelling and do not get matched to an
        # unrelated same-named local function.
        name = token[0]
        if index >= 2 and values[index - 1] in ('.', '::'):
            if not call: continue
            name = values[index - 2] + values[index - 1] + name
        outline.reference(outline.owner(token.start()), name, outline.line(token.start()), 'call' if call else 'read')
    outline.warn('仅词法结构候选，未调用原平台编译器；宏、类型、重载、作用域和实际执行依赖未解析。')
    return 'partial', 'lexical-v1'
