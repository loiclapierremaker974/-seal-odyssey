import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createIllustratedArena,loadIllustratedArenaAssets} from '../src/combat/createIllustratedArena.js';
import {ARENA_ILLUSTRATIONS as manifest} from '../src/combat/arenaIllustrations.js';
import {BattleArena} from '../src/combat/BattleArena.js';
import {ENCOUNTERS,CombatSystem} from '../src/combat/CombatSystem.js';
function texture(width,height){const t=new THREE.Texture({width,height});t.colorSpace=THREE.SRGBColorSpace;return t;}
function assets(){return {backgrounds:Object.fromEntries(Object.entries(manifest.backgrounds).map(([k,e])=>[k,{...e,texture:texture(e.width,e.height)}])),sealTexture:texture(manifest.seal.atlas.width,manifest.seal.atlas.height),currentTexture:texture(manifest.current.width,manifest.current.height),atlas:manifest.seal.atlas};}
const renderer=()=>({getSize:t=>t.set(960,540),render(){}});
function owned(layer){const result=new Set();layer.group.traverse(o=>{if(o.geometry)result.add(o.geometry);if(o.material)result.add(o.material);});return result;}
test('the original Luma PNG has a genuine alpha cutout and contact pivots stay on the painted feet',async()=>{
 const png=await readFile(new URL('../public/assets/arena/luma-poses.png',import.meta.url));
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 assert.equal(width,manifest.seal.atlas.width);assert.equal(height,manifest.seal.atlas.height);assert.equal(png[25],6);
 const chunks=[];for(let i=8;i+12<=png.length;){const n=png.readUInt32BE(i),type=png.toString('ascii',i+4,i+8);if(type==='IDAT')chunks.push(png.subarray(i+8,i+8+n));i+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(stride*height);
 let at=0,zero=0;
 for(let y=0;y<height;y++){const f=raw[at++];assert.ok(f<=4);for(let x=0;x<stride;x++){
  const i=y*stride+x,l=x>=4?pixels[i-4]:0,u=y?pixels[i-stride]:0,ul=y&&x>=4?pixels[i-stride-4]:0;let p=0;
  if(f===1)p=l;if(f===2)p=u;if(f===3)p=(l+u)>>1;
  if(f===4){const v=l+u-ul,pa=Math.abs(v-l),pb=Math.abs(v-u),pc=Math.abs(v-ul);p=pa<=pb&&pa<=pc?l:pb<=pc?u:ul;}
  pixels[i]=(raw[at++]+p)&255;
 }for(let x=0;x<width;x++)if(pixels[y*stride+x*4+3]===0)zero++;}
 assert.ok(zero>width*height*.5,'The background must really be transparent, not a painted rectangle.');
 for(const [name,[frame]] of Object.entries(manifest.seal.atlas.poses)){
  let bottom=-1,count=0;
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
   if(frame.clips.some(r=>x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3]))continue;
   if(pixels[(frame.y+y)*stride+(frame.x+x)*4+3]>=128){bottom=Math.max(bottom,y);count++;}
  }
  assert.ok(count>30000,name+' must contain a full seal.');
  assert.ok(Math.abs(bottom-frame.pivotY*frame.height)<=6,name+' contact pivot must align to its visible lowest flipper.');
 }
});
test('all three painted encounter settings replace their procedural geometry and retain borrowed textures',()=>{
 const a=assets(),arena=new BattleArena({renderer:renderer(),lowPower:true});
 arena.setIllustratedAssets(a);
 const counts=new Map();for(const t of [a.sealTexture,a.currentTexture,...Object.values(a.backgrounds).map(x=>x.texture)]){counts.set(t,0);t.addEventListener('dispose',()=>counts.set(t,counts.get(t)+1));}
 for(const e of ENCOUNTERS){
  arena.open(e);assert.equal(arena.illustrated,true);assert.equal(arena.luma.visible,false);assert.equal(arena._sky.visible,false);
  assert.ok(Object.values(arena._backdrops).every(g=>!g.visible));
  assert.equal(arena._core.visible,false);assert.ok(arena._illustrated.current.isMesh);
  assert.equal(arena._illustrated.background.material.uniforms.uMap.value,a.backgrounds[e.arena].texture);
  arena.resize(390,844);arena.update(.05);assert.equal(arena._illustrated.group.visible,true);
  const before=owned(arena._illustrated);arena.play(new CombatSystem().act('strong-wave').events);
  for(let i=0;i<100;i++)arena.update(.04);
  assert.deepEqual(owned(arena._illustrated),before);
 }
 arena.close();assert.equal(arena._illustrated.group.visible,false);arena.dispose();arena.dispose();
 assert.ok([...counts.values()].every(n=>n===0),'Borrowed art belongs to its loader.');
});
test('pose transitions keep one actor anchor and atlas resources while evasion follows the live hop',()=>{
 const a=assets(),layer=createIllustratedArena(a),actor=new THREE.Object3D(),camera=new THREE.OrthographicCamera();
 actor.position.set(-3,.04,.15);camera.position.set(0,3,12);camera.lookAt(0,1,0);
 const before=owned(layer);
 for(const [id,p,pose] of [['strong-wave',.2,'prepare'],['strong-wave',.6,'attack'],['guard',.5,'guard'],['comfort',.5,'happy']]){
  layer.update(1,{event:{type:'action',actor:'luma',actionId:id},age:p,duration:1},actor,camera);
  assert.equal(layer.pose,pose);assert.ok(layer.seal.position.equals(actor.position));
 }
 actor.position.y=.2;layer.update(2,{event:{type:'action',actor:'opponent'},defense:'dodge',age:.5,duration:1},actor,camera);
 assert.equal(layer.pose,'dodge');assert.equal(layer.seal.position.y,.2,'The illustration must not add a second airborne displacement.');
 assert.deepEqual(owned(layer),before);
 let calls=0;for(const item of before)item.addEventListener('dispose',()=>calls++);
 layer.dispose();layer.dispose();assert.equal(calls,before.size);
});
test('late successful downloads are released when another required illustration fails',async()=>{
 const original=THREE.TextureLoader.prototype.loadAsync,late=texture(1672,941);let disposals=0;
 late.addEventListener('dispose',()=>disposals++);
 THREE.TextureLoader.prototype.loadAsync=url=>url.includes('luma-poses')?Promise.reject(new Error('unavailable')):new Promise(resolve=>setTimeout(()=>resolve(late),10));
 try{await assert.rejects(loadIllustratedArenaAssets(manifest,{baseUrl:'/-seal-odyssey/'}),/unavailable/);assert.equal(disposals,1);}
 finally{THREE.TextureLoader.prototype.loadAsync=original;}
});
