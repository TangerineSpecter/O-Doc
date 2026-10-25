"""CSCV rank reversal of fixed cost-adjusted return streams, not a significance test.

All symmetric half-block combinations are retained, including ambiguous ties.
No final chronological holdout, random sampling or candidate generation occurs.
"""
from itertools import combinations
import math

POLICY={'version':1,'blocks':8,'minimum_block_intervals':5,
    'score':'arithmetic_mean_cost_adjusted_return','tie_absolute_tolerance':1e-12,
    'maximum_candidates':32,'maximum_intervals':20000,
    'remainder':'drop_oldest_development_intervals'}
METHOD='cscv-fixed-family-mean-net-v1'


def finite(value):
    return type(value) in (int,float) and math.isfinite(value)


def analyze_blocks(block_means: dict,check=lambda:None):
    """Equal-sized chronological blocks. Never break an IS tie by identity."""
    count=len(block_means);blocks=POLICY['blocks'];epsilon=POLICY['tie_absolute_tolerance']
    if (not 2<=count<=POLICY['maximum_candidates'] or any(not isinstance(key,str) or not key for key in block_means)
            or any(not isinstance(values,list) or len(values)!=blocks or any(not finite(v) for v in values) for values in block_means.values())):
        raise ValueError('CSCV requires 2–32 aligned finite eight-block series')
    rows=[]
    for chosen in combinations(range(blocks),blocks//2):
        check();other=[i for i in range(blocks) if i not in chosen]
        inside={key:math.fsum(values[i] for i in chosen)/(blocks//2) for key,values in block_means.items()}
        outside={key:math.fsum(values[i] for i in other)/(blocks//2) for key,values in block_means.items()}
        best=max(inside.values());winners=sorted(key for key,value in inside.items() if abs(value-best)<=epsilon)
        row={'in_blocks':list(chosen),'winner_ids':winners,'relative_oos_rank':None,'logit':None,'status':'ambiguous_is_tie'}
        if len(winners)==1:
            score=outside[winners[0]]
            below=sum(value<score-epsilon for value in outside.values())
            equal=sum(abs(value-score)<=epsilon for value in outside.values())
            rank=(1+below+(equal-1)/2)/(count+1)
            row.update(relative_oos_rank=rank,logit=math.log(rank/(1-rank)),
                status='ambiguous_oos_median' if abs(rank-.5)<=epsilon else 'reversal' if rank<.5 else 'retained')
        rows.append(row)
    reversal=sum(row['status']=='reversal' for row in rows)
    retained=sum(row['status']=='retained' for row in rows)
    unresolved=len(rows)-reversal-retained
    return {'status':'completed' if reversal+retained else 'insufficient','combinations':len(rows),
        'reversal_count':reversal,'retained_count':retained,'ambiguous_count':unresolved,
        'reversal_fraction_resolved':reversal/(reversal+retained) if reversal+retained else None,
        'ambiguity_lower':reversal/len(rows),'ambiguity_upper':(reversal+unresolved)/len(rows),
        'bounds_kind':'unresolved_combinations_not_confidence_interval','block_means':block_means,'splits':rows}


def summarize_matrix(matrix: dict,check=lambda:None):
    if not isinstance(matrix,dict) or not matrix:
        raise ValueError('Missing diagnostic return matrix')
    if any(not isinstance(values,list) for values in matrix.values()):
        raise ValueError('Invalid diagnostic return series')
    sizes={len(values) for values in matrix.values()}
    if len(sizes)!=1:
        raise ValueError('Misaligned diagnostic returns')
    size=next(iter(sizes));width=size//POLICY['blocks'];dropped=size%POLICY['blocks']
    if width<POLICY['minimum_block_intervals'] or size>POLICY['maximum_intervals']:
        raise ValueError('Insufficient or excessive diagnostic intervals')
    means={}
    for key,values in matrix.items():
        check()
        if any(not finite(value) or value<=-1 for value in values):
            raise ValueError('Invalid net return')
        means[key]=[math.fsum(values[dropped+i*width:dropped+(i+1)*width])/width for i in range(POLICY['blocks'])]
    return {'available_intervals':size,'used_intervals':width*POLICY['blocks'],
        'dropped_oldest_intervals':dropped,'block_intervals':width,**analyze_blocks(means,check)}
