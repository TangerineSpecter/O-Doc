import type {DecisionGuideKind, DecisionProcessGuide} from './decisionProcessTypes';
import {idleGuides} from './decisionGuides/idle';
import {scheduledGuides} from './decisionGuides/scheduled';
import {independentGuides} from './decisionGuides/independent';
import {interleavingGuide} from './decisionGuides/interleaving';

export type {DecisionGuideKind, DecisionFlowStep, DecisionProcessGuide} from './decisionProcessTypes';

/** The single registry used by task cards and domain panels, including probability-weighted free-activity draws. Keep sources in docs/agents; lottery includes issued-ticket counts, number frequencies and up to three past draws; market includes hourly entry summaries and per-instance unjudged wearable equipment purchases without attribute-improvement filtering, plus daily/hourly bait decisions; guides include daily group-reservation coordination and time/stamina/quota protection; idle guides include priest-lineage basic staff permissions and frozen-instance boundaries, adventure-mode decisions, shared-party settlement, weapon-gated lifesteal, tiered damage reduction, bard music and passive recovery boundaries. */
export const decisionProcessGuides: Record<DecisionGuideKind, DecisionProcessGuide> = {
    ...scheduledGuides, ...idleGuides, ...independentGuides, interleaving: interleavingGuide,
};

export function hasDecisionGuide(kind: string | undefined): kind is DecisionGuideKind {
    return !!kind && Object.prototype.hasOwnProperty.call(decisionProcessGuides, kind);
}
