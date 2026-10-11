import type {Novel} from '../types/api/novel';

export type PreparationForm = Pick<Novel, 'title' | 'direction' | 'blueprint' | 'style' | 'setup'>;
export type PreparationField = Exclude<keyof PreparationForm, 'setup'>;
export type PreparationEdits = Partial<PreparationForm>;

export function preparationForm(novel: PreparationForm, edits: PreparationEdits): PreparationForm {
    return {
        title: edits.title ?? novel.title,
        direction: edits.direction ?? novel.direction,
        blueprint: edits.blueprint ?? novel.blueprint,
        style: edits.style ?? novel.style,
        setup: {...novel.setup, ...edits.setup},
    };
}

/** Clear only the inputs actually saved; typing during the request stays local. */
export function clearSavedPreparation(edits: PreparationEdits, saved: PreparationForm): PreparationEdits {
    const remaining = {...edits};
    for (const field of ['title', 'direction', 'blueprint', 'style'] as const) {
        if (remaining[field] === saved[field]) delete remaining[field];
    }
    const setup = {...remaining.setup};
    for (const [field, value] of Object.entries(setup)) {
        if (value === saved.setup[field]) delete setup[field];
    }
    if (Object.keys(setup).length) remaining.setup = setup;
    else delete remaining.setup;
    return remaining;
}
