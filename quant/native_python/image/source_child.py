"""Untrusted source executes here, already under a separate low-privilege UID."""
import importlib.util
import contextlib
import inspect
import json
import math
from pathlib import Path
import resource
import sys
import tempfile

import numpy as np
import pandas as pd


def scalar(value,output_type):
    if value is None or value is pd.NA:return None
    if isinstance(value,np.generic):value=value.item()
    if type(value) is float and math.isnan(value):return None
    if output_type=='boolean_series':
        if type(value) is not bool:raise ValueError('boolean_output_required')
    elif type(value) not in (int,float) or not math.isfinite(value):raise ValueError('finite_numeric_output_required')
    return value


def evaluate(request):
    rows=request['rows'];size=len(rows)
    index=pd.RangeIndex(size) if request['index']=='range' else pd.to_datetime([r['timestamp'] for r in rows],utc=True)
    arguments={}
    for binding in request['arguments']:
        if binding['kind']=='series':
            arguments[binding['name']]=pd.Series([row[binding['column']] for row in rows],index=index,name=binding['column'])
        elif binding['kind']=='dataframe':
            arguments[binding['name']]=pd.DataFrame({column:[row[column] for row in rows] for column in binding['columns']},index=index)
        elif binding['kind']=='literal':arguments[binding['name']]=binding['value']
        else:raise ValueError('unsupported_argument_kind')
    with tempfile.TemporaryDirectory(prefix='source-') as directory:
        root=Path(directory)
        for item in request['files']:
            path=root/item['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_text(item['text'],encoding='utf-8')
        sys.path.insert(0,str(root))
        spec=importlib.util.spec_from_file_location('odoc_source',root/request['main'])
        module=importlib.util.module_from_spec(spec);sys.modules['odoc_source']=module;spec.loader.exec_module(module)
        function=getattr(module,request['entrypoint'])
        signature=inspect.signature(function)
        if any(parameter.kind in (parameter.POSITIONAL_ONLY,parameter.VAR_POSITIONAL,parameter.VAR_KEYWORD)
               for parameter in signature.parameters.values()):raise ValueError('unsupported_function_signature')
        # Every argument is explicit. Source defaults do not stand in for this case.
        if set(arguments)!=set(signature.parameters):raise ValueError('all_function_arguments_must_be_explicit')
        signature.bind(**arguments)
        value=function(**arguments)
        column=request['output_column']
        if isinstance(value,(pd.DataFrame,dict)):
            if not column or column not in value:raise ValueError('explicit_output_column_required')
            value=value[column]
        elif column:raise ValueError('output_column_on_non_mapping')
        if isinstance(value,pd.Series):
            if not value.index.equals(index):raise ValueError('output_index_mismatch')
            value=value.tolist()
        elif isinstance(value,np.ndarray):
            if value.ndim!=1:raise ValueError('one_dimensional_output_required')
            value=value.tolist()
        if not isinstance(value,(list,tuple)) or len(value)!=size:raise ValueError('one_output_per_input_row_required')
        return [scalar(v,request['output_type']) for v in value]


def main():
    request=json.load(sys.stdin);seconds=request['seconds']
    resource.setrlimit(resource.RLIMIT_CPU,(seconds+1,seconds+2))
    resource.setrlimit(resource.RLIMIT_FSIZE,(1024*1024,1024*1024))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    try:
        with contextlib.redirect_stdout(sys.stderr):values=evaluate(request)
        result={'status':'completed','values':values}
    except ModuleNotFoundError:result={'status':'failed','reason':'dependency_unavailable'}
    except Exception as error:
        allowed={'boolean_output_required','finite_numeric_output_required','unsupported_function_signature',
            'all_function_arguments_must_be_explicit','explicit_output_column_required','output_column_on_non_mapping',
            'output_index_mismatch','one_dimensional_output_required','one_output_per_input_row_required'}
        reason=str(error)
        result={'status':'failed','reason':reason if reason in allowed else 'source_execution_error'}
    sys.stdout.write(json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n')


if __name__=='__main__':main()
