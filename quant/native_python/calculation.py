"""The host calculates only the controlled IR; original Python stays in Docker."""
import time
from rest_framework.exceptions import ValidationError
from quant.comparisons.output_compare import compare_outputs
from quant.experiments.expression import calculate
from quant.factors.expression import finite_number
from .contracts import payload
from . import runtime

METHOD='original-python-fixed-output-v1'
CLAIM='stored_python_text_process_outputs_fixed_sample_not_platform_global_or_financial_equivalence'
REASONS={'dependency_unavailable','source_execution_error','unsupported_function_signature',
    'all_function_arguments_must_be_explicit','explicit_output_column_required','output_column_on_non_mapping',
    'output_index_mismatch','one_dimensional_output_required','one_output_per_input_row_required',
    'boolean_output_required','finite_numeric_output_required','source_wall_time_exceeded','source_output_exceeded',
    'invalid_source_output','source_process_failed','invalid_request','input_exceeded',
    'docker_unavailable','docker_operation_unavailable','runner_image_unavailable','runner_image_contract_mismatch',
    'runner_probe_unavailable','runner_rebuild_required','native_container_failed','native_runner_invalid_output',
    'native_container_output_exceeded','native_host_wall_time_exceeded','portable_calculation_failed',
    'native_runtime_changed','native_output_contract_invalid','cancelled','native_execution_failed'}


def failed(reason,status='failed'):
    if reason not in REASONS:reason='native_execution_failed'
    return {'version':1,'method':METHOD,'status':status,'reason':reason,'native_values':None,'comparison':None,
        'claim':CLAIM,'independent_validation':False,'platform_equivalence':'unverified'}


def portable(plan,snapshot,check=lambda:None):
    start=plan['dataset']['offset'];rows=snapshot['rows'][start:start+plan['dataset']['row_count']]
    candidate=plan['candidate'];data=candidate['data']
    values=calculate(data['expression'],{key:[row[column] for row in rows] for key,column in candidate['bindings'].items()},
        candidate['parameters'],expected=data['output_type'],check=check,deadline=time.monotonic()+10)
    return rows,values


def validate_values(values,kind,size):
    if not isinstance(values,list) or len(values)!=size:raise ValueError('native_output_contract_invalid')
    if any(value is not None and (type(value) is not bool if kind=='boolean_series' else not finite_number(value)) for value in values):
        raise ValueError('native_output_contract_invalid')


def compare(plan,rows,expected,native,check=lambda:None):
    validate_values(native,plan['candidate']['data']['output_type'],len(rows))
    data=plan['candidate']['data']
    result=compare_outputs([row['timestamp'] for row in rows],expected,native,plan['policy'],
        left_output_type=data['output_type'],right_output_type=data['output_type'],left_units=data['units'],right_units=data['units'],
        left_role=data['role'],right_role=data['role'],check=check,deadline=time.monotonic()+15)
    result['claim']=CLAIM
    result['limitations'][0]='比较固定存储Python文本函数与受控表达式在本次实际参数、输入和容差下的输出；不证明平台、全局或经济等价。'
    result['limitations'].append('输出单位和用途取候选的声明，不是原函数单位的独立认证。')
    return result


def evaluate(plan,snapshot,check=lambda:None):
    try:rows,expected=portable(plan,snapshot,check)
    except (ValidationError,TimeoutError,ArithmeticError):return failed('portable_calculation_failed')
    check()
    try:
        current=runtime.probe(plan['environment']['image_id'])
        if current!=plan['environment']:return failed('native_runtime_changed')
        result=runtime.run(payload(plan,snapshot),plan['environment'],check=check)
    except (runtime.RuntimeUnavailable,ValueError,OSError,TimeoutError) as error:
        return failed(str(error) if str(error) in REASONS else 'native_execution_failed')
    if result.get('status')!='completed':
        reason=result.get('reason','native_execution_failed')
        return failed(reason)
    child=result.get('result')
    if not isinstance(child,dict) or child.get('status')!='completed':
        return failed(child.get('reason','native_execution_failed') if isinstance(child,dict) else 'native_runner_invalid_output')
    try:comparison=compare(plan,rows,expected,child.get('values'),check)
    except (ValueError,ValidationError,TimeoutError):return failed('native_output_contract_invalid')
    return {'version':1,'method':METHOD,'status':'completed','reason':'','native_values':child['values'],'comparison':comparison,
        'claim':CLAIM,'independent_validation':False,'platform_equivalence':'unverified'}
