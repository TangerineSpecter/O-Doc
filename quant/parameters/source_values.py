"""Bounded scalar syntax, never eval/execute source or resolve names."""
import ast
import math
from .mql_set import literal

UNKNOWN={'kind':'unknown','value':None}


def uncomment(raw: str) -> str:
    chars=[];at=0
    while at<len(raw):
        if raw[at] in ('"',"'"):
            quote=raw[at];chars.append(quote);at+=1
            while at<len(raw):
                char=raw[at];chars.append(char);at+=1
                if char=='\\' and at<len(raw):chars.append(raw[at]);at+=1
                elif char==quote:break
        elif raw.startswith('//',at):
            end=raw.find('\n',at);at=len(raw) if end<0 else end
        elif raw.startswith('/*',at):
            end=raw.find('*/',at+2)
            if end<0:return raw
            chars.append(' ');at=end+2
        else:chars.append(raw[at]);at+=1
    return ''.join(chars).strip()


def scalar(value) -> dict:
    kind={bool:'bool',int:'int',float:'float',str:'string'}.get(type(value))
    if (kind is None or kind=='int' and abs(value)>2**53-1 or kind=='float' and not math.isfinite(value)
            or kind=='string' and (len(value)>2000 or '\x00' in value)):
        return dict(UNKNOWN)
    return {'kind':kind,'value':value}


def python_node(node) -> dict:
    if isinstance(node,ast.Constant):return scalar(node.value)
    if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)) and isinstance(node.operand,ast.Constant) and type(node.operand.value) in (int,float):
        return scalar(node.operand.value if isinstance(node.op,ast.UAdd) else -node.operand.value)
    return dict(UNKNOWN)


def quoted(raw: str, *, pine=False) -> dict:
    if len(raw)>8000 or len(raw)<2 or raw[0] not in ('"',"'") or raw[-1]!=raw[0]:return dict(UNKNOWN)
    if pine:
        chars=[];at=1;escapes={'n':'\n','r':'\r','t':'\t','\\':'\\','"':'"',"'":"'"}
        while at<len(raw)-1:
            char=raw[at]
            if char=='\\':
                at+=1
                if at>=len(raw)-1 or raw[at] not in escapes:return dict(UNKNOWN)
                char=escapes[raw[at]]
            elif char==raw[0] or char in '\r\n':return dict(UNKNOWN)
            chars.append(char);at+=1
        return scalar(''.join(chars))
    try:return python_node(ast.parse(raw,mode='eval').body)
    except (SyntaxError,ValueError,RecursionError,MemoryError):return dict(UNKNOWN)


def text_literal(raw: str, *, pine=False) -> dict:
    raw=uncomment(raw) if pine else raw.strip()
    if raw.startswith(('"',"'")):return quoted(raw,pine=pine)
    return literal(raw)


def configured(raw: str, expected: str, language: str) -> dict:
    if expected=='string':
        if raw.startswith(('"',"'")) and raw[-1:]==raw[:1]:return quoted(raw,pine=language=='pine')
        return scalar(raw)
    value=text_literal(raw,pine=language=='pine')
    if expected=='float' and value['kind']=='int':return {'kind':'float','value':float(value['value'])}
    return value
