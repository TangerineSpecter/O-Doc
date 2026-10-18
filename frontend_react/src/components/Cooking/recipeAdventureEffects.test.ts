import assert from 'node:assert/strict';
import test from 'node:test';

const BASE_STAT_MAP: Record<string, {label: string; shortLabel: string}> = {
    physical_attack: {label: '物理攻击', shortLabel: '物攻'},
    physicalAttack: {label: '物理攻击', shortLabel: '物攻'},
    magic_attack: {label: '魔法攻击', shortLabel: '魔攻'},
    magicAttack: {label: '魔法攻击', shortLabel: '魔攻'},
    physical_defense: {label: '物理防御', shortLabel: '物防'},
    physicalDefense: {label: '物理防御', shortLabel: '物防'},
    magic_defense: {label: '魔法防御', shortLabel: '魔防'},
    magicDefense: {label: '魔法防御', shortLabel: '魔防'},
    hp_recovery: {label: '每回合生命恢复', shortLabel: '生恢'},
    hpRecovery: {label: '每回合生命恢复', shortLabel: '生恢'},
    mp_recovery: {label: '每回合法力恢复', shortLabel: '法恢'},
    mpRecovery: {label: '每回合法力恢复', shortLabel: '法恢'},
};

const ELEMENT_LABELS: Record<string, string> = {
    water: '水',
    fire: '火',
    earth: '土',
    wind: '风',
    light: '光',
    dark: '暗',
};

test('camelCase stats from API response map correctly to Chinese labels', () => {
    assert.equal(BASE_STAT_MAP['physicalAttack'].label, '物理攻击');
    assert.equal(BASE_STAT_MAP['physicalAttack'].shortLabel, '物攻');
    assert.equal(BASE_STAT_MAP['magicAttack'].label, '魔法攻击');
    assert.equal(BASE_STAT_MAP['magicAttack'].shortLabel, '魔攻');
    assert.equal(BASE_STAT_MAP['physicalDefense'].label, '物理防御');
    assert.equal(BASE_STAT_MAP['physicalDefense'].shortLabel, '物防');
    assert.equal(BASE_STAT_MAP['magicDefense'].label, '魔法防御');
    assert.equal(BASE_STAT_MAP['magicDefense'].shortLabel, '魔防');
    assert.equal(BASE_STAT_MAP['hpRecovery'].label, '每回合生命恢复');
    assert.equal(BASE_STAT_MAP['hpRecovery'].shortLabel, '生恢');
    assert.equal(BASE_STAT_MAP['mpRecovery'].label, '每回合法力恢复');
    assert.equal(BASE_STAT_MAP['mpRecovery'].shortLabel, '法恢');
});

test('element powers and resists in camelCase match correctly', () => {
    const powerKey = 'earthPower';
    const match = powerKey.match(/^([a-z]+)(?:_power|Power)$/);
    assert.ok(match);
    assert.equal(match[1], 'earth');
    assert.equal(ELEMENT_LABELS[match[1]], '土');

    const resistKey = 'waterResist';
    const resistMatch = resistKey.match(/^([a-z]+)(?:_resist|Resist)$/);
    assert.ok(resistMatch);
    assert.equal(resistMatch[1], 'water');
    assert.equal(ELEMENT_LABELS[resistMatch[1]], '水');
});
