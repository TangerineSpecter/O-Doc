import type {DecisionProtocol} from '../../types/api/decision';

/** Same endpoint and model as LEGACY_JEV_PROFILE in system_settings/decision/config.py. */
export const JEV_DEFAULT_BASE_URL = 'https://api.typesafe.ai/v1';
export const JEV_DEFAULT_MODEL_ID = 'jev-latest';

export interface DecisionProtocolFieldDefaults {
    baseUrl: string;
    modelId: string;
}

const protocolFieldDefaults: Record<DecisionProtocol, DecisionProtocolFieldDefaults> = {
    systemone: {baseUrl: JEV_DEFAULT_BASE_URL, modelId: JEV_DEFAULT_MODEL_ID},
    openai_chat_json: {baseUrl: '', modelId: ''},
};

function replaceIfUnset(current: string, previousDefault: string, nextDefault: string): string {
    const stillEmpty = current.trim() === '';
    const stillPreviousDefault = current === previousDefault;
    return stillEmpty || stillPreviousDefault ? nextDefault : current;
}

/** Prefill only untouched fields. Name and API key are not part of this result. */
export function fieldsAfterProtocolChange(
    previousProtocol: DecisionProtocol,
    nextProtocol: DecisionProtocol,
    fields: DecisionProtocolFieldDefaults,
): DecisionProtocolFieldDefaults {
    if (previousProtocol === nextProtocol) return fields;
    const previous = protocolFieldDefaults[previousProtocol];
    const next = protocolFieldDefaults[nextProtocol];
    return {
        baseUrl: replaceIfUnset(fields.baseUrl, previous.baseUrl, next.baseUrl),
        modelId: replaceIfUnset(fields.modelId, previous.modelId, next.modelId),
    };
}
