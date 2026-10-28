import type {DecisionGuideKind, DecisionProcessGuide} from './decisionProcessTypes';
import {idleGuides} from './decisionGuides/idle';
import {scheduledGuides} from './decisionGuides/scheduled';
import {independentGuides} from './decisionGuides/independent';
import {interleavingGuide} from './decisionGuides/interleaving';

export type {DecisionGuideKind, DecisionFlowStep, DecisionProcessGuide} from './decisionProcessTypes';

/** The single registry used by task cards and domain panels. Domain files describe the actual decision inputs, including exploration element facts and each promotion decision. */
export const decisionProcessGuides: Record<DecisionGuideKind, DecisionProcessGuide> = {
    ...scheduledGuides, ...idleGuides, ...independentGuides, interleaving: interleavingGuide,
};

export function hasDecisionGuide(kind: string | undefined): kind is DecisionGuideKind {
    return !!kind && Object.prototype.hasOwnProperty.call(decisionProcessGuides, kind);
}
