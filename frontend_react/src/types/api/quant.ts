export type QuantKind = 'factor' | 'indicator' | 'strategy';
export type QuantLanguage = 'python' | 'pine' | 'mql4';
export type QuantCheck = 'pending' | 'passed' | 'failed';
export interface QuantEntry {
    id: string;
    collId: string;
    title: string;
    kind: QuantKind;
    content: string;
    sourceUrl: string;
    tags: string[];
    isValid: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface QuantCodeVersion {
    id: string;
    implementationId: string;
    code: string;
    note: string;
    language: QuantLanguage;
    languageVersion: string;
    dependencies: string;
    parameters: string;
    compileCheck: QuantCheck;
    runCheck: QuantCheck;
    resultCheck: QuantCheck;
    verificationNotes: string;
    sourceVersionId: string | null;
    createdAt: string;
}
export interface QuantImplementation {
    id: string;
    entryId: string;
    name: string;
    language: QuantLanguage;
    languageVersion: string;
    dependencies: string;
    parameters: string;
    currentVersionId: string;
    versions: QuantCodeVersion[];
    createdAt: string;
    updatedAt: string;
}
export interface QuantBacktest {
    id: string;
    entryId: string;
    name: string;
    versionId: string | null;
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
    parameters: string;
    fees: string;
    metrics: { name: string; value: string }[];
    conclusion: string;
    createdAt: string;
    updatedAt: string;
}
export interface QuantAttachment {
    id: string;
    entryId: string;
    assetId: string;
    name: string;
    fileType: string;
    fileExtension: string;
    mimeType: string;
    fileSize: number;
    url: string;
    downloadUrl: string;
    implementationId: string | null;
    versionId: string | null;
    backtestId: string | null;
    createdAt: string;
}
export type QuantRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export interface QuantAIRun {
    id: string;
    entryId: string;
    kind: 'explain' | 'convert';
    sourceVersionId: string;
    targetLanguage: QuantLanguage | '';
    targetVersion: string;
    requirements: string;
    modelId: string;
    modelName: string;
    status: QuantRunStatus;
    result: {
        code?: string;
        explanation?: string;
        differences?: string;
        assumptions?: string;
        dependencies?: string;
        limitations?: string;
    };
    error: string;
    preview?: string;
    adoptedImplementationId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface QuantEntryDetail extends QuantEntry {
    implementations: QuantImplementation[];
    backtests: QuantBacktest[];
    attachments: QuantAttachment[];
    runs: QuantAIRun[];
}
export type QuantEntryInput = Pick<QuantEntry, 'title' | 'kind' | 'content' | 'sourceUrl' | 'tags'>;
export type QuantVersionInput = Pick<
    QuantCodeVersion,
    'code' | 'note' | 'language' | 'languageVersion' | 'dependencies' | 'parameters'
> & { sourceVersionId?: string };
export type QuantImplementationInput = QuantVersionInput & { name: string };
export type QuantVerificationInput = Pick<
    QuantCodeVersion,
    'compileCheck' | 'runCheck' | 'resultCheck' | 'verificationNotes'
>;
export type QuantBacktestInput = Omit<QuantBacktest, 'id' | 'entryId' | 'createdAt' | 'updatedAt'>;
export interface QuantRunInput {
    kind: 'explain' | 'convert';
    sourceVersionId: string;
    targetLanguage?: QuantLanguage;
    targetVersion?: string;
    requirements?: string;
    modelId?: string;
    requestKey: string;
}
export interface QuantModels {
    models: { id: string; name: string }[];
    defaultModelId: string;
}
