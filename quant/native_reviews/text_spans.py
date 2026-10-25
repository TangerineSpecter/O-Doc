"""Selectable immutable prose spans; the program copies the selected text."""
import copy

CHUNK=2400
ROOTS={'title','summary','comparison','hypotheses','unknowns','next_steps','feedback_planning_note','memory_note'}


def narrative(parts):
    return (parts and parts[0] in ROOTS or len(parts)>=2 and parts[0]=='native_review' and parts[1] in
        ('interpretation','parameter_assessment','limitations') or len(parts)>=3 and parts[0]=='memory_assessment' and parts[2]=='rationale'
        or len(parts)==2 and parts[0]=='feedback_proposal' and parts[1] in ('name','hypothesis','falsification','data_requirement'))


def registry(draft):
    spans=[]
    def visit(value,parts):
        if isinstance(value,str) and narrative(parts):
            path='/'+('/'.join(part.replace('~','~0').replace('/','~1') for part in parts));refs=[]
            for index,start in enumerate(range(0,len(value),CHUNK)):
                ref=f'text:{path}#{index}';refs.append(ref)
                spans.append({'ref':ref,'path':path,'start':start,'end':min(start+CHUNK,len(value)),'text':value[start:start+CHUNK]})
            return {'text_refs':refs}
        if isinstance(value,dict):return {key:visit(item,[*parts,key]) for key,item in sorted(value.items())
            if parts or key not in ('native_review_facts','native_review_gate','evidence_hash')}
        if isinstance(value,list):return [visit(item,[*parts,str(index)]) for index,item in enumerate(value)]
        return copy.deepcopy(value)
    structure=visit(draft,[])
    version=draft.get('native_review_version')
    spans.append({'ref':'text:protocol_version','path':'/','start':None,'end':None,'text':f'"native_review_version": {version}'})
    return structure,spans


def select(draft,reference,path):
    _,spans=registry(draft)
    row=next((row for row in spans if row['ref']==reference and row['path']==path),None)
    if row is None:raise ValueError('review text reference does not belong to frozen draft')
    return {'quote':row['text'],'text_ref':row['ref'],'quote_origin':'frozen_text_span','span_start':row['start'],'span_end':row['end']}
