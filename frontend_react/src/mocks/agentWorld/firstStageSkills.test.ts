import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import type {CombatCatalog} from '../../types/api/combat.ts';
import {firstStageSkills} from './firstStageSkills.ts';

const {combat}: {combat: CombatCatalog} = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));

test('local first-promotion skills use the same rank thresholds as the catalog', () => {
    for (const job of ['warrior', 'mage', 'ranger', 'priest', 'bard']) {
        for (const level of [15, 20, 24, 25, 29, 30]) {
            const skills = firstStageSkills(combat, `job.${job}`, level);
            for (const skill of skills) {
                const available = combat.tables.skillLevels.filter(row => row.skillId === skill.id && Number(row.requiredLevel) <= level);
                assert.equal(skill.rank, Math.max(...available.map(row => Number(row.rank))), `${job} ${skill.id} Lv.${level}`);
                assert.equal(skill.parameters.id, `${skill.id}.r${skill.rank}`);
                assert.ok(skill.effects.length > 0);
            }
            if (level === 30) assert.ok(skills.length > 0 && skills.every(skill => skill.rank === 3), job);
        }
    }
    const priest25 = firstStageSkills(combat, 'job.priest', 25);
    assert.equal(priest25.find(skill => skill.name === '圣光')?.rank, 2);
    assert.equal(priest25.find(skill => skill.name === '信念')?.rank, 2);
    assert.equal(priest25.find(skill => skill.name === '圣愈')?.rank, 2);
});
