"""Conservative display grouping, not destructive merge or equivalence certification."""
from quant.models import FactorCandidate
from quant.research.contracts import digest


def fingerprints(candidate: FactorCandidate) -> dict[str, str]:
    data = candidate.data
    source = candidate.report.source.payload
    # Quotes alone omit dependency context; include the complete input/output
    # contract and platform. Parameters keep defaults/constraints, not advice.
    contract = {key: data[key] for key in ('role', 'output_type', 'units', 'timeframe')}
    contract['inputs'] = sorted(data['inputs'], key=lambda row: row['name'])
    contract['parameters'] = sorted([{key: parameter[key] for key in
        ('name', 'type', 'default_value', 'category', 'meaning', 'constraints', 'domain') if key in parameter} for parameter in data['parameters']], key=lambda row: row['name'])
    contract['dependencies'] = sorted(set(data['dependencies']))
    contract['language'] = 'quant_expression' if candidate.derived_checkpoint_id or data.get('formula_version') else source.get('language', 'text')
    contract['language_version'] = 'factor-formula-1' if data.get('formula_version') else candidate.data['derivation']['engine_version'] if candidate.derived_checkpoint_id else source.get('language_version', '')
    code = '' if candidate.derived_checkpoint_id or data.get('formula_version') else source.get('code', '')
    return {'raw': digest({'format': 'factor-raw-v1', 'source_code': digest(code), 'formula': data['formula'], 'contract': contract}) if code else '',
        'expression': digest({'format': 'factor-expression-v1', 'expression': data['expression'], 'contract': contract}) if data['expression'] is not None else ''}


def group_key(candidate: FactorCandidate, mode: str) -> str:
    return fingerprints(candidate).get(mode) or f'candidate:{candidate.pk}'


def group_candidates(candidates: list[FactorCandidate], mode: str) -> list[list[FactorCandidate]]:
    groups = {}
    for candidate in candidates:
        # `none` deliberately makes a group for every occurrence.
        key = group_key(candidate, mode)
        groups.setdefault(key, []).append(candidate)
    return list(groups.values())
