"""Lossless prompt-only sharing of repeated JSON facts; no evidence is selected out."""
import copy
import json
import re
from collections import Counter
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

VERSION = 'exact-json-facts-1'
MIN_CHARS = 180
MAX_CHARS = 160000
MAX_NODES = 100000
MAX_DEPTH = 80
MAX_FACTS = 2048


def dumps(value) -> str:
    try:
        result = json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
        result.encode('utf-8')
        return result
    except (TypeError, ValueError, OverflowError, RecursionError, UnicodeError) as exc:
        raise ValidationError('模型上下文含非JSON类型、非有限数值或超限结构') from exc


class Budget:
    def __init__(self):
        self.nodes = 0
        self.characters = 0

    def visit(self, value, depth):
        self.nodes += 1
        if self.nodes > MAX_NODES or depth > MAX_DEPTH:
            raise ValidationError('模型上下文展开超过节点或深度上限')
        if type(value) not in (dict,list,str,int,float,bool,type(None)):
            raise ValidationError('模型上下文只接受JSON类型')
        if isinstance(value,dict) and any(type(key) is not str for key in value):
            raise ValidationError('模型上下文对象键须为字符串')

    def account(self, value):
        if isinstance(value,dict):
            self.characters += 2 + max(0,len(value)-1) + sum(len(dumps(key))+1 for key in value)
        elif isinstance(value,list):
            self.characters += 2 + max(0,len(value)-1)
        else:
            self.characters += len(dumps(value))
        if self.characters > MAX_CHARS:
            raise ValidationError('模型上下文展开超过字符上限')


def encode(value: dict) -> dict:
    """Share exact subtrees only. Arrays and unknown/zero/failed facts survive."""
    if type(value) is not dict or len(dumps(value)) > MAX_CHARS:
        raise ValidationError('模型上下文不是有界对象')
    counts, budget = Counter(), Budget()
    def scan(item, depth=0):
        budget.visit(item,depth)
        if isinstance(item,(dict,list)):
            text = dumps(item)
            if len(text) >= MIN_CHARS:
                counts[text] += 1
            for child in item.values() if isinstance(item,dict) else item:
                scan(child,depth+1)
    scan(value)
    registry, known = {}, {}
    def pack(item):
        if not isinstance(item,(dict,list)):
            return item
        # User data that resembles our reference/literal marker stays literal.
        if isinstance(item,dict) and set(item) in ({'$fact'},{'$literal'}):
            return {'$literal':copy.deepcopy(item)}
        signature = dumps(item)
        if signature in known:
            return {'$fact':known[signature]}
        result = {key:pack(item[key]) for key in sorted(item)} if isinstance(item,dict) else [pack(child) for child in item]
        if counts[signature] >= 2:
            if len(registry) >= MAX_FACTS:
                raise ValidationError('模型上下文重复事实数量超过上限')
            label = 'metric' if isinstance(item,dict) and {'total_return','max_drawdown'} <= item.keys() else 'recipe' if isinstance(item,dict) and {'expression','bindings','parameters'} <= item.keys() else 'value'
            identity = f'{label}:{len(registry)+1}'
            known[signature] = identity
            registry[identity] = result
            return {'$fact':identity}
        return result
    packed = pack(value)
    # A small/no-duplicate input uses no references rather than growing a pool.
    if len(dumps({'context':packed,'exact_facts':registry})) >= len(dumps({'context':value,'exact_facts':{}})):
        packed, registry = copy.deepcopy(value), {}
        # Even the no-sharing form must escape marker-shaped user dictionaries.
        def literal(item):
            if isinstance(item,dict):
                return {'$literal':copy.deepcopy(item)} if set(item) in ({'$fact'},{'$literal'}) else {key:literal(item[key]) for key in sorted(item)}
            return [literal(child) for child in item] if isinstance(item,list) else item
        packed = literal(packed)
    result = {'encoding':VERSION,'context':packed,'exact_facts':registry,'canonical_hash':digest(value)}
    if digest(decode(result)) != digest(value):
        raise ValidationError('模型上下文无损核对失败')
    return result


def decode(value: dict) -> dict:
    """Bounded verifier, also rejecting cycles, dangling and unused facts."""
    if (type(value) is not dict or set(value) != {'encoding','context','exact_facts','canonical_hash'}
            or value['encoding'] != VERSION or type(value['exact_facts']) is not dict
            or len(value['exact_facts']) > MAX_FACTS or type(value['canonical_hash']) is not str
            or re.fullmatch(r'[0-9a-f]{64}',value['canonical_hash']) is None):
        raise ValidationError('模型上下文编码合同无效')
    registry = value['exact_facts']
    if any(type(key) is not str or re.fullmatch(r'(metric|recipe|value):[1-9][0-9]{0,3}',key) is None
            or type(item) not in (dict,list) for key,item in registry.items()):
        raise ValidationError('模型上下文事实字典无效')
    budget, used = Budget(), set()
    def unpack(item, stack=(), depth=0):
        budget.visit(item,depth)
        if isinstance(item,dict):
            if set(item) == {'$fact'}:
                key = item['$fact']
                if type(key) is not str or key not in registry or key in stack or len(stack) >= MAX_DEPTH:
                    raise ValidationError('模型上下文引用缺失或循环')
                used.add(key)
                return unpack(registry[key],(*stack,key),depth)
            if set(item) == {'$literal'}:
                # Copy through the bounded scanner without interpreting markers.
                def original(child, level):
                    budget.visit(child,level)
                    budget.account(child)
                    if isinstance(child,dict):return {key:original(part,level+1) for key,part in child.items()}
                    return [original(part,level+1) for part in child] if isinstance(child,list) else child
                if type(item['$literal']) is not dict or set(item['$literal']) not in ({'$fact'},{'$literal'}):
                    raise ValidationError('模型上下文原文包装无效')
                return original(item['$literal'],depth)
            budget.account(item)
            return {key:unpack(child,stack,depth+1) for key,child in item.items()}
        budget.account(item)
        return [unpack(child,stack,depth+1) for child in item] if isinstance(item,list) else item
    result = unpack(value['context'])
    if (type(result) is not dict or used != set(registry) or len(dumps(result)) > MAX_CHARS
            or digest(result) != value['canonical_hash']):
        raise ValidationError('模型上下文展开哈希、范围或事实覆盖不一致')
    return result


def instruction() -> str:
    return ('本次实验依据采用exact-json-facts-1无损表示：context是完整上下文，exact_facts只共享规范化后完全相同的JSON事实。'
        '遇到仅含$fact的对象，读取exact_facts中对应完整值；$literal包装的是原始数据，内部标记不得解释为引用。'
        '同一个共享值出现在不同窗口不表示窗口或样本独立；必须按原位置的外折、内层number和attempt_id解读。'
        '所有引用展开后与服务端完整证据逐值一致，未筛掉失败、未执行、缺测或负收益；不估算未知值。'
        '输出evidence_refs仍只使用下方给出的原始证据键，metric:/recipe:/value:共享标识不能作为引用、候选ID或参数名。'
        '不要在报告粘贴编码、共享字典或canonical_hash；报告写中文分析，服务端仍按完整原始事实校验。')
