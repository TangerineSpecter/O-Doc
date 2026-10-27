import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {elementEquipmentArt} from './elementEquipmentArt';

test('element weapon IDs resolve the proper original silhouette and element', () => {
    assert.deepEqual(elementEquipmentArt('equip.bow.element.water'), {baseId:'equip.bow', element:'water'});
    assert.deepEqual(elementEquipmentArt('equip.dagger.30.element.fire'), {baseId:'equip.dagger', element:'fire'});
    assert.deepEqual(elementEquipmentArt('equip.instrument.element_low.element.earth'), {baseId:'equip.instrument', element:'earth'});
    assert.deepEqual(elementEquipmentArt('equip.instrument.30.element.wind'), {baseId:'equip.instrument.30', element:'wind'});
    assert.deepEqual(elementEquipmentArt('equip.staff.element.fire'), {baseId:'equip.staff', element:'fire'});
    assert.deepEqual(elementEquipmentArt('equip.sword.30'), {baseId:'equip.sword', element:undefined});
    assert.deepEqual(elementEquipmentArt('equip.boss.element.fire'), {baseId:'equip.boss.element.fire'});
});
