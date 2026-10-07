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
