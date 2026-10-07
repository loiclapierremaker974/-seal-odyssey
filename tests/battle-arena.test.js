import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BattleArena} from '../src/combat/BattleArena.js';
import {CombatSystem,ENCOUNTERS} from '../src/combat/CombatSystem.js';

function renderer(){
  return {calls:[],getSize(target){return target.set(960,540);},
    render(scene,camera){this.calls.push({scene,camera});}};
}
function resources(scene){
  const result=new Set();
  scene.traverse(o=>{
    if(o.geometry)result.add(o.geometry);
    if(o.skeleton)result.add(o.skeleton);
    if(o.isInstancedMesh)result.add(o);
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!m)continue;result.add(m);
      for(const value of Object.values(m))if(value?.isTexture)result.add(value);
    }
  });
  return result;
}
test('fixed arenas reuse the renderer, select the correct scenery and preserve encounter identities',()=>{
  for(const lowPower of [false,true]){
    const r=renderer(),arena=new BattleArena({renderer:r,lowPower});
    assert.equal(arena.render(),false);
    for(const e of ENCOUNTERS){
      arena.open(e);arena.resize(844,390);arena.update(1/60);arena.render();
      assert.equal(arena.camera.isOrthographicCamera,true);
      assert.equal(arena.variant,e.arena);
      assert.equal(arena.name,e.opponent.name);
      assert.equal(arena.maxResolve,e.opponent.maxResolve);
      assert.equal(arena.element,e.opponent.element);
      assert.equal(r.calls.at(-1).scene,arena.scene);
      assert.equal(r.calls.at(-1).camera,arena.camera);
      assert.equal(Object.values(arena._backdrops).filter(g=>g.visible).length,1);
      arena.scene.updateMatrixWorld(true);
      const projected=arena.opponent.getWorldPosition(new THREE.Vector3()).project(arena.camera);
      assert.ok(projected.x>0&&projected.x<1);
      assert.ok(projected.y>-.4&&projected.y<.4,'The opponent stays in the visible central band.');
    }
    arena.close();assert.equal(arena.render(),false);arena.dispose();
  }
});
test('animated turns lock against overlap, complete once, stay bounded and cancel cleanly',()=>{
  const arena=new BattleArena({renderer:renderer(),lowPower:true});
  arena.open(ENCOUNTERS[0]);
  const before=resources(arena.scene),combat=new CombatSystem();
  let completions=0;
  const events=combat.act('observe').events;
  assert.equal(arena.play(events,()=>completions++),true);
  assert.equal(arena.play(events,()=>completions++),false);
  for(let i=0;i<100;i++)arena.update(1/30);
  assert.equal(arena.playing,false);assert.equal(completions,1);
  assert.deepEqual(resources(arena.scene),before,'Turns must reuse GPU resources.');
  const excessive=Array.from({length:50},()=>({type:'action',actor:'luma',actionId:'strong-wave'}));
  assert.equal(arena.play(excessive,()=>completions++),true);
  for(let i=0;i<100;i++)arena.update(1/30);
  assert.equal(completions,2);assert.equal(arena.playing,false);
  assert.ok(arena.floats.every(f=>Number.isFinite(f.screenX)&&Number.isFinite(f.screenY)));
  arena.play(events,()=>completions++);arena.close();arena.update(5);
  assert.equal(completions,2);assert.equal(arena.play([],()=>completions++),false);
  arena.dispose();
});
test('arena disposal releases its resources once and retains the borrowed environment',()=>{
  const environment=new THREE.Texture();let borrowedDisposals=0;
  environment.addEventListener('dispose',()=>borrowedDisposals++);
  const arena=new BattleArena({renderer:renderer(),environment,lowPower:true});
  arena.open(ENCOUNTERS[1]);
  const counts=new Map();
  for(const item of resources(arena.scene)){
    counts.set(item,0);
    const originalDispose=item.dispose;
    item.dispose=function(...args){counts.set(item,counts.get(item)+1);return originalDispose.apply(this,args);};
  }
  arena.dispose();arena.dispose();
  assert.equal(borrowedDisposals,0);
  assert.ok([...counts.values()].every(n=>n===1),'Every owned mesh, geometry, material, texture and skeleton is disposed once.');
  assert.throws(()=>arena.open(ENCOUNTERS[0]),/disposed/);
  assert.equal(arena.scene.children.length,0);
});

test('evasion is visible while the incoming wave travels, without a late second hop',()=>{
  const arena=new BattleArena({renderer:renderer(),lowPower:true});
  arena.open(ENCOUNTERS[0]);
  const combat=new CombatSystem(),result=combat.act('dodge');
  assert.ok(result.events.some(e=>e.type==='dodge'&&e.amount>0));
  arena.play(result.events);
  let incoming=false,outcome=false;
  for(let i=0;i<150&&arena.playing;i++){
    arena.update(.01);
    const entry=arena._current;
    if(entry?.event.actor==='opponent'&&entry.event.type==='action'&&entry.age/entry.duration>.3&&entry.age/entry.duration<.7){
      incoming=true;
      assert.ok(arena.luma.position.x<arena._lumaBase.x-.3);
      assert.ok(arena.luma.position.y>arena._lumaBase.y+.1);
    }
    if(entry?.event.type==='dodge'){
      outcome=true;assert.equal(arena.luma.position.y,arena._lumaBase.y);
    }
  }
  assert.ok(incoming&&outcome);arena.dispose();
});

test('arena flora, coral and ivy use distinct batched scenery with a shared water clock',()=>{
  for(const lowPower of [true,false]){
    const arena=new BattleArena({renderer:renderer(),lowPower});
    for(const encounter of ENCOUNTERS){
      arena.open(encounter);arena.update(.05);
      const landscape=arena._backdrops[encounter.arena];assert.equal(landscape.userData.features.organic,true);assert.equal(landscape.userData.clock.value,arena.time);
      for(const [name,count] of [['Coastal broad leaves',96],['Layered coastal fronds',42],['Aelys littoral flowers',96]]){
        const mesh=landscape.getObjectByName(name);assert.ok(mesh.isInstancedMesh&&mesh.count>=count);
      }
      assert.equal(Boolean(landscape.getObjectByName('Lagoon branching coral')),encounter.arena==='lagoon');
      assert.equal(Boolean(landscape.getObjectByName('Ancient site climbing ivy')),encounter.arena==='ruins');
      const water=landscape.getObjectByName('Arena shallow water'),shader={uniforms:{},vertexShader:'#include <begin_vertex>\n#include <beginnormal_vertex>'};water.material.onBeforeCompile(shader);
      assert.equal(shader.uniforms.uArenaClock,landscape.userData.clock);
    }arena.dispose();
  }
});
test('strong resonance anticipates backwards, pushes with flippers and recovers',()=>{
  const arena=new BattleArena({renderer:renderer(),lowPower:true});arena.open(ENCOUNTERS[0]);arena.play(new CombatSystem().act('strong-wave').events);
  let prepared=false,released=false,ribbon=false;const baseX=arena._lumaBase.x;
  for(let frame=0;frame<75;frame++){
    arena.update(.01);const e=arena._current;
    if(e?.event.type==='action'&&e.event.actor==='luma'&&e.event.actionId==='strong-wave'){
      const p=e.age/e.duration;
      if(p>.15&&p<.23){prepared=true;assert.ok(arena.luma.position.x<baseX-.04);}
      if(p>.48&&p<.6){released=true;assert.ok(arena.luma.position.x>baseX+.25);}
      for(const joint of arena._fore)assert.ok([joint.rotation.x,joint.rotation.y,joint.rotation.z].every(Number.isFinite));
    }
    if(e?.event.type==='hit'&&e.event.actor==='luma'&&e.event.target==='opponent')assert.ok(Math.abs(arena.luma.position.x-baseX)<1e-6);
    for(const w of arena._waves)if(w.group.visible){ribbon=true;assert.ok(w.ribbon.mesh.isMesh);assert.ok(w.ribbon.material.uniforms.uOpacity.value>=0);}
  }
  assert.ok(prepared&&released&&ribbon);arena.close();arena.dispose();
});
test('recipient-local impacts reuse four slots without creating resources during turns',()=>{
  const arena=new BattleArena({renderer:renderer(),lowPower:true});arena.open(ENCOUNTERS[0]);const before=resources(arena.scene);
  arena.play([{type:'hit',actor:'luma',target:'opponent',element:'water',amount:18}]);arena.update(.01);
  const active=arena._impacts.slots.filter(s=>s.mesh.visible);assert.equal(active.length,1);
  assert.ok(Math.abs(active[0].mesh.position.x-arena._opponentBase.x)<.08);assert.ok(Math.abs(active[0].mesh.position.y-arena._opponentBase.y)<.1);
  arena.update(.2);arena.play([{type:'guard',actor:'luma',amount:14,element:'light'}]);arena.update(.01);
  assert.ok(arena._impacts.slots.some(s=>s.mesh.visible&&Math.abs(s.mesh.position.x-(arena._shield.position.x+.64))<.001));
  for(let i=0;i<100;i++)arena._impacts.emit(0,1,.5,arena._palette.water,Boolean(i%2));
  assert.equal(arena._impacts.slots.length,4);assert.deepEqual(resources(arena.scene),before);
  for(let i=0;i<10;i++)arena._impacts.update(.1);
  assert.ok(arena._impacts.slots.every(s=>!s.mesh.visible));arena.open(ENCOUNTERS[1]);assert.ok(arena._impacts.slots.every(s=>!s.mesh.visible));arena.dispose();
});
