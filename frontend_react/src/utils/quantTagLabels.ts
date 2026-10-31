import type {VocabularyTerm} from '../types/api/quantVocabulary';

type Term = Pick<VocabularyTerm, 'id' | 'label' | 'active'>;

/** Keep stable IDs in storage while editing the catalog's current display names. */
export function tagLabels(terms: Term[]): Map<string, string> {
    const counts = new Map<string, number>();
    for (const term of terms) counts.set(term.label, (counts.get(term.label) || 0) + 1);
    return new Map(terms.map(term => [term.id,
        counts.get(term.label) === 1 ? term.label : `${term.label}（${term.id}）`]));
}

export function tagTextForDisplay(text: string, terms: Term[]): string {
    const names = tagLabels(terms);
    return mapTokens(text, value => names.get(value) || value);
}

export function tagTextForStorage(text: string, terms: Term[], previous: string[]): string {
    const names = tagLabels(terms);
    const identities = new Set(terms.map(term => term.id));
    const allowed = terms.filter(term => term.active || previous.includes(term.id));
    const byName = new Map(allowed.map(term => [names.get(term.id)!, term.id]));
    return mapTokens(text, value => identities.has(value) ? value : byName.get(value) || value);
}

function mapTokens(text: string, map: (value: string) => string): string {
    // Preserve separators and whitespace so typing a new tag does not eat commas.
    return text.split(/([，,\n])/).map(token => /^[，,\n]$/.test(token) ? token
        : token.replace(/^(\s*)(.*?)(\s*)$/, (_, start, value, end) => start + map(value) + end)).join('');
}
