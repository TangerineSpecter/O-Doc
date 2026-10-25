"""Missing-value positions from controlled IR and saved original outputs only."""
from quant.native_python.calculation import portable,validate_values

METHOD='fixed-output-missing-alignment-v1'
MAX_EXAMPLES=12


def edges(values,rows):
    indices=[index for index,value in enumerate(values) if value is not None]
    def point(index):return {'index':index,'timestamp':rows[index]['timestamp']}
    return {'first_valid':point(indices[0]) if indices else None,'last_valid':point(indices[-1]) if indices else None,
        'missing_count':len(values)-len(indices)}


def summarize(plan,snapshot,data):
    size=plan['dataset']['row_count'];warmup=plan['policy']['warmup_bars']
    if type(size) is not int or not 30<=size<=20000 or type(warmup) is not int or not 0<=warmup<size:
        raise ValueError('fixed alignment row bounds invalid')
    result={'version':1,'method':METHOD,'position_convention':'zero_based_within_fixed_sample',
        'sample_row_count':size,'compared_start_index':warmup,'status':'unavailable','reason':data.get('reason') or 'original_output_unavailable',
        'left':None,'right':None,'compared':None}
    if data['status']!='completed':return result
    rows,left=portable(plan,snapshot)
    right=data['native_values'];validate_values(right,plan['candidate']['data']['output_type'],len(rows))
    if len(rows)!=size or len(left)!=size:raise ValueError('fixed alignment sample size changed')
    differences=[];total=0;left_missing=right_missing=both_missing=0
    for index in range(warmup,size):
        lm=left[index] is None;rm=right[index] is None
        left_missing+=lm;right_missing+=rm;both_missing+=lm and rm
        if lm!=rm:
            total+=1
            if len(differences)<MAX_EXAMPLES:differences.append({'index':index,'timestamp':rows[index]['timestamp'],
                'left_missing':lm,'right_missing':rm})
    return {**result,'status':'available','reason':'','left':edges(left,rows),'right':edges(right,rows),
        'compared':{'row_count':size-warmup,'left_missing':left_missing,'right_missing':right_missing,'both_missing':both_missing,
            'missing_mismatch_total':total,'missing_mismatch_examples':differences,'omitted_missing_mismatches':total-len(differences)}}


def acknowledgment(value):
    available=value['status']=='available'
    def first(side):
        point=value[side]['first_valid'] if available else None
        return point['index'] if point else None
    return {'method':METHOD,'status':value['status'],'sample_row_count':value['sample_row_count'],
        'compared_start_index':value['compared_start_index'],'left_first_valid_index':first('left'),'right_first_valid_index':first('right'),
        'missing_mismatch_total':value['compared']['missing_mismatch_total'] if available else None,
        'missing_mismatch_indices':[row['index'] for row in value['compared']['missing_mismatch_examples']] if available else [],
        'omitted_missing_mismatches':value['compared']['omitted_missing_mismatches'] if available else None}


def validate_ack(value):
    keys={'method','status','sample_row_count','compared_start_index','left_first_valid_index','right_first_valid_index',
        'missing_mismatch_total','missing_mismatch_indices','omitted_missing_mismatches'}
    if not isinstance(value,dict) or set(value)!=keys or value['method']!=METHOD or value['status'] not in ('available','unavailable'):
        raise ValueError('missing alignment acknowledgment invalid')
    size=value['sample_row_count'];start=value['compared_start_index'];indices=value['missing_mismatch_indices']
    if (type(size) is not int or not 30<=size<=20000 or type(start) is not int or not 0<=start<size
            or any(item is not None and (type(item) is not int or not 0<=item<size) for item in [value['left_first_valid_index'],value['right_first_valid_index']])
            or not isinstance(indices,list) or len(indices)>MAX_EXAMPLES
            or any(type(item) is not int or not start<=item<size for item in indices) or indices!=sorted(set(indices))):
        raise ValueError('missing alignment positions invalid')
    total=value['missing_mismatch_total'];omitted=value['omitted_missing_mismatches']
    if value['status']=='unavailable':
        if any(value[key] is not None for key in ('left_first_valid_index','right_first_valid_index','missing_mismatch_total','omitted_missing_mismatches')) or indices:
            raise ValueError('unavailable alignment cannot invent positions')
    elif type(total) is not int or not 0<=total<=size-start or type(omitted) is not int or omitted<0 or omitted+len(indices)!=total:
        raise ValueError('missing alignment totals invalid')


