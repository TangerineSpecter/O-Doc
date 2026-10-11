import {useState} from 'react';
import type {NovelController} from './useNovel';
import {clearSavedPreparation, preparationForm} from '../utils/novelPreparation';
import type {PreparationEdits, PreparationField} from '../utils/novelPreparation';

export function useNovelPreparation(c: NovelController) {
    const [edits, setEdits] = useState<PreparationEdits>({});
    const form = preparationForm(c.novel!, edits);
    const change = (field: PreparationField, value: string) => {
        setEdits(current => ({...current, [field]: value}));
    };
    const changeSetup = (field: string, value: string) => {
        setEdits(current => ({...current, setup: {...current.setup, [field]: value}}));
    };
    const save = async () => {
        const saved = form;
        const ok = await c.patch({...saved, confirmed: true});
        if (ok) setEdits(current => clearSavedPreparation(current, saved));
        return ok;
    };
    return {form, change, changeSetup, save};
}
