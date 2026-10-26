"""Offset-preserving Pine input calls; transformed/dynamic initializers stay unknown."""
import re
from quant.source_structure.lexical import mask
from .source_values import text_literal, uncomment, UNKNOWN

INPUT=re.compile(r'^(?:(?:var|varip|const|input|simple|series)[ \t]+)?(?:(?:int|float|bool|string|color)[ \t]+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*input(?P<kind>\.[A-Za-z_][A-Za-z0-9_]*)?[ \t]*\(',re.M)
KINDS={'int':'int','integer':'int','float':'float','bool':'bool','boolean':'bool','string':'string',
    'symbol':'string','timeframe':'string','resolution':'string','session':'string','text_area':'string'}


def split_ranges(masked: str,start: int,end: int) -> list[tuple[int,int]]:
    result=[];stack=[];begin=start
    for at in range(start,end):
        char=masked[at]
        if char in '([{':stack.append(char)
        elif char in ')]}':
            if not stack or stack.pop()!= {')':'(',']':'[','}':'{'}[char]:raise ValueError('unbalanced')
        elif char==',' and not stack:result.append((begin,at));begin=at+1
    if stack:raise ValueError('unbalanced')
    return result+[(begin,end)]


def arguments(code: str,masked: str,start: int,end: int) -> tuple[list[str],dict[str,str]]:
    positional=[];named={};seen_named=False
    for begin,finish in split_ranges(masked,start,end):
        raw=code[begin:finish].strip()
        if not raw:raise ValueError('empty input argument')
        name=re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)',masked[begin:finish])
        if name:
            seen_named=True
            if name[1] in named:raise ValueError('duplicate input argument')
            named[name[1]]=code[begin+name.end():finish].strip()
        elif seen_named:raise ValueError('positional after named')
        else:positional.append(raw)
    return positional,named


def parse(code: str) -> tuple[list[dict],list[str],str]:
    masked,errors=mask(code,'pine')
    if errors:return [],['Pine注释或字符串未闭合；不使用局部声明。'],'unparsed'
    rows=[];warnings=[]
    for found in INPUT.finditer(masked):
        start=found.end();depth=1;end=start
        while end<len(masked) and depth:
            if masked[end]=='(':depth+=1
            elif masked[end]==')':depth-=1
            if depth:end+=1
        if depth:return [],['Pine输入调用括号未闭合；不使用截断声明。'],'unparsed'
        try:positional,named=arguments(code,masked,start,end)
        except ValueError:
            return [],['Pine输入参数重复、结构不完整或顺序无法判定；保留未解决。'],'unparsed'
        raw=named.get('defval',positional[0] if positional else '')
        if 'defval' in named and positional:return [],['Pine默认值同时按位置和名称提供，无法唯一匹配。'],'unparsed'
        value=text_literal(raw,pine=True)
        method=(found['kind'] or '')[1:]
        legacy=uncomment(named.get('type',positional[2] if not method and len(positional)>2 else '')).removeprefix('input.')
        kind=KINDS.get(method or legacy,value['kind'] if not method and not legacy else 'unknown')
        if kind=='float' and value['kind']=='int':value={'kind':'float','value':float(value['value'])}
        line_end=masked.find('\n',end)
        line_end=len(masked) if line_end<0 else line_end
        transformed=bool(masked[end+1:line_end].strip())
        # A continuation after the call may change the value assigned to this name.
        following=masked[line_end+1:].splitlines()
        first=next((line for line in following if line.strip()),'')
        transformed=transformed or bool(first and first!=first.lstrip(' \t'))
        constraints={}
        for field in ('minval','maxval','step'):
            if field in named:constraints[field]={'raw':named[field],'literal':text_literal(named[field],pine=True)}
        if 'options' in named:
            text=named['options'];part=mask(text,'pine')[0]
            choices=None
            if part.startswith('[') and part.endswith(']'):
                try:
                    parts=split_ranges(part,1,len(part)-1)
                    if len(parts)<=32:
                        values=[text_literal(text[a:b],pine=True) for a,b in parts]
                        if all(item['kind']!='unknown' for item in values):choices=values
                except ValueError:pass
            constraints['options']={'raw':text,'literals':choices}
        if transformed:
            value=dict(UNKNOWN);kind='unknown'
            warnings.append(f"{found['name']} 的input调用参与了其他表达式；不能把输入默认值当作该变量的最终默认值。")
        rows.append({'name':found['name'],'type':kind,'declaration':'input'+(found['kind'] or ''),
            'default_raw':raw,'line':code.count('\n',0,found.start())+1,'quote':code[found.start():end+1],
            'binding_kind':'transformed_input' if transformed else 'exposed_input','scope':'<module>',
            'default_value':value,'declared_constraints':constraints,'type_basis':'input_declaration'})
        if len(rows)>300:return [],['Pine输入声明超过300项；不使用截断结果。'],'limited'
    initialized={(row['name'],row['line']) for row in rows}
    assignments=re.compile(r'^(?:(?:var|varip|const)[ \t]+)?(?:(?:int|float|bool|string|color)[ \t]+)?(?P<name>[A-Za-z_][A-Za-z0-9_]*)[ \t]*=(?!=)[ \t]*(?P<value>[^\r\n]*)',re.M)
    for found in assignments.finditer(masked):
        line=code.count('\n',0,found.start())+1
        if (found['name'],line) in initialized:continue
        raw=code[found.start('value'):found.end('value')].strip()
        value=text_literal(raw,pine=True)
        if value['kind']=='unknown':continue
        row={'name':found['name'],'type':value['kind'],'declaration':'pine_assignment','default_raw':raw,
            'line':line,'quote':code[found.start():found.end()], 'binding_kind':'module_literal','scope':'<module>',
            'default_value':value,'declared_constraints':{},'type_basis':'literal_syntax'}
        rows.append(row)
        if re.search(r'\b'+re.escape(found['name'])+r'[ \t]*:=',masked):
            rows.append({**row,'binding_kind':'unresolved_write','default_value':dict(UNKNOWN)})
        if len(rows)>300:return [],['Pine声明与赋值超过300项；不使用截断结果。'],'limited'
    return rows,warnings+['仅解析直接顶层input/input.*调用的字面默认值及简单字面赋值；不求值函数、枚举、常量引用、源序列或转换表达式。',
        '具名minval/maxval/options只作源码声明核对；step是界面增量，不据此推断收益最优区间或强制数值网格。'],'partial'
