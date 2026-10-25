"""Lossless metric tables and deterministic signs for native-report model input."""
import copy
import math


def columns(metrics):
    return sorted({key for value in metrics if isinstance(value,dict) for key in value})


def packed(value,names):
    if not isinstance(value,dict):return copy.deepcopy(value)
    result={'values':[copy.deepcopy(value.get(name)) for name in names]}
    if set(value)!=set(names):result['present']=[name for name in names if name in value]
    return result


def sign_counts(attempts):
    counts={}
    for attempt in attempts:
        for phase in ('train','validation'):
            group=counts.setdefault(phase,{'positive':0,'negative':0,'zero':0,'unknown':0})
            value=((attempt.get('metrics') or {}).get(phase) or {}).get('total_return')
            if type(value) not in (int,float) or not math.isfinite(value):group['unknown']+=1
            else:group['negative' if value<0 else 'positive' if value>0 else 'zero']+=1
    return counts


def statistics(memory):
    result=[]
    for item in (memory or {}).get('items',[]):
        if item['kind']!='experiment':continue
        attempts=item['evidence'].get('attempts',[])
        operations=sorted({row.get('operation','') for row in attempts})
        result.append({'id':item['id'],'kind':'experiment','attempt_count':len(attempts),'signs':sign_counts(attempts),
            'by_operation':[{ 'operation':operation,'attempt_count':sum(row.get('operation','')==operation for row in attempts),
                'signs':sign_counts([row for row in attempts if row.get('operation','')==operation])} for operation in operations],
            'scope':'frozen_historical_records_not_current_or_independent_performance'})
    return result


def model_memory(memory):
    value=copy.deepcopy(memory)
    for item in value.get('items',[]):
        evidence=item.get('evidence',{})
        if item['kind']=='experiment':
            attempts=evidence.get('attempts',[])
            names=columns([metric for row in attempts for metric in (row.get('metrics') or {}).values()])
            evidence['metrics_columns']=names;evidence['metrics_encoding']='columns-values-v1'
            for row in attempts:
                row['metrics']={phase:packed(metric,names) for phase,metric in (row.get('metrics') or {}).items()}
        elif item['kind']=='fixed_validation':
            names=columns([evidence.get('final'),evidence.get('baseline')])
            evidence['metrics_columns']=names;evidence['metrics_encoding']='columns-values-v1'
            for key in ('final','baseline'):evidence[key]=packed(evidence.get(key),names)
    return value
