"""Versioned historical evidence for source review; optional prose editing is separate."""
import copy
from rest_framework.exceptions import ValidationError


def uses_history(version):
    return type(version) is int and version in (12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40, 41, 42)


def options(factors):
    return [{'id':f'current-extraction:{index}','candidate':value} for index,value in enumerate(factors)]


def review(value,outputs):
    memory=outputs['compare']['research_memory']
    from quant.research_memory.assessment import validate_assessment,references
    return {'source_memory_version':1,'research_memory':copy.deepcopy(memory),**({'memory_note':'本次未纳入相关历史研究（系统记录）。','memory_assessment':[]} | validate_assessment(value,references(memory),version=3))}


def extension(value):
    fields={'source_memory_version','research_memory','memory_note','memory_assessment'}
    if not fields.intersection(value): return {}
    if (not fields<=value.keys() or type(value['source_memory_version']) is not int or value['source_memory_version']!=1
            or not isinstance(value['research_memory'],dict) or value['research_memory'].get('version')!=3):
        raise ValidationError('源码研究的历史依据合同不完整')
    from quant.research_memory.contract import validate_header
    from quant.research_memory.assessment import validate_assessment,references
    memory=value['research_memory'];validate_header(memory,latest_at=memory.get('cutoff'))
    return {'source_memory_version':1,'research_memory':copy.deepcopy(memory),**validate_assessment(value,references(memory),version=3)}


def retain_on_resume(version,old_source,new_source,old_requirements,new_requirements,prior_input,outputs):
    """A continuation with unchanged upstream facts keeps the original history cutoff."""
    if not uses_history(version) or old_source!=new_source or old_requirements!=new_requirements or not prior_input:return False
    from .contracts import dependencies
    from quant.research.contracts import digest
    return prior_input.get('dependencies')=={key:digest(outputs[key]) for key in dependencies('compare',version)}
