import assert from 'node:assert/strict';
import test from 'node:test';
import {footBounds, parseDocument, placementProblem, stopBeforeObstacle} from './placement';
import {initialDocument, makePlacement} from './templates';
import {StudioActors} from './StudioActors';

test('a tall lamp reserves its display cells while only its base blocks walking',()=>{
    const lamp=makePlacement('lamp',10,'lamp');
    assert.equal(placementProblem(makePlacement('bench',11,'bench'),[lamp]),'这里已有萤火路灯，请换一个位置');
    assert.equal(placementProblem(makePlacement('bench',12,'bench'),[lamp]),null);
    const base=footBounds(lamp);
    assert.equal(base.right-base.left,16);
    assert.equal(stopBeforeObstacle(300,500,[lamp]),base.left-9);
    assert.equal(stopBeforeObstacle(500,300,[lamp]),base.right+9);
    assert.equal(stopBeforeObstacle(300,500,[{...lamp,solid:false}]),500);
    assert.equal(placementProblem({...lamp,col:39},[]),'已经超出场景边界');
});

test('layout export round-trips both coordinate spaces and rejects overlapping or unknown templates',()=>{
    const doc=initialDocument();assert.deepEqual(parseDocument(JSON.stringify(doc)),doc);
    doc.scenes.camp[1].col=3;assert.throws(()=>parseDocument(JSON.stringify(doc)),/这里已有/);
    const unknown=JSON.stringify(initialDocument()).replace('"templateId":"lamp"','"templateId":"script"');
    assert.throws(()=>parseDocument(unknown),/摆件模板/);
});

test('residents keep clear of bases after layout changes and perform several interactions',()=>{
    const actors=new StudioActors();actors.reset();
    const items=initialDocument().scenes.camp,poses=new Set<string>();
    for(let i=0;i<30*180;i++){
        if(i===900)items.push(makePlacement('rock',20,'new-obstacle'));
        actors.update(1/30,items);
        for(const actor of actors.actors){
            poses.add(actor.pose);
            if(actor.pose==='sit')continue;
            for(const item of items.filter(i=>i.solid)){const b=footBounds(item);assert.ok(actor.x<=b.left-9||actor.x>=b.right+9,`${actor.id} inside ${item.id}`);}
        }
    }
    assert.ok(poses.has('walk1'));assert.ok(poses.has('roast'));assert.ok(poses.has('sit'));
});
