import assert from 'node:assert/strict';
import test from 'node:test';
import {findPath, isWalkable, nearbyWalkable, segmentClear} from './navigation';
import {CampSimulation} from './simulation';
import {GROUND_Y, worldObjects} from './worldMap';

test('ground clicks only select a horizontal position', () => {
    assert.deepEqual(nearbyWalkable({x: 650, y: 50}), {x: 650, y: GROUND_Y});
    assert.deepEqual(nearbyWalkable({x: 650, y: 390}), {x: 650, y: GROUND_Y});
    assert.equal(isWalkable({x: 1015, y: GROUND_Y}), false);
});

test('solid obstacles require a jump and every arc segment clears the collision mask in both directions', () => {
    for (const [start, destination] of [[650, 1100], [1100, 650]]) {
        let previous = {x: start, y: GROUND_Y};
        const path = findPath(previous, {x: destination, y: GROUND_Y});
        assert.ok(path);
        assert.ok(path.some(point => point.y < GROUND_Y - 35));
        for (const point of path) {
            assert.ok(point.y <= GROUND_Y);
            assert.ok(segmentClear(previous, point), `blocked segment ${JSON.stringify({previous, point})}`);
            previous = point;
        }
        assert.deepEqual(previous, {x: destination, y: GROUND_Y});
    }
});

test('every interaction spot is on the same ground line and reachable from the camp', () => {
    for (const object of worldObjects) for (const spot of object.spots) {
        assert.equal(spot.y, GROUND_Y, object.id);
        assert.ok(findPath({x: 660, y: GROUND_Y}, spot), `${object.id} has an unreachable spot`);
    }
});

test('two residents reserve different sides of the fire and actually arrive before roasting', () => {
    const sim = new CampSimulation(); sim.automatic = false;
    sim.command({type: 'gather'});
    assert.ok(sim.residents.every(resident => resident.pose === 'walk'));
    for (let tick = 0; tick < 150; tick++) sim.tick(1 / 30);
    assert.ok(sim.residents.every(resident => resident.pose === 'roast' && resident.y === GROUND_Y));
    assert.notEqual(sim.residents[0].spotIndex, sim.residents[1].spotIndex);
    assert.ok(sim.residents.every(resident => resident.speech));
});

test('autonomous life keeps feet out of obstacles, returns every jump to the same floor and visits several activities', () => {
    const sim = new CampSimulation(), activities = new Set<string>();
    let jumped = false;
    for (let tick = 0; tick < 30 * 240; tick++) {
        sim.tick(1 / 30);
        for (const resident of sim.residents) {
            assert.ok(isWalkable(resident), `${resident.id} collided at ${resident.x},${resident.y}`);
            if (resident.y < GROUND_Y - 10) jumped = true;
            if (resident.pose !== 'walk') assert.equal(resident.y, GROUND_Y);
            if (resident.targetId && resident.pose !== 'walk') activities.add(resident.targetId);
        }
    }
    assert.ok(jumped);
    assert.ok(activities.size >= 4, `Only visited ${[...activities].join(', ')}`);
});

test('pause freezes intent and movement; manual camera pans stay inside the world', () => {
    const sim = new CampSimulation(); sim.command({type: 'gather'}); sim.command({type: 'pause'});
    const before = JSON.stringify(sim.snapshot());
    for (let tick = 0; tick < 90; tick++) sim.tick(1 / 30);
    assert.equal(JSON.stringify(sim.snapshot()), before);
    for (let i = 0; i < 10; i++) sim.command({type: 'pan', direction: 1});
    assert.equal(sim.cameraX, 640);
    for (let i = 0; i < 10; i++) sim.command({type: 'pan', direction: -1});
    assert.equal(sim.cameraX, 0);
});
