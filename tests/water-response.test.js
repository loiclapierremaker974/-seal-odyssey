import * as THREE from 'three';
import { createAelysWater } from '../src/world/createAelysWater.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterResponse, sampleAelysSurface, sampleAelysMeshSurface } from '../src/world/WaterResponse.js';

test('water responds at the contact, propagates a wave and returns to calm',()=>{
  const water=new WaterResponse();const identity=water.impacts;
  assert.equal(water.sample(0,0),0);water.impact(0,0,1);
  assert.ok(water.sample(0,0)<-.10);
  water.update(.5);
  assert.ok(Math.abs(water.sample(1.325+.15,0))>.015);
  assert.ok(Math.abs(water.sample(0,0))<.015);
  water.update(3);assert.equal(water.sample(0,0),0);
  assert.equal(water.sample(1.5,0),0);assert.equal(water.impacts,identity);
});
test('impact strength, overlapping bounds and mobile pool capacity stay finite',()=>{
  const weak=new WaterResponse(),strong=new WaterResponse();
  weak.impact(0,0,.25);strong.impact(0,0,1);
  assert.ok(Math.abs(weak.sample(0,0)-strong.sample(0,0)*.25)<1e-9);
  for(const capacity of [4,8]){
    const response=new WaterResponse({capacity}),identity=response.impacts;
    for(let i=0;i<300;i++)response.impact(i*.001,0,1);
    for(let t=0;t<3;t+=.025){
      response.update(t);
      for(let x=-2;x<2;x+=.05){const y=response.sample(x,0);assert.ok(Number.isFinite(y)&&Math.abs(y)<=.24);}
    }
    assert.equal(response.impacts,identity);assert.equal(response.impacts.length,32);
    assert.equal(response.sample(NaN,0),0);
    assert.ok(Number.isFinite(sampleAelysSurface(1,2,response.time,response)));
  }
});

test('buoyancy samples the actual triangulated surface, including contact deformation',()=>{
  const response=new WaterResponse();response.impact(.25,.25,1);
  const time=0,size=4,segments=8;
  const h=(x,z)=>sampleAelysSurface(x,z,time,response);
  const u=.4,v=.3,x=u*.5,z=v*.5;
  const expected=h(0,0)*(1-u-v)+h(0,.5)*v+h(.5,0)*u;
  assert.ok(Math.abs(sampleAelysMeshSurface(x,z,time,response,size,segments)-expected)<1e-12);
  const a=.8,b=.7;
  const upper=h(0,.5)*(1-a)+h(.5,.5)*(a+b-1)+h(.5,0)*(1-b);
  assert.ok(Math.abs(sampleAelysMeshSurface(a*.5,b*.5,time,response,size,segments)-upper)<1e-12);
  assert.equal(sampleAelysMeshSurface(.5,.5,time,response,size,segments),h(.5,.5));
  const impact=sampleAelysMeshSurface(.25,.25,time,response,size,segments)-sampleAelysMeshSurface(.25,.25,time,null,size,segments);
  assert.ok(impact<-.085,'The mobile mesh represents the broad contact depression.');
});

test('lagoon buoyancy matches ray intersections with the actual nonuniform water triangles',()=>{
  for(const lowPower of [false,true]){
    const water=createAelysWater({size:96,waterLevel:0,terrainHeight:()=>-4.6,lowPower});
    const response=water.userData.response;response.impact(-4.1,-1.2,1);response.update(.4);
    const positions=water.geometry.getAttribute('position'),indices=water.geometry.index;
    assert.ok(positions.count<16000);
    for(const [x,z] of [[-4.15,-1.24],[1.23,-3.54],[.25,5.6],[-18.2,-27.1]]){
      const ray=new THREE.Ray(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0));
      const vertices=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],hit=new THREE.Vector3();
      let found=false;
      for(let i=0;i<indices.count;i+=3){
        for(let k=0;k<3;k++){
          const v=vertices[k];v.fromBufferAttribute(positions,indices.getX(i+k));
          v.y=sampleAelysSurface(v.x,v.z,.4,response);
        }
        if(ray.intersectTriangle(...vertices,false,hit)){
          assert.ok(Math.abs(hit.y-water.userData.surfaceHeight(x,z,.4))<1e-6);
          found=true;break;
        }
      }
      assert.ok(found);
    }
    water.geometry.dispose();water.material.uniforms.uSeabed.value.dispose();water.material.dispose();
  }
});
