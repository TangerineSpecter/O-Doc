import type {QuantFactorCandidate} from '../../types/api/quant';
import type {FactorClassification, QuantVocabulary} from '../../types/api/quantVocabulary';
const key = (value: string) => value.normalize('NFKC').trim().toLowerCase();

export function mockClassification(candidate: QuantFactorCandidate, vocabulary: QuantVocabulary, platform = ''): FactorClassification {
    const terms = new Map(vocabulary.catalog.terms.map(row => [row.id, row]));
    const matches = new Map<string, FactorClassification['terms'][number]>();
    const unresolved: FactorClassification['unresolved'] = [], rawLabels: FactorClassification['rawLabels'] = [];
    const add = (code: string, kind: string, raw: string) => {
        const term = terms.get(code); if (!term) return;
        const item = matches.get(code) || {...term, basis: []};
        if (!item.basis.some(row => row.kind === kind && row.raw === raw)) item.basis.push({kind, raw});
        matches.set(code, item);
    };
    const label = (value: string, basis: string, dimension = '') => {
        rawLabels.push({value, basis});
        const rows = vocabulary.catalog.terms.filter(row => (!dimension || row.dimension === dimension) && (row.id === value || row.active && [row.label, ...row.aliases].some(name => key(name) === key(value))));
        const allowed = rows.filter(row => row.dimension !== 'evidence');
        if (allowed.length === 1) add(allowed[0].id, basis, value);
        else unresolved.push({raw: value, basis, status: rows.some(row => row.dimension === 'evidence') ? 'protected' : allowed.length ? 'ambiguous' : 'unmapped', codes: allowed.map(row => row.id)});
    };
    for (const tag of candidate.curation.tags) label(tag, candidate.data.tags.includes(tag) ? candidate.data.formulaVersion && candidate.data.formulaVersion.origin !== 'ai_repair' ? 'authored_tag' : candidate.data.derivation ? 'inherited_tag' : 'ai_tag' : 'user_tag');
    add('mechanism:' + candidate.curation.family, candidate.curation.family !== candidate.data.family ? 'user_family' : 'declared_family', candidate.curation.family);
    add('usage:' + candidate.data.role, 'declared_role', candidate.data.role);
    if (platform) label(platform, 'source_platform', 'platform');
    const tunability = candidate.data.parameters.some(row => row.category === 'signal') ? 'signal' : candidate.data.parameters.length ? 'other' : 'none';
    add('tunability:' + tunability, 'parameter_declaration', tunability);
    const evidenceStatus = candidate.evidenceStatus === 'ai_revised_unverified' ? 'static_unverified' : candidate.evidenceStatus;
    add('evidence:' + evidenceStatus, 'record_origin', evidenceStatus);
    return {reference: vocabulary.reference, terms: [...matches.values()].sort((a, b) => a.id.localeCompare(b.id)), rawLabels, originalTags: candidate.data.tags,
        unresolved, claim: 'classification_proposals_not_validated_suitability'};
}

export const mockClassificationLabels = (row: QuantFactorCandidate) => row.classification?.terms.filter(term => term.dimension !== 'evidence').flatMap(term => [term.id, term.label, ...term.aliases]) || [];
