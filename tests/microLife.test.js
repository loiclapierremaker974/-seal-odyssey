import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAelysMicroLife } from '../src/world/createAelysMicroLife.js';
const terrain=(x,z)=>1.4+x*.025-z*.015,spawn={x:.25,z:5.6},matrix=new THREE.Matrix4();
const read=(mesh,i,target=new THREE.Vector3())=>{mesh.getMatrixAt(i,matrix);return target.setFromMatrixPosition(matrix);};
const create=(lowPower=false)=>createAelysMicroLife({terrainHeight:terrain,lowPower});
test('micro-fauna budgets, safe dry trails, articulated limbs and positive wing scales',()=>{
  for(const lowPower of [true,false]){
    const g=create(lowPower),{ants,flutter,glows}=g.userData.counts;
    assert.equal(ants,lowPower?12:28);assert.equal(flutter,lowPower?4:10);assert.equal(g.children.length,5);
    assert.ok(g.children.every(m=>m.isInstancedMesh&&!m.castShadow));
    const bodies=g.getObjectByName('Fourmis — abdomen thorax tête'),limbs=g.getObjectByName('Fourmis — six pattes articulées et antennes'),wings=g.getObjectByName('Insectes ailés — membranes');
    assert.equal(bodies.count,ants*3);assert.equal(limbs.count,ants*14);assert.equal(wings.count,flutter*2);assert.equal(g.getObjectByName('Lucioles — lueur discrète').count,glows);
    for(let step=0;step<=36;step++){
      g.userData.update(step*2,null);
      for(let i=0;i<ants;i++){const p=read(bodies,i*3+1);assert.ok(Math.abs(p.x)>=1.7);assert.ok(Math.hypot(p.x-spawn.x,p.z-spawn.z)>=1.7);assert.ok(terrain(p.x,p.z)>.15);assert.ok(p.y-terrain(p.x,p.z)>=.031&&p.y-terrain(p.x,p.z)<=.035);}
      for(let i=0;i<wings.count;i++){wings.getMatrixAt(i,matrix);assert.ok(matrix.determinant()>0);}
    }
    assert.equal(wings.material.side,THREE.DoubleSide);assert.equal(wings.material.depthWrite,false);g.userData.dispose();
  }
});
test('Luma gently diverts ants and flying insects, which return after departure',()=>{
  for(const [name,index,frames] of [['Fourmis — abdomen thorax tête',1,30],['Insectes ailés — silhouettes',0,60]]){
    const a=create(true),b=create(true),ma=a.getObjectByName(name),mb=b.getObjectByName(name),p=read(ma,index);
    const luma=new THREE.Vector3(p.x,name.startsWith('Fourmis')?terrain(p.x,p.z):p.y-.3,p.z);
    for(let i=1;i<=frames;i++){a.userData.update(i/60,null);b.userData.update(i/60,luma);}
    assert.ok(read(mb,index).distanceTo(read(ma,index))>.1);
    for(let i=frames+1;i<=frames+240;i++){a.userData.update(i/60,null);b.userData.update(i/60,null);}
    assert.ok(read(mb,index).distanceTo(read(ma,index))<.001);a.userData.dispose();b.userData.dispose();
  }
});
test('micro-fauna retain GPU arrays with invalid inputs and dispose exactly once',()=>{
  const scene=new THREE.Scene(),g=create();scene.add(g);
  const resources=new Set(),refs=g.children.map(m=>({mesh:m,matrix:m.instanceMatrix.array,bound:m.boundingSphere}));
  for(const m of g.children){resources.add(m);resources.add(m.geometry);resources.add(m.material);}
  for(let i=0;i<240;i++)g.userData.update(i/60,{x:-3.4,y:1.4,z:5.6});
  g.userData.setRestoration(100);g.userData.update(NaN,{x:Infinity,y:NaN,z:1});g.userData.update(Infinity,null);
  for(const r of refs){assert.equal(r.mesh.instanceMatrix.array,r.matrix);assert.equal(r.mesh.boundingSphere,r.bound);assert.ok(Array.from(r.matrix).every(Number.isFinite));}
  const counts=new Map();for(const r of resources){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}
  g.userData.dispose();g.userData.dispose();g.userData.update(2,null);assert.equal(g.parent,null);assert.equal(g.children.length,0);assert.ok(Array.from(counts.values()).every(c=>c===1));
});
test('submerged terrain hides ants with finite matrices',()=>{
  const g=createAelysMicroLife({terrainHeight:()=>-2,lowPower:true}),b=g.getObjectByName('Fourmis — abdomen thorax tête');
  for(let i=0;i<b.count;i++){b.getMatrixAt(i,matrix);const e=matrix.elements;assert.equal(Math.hypot(e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]),0);}
  g.userData.update(1,{x:-3,y:0,z:5});assert.ok(Array.from(b.instanceMatrix.array).every(Number.isFinite));g.userData.dispose();
});
