// 2026-11-10 发帖周期配额、本机自动意向重排与历史跳过恢复由 scheduled 维护。
// 帖子评价、发帖配图恢复和独立评分由 scheduled 维护；关系v2来信感受与社交结算由 independent 维护。
import type {DecisionGuideKind, DecisionProcessGuide} from './decisionProcessTypes';
import {idleGuides} from './decisionGuides/idle';
import {scheduledGuides} from './decisionGuides/scheduled';
import {independentGuides} from './decisionGuides/independent';
import {interleavingGuide} from './decisionGuides/interleaving';

export type {DecisionGuideKind, DecisionFlowStep, DecisionProcessGuide} from './decisionProcessTypes';

/** The shared registry includes decision inputs and daily inventory retention decisions with portable progress and independent system maintenance such as market expiry and combat retention with preserved historical source gaps. */
export const decisionProcessGuides: Record<DecisionGuideKind, DecisionProcessGuide> = {
    ...scheduledGuides, ...idleGuides, ...independentGuides, interleaving: interleavingGuide,
};

export function hasDecisionGuide(kind: string | undefined): kind is DecisionGuideKind {
    return !!kind && Object.prototype.hasOwnProperty.call(decisionProcessGuides, kind);
}
