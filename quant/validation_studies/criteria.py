"""Preregistered numeric rules; thresholds never imply global validation."""
import math
from rest_framework import serializers

TOLERANCE=1e-12
FIELDS=('min_total_return','max_drawdown','min_excess_return','min_signal_coverage','min_entries')
METRICS={'min_total_return':('total_return','gte','fraction'),
    'max_drawdown':('max_drawdown','lte','fraction'),
    'min_excess_return':('excess_return','gte','fraction'),
    'min_signal_coverage':('signal_coverage','gte','fraction'),
    'min_entries':('entries','gte','count')}


class FiniteFloat(serializers.FloatField):
    def to_internal_value(self,value):
        if isinstance(value,bool):
            raise serializers.ValidationError('标准须为有限数值，不能使用布尔值')
        try:
            parsed=super().to_internal_value(value)
        except OverflowError as error:
            raise serializers.ValidationError('标准数值过大') from error
        if not math.isfinite(parsed):
            raise serializers.ValidationError('标准须为有限数值')
        return parsed


class EntryCount(serializers.IntegerField):
    def to_internal_value(self,value):
        if isinstance(value,bool):
            raise serializers.ValidationError('入场次数须为整数，不能使用布尔值')
        return super().to_internal_value(value)


class CriteriaInput(serializers.Serializer):
    min_total_return=FiniteFloat(min_value=-1,max_value=1000,required=False,allow_null=True,default=None)
    max_drawdown=FiniteFloat(min_value=0,max_value=1,required=False,allow_null=True,default=None)
    min_excess_return=FiniteFloat(min_value=-1000,max_value=1000,required=False,allow_null=True,default=None)
    min_signal_coverage=FiniteFloat(min_value=0,max_value=1,required=False,allow_null=True,default=None)
    min_entries=EntryCount(min_value=0,max_value=100000,required=False,allow_null=True,default=None)

    def to_internal_value(self,data):
        if not isinstance(data,dict) or set(data)-set(FIELDS):
            raise serializers.ValidationError('登记标准包含未知字段')
        return super().to_internal_value(data)

    def validate(self,value):
        if all(value[key] is None for key in FIELDS):
            raise serializers.ValidationError('启用登记标准时至少指定一项；未知项不能填0代替')
        return value


def freeze(values: dict) -> dict:
    form=CriteriaInput(data=values);form.is_valid(raise_exception=True)
    return {'version':1,**dict(form.validated_data),'logic':'all',
        'fraction_tolerance':TOLERANCE,'scope':'registered_recipe_parameters_and_interval_only'}


def finite(value):
    if type(value) not in (int,float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def observed(metric: str,output: dict | None):
    final=(output or {}).get('final') or {}
    value=final.get(metric)
    if metric=='excess_return':
        baseline=(output or {}).get('baseline') or {}
        comparable=all(final.get(key)==baseline.get(key) and final.get(key) is not None for key in ('bars','start','end'))
        if comparable and finite(final.get('total_return')) and finite(baseline.get('total_return')):
            return final['total_return']-baseline['total_return']
        return None
    if metric=='signal_coverage':
        bars,missing=final.get('bars'),final.get('missing_signals')
        if type(bars) is int and bars>0 and type(missing) is int and 0<=missing<=bars:
            return 1-missing/bars
        return None
    if metric=='entries':
        return value if type(value) is int and value>=0 else None
    if not finite(value) or metric=='max_drawdown' and not 0<=value<=1:
        return None
    return value


def assess(criteria: dict,status: str,output: dict | None,request: dict,publication_audit: dict | None) -> dict:
    if type(criteria.get('version')) is not int or criteria!=freeze({key:criteria.get(key) for key in FIELDS}):
        raise serializers.ValidationError('登记标准的版本、逻辑或比较容差不能改写')
    rows=[]
    for key in FIELDS:
        threshold=criteria[key]
        if threshold is None:
            continue
        metric,relation,unit=METRICS[key]
        value=observed(metric,output) if status=='completed' else None
        tolerance=0 if unit=='count' else TOLERANCE
        met=value is not None and (value+tolerance>=threshold if relation=='gte' else value-tolerance<=threshold)
        rows.append({'criterion':key,'metric':metric,'relation':relation,'unit':unit,
            'threshold':threshold,'observed':value,'tolerance':tolerance,
            'status':'unknown' if value is None else 'met' if met else 'not_met'})
    verdict='not_met' if any(row['status']=='not_met' for row in rows) else 'insufficient' if any(row['status']=='unknown' for row in rows) else 'met'
    authorization=request.get('audit') or {}
    published=publication_audit or {}
    checks={'calculation_completed':status=='completed',
        'all_registered_rules_met':verdict=='met',
        'fresh_mode':request.get('mode')=='fresh',
        'imported_after_registration':request.get('imported_after_registration') is True,
        'authorization_audit_complete':authorization.get('complete_scan') is True,
        'authorization_no_known_reuse':type(authorization.get('conflict_count')) is int and authorization['conflict_count']==0,
        'publication_audit_complete':published.get('complete_scan') is True,
        'publication_no_known_reuse':type(published.get('conflict_count')) is int and published['conflict_count']==0}
    eligibility=('fresh_scope_criteria_met' if all(checks.values()) else 'criteria_met_reuse_or_audit_unknown') if verdict=='met' else 'criteria_not_met' if verdict=='not_met' else 'insufficient_evidence'
    return {'version':1,'status':verdict,'rules':rows,'eligibility':eligibility,'checks':checks,
        'scope':criteria['scope'],'independent_validation':False,
        'unknown_requirements':['external_prior_data_use','native_platform_equivalence','cross_market_robustness'],
        'claim':'registered_thresholds_and_publication_time_tracked_scope_not_financial_certification'}
