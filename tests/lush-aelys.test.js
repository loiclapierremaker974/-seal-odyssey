import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLushAelys } from '../src/world/createLushAelys.js';
const terrainHeight=(x,z)=>z>0?.7:-3;
test('lush profiles remain bounded and keep the central path and spawn clear',()=>{
  for(const lowPower of [true,false]){
    const g=createLushAelys({lowPower,terrainHeight}),stats=g.userData.stats,matrix=new THREE.Matrix4(),p=new THREE.Vector3();
    assert.ok(stats.drawCalls<=8);assert.ok(stats.triangles<=(lowPower?25000:80000));
    for(const m of g.children){if(!m.isInstancedMesh)continue;assert.ok(m.instanceMatrix.array.every(Number.isFinite));
      if(!['Bosquets côtiers aux feuilles pliées','Fougères du rivage','Coussins de mousse','Floraisons côtières'].includes(m.name))continue;
      for(let i=0;i<m.count;i++){m.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);assert.ok(Math.abs(p.x)>=1.8);assert.ok(Math.hypot(p.x-.25,p.z-5.6)>1.95);}
    }g.userData.dispose();
  }
});
test('fish yield locally then return smoothly without reallocating instance buffers',()=>{
  const g=createLushAelys({lowPower:true,terrainHeight}),fish=g.getObjectByName('Petits bancs lumineux'),m=new THREE.Matrix4(),offsets=g.userData.fishAvoidanceOffsets;
  fish.getMatrixAt(0,m);const p=new THREE.Vector3().setFromMatrixPosition(m);
  for(let i=1;i<=10;i++)g.userData.update(i*.1,p);
  const reaction=Math.max(...offsets.map(Math.abs));assert.ok(reaction>.02&&reaction<=1.8);assert.equal(g.userData.fishAvoidanceOffsets,offsets);
  for(let i=11;i<=70;i++)g.userData.update(i*.1);
  assert.ok(Math.max(...offsets.map(Math.abs))<reaction*.02);assert.ok(fish.instanceMatrix.array.every(Number.isFinite));g.userData.dispose();
});
test('flowers share the clock and actual actor uniform, and disposal detaches each resource once',()=>{
  const scene=new THREE.Scene(),g=createLushAelys({lowPower:true,terrainHeight});scene.add(g);
  const flower=g.getObjectByName('Floraisons côtières'),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader},p=new THREE.Vector3(4,.3,6);
  flower.material.onBeforeCompile(shader);g.userData.update(2.5,p);
  assert.equal(shader.uniforms.uLushTime.value,2.5);assert.ok(shader.uniforms.uLushActor.value.distanceTo(p)<1e-9);assert.equal(shader.uniforms.uLushReactive.value,1);
  const resources=new Map();g.traverse(o=>{for(const r of [o.geometry,o.material,o.isInstancedMesh?o:null])if(r&&!resources.has(r))resources.set(r,0);});
  for(const r of resources.keys())r.addEventListener('dispose',()=>resources.set(r,resources.get(r)+1));
  g.userData.dispose();g.userData.dispose();assert.equal(g.parent,null);assert.equal(g.children.length,0);assert.equal(scene.children.length,0);assert.ok([...resources.values()].every(c=>c===1));
});
