import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAelysWaterGarden,stepWaterGardenSpring} from '../src/world/createAelysWaterGarden.js';

test('contact springs converge, settle after departure and remain bounded at multiple frame rates',()=>{
  for(const rate of [20,30,60,120]){
    const state={offset:0,velocity:0};
    for(let i=0;i<rate*3;i++)stepWaterGardenSpring(state,1/rate,-.065);
    assert.ok(Math.abs(state.offset+.065)<.001);
    for(let i=0;i<rate*3;i++)stepWaterGardenSpring(state,1/rate,0);
    assert.ok(Math.abs(state.offset)<.001);
    for(const delta of [1,NaN,-1,Infinity])stepWaterGardenSpring(state,delta,-3);
    assert.ok(Number.isFinite(state.offset)&&Number.isFinite(state.velocity));
    assert.ok(state.offset>=-.10&&state.offset<=.018);
  }
});
test('pads follow the actual surface and trigger one bounded wave per entry, without acting as platforms',()=>{
  const impacts=[],group=createAelysWaterGarden({terrainHeight:()=>-2,surfaceHeight:(x,z,t)=>.12+t*.03,
    onContact:(...args)=>impacts.push(args),lowPower:true});
  assert.ok(group.userData.padCount<=8&&group.userData.padCount>0);
  const pad=group.userData.pads[0],position=new THREE.Vector3(pad.x,0,pad.z);
  for(let i=0;i<60;i++)group.userData.update(1/60,1,position,{mode:'surface'});
  assert.equal(impacts.length,1);
  const matrix=new THREE.Matrix4();group.getObjectByName('Feuilles flottantes nervurées').getMatrixAt(0,matrix);
  const visual=new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(visual.y>.15-.08&&visual.y<.15+.04);
  group.userData.update(.05,1,null,{mode:'land'});
  group.userData.update(.05,1,position,{mode:'surface'});assert.equal(impacts.length,2);
  group.userData.update(.05,1,null,{mode:'land'});
  group.userData.update(.05,1,position,{mode:'underwater'});assert.equal(impacts.length,2);
  group.userData.dispose();
});
test('water-garden disposal is idempotent and releases owned GPU resources exactly once',()=>{
  const group=createAelysWaterGarden({terrainHeight:()=>-2,lowPower:true}),objects=new Set(),counts=new Map();
  group.traverse(o=>{if(o.isInstancedMesh)objects.add(o);if(o.geometry)objects.add(o.geometry);
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)objects.add(m);});
  for(const item of objects){counts.set(item,0);const original=item.dispose;item.dispose=function(...args){counts.set(item,counts.get(item)+1);return original.apply(this,args);};}
  group.userData.dispose();group.userData.dispose();group.userData.update(1,10,new THREE.Vector3(),{mode:'surface'});
  assert.ok([...counts.values()].every(n=>n===1));assert.equal(group.children.length,0);
});
