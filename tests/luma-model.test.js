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
  const rearJoints=[];
  luma.traverse(o=>{if(o.name==='Luma hind flipper joint')rearJoints.push(o);});
  assert.equal(rearJoints.length,2);
  for(const joint of rearJoints)assert.equal(joint.parent,body.skeleton.bones.find(b=>b.name==='Luma rear propulsion'));
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

test('short fur follows the shared rig and flattens after immersion',()=>{
  for(const highDetail of [false,true]){
    const luma=createLumaProxy({highDetail}),body=luma.getObjectByName('Luma continuous skin'),coats=[];
    luma.traverse(o=>{if(o.name.startsWith('Luma short fur '))coats.push(o);});
    assert.ok(coats.length>=3&&coats.length<=6);
    if(!highDetail)assert.ok(coats.length<=3,'Mobile fur uses a smaller draw budget.');
    const dry=coats.at(-1).material.userData.furLength.value;
    for(let i=0;i<90;i++)luma.userData.update(1/60,{mode:'underwater',speed:4});
    luma.updateMatrixWorld(true);body.skeleton.update();
    for(const coat of coats){
      assert.equal(coat.skeleton,body.skeleton);assert.equal(coat.geometry,body.geometry);
      assert.equal(coat.castShadow,false);
      const a=new THREE.Vector3(),b=new THREE.Vector3();
      for(const vertex of [0,119,body.geometry.attributes.position.count-1]){
        body.getVertexPosition(vertex,a);coat.getVertexPosition(vertex,b);
        assert.ok(a.distanceTo(b)<1e-6,'Fur and skin must stay attached in a swimming pose.');
      }
    }
    assert.ok(coats.at(-1).material.userData.furLength.value<dry*.4);
    disposeLumaProxy(luma);
  }
});

test('middle rig preserves the bind pose and foreflipper placement',()=>{
  for(const highDetail of [false,true]){
    const luma=createLumaProxy({highDetail,scale:.62}),body=luma.getObjectByName('Luma continuous skin');
    const middle=body.skeleton.bones[3],weights=body.geometry.getAttribute('skinWeight');
    assert.equal(body.skeleton.bones.length,4);assert.equal(middle.parent,body.skeleton.bones[0]);
    assert.ok(Array.from({length:weights.count},(_,i)=>weights.getW(i)).some(w=>w>.5));
    luma.updateMatrixWorld(true);body.skeleton.update();
    const expected=new THREE.Vector3(),actual=new THREE.Vector3(),positions=body.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i+=31){
      expected.fromBufferAttribute(positions,i);body.getVertexPosition(i,actual);
      assert.ok(expected.distanceTo(actual)<1e-5);
    }
    const front=[];luma.traverse(o=>{if(o.name==='Luma shoulder joint')front.push(o);});
    assert.equal(front.length,2);
    for(const joint of front){
      assert.equal(joint.parent,middle);
      expected.set(Math.sign(joint.position.x)*.44,.27,.38).multiplyScalar(.62);
      joint.getWorldPosition(actual);assert.ok(expected.distanceTo(actual)<1e-6);
    }
    disposeLumaProxy(luma);
  }
});

test('jump poses leave the shadow at shore height with finite, volume-preserving deformation',()=>{
  const scale=.62,baseY=1.52,luma=createLumaProxy({scale,highDetail:false});
  const body=luma.getObjectByName('Luma continuous skin'),shadow=luma.getObjectByName('Luma soft contact shadow');
  const world=new THREE.Vector3(),vertex=new THREE.Vector3();luma.rotation.y=.37;
  for(const state of [
    {jumpStage:'anticipation',jumpPhase:1,jumpHeight:0,landing:0,airborne:false},
    {jumpStage:'air',jumpPhase:.42,jumpHeight:.3,landing:0,airborne:true},
    {jumpStage:'landing',jumpPhase:0,jumpHeight:0,landing:1,airborne:false},
    {jumpStage:'idle',jumpPhase:0,jumpHeight:0,landing:0,airborne:false},
  ]){
    luma.position.set(4,baseY+state.jumpHeight,-2);
    for(let i=0;i<30;i++)luma.userData.update(1/60,{mode:'land',horizontalSpeed:2,gaitPhase:1.1,...state});
    luma.updateMatrixWorld(true);body.skeleton.update();shadow.getWorldPosition(world);
    assert.ok(Math.abs(world.y-(baseY+.016*scale))<1e-6);assert.equal(shadow.visible,true);
    const core=body.skeleton.bones[0],torso=body.skeleton.bones[3];
    assert.deepEqual(core.scale.toArray(),[1,1,1]);
    assert.ok(Math.abs(torso.scale.x*torso.scale.y*torso.scale.z-1)<1e-8);
    if(state.jumpStage==='anticipation')assert.ok(torso.scale.y<.97&&torso.scale.y>.94);
    if(state.jumpStage==='landing')assert.ok(torso.scale.y<.95&&torso.scale.y>.92);
    if(state.airborne){assert.equal(luma.userData.motion.groundPush,0);assert.ok(shadow.material.opacity<.8);}
    luma.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
    for(let i=0;i<body.geometry.attributes.position.count;i+=37){
      body.getVertexPosition(i,vertex);assert.ok(Number.isFinite(vertex.x+vertex.y+vertex.z)&&vertex.length()<5);
    }
  }
  luma.userData.update(1/60,{mode:'land',overWater:true,jumpHeight:.3,airborne:true,jumpStage:'air'});
  assert.equal(shadow.visible,false);
  for(const mode of ['surface','underwater']){luma.userData.update(1/60,{mode});assert.equal(shadow.visible,false);}
  disposeLumaProxy(luma);
});

test('distance gait drives the torso on shore and swimming banks with turns',()=>{
  const luma=createLumaProxy({highDetail:false}),body=luma.getObjectByName('Luma continuous skin');
  const core=body.skeleton.bones[0],middle=body.skeleton.bones[3];
  luma.userData.update(0,{mode:'land',horizontalSpeed:3,gaitPhase:Math.PI/2});const forward=middle.rotation.x;
  luma.userData.update(0,{mode:'land',horizontalSpeed:3,gaitPhase:Math.PI*1.5});
  assert.ok(forward>.02&&middle.rotation.x<-.02);
  luma.userData.update(0,{mode:'land',horizontalSpeed:0,speed:20,gaitPhase:Math.PI/2});
  assert.ok(Math.abs(middle.rotation.x)<1e-9);
  luma.userData.update(1/60,{mode:'land',horizontalSpeed:3,gaitPhase:Math.PI/2,airborne:true,jumpStage:'air'});
  assert.ok(Math.abs(middle.rotation.x)<1e-9);
  for(let i=0;i<120;i++)luma.userData.update(1/60,{mode:'underwater',horizontalSpeed:3,turn:1});
  assert.ok(core.rotation.z<0&&Math.abs(core.rotation.z)<.1);
  luma.userData.update(1/60,{mode:'underwater',horizontalSpeed:3,turn:-1});assert.ok(core.rotation.z>0&&Math.abs(core.rotation.z)<.1);
  disposeLumaProxy(luma);
});

test('surface pose partially immerses the belly while keeping Luma visible above water',()=>{
  const luma=createLumaProxy({highDetail:false}),body=luma.getObjectByName('Luma continuous skin');
  luma.position.y=-.14;
  for(let i=0;i<120;i++)luma.userData.update(1/60,{mode:'surface',horizontalSpeed:0});
  luma.updateMatrixWorld(true);body.skeleton.update();
  const v=new THREE.Vector3();let min=Infinity,max=-Infinity;
  for(let i=0;i<body.geometry.attributes.position.count;i+=17){
    body.getVertexPosition(i,v);v.applyMatrix4(body.matrixWorld);
    min=Math.min(min,v.y);max=Math.max(max,v.y);
  }
  assert.ok(min<-.03&&max>.2);
  disposeLumaProxy(luma);
});

test('skull shape and bind translation remain rigid through swimming and landing',()=>{
  for(const highDetail of [false,true]){
    const luma=createLumaProxy({highDetail,scale:1}),body=luma.getObjectByName('Luma continuous skin'),head=body.skeleton.bones.find(b=>b.name==='Luma head'),core=body.skeleton.bones[0],anchor=head.position.clone(),weights=body.geometry.getAttribute('skinWeight'),skull=[];
    for(let i=0;i<weights.count;i++)if(weights.getY(i)>1-1e-6)skull.push(i);
    assert.ok(skull.length>3);const pair=[skull[Math.floor(skull.length*.25)],skull[Math.floor(skull.length*.65)]],a=new THREE.Vector3(),b=new THREE.Vector3();
    luma.updateMatrixWorld(true);body.skeleton.update();body.getVertexPosition(pair[0],a);body.getVertexPosition(pair[1],b);const distance=a.distanceTo(b);assert.ok(distance>0);
    for(const state of [{mode:'surface',horizontalSpeed:4,turn:1},{mode:'underwater',horizontalSpeed:4,turn:-1},{mode:'land',horizontalSpeed:0,jumpStage:'anticipation',jumpPhase:1},{mode:'land',horizontalSpeed:0,jumpStage:'landing',landing:1}]){
      for(let i=0;i<90;i++)luma.userData.update(1/60,state);luma.updateMatrixWorld(true);body.skeleton.update();
      assert.ok(head.position.distanceTo(anchor)<1e-10);assert.deepEqual(core.scale.toArray(),[1,1,1]);body.getVertexPosition(pair[0],a);body.getVertexPosition(pair[1],b);assert.ok(Math.abs(a.distanceTo(b)-distance)<1e-6);
    }disposeLumaProxy(luma);
  }
});
test('flippers have closed nondegenerate volumes and monotonic symmetric sections',()=>{
  for(const highDetail of [false,true]){
    const luma=createLumaProxy({highDetail}),geometries=new Set();luma.traverse(o=>{if(o.isMesh&&o.name.includes('flipper'))geometries.add(o.geometry);});assert.equal(geometries.size,4);
    for(const g of geometries){
      const p=g.getAttribute('position'),idx=g.index,{rings,sections}=g.userData,stride=sections+1;assert.ok(rings>0&&sections>0);
      for(let ring=0;ring<=rings;ring++){const z=p.getZ(ring*stride);if(ring)assert.ok(z>p.getZ((ring-1)*stride));
        for(let side=0;side<=sections;side++){const i=ring*stride+side,j=ring*stride+sections-side;assert.ok(Math.abs(p.getZ(i)-z)<1e-8);assert.ok(Math.abs(p.getX(i)+p.getX(j))<1e-8);assert.ok(Math.abs(p.getY(i)-p.getY(j))<1e-8);}}
      assert.ok(Math.abs(p.getX(rings*stride+sections/4))>1e-6);
      const welded=new Map(),ids=[],edges=new Map(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();
      for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e7)).join(',');if(!welded.has(key))welded.set(key,welded.size);ids[i]=welded.get(key);}
      for(let i=0;i<idx.count;i+=3){const tri=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];a.fromBufferAttribute(p,tri[0]);b.fromBufferAttribute(p,tri[1]);c.fromBufferAttribute(p,tri[2]);cross.crossVectors(b.sub(a),c.sub(a));assert.ok(cross.lengthSq()>1e-12);
        for(const [u,v] of [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]]){const key=[ids[u],ids[v]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}}
      for(const n of edges.values())assert.equal(n,2);
    }disposeLumaProxy(luma);
  }
});
test('fin roots remain embedded in actual skinned body throughout land and water poses',()=>{
  for(const highDetail of [false,true]){
    const luma=createLumaProxy({highDetail,scale:.62}),body=luma.getObjectByName('Luma continuous skin'),joints=[];
    luma.traverse(o=>{if(o.name==='Luma shoulder joint'||o.name==='Luma hind flipper joint')joints.push(o);});assert.equal(joints.length,4);
    const rest=joints.map(j=>j.position.clone()),ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3(),material=body.material,probe=material.clone();probe.side=THREE.DoubleSide;body.material=probe;
    try{
      for(const state of [{mode:'land',horizontalSpeed:0},{mode:'land',horizontalSpeed:3,gaitPhase:Math.PI/2},{mode:'surface',horizontalSpeed:4,turn:1},{mode:'underwater',horizontalSpeed:4,turn:-1},{mode:'land',horizontalSpeed:0,jumpStage:'landing',landing:1}]){
        for(let i=0;i<90;i++)luma.userData.update(1/60,state);luma.updateMatrixWorld(true);body.skeleton.update();body.computeBoundingSphere();
        for(let i=0;i<joints.length;i++){const joint=joints[i];assert.ok(joint.position.distanceTo(rest[i])<1e-10);joint.getWorldPosition(origin);direction.set(Math.sign(joint.position.x),0,0).transformDirection(joint.parent.matrixWorld);
          for(const sign of [1,-1]){ray.set(origin,direction.clone().multiplyScalar(sign));const hit=ray.intersectObject(body,false)[0];assert.ok(hit&&Number.isFinite(hit.distance)&&hit.distance>0);}}
      }
    }finally{body.material=material;probe.dispose();disposeLumaProxy(luma);}
  }
});
