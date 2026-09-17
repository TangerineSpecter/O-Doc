import assert from 'node:assert/strict';
import test from 'node:test';
import {claimContext, sameSourcePassage} from './biographyClaimContext.ts';
import type {ChapterDigest, ReadingNode, SourceEvidence} from '../types/bookAnalysis.ts';

const evidence = (quote: string, offset: number): SourceEvidence => ({chapterId: 'chapter-1', chapterTitle: '第一章', ordinal: 1, quote, locator: {format: 'epub', href: 'chapter-1.xhtml', offset}});

test('chapter background joins only the claim supported by its impact passage', () => {
    const impact = evidence('丁磊的成功影响了马化腾，马化腾也想创业。', 40);
    const claim: ReadingNode = {id: 'ding-claim', kind: 'claim', name: '受丁磊影响', aliases: [], facts: [{description: '马化腾受丁磊影响', status: 'explicit', evidence: evidence('影响了马化腾，马化腾也想创业', 46)}], ordinal: 1, timeLabel: '', timeOrder: ''};
    const other: ReadingNode = {...claim, id: 'astronomy-claim', facts: [{...claim.facts[0], evidence: evidence('马化腾喜欢观察哈雷彗星', 200)}]};
    const digest = {summary: '', points: [], qa: [], inspiration: [], nodeIds: [], flow: [{kind: 'background', title: '丁磊创办网易', detail: '丁磊创办网易。', evidence: evidence('丁磊创办网易。', 10), impactEvidence: impact}], reflections: []} as ChapterDigest;
    assert.equal(claimContext(digest, claim).backgrounds.length, 1);
    assert.equal(claimContext(digest, other).backgrounds.length, 0);
    assert.equal(sameSourcePassage(evidence('同一章另一段话', 500), impact), false);
});
