"""Exact classification with visible basis. Aliases are not semantic equivalence."""
from .contracts import key, reference


def index(catalog):
    terms, aliases = {}, {}
    for term in catalog['terms']:
        terms[term['id']] = term
        if term['active']:
            for label in [term['label'], *term['aliases']]:
                aliases.setdefault(key(label), set()).add(term['id'])
    return terms, aliases


def ambiguities(catalog):
    terms, aliases = index(catalog)
    return [{'label': label, 'codes': sorted(codes), 'labels': [terms[code]['label'] for code in sorted(codes)]}
        for label, codes in sorted(aliases.items()) if len(codes) > 1]


def classify(data: dict, curated: dict, catalog: dict, ref: dict | None = None, platform='') -> dict:
    terms, aliases = index(catalog)
    matches, unresolved, raw = {}, [], []
    def add(code, basis, raw_label):
        term = terms.get(code)
        if not term: return
        item = matches.setdefault(code, {**term, 'basis': []})
        evidence = {'kind': basis, 'raw': raw_label}
        if evidence not in item['basis']: item['basis'].append(evidence)
    def label(value, basis, dimension=''):
        raw.append({'value': value, 'basis': basis})
        codes = {value} if value in terms else aliases.get(key(value), set())
        if dimension: codes = {code for code in codes if terms[code]['dimension'] == dimension}
        protected = any(terms[code]['dimension'] == 'evidence' for code in codes)
        codes = {code for code in codes if terms[code]['dimension'] != 'evidence'}
        if len(codes) == 1:
            add(next(iter(codes)), basis, value)
        else:
            unresolved.append({'raw': value, 'basis': basis, 'status': 'protected' if protected else 'ambiguous' if codes else 'unmapped', 'codes': sorted(codes)})
    for value in curated.get('tags', data.get('tags', [])):
        label(value, ('authored_tag' if data.get('formula_version') and data['formula_version']['origin'] != 'ai_repair' else 'inherited_tag' if data.get('derivation') else 'ai_tag') if value in data.get('tags', []) else 'user_tag')
    family = curated.get('family', data.get('family', ''))
    add('mechanism:' + family, 'user_family' if family != data.get('family') else 'declared_family', family)
    add('usage:' + data.get('role', ''), 'declared_role', data.get('role', ''))
    if platform: label(platform, 'source_platform', 'platform')
    parameters = data.get('parameters', [])
    tunability = 'signal' if any(row.get('category') == 'signal' for row in parameters) else 'other' if parameters else 'none'
    add('tunability:' + tunability, 'parameter_declaration', tunability)
    status = ('static_unverified' if data.get('formula_version', {}).get('origin') == 'ai_repair'
        else 'authored_unverified' if data.get('formula_version') else 'local_simulation_unverified_platform' if data.get('derivation') else 'static_unverified')
    add('evidence:' + status, 'record_origin', status)
    return {'reference': ref or reference(catalog), 'terms': sorted(matches.values(), key=lambda row: row['id']),
        'raw_labels': raw, 'original_tags': data.get('tags', []), 'unresolved': unresolved, 'claim': 'classification_proposals_not_validated_suitability'}


def search_labels(classification):
    return [value for term in classification['terms'] if term['dimension'] != 'evidence'
        for value in [term['id'], term['label'], *term['aliases']]]
