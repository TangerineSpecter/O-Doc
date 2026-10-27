export interface QuantParameterValue {kind: 'unknown' | 'int' | 'float' | 'bool' | 'string'; value: string | number | boolean | null}
export type QuantParameterSourceBinding = {version: 1; sourceHash: string; sourceName: string} & (
    {status: 'resolved'; id: string; file: string; scope: string; kind: string; ordinal: number; type: string;
        defaultRaw: string; literal: QuantParameterValue; line: number; endLine: number; quote: string; conditional: boolean}
    | {status: 'unresolved' | 'hypothesis'; reason: string});
export interface QuantParameterDeclaration {name: string; type: string; declaration: string; defaultRaw: string; line: number; quote: string}
export interface QuantParameterConfiguration {
    parserVersion: string; status: 'imported_configuration_not_verified_execution';
    parameters: ({name: string; rawValue: string; line: number; quote: string;
        optimization: null | {format: 'legacy' | 'inline'; enabled: boolean | null; start: string | null; step: string | null; stop: string | null}} & QuantParameterValue)[];
    warnings: {line: number; message: string}[];
}
export interface QuantParameterComparison {
    version: 1; sourceId: string; sourceHash: string;
    rows: {name: string; configured: QuantParameterValue; declaration: QuantParameterDeclaration | null; default: QuantParameterValue | null;
        status: 'same' | 'different' | 'type_mismatch' | 'default_unknown' | 'unknown_type' | 'unmatched' | 'ambiguous'}[];
    missing: QuantParameterDeclaration[]; limitations: string[];
}
export interface QuantConfigurationPreview {configuration: QuantParameterConfiguration; comparison: QuantParameterComparison}

export type QuantParameterComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';
export type QuantParameterArithmeticOperator = 'add' | 'sub' | 'mul' | 'div';
export type QuantParameterOperand = {parameter: string} | {value: number | boolean | string}
    | {operator: QuantParameterArithmeticOperator; left: QuantParameterOperand; right: QuantParameterOperand}
    | {operator: 'neg'; argument: QuantParameterOperand};
export type QuantParameterPredicate = {operator: QuantParameterComparisonOperator; left: QuantParameterOperand; right: QuantParameterOperand}
    | {operator: 'all' | 'any'; arguments: QuantParameterPredicate[]} | {operator: 'not'; argument: QuantParameterPredicate};
export interface QuantParameterCondition {when: QuantParameterPredicate; require: QuantParameterPredicate}
export type QuantParameterDomain = ({version: 1; conditions?: never} | {version: 2 | 3 | 4 | 5; conditions: QuantParameterCondition[]}) & { minimum: number | null; maximum: number | null; step: number | null; stepOrigin: number | null;
    choices: (number | boolean | string)[];
    relations: {operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne'; parameter: string}[];
    evidence: {field: 'code' | 'description' | 'web_markdown' | 'parameters'; quote: string}[];
}
