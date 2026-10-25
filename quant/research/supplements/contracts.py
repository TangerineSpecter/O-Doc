"""Canonical source-file assembly shared by writes and snapshot validation."""
import copy
import hashlib
import unicodedata
from pathlib import PurePosixPath
from rest_framework import serializers
from quant.research.contracts import digest
from quant.source_structure.common import source_lines


class SourceFileInput(serializers.Serializer):
    name = serializers.CharField(max_length=160,trim_whitespace=False)
    code = serializers.CharField(max_length=100000, trim_whitespace=False)

    def validate_name(self, value):
        parts=value.split('/')
        allowed=all(char in '._-/ ' or unicodedata.category(char)[0] in 'LNM' for char in value)
        if not allowed or any(part in ('', '.', '..') or part!=part.strip() for part in parts) or PurePosixPath(value).suffix.lower() not in ('.py','.pine','.mq4','.mqh','.tdx','.txt'):
            raise serializers.ValidationError('文件名需为相对源码路径，不含 . 或 .. 路径段')
        return value

    def validate_code(self, value):
        if not value.strip() or '\x00' in value:
            raise serializers.ValidationError('依赖源码不能为空或包含空字符')
        return value


class SupplementInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    expected_source_id = serializers.CharField(max_length=40)
    reason = serializers.CharField(max_length=2000)
    files = SourceFileInput(many=True, min_length=1, max_length=4)
    analyze = serializers.BooleanField(default=True)
    model_id = serializers.CharField(max_length=40, allow_blank=True, default='')

    def validate_files(self, value):
        if len({unicodedata.normalize('NFC',row['name']).casefold() for row in value}) != len(value):
            raise serializers.ValidationError('同次提交的文件名不能重复或仅大小写不同')
        return value


def identity(material_id: str, request_key: str) -> str:
    return digest(['source-supplement-v1',material_id,request_key])[:40]


def file_hash(code: str) -> str:
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def build(parent_id: str, parent_hash: str, parent: dict, submission: dict) -> dict:
    if submission['expected_source_id'] != parent_id or parent.get('provenance') == 'external_feedback' or not parent.get('code','').strip():
        raise serializers.ValidationError('补充依赖须基于当前主源码快照，不能修改反馈资料')
    language = parent.get('language','text')
    depth = (parent['bundle_depth'] if parent.get('provenance')=='source_supplement' else 0)+1
    if depth>64:
        raise serializers.ValidationError('依赖补充最多64层，请重新收集为独立研究')
    if parent.get('provenance') == 'source_supplement':
        files = [{key:row[key] for key in ('name','code','role')} for row in parent['files']]
    else:
        extension = {'python':'py','pine':'pine','mql4':'mq4','tongdaxin':'tdx'}.get(language,'txt')
        files = [{'name':f'__source__.{extension}','code':parent['code'],'role':'primary'}]
    files = copy.deepcopy(files)
    changes = []
    for supplied in submission['files']:
        normalized=unicodedata.normalize('NFC',supplied['name']).casefold()
        existing = next((row for row in files if unicodedata.normalize('NFC',row['name']).casefold()==normalized),None)
        if existing and (existing['role']=='primary' or existing['name'] != supplied['name']):
            raise serializers.ValidationError('不能覆盖主源码；替换依赖须使用完全相同的文件名')
        before = file_hash(existing['code']) if existing else ''
        if existing and before==file_hash(supplied['code']):
            continue
        row = dict(supplied,role='dependency')
        if existing:
            files[files.index(existing)] = row
        else:
            files.append(row)
        changes.append({'name':row['name'],'before_hash':before,'after_hash':file_hash(row['code']),
            'action':'replace' if existing else 'add'})
    if len(files)>8:
        raise serializers.ValidationError('每份来源最多保留主源码及7份依赖文件')
    if not changes:
        raise serializers.ValidationError('所提交的依赖源码没有变化')
    rendered, line = [], 1
    prefix = '#' if language=='python' else '//'
    for row in files:
        origin = 'from parent snapshot' if row['role']=='primary' else 'user supplied'
        header = f'{prefix} SOURCE FILE: {row["name"]} ({row["role"]}; {origin}; not executed)\n'
        if language=='tongdaxin':
            header = f'{{ SOURCE FILE: {row["name"]} ({row["role"]}; {origin}; not executed) }}\n'
        row.update(content_hash=file_hash(row['code']),start_line=line+1,
            end_line=line+len(source_lines(row['code'])))
        block = header+row['code']+'\n\n'
        rendered.append(block)
        line += len(source_lines(block))
    code = ''.join(rendered)
    if len(code)>150000:
        raise serializers.ValidationError('主源码与全部依赖合计最多150000字符（含文件定位标记）')
    value = {key:parent.get(key,'') for key in ('title','description','url','platform','language_version','dependencies','parameters','web_markdown',
        'final_url','fetched_at','extraction_method','extraction_confidence','code_origin')}
    value.update(language=language,code=code,provenance='source_supplement',fetch_status='supplied',bundle_version=1,bundle_depth=depth,
        parent_source_id=parent_id,parent_source_hash=parent_hash,submission=copy.deepcopy(submission),
        request_fingerprint=digest(submission),files=files,changes=changes,
        claim='user_supplied_dependencies_preserved_primary_not_native_installation_or_equivalence')
    return value
