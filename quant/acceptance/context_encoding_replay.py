"""Measure a lossless v14 projection of the real v13 timeout; no DB or calls."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path

PREFIX = '2026-10-26-context-encoding-'
BASIS = '2026-10-26-window-review-'


def benchmark(directory: str | Path) -> dict:
    from quant.experiments.context_encoding import VERSION, encode, decode, dumps
    from quant.experiments.review_contract import review_prompt
    from quant.research.contracts import digest
    root = Path(directory)
    basis_name = BASIS+'input.json'
    manifest = json.loads((root/(BASIS+'manifest.json')).read_text())
    expected = {BASIS+name for name in ('input.json','request-options.json','usage.json',
        'execution-summary-original.json','summary.json','delta.json')}
    if set(manifest['artifact_hashes']) != expected:
        raise ValueError('Unexpected real-call artifacts')
    for name, expected_hash in manifest['artifact_hashes'].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest() != expected_hash:
            raise ValueError('Real-call artifact changed')
    capture = json.loads((root/basis_name).read_text())
    original, requirements = capture['evidence'], capture['requirements']
    if review_prompt(original,requirements) != capture['prompt'] or 'model_context_encoding' in original:
        raise ValueError('The historical real prompt was changed')
    canonical = {**copy.deepcopy(original),'model_context_encoding':VERSION}
    wire = encode(canonical)
    restored = decode(wire)
    if digest(restored) != digest(canonical):
        raise ValueError('Complete canonical input was not retained')
    prompt = review_prompt(canonical,requirements)
    actual_wire = json.loads(prompt.split('\n实验依据：',1)[1].split('\n补充关注：',1)[0])
    actual_refs = json.loads(prompt.split('\n可用证据引用键（仅从中逐字选择）：',1)[1].split('\n输出结构：',1)[0])
    if actual_wire != wire or set(actual_refs) != {key for key,value in original['evidence'].items() if value is not None}:
        raise ValueError('The production prompt lost evidence or changed citable keys')
    old_size, new_size = len(capture['prompt']), len(prompt)
    return {'version':1,'application':'1.5.57','schema_version':59,'review_version':14,'encoding':VERSION,
        'basis_input':basis_name,'basis_input_sha256':hashlib.sha256((root/basis_name).read_bytes()).hexdigest(),
        'original_prompt_characters':old_size,'encoded_prompt_characters':new_size,
        'character_reduction_percent':round((1-new_size/old_size)*100,4),
        'original_context_characters':len(json.dumps(original,ensure_ascii=False)),
        'encoded_context_characters':len(dumps(wire)),'shared_exact_facts':len(wire['exact_facts']),
        'canonical_hash':digest(canonical),'roundtrip_hash':digest(restored),
        'original_prompt_sha256':hashlib.sha256(capture['prompt'].encode()).hexdigest(),
        'encoded_prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),
        'citable_evidence_keys':len(actual_refs),
        'retained_attempts':len([key for key in restored['evidence'] if key.startswith('attempt-')]),
        'retained_planned_windows':len([key for key in restored['evidence'] if key.startswith('temporal_window:')]),
        'parameter_status':restored['evidence']['temporal_parameter_stability']['status'],
        'new_provider_calls':0,'new_market_calculations':0,'new_source_executions':0,'business_database_writes':0,
        'published_v14_run':False,'token_saving_measured':False,'latency_improvement_measured':False,'model_quality_release':False,
        'scope':'offline v14 projection of a real v13 timeout; all original facts retained; not a new model response or independent validation'}


def replay(directory: str | Path) -> dict:
    root = Path(directory)
    name = PREFIX+'summary.json'
    manifest = json.loads((root/(PREFIX+'manifest.json')).read_text())
    if set(manifest.get('artifact_hashes',{})) != {name} or manifest.get('basis_input') != BASIS+'input.json':
        raise ValueError('Unexpected encoding benchmark manifest')
    if hashlib.sha256((root/name).read_bytes()).hexdigest() != manifest['artifact_hashes'][name]:
        raise ValueError('Encoding benchmark artifact changed')
    actual = benchmark(root)
    if actual != json.loads((root/name).read_text()):
        raise ValueError('The encoded production prompt no longer matches the benchmark')
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    parser.add_argument('--export',action='store_true',help='Write derived sizes/hashes only, never a model response')
    args = parser.parse_args()
    os.environ['DJANGO_SETTINGS_MODULE'] = 'quant.test_settings'
    import django
    django.setup()
    root = Path(args.directory)
    if args.export:
        if (root/(PREFIX+'summary.json')).exists() or (root/(PREFIX+'manifest.json')).exists():
            # An existing benchmark is evidence, not an overwriteable scratch file.
            print(json.dumps(replay(root),ensure_ascii=False))
            return
        result = benchmark(root)
        name = PREFIX+'summary.json'
        (root/name).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        manifest = {'version':1,'basis_input':BASIS+'input.json','artifact_hashes':{
            name:hashlib.sha256((root/name).read_bytes()).hexdigest()},
            'scope':'derived statistics only; no new DB records, model calls, source execution or market calculation'}
        (root/(PREFIX+'manifest.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(replay(root),ensure_ascii=False))


if __name__ == '__main__':main()
