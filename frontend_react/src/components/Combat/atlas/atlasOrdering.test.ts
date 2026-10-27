import assert from 'node:assert/strict';
import {test} from 'node:test';
import {orderDungeons, orderMonsters} from './atlasOrdering';
import type {CombatRow} from '../../../types/api/combat';
import catalog from '../../../mocks/agentWorld/catalog';

test('dungeons use recommended minimum, maximum and stable catalog order', () => {
    const input: CombatRow[] = [
        {id:'late', recommendedLevelMin:'30', recommendedLevelMax:'50'},
        {id:'unknown'},
        {id:'same-a', recommendedLevelMin:'15', recommendedLevelMax:'25'},
        {id:'early', recommendedLevelMin:'1', recommendedLevelMax:'15'},
        {id:'same-b', recommendedLevelMin:'15', recommendedLevelMax:'25'},
        {id:'short', recommendedLevelMin:'30', recommendedLevelMax:'40'},
    ];
    assert.deepEqual(orderDungeons(input).map(row => row.id), ['early', 'same-a', 'same-b', 'short', 'late', 'unknown']);
    assert.equal(input[0].id, 'late');
});

test('monsters group by earliest area, including bosses and shared monsters', () => {
    const areas: CombatRow[] = [
        {id:'late', recommendedLevelMin:'20', recommendedLevelMax:'30', bossId:'boss'},
        {id:'early', recommendedLevelMin:'10', recommendedLevelMax:'20'},
    ];
    const monsters: CombatRow[] = [
        {id:'orphan', rank:'normal', levelMin:'1'}, {id:'boss', rank:'boss', levelMin:'20'},
        {id:'elite', rank:'elite', levelMin:'12'}, {id:'shared', rank:'normal', levelMin:'10'},
        {id:'late-normal', rank:'normal', levelMin:'20'},
    ];
    const encounters: CombatRow[] = [
        {id:'l', dungeonId:'late', monsterId:'shared', levelMin:'20'},
        {id:'e', dungeonId:'early', monsterId:'shared', levelMin:'10'},
        {id:'e2', dungeonId:'early', monsterId:'elite', levelMin:'12'},
        {id:'l2', dungeonId:'late', monsterId:'late-normal', levelMin:'20'},
    ];
    assert.deepEqual(orderMonsters(monsters, areas, encounters).map(row => row.id),
        ['shared', 'elite', 'late-normal', 'boss', 'orphan']);
    assert.equal(monsters[0].id, 'orphan');
});

test('current catalog interleaves elemental areas and puts each boss in its area', () => {
    const tables = catalog.combat.tables;
    const areas = orderDungeons(tables.dungeons);
    assert.deepEqual(areas.map(row => row.name), [
        '新芽草甸', '苔石洞窟', '废弃矿坑', '潮汐浅湾', '迷雾林地', '琥岩地窟',
        '浮岚高地', '沉没遗迹', '熔羽火山', '灰烬堡垒', '星蚀裂隙',
    ]);
    const monsters = orderMonsters(tables.monsters, tables.dungeons, tables.dungeonMonsters);
    const index = (id: string) => monsters.findIndex(row => row.id === id);
    assert.ok(index('monster.moss_king') < index('monster.element.water.bubble_crab'));
    assert.ok(index('monster.element.water.bubble_crab') < index('monster.element.water.tide_crown'));
    assert.ok(index('monster.element.water.tide_crown') < index('monster.element.earth.mole'));
    assert.ok(index('monster.element.fire.firebird') < index('monster.ash_lord'));
});
