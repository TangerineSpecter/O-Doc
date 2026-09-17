import type {ChapterDigest, ReadingNode, SourceEvidence} from '../types/bookAnalysis';

export function sameSourcePassage(a: SourceEvidence | null | undefined, b: SourceEvidence | null | undefined): boolean {
    if (!a || !b || a.chapterId !== b.chapterId) return false;
    const aq = a.quote.replace(/\s/g, '');
    const bq = b.quote.replace(/\s/g, '');
    if (Math.min(aq.length, bq.length) >= 8 && (aq.includes(bq) || bq.includes(aq))) return true;
    const al = a.locator, bl = b.locator;
    if (al.format !== bl.format || al.href !== bl.href || al.offset === undefined || bl.offset === undefined) return false;
    const overlap = Math.min(al.offset + a.quote.length, bl.offset + b.quote.length) - Math.max(al.offset, bl.offset);
    return overlap >= 8;
}

export function claimContext(digest: ChapterDigest | null, claim: ReadingNode | null) {
    if (!digest || !claim) return {backgrounds: [], reflections: []};
    const evidence = claim.facts.flatMap(fact => fact.evidence ? [fact.evidence] : []);
    return {
        backgrounds: (digest.flow || []).filter(step => step.kind === 'background' && step.impactEvidence && (
            step.claimId === claim.id || (!step.claimId && evidence.some(source => sameSourcePassage(source, step.impactEvidence)))
        )),
        reflections: (digest.reflections || []).filter(item => item.claimId === claim.id || (!item.claimId && evidence.some(source => sameSourcePassage(source, item.evidence)))),
    };
}
