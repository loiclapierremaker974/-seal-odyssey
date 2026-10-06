import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLumaProxy, disposeLumaProxy } from '../src/world/createLumaProxy.js';

for (const highDetail of [false,true]) test('Luma skin and rig remain valid through land, surface and depth ('+highDetail+')', () => {
  const luma=createLumaProxy({highDetail});
  const body=luma.getObjectByName('Luma continuous skin');
  assert.ok(body.isSkinnedMesh);
  const normals=body.geometry.getAttribute('normal'), weights=body.geometry.getAttribute('skinWeight');
  for(let i=0;i<weights.count;i++){
    const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);
    assert.ok(Math.abs(sum-1)<1e-5);
    assert.ok(Number.isFinite(normals.getX(i)+normals.getY(i)+normals.getZ(i)));
  }
  const vertex=new THREE.Vector3();
  for(const mode of ['land','surface','underwater','land']){
    for(let frame=0;frame<60;frame++)luma.userData.update(1/60,{mode,speed:5});
    luma.updateMatrixWorld(true);
    body.skeleton.update();
    for(let i=0;i<body.geometry.attributes.position.count;i+=37){
      body.getVertexPosition(i,vertex);
      assert.ok(Number.isFinite(vertex.x+vertex.y+vertex.z));
      assert.ok(vertex.length()<5);
    }
  }
  assert.ok(luma.userData.wetness>.5,'The skin should remain damp just after returning to shore.');
  const eye=luma.getObjectByName('Luma left eye');
  assert.ok(eye.parent.parent.parent.parent.isBone,'The eye, reflections and muzzle must follow the head rig.');
  disposeLumaProxy(luma);
});

test('Luma releases shared textures and geometries once, including the skin maps',()=>{
  const luma=createLumaProxy({highDetail:false});
  const resources=new Map();
  const register=(resource)=>{if(resource&&!resources.has(resource)){resources.set(resource,0);resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));}};
  luma.traverse(o=>{
    register(o.geometry);
    for(const material of Array.isArray(o.material)?o.material:[o.material])if(material){
      register(material);for(const value of Object.values(material))if(value?.isTexture)register(value);
    }
  });
  disposeLumaProxy(luma);
  assert.ok(resources.size>10);
  for(const count of resources.values())assert.equal(count,1);
});
