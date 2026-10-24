import type {DecisionGuideKind, DecisionProcessGuide} from './decisionProcessTypes';
import {idleGuides} from './decisionGuides/idle';
import {scheduledGuides} from './decisionGuides/scheduled';
import {independentGuides} from './decisionGuides/independent';
import {interleavingGuide} from './decisionGuides/interleaving';

export type {DecisionGuideKind, DecisionFlowStep, DecisionProcessGuide} from './decisionProcessTypes';

/** The single registry used by task cards and domain panels, including probability-weighted free-activity draws. Keep sources in docs/agents; lottery includes issued-ticket counts, number frequencies and up to three past draws; market includes daily/hourly bait decisions; idle guides include adventure-mode decisions, shared-party settlement and passive recovery boundaries. */
export const decisionProcessGuides: Record<DecisionGuideKind, DecisionProcessGuide> = {
    ...scheduledGuides, ...idleGuides, ...independentGuides, interleaving: interleavingGuide,
};

export function hasDecisionGuide(kind: string | undefined): kind is DecisionGuideKind {
    return !!kind && Object.prototype.hasOwnProperty.call(decisionProcessGuides, kind);
}
