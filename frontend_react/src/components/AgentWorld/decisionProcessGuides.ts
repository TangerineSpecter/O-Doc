import type {DecisionGuideKind, DecisionProcessGuide} from './decisionProcessTypes';
import {idleGuides} from './decisionGuides/idle';
import {scheduledGuides} from './decisionGuides/scheduled';
import {independentGuides} from './decisionGuides/independent';
import {interleavingGuide} from './decisionGuides/interleaving';

export type {DecisionGuideKind, DecisionFlowStep, DecisionProcessGuide} from './decisionProcessTypes';

/** The single registry used by task cards and domain panels, including probability-weighted free-activity draws. Keep sources in docs/agents; lottery includes issued-ticket counts, number frequencies and up to three past draws; market includes hourly entry summaries and resumable provisional equipment comparisons, two ring slots and final legal hand combinations before atomic purchases, without attribute-improvement filtering, plus daily/hourly bait decisions; guides include daily group-reservation coordination and time/stamina/quota protection; idle guides include priest-lineage basic staff permissions and frozen-instance boundaries, adventure-mode decisions, shared-party settlement, full HP after 30-minute fallen rest, compact last-trip potion evidence, independent red-potion tier choice after positive count and catalog-frozen elite/boss reductions with 1.1/1.3/1.5 party difficulty multipliers, unchanged rewards, weapon-gated lifesteal, tiered damage reduction, bard music and passive recovery boundaries. */
export const decisionProcessGuides: Record<DecisionGuideKind, DecisionProcessGuide> = {
    ...scheduledGuides, ...idleGuides, ...independentGuides, interleaving: interleavingGuide,
};

export function hasDecisionGuide(kind: string | undefined): kind is DecisionGuideKind {
    return !!kind && Object.prototype.hasOwnProperty.call(decisionProcessGuides, kind);
}
