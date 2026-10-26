"""Versioned cross-language syntax comparison; never converts guesses into live values."""
import copy
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .comparison import compare as legacy_compare
from .source_values import configured, UNKNOWN

VERSION='source-parameters-2'
LIMITATIONS=[
    '报告参数是外部声明，不证明真实运行；缺失实际值保持缺失，不使用源码默认值补齐。',
    '只匹配固定源码中唯一且区分大小写的可识别名称；函数重名、重复声明、重写或作用域不明确时保留歧义。',
    '函数默认形参、公开输入和模块初始字面赋值分开；初始赋值不是公开可调输入，也不证明运行时全程不变；修改源码赋值须形成新版本。',
    '字面默认值不等于当前运行值；不执行源码、不展开依赖或宏、不解析动态配置，不把声明范围当推荐参数区域。',
]


def with_refs(value: dict) -> dict:
    result=copy.deepcopy(value)
    binding=digest([VERSION,result])
    root='source-parameters:'+binding[:24]
    refs=[root]
    for field in ('rows','missing'):
        for index,row in enumerate(result[field]):
            row['ref']='source-parameter:'+digest([binding,field,index,row['name']])[:24]
            refs.append(row['ref'])
    result.update(ref=root,refs=refs)
    return result


def declarations(payload: dict) -> tuple[list[dict],list[str],str]:
    code=payload.get('code','');language=payload.get('language','')
    if len(code)>200000:return [],['源码超过20万字符，未运行参数语法解析。'],'limited'
    if language=='pine':
        from .pine_declarations import parse
        return parse(code)
    if language=='python':
        from .python_declarations import parse
        return parse(code)
    return [],['该语言尚无确定性声明读取器；通达信等外部参数表缺失时不猜造默认值。'],'unsupported'


def constraint_mismatch(value: dict, declaration: dict) -> bool:
    constraints=declaration['declared_constraints']
    if value['kind'] in ('int','float'):
        for name,op in (('minval',lambda a,b:a<b),('maxval',lambda a,b:a>b)):
            bound=constraints.get(name,{}).get('literal',UNKNOWN)
            if bound['kind'] in ('int','float') and op(value['value'],bound['value']):return True
    choices=constraints.get('options',{}).get('literals')
    if choices is not None and not any(row['kind']==value['kind'] and row['value']==value['value']
            or value['kind'] in ('int','float') and row['kind'] in ('int','float') and row['value']==value['value'] for row in choices):return True
    return False


def compare(snapshot: dict,target: dict) -> dict:
    language=target['payload'].get('language','')
    if language=='mql4':
        result=legacy_compare(snapshot,target)
        return with_refs({**result,'version':2,'parser':VERSION,'source_language':language,'parser_status':'partial',
            'limitations':copy.deepcopy(LIMITATIONS)+result['limitations']})
    rows,warnings,status=declarations(target['payload'])
    names={}
    for row in rows:names.setdefault(row['name'],[]).append(row)
    compared=[]
    for item in snapshot['parameters']:
        if not isinstance(item,dict) or not isinstance(item.get('name'),str) or not isinstance(item.get('raw_value'),str):
            raise ValidationError('运行参数名称和值必须是原始字符串')
        matches=names.get(item['name'],[]);declaration=matches[0] if len(matches)==1 else None
        kind=declaration['type'] if declaration else 'unknown'
        value=configured(item['raw_value'],kind,language)
        default=copy.deepcopy(declaration['default_value']) if declaration else None
        result='ambiguous' if len(matches)>1 else 'unresolved' if not declaration else 'unknown_type'
        if declaration:
            if declaration['binding_kind'] in ('transformed_input','unresolved_write'):result='unresolved'
            elif kind in ('int','float','bool','string'):
                if value['kind']!=kind:result='type_mismatch'
                elif default['kind']=='unknown':result='default_unknown'
                elif default['kind']!=kind:result='unknown_type'
                elif constraint_mismatch(value,declaration):result='constraint_mismatch'
                else:
                    same=value['value']==default['value']
                    result=('literal_same' if same else 'literal_differs') if declaration['binding_kind']=='module_literal' else 'same' if same else 'different'
        compared.append({'name':item['name'],'configured':value,'declaration':declaration,'default':default,'status':result})
    present={row['name'] for row in snapshot['parameters']}
    return with_refs({'version':2,'parser':VERSION,'source_language':language,'parser_status':status,
        'source_id':target['id'],'source_hash':target['content_hash'],'rows':compared,
        'missing':[row for row in rows if row['name'] not in present and row['binding_kind'] in ('exposed_input','function_default')],
        'limitations':copy.deepcopy(LIMITATIONS)+warnings})
