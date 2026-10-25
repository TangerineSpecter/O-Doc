"""Frozen source, actual arguments and exact fixed-sample comparison intent."""
import copy
import hashlib
import json
import math
from pathlib import PurePosixPath
import re
import unicodedata
from rest_framework import serializers
from quant.comparisons.output_compare import validate_policy
from quant.experiments.contracts import unpack_seed
from quant.experiments.proposal_contract import validate_values

FIELDS={'open','high','low','close','volume'}


def signature_hints(text):
    """Syntax-only hints. Never evaluate defaults, annotations, imports or source."""
    import ast
    try:tree=ast.parse(text)
    except (SyntaxError,ValueError,RecursionError,MemoryError):return []
    result=[]
    for node in tree.body:
        if not isinstance(node,ast.FunctionDef):continue
        args=node.args;names=[*args.posonlyargs,*args.args,*args.kwonlyargs]
        defaults=[None]*(len(args.posonlyargs)+len(args.args)-len(args.defaults))+list(args.defaults)+list(args.kw_defaults)
        result.append({'name':node.name,'supported':not args.posonlyargs and args.vararg is None and args.kwarg is None,
            'arguments':[{'name':arg.arg,'default_text':(ast.get_source_segment(text,default) or '')[:500] if default else ''}
                for arg,default in zip(names,defaults)]})
        if len(result)==40:break
    return result


class NativeInput(serializers.Serializer):
    def to_internal_value(self,data):
        if not isinstance(data,dict) or set(data)-set(self.fields):
            raise serializers.ValidationError({'non_field_errors':['原始Python验证包含未知字段']})
        for key in ('offset','row_count','seconds','warmup_bars'):
            if key in data and type(data[key]) is not int:
                raise serializers.ValidationError({key:['行数、偏移和运行秒数须为整数']})
        return super().to_internal_value(data)

    request_key=serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    name=serializers.CharField(max_length=200)
    source_id=serializers.CharField(max_length=40,required=False,allow_blank=True,default='')
    dataset_id=serializers.CharField(max_length=40)
    bindings=serializers.ListField(child=serializers.DictField(),max_length=30)
    parameters=serializers.ListField(child=serializers.DictField(),max_length=30)
    entrypoint=serializers.RegexField(r'^[A-Za-z_][A-Za-z0-9_]{0,99}$')
    arguments=serializers.ListField(child=serializers.DictField(),min_length=1,max_length=40)
    index=serializers.ChoiceField(choices=['range','timestamps'],default='range')
    output_column=serializers.CharField(max_length=100,required=False,allow_blank=True,default='')
    offset=serializers.IntegerField(min_value=0,max_value=19999,default=0)
    row_count=serializers.IntegerField(min_value=30,max_value=20000,required=False)
    seconds=serializers.IntegerField(min_value=1,max_value=30,default=10)
    absolute_tolerance=serializers.FloatField(min_value=0,max_value=.001,default=1e-9)
    relative_tolerance=serializers.FloatField(min_value=0,max_value=.001,default=1e-8)
    warmup_bars=serializers.IntegerField(min_value=0,max_value=2000,default=0)
    analyze=serializers.BooleanField(default=True)
    model_id=serializers.CharField(max_length=40,required=False,allow_blank=True,default='')


def source_files(payload):
    if payload.get('language') not in ('python','text','') or not payload.get('code','').strip():
        raise serializers.ValidationError('本运行器只接受原始Python源码，不转换其他平台脚本')
    files=([{key:row[key] for key in ('name','code','role')} for row in payload['files']]
        if payload.get('provenance')=='source_supplement' else [{'name':'__source__.py','code':payload['code'],'role':'primary'}])
    names=set();total=0;frozen=[]
    for row in files:
        name=row['name'];path=PurePosixPath(name);key=unicodedata.normalize('NFC',name).casefold()
        if (not name or len(name)>180 or path.is_absolute() or any(part in ('','.','..') for part in name.split('/'))
                or '\\' in name or any(ord(c)<32 or ord(c)==127 for c in name) or key in names):
            raise serializers.ValidationError('依赖文件名必须是无歧义的相对路径')
        names.add(key);total+=len(row['code'])
        frozen.append({'path':name,'text':row['code'],'role':row['role'],'sha256':hashlib.sha256(row['code'].encode()).hexdigest()})
    if not 1<=len(frozen)<=8 or total>150000 or sum(row['role']=='primary' for row in frozen)!=1:
        raise serializers.ValidationError('原始源码文件包超出运行器范围')
    return frozen


def arguments(raw,parameters):
    result=[];names=set()
    for value in raw:
        name=value.get('name','');kind=value.get('kind')
        if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,99}',name) or name in names:
            raise serializers.ValidationError('函数参数名须为不重复的Python标识符')
        names.add(name)
        fields={'name','kind'}|({'column'} if kind=='series' else {'columns'} if kind=='dataframe' else {'parameter'} if kind=='parameter' else {'value'} if kind=='literal' else set())
        if kind not in ('series','dataframe','parameter','literal') or set(value)!=fields:
            raise serializers.ValidationError('函数参数映射字段无效')
        if kind=='series' and (not isinstance(value['column'],str) or value['column'] not in FIELDS):raise serializers.ValidationError('序列需绑定已知行情列')
        if kind=='dataframe' and (not isinstance(value['columns'],list) or not value['columns'] or len(value['columns'])>6
                or any(not isinstance(column,str) or column not in FIELDS|{'timestamp'} for column in value['columns']) or len(set(value['columns']))!=len(value['columns'])):
            raise serializers.ValidationError('DataFrame需明确选择不重复的行情列')
        if kind=='parameter' and (not isinstance(value['parameter'],str) or value['parameter'] not in parameters):raise serializers.ValidationError('函数参数只能引用本次明确填写的实际参数')
        if kind=='literal':
            item=value['value']
            try:valid=item is None or type(item) is bool or type(item) is str and len(item)<=2000 or type(item) in (int,float) and math.isfinite(item)
            except OverflowError:valid=False
            if not valid:raise serializers.ValidationError('额外参数须为有界标量，不能包含嵌套对象')
        result.append(copy.deepcopy(value))
    if len(json.dumps(result,ensure_ascii=False,allow_nan=False))>12000:
        raise serializers.ValidationError('函数参数映射超过12000字，请缩小固定验证范围')
    return result


def build(candidate,source,dataset,values,environment):
    data=candidate.data
    seed=unpack_seed({'candidate_id':candidate.pk,'bindings':values['bindings'],'parameters':values['parameters'],'variants':[]},data)
    validate_values(data,seed['parameters'])
    files=source_files(source.payload);size=len(dataset.snapshot['rows']);offset=values['offset']
    count=values.get('row_count',min(2000,size-offset))
    if offset+count>size or count<30:raise serializers.ValidationError('固定片段必须被行情完整覆盖，至少30行')
    policy={'version':1,**{key:values[key] for key in ('absolute_tolerance','relative_tolerance','warmup_bars')}}
    validate_policy(policy,count)
    return {'version':1,'method':'original-python-fixed-output-v1','name':values['name'],
        'candidate':{'id':candidate.pk,'hash':candidate.content_hash,'data':copy.deepcopy(data),
            'bindings':seed['bindings'],'parameters':seed['parameters']},
        'source':{'id':source.pk,'hash':source.content_hash,'files':files,'main':next(row['path'] for row in files if row['role']=='primary')},
        'dataset':{'id':dataset.pk,'hash':dataset.content_hash,'offset':offset,'row_count':count},
        'native':{'entrypoint':values['entrypoint'],'arguments':arguments(values['arguments'],seed['parameters']),
            'index':values['index'],'output_column':values['output_column'],'seconds':values['seconds'],
            'output_type':data['output_type'],'argument_policy':'all_explicit_no_source_default_substitution'},
        'policy':policy,'environment':copy.deepcopy(environment),'analyze':values['analyze'],
        'claim':'one_original_python_process_fixed_sample_not_platform_global_or_financial_equivalence'}


def payload(plan,snapshot):
    native=plan['native'];arguments=[]
    for row in native['arguments']:
        if row['kind']=='parameter':arguments.append({'name':row['name'],'kind':'literal','value':plan['candidate']['parameters'][row['parameter']]})
        else:arguments.append(copy.deepcopy(row))
    start=plan['dataset']['offset'];end=start+plan['dataset']['row_count']
    return {key:copy.deepcopy(native[key]) for key in ('entrypoint','index','output_column','seconds','output_type')}|{
        'arguments':arguments,'rows':copy.deepcopy(snapshot['rows'][start:end]),'main':plan['source']['main'],
        'files':[{key:row[key] for key in ('path','text')} for row in plan['source']['files']]}
