import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IslandController } from '../src/player/IslandController.js';
function fixture({terrain,resolveMovement,initialEnergy,initialOxygen}={}){
 const object=new THREE.Group();object.position.y=.04;
 const controls={move:{x:0,y:0},action:false,dive:false,ascend:false,sprint:false},queued=new Set(),events={motion:[],actions:[],states:[],focus:[],care:[]};
 const input={getState:()=>controls,consumePressed:name=>{const had=queued.has(name);queued.delete(name);return had;},destroy(){}};
 const environment={getEnvironmentAt:terrain||(()=>({isLand:true,groundHeight:.04,waterLevel:0})),resolveMovement,interact:p=>({success:true,type:'echo',id:'echo-rivage',position:p.clone()}),emitLumaMotion:(type,p)=>events.motion.push({type,p:p.clone()}),focusOn:(p,snap)=>events.focus.push({p:p.clone(),snap}),setCareFocus:a=>events.care.push(a)};
 const controller=new IslandController({object,input,environment,initialEnergy,initialOxygen,onAction:r=>events.actions.push(r),onStateChange:s=>events.states.push(s)});
 return {controller,object,controls,queued,events,environment};
}
const water=()=>({isLand:false,groundHeight:-4,waterLevel:0,floatY:.06});
function step(f,seconds,fps=60){const count=Math.round(seconds*fps);for(let i=0;i<count;i++)f.controller.update(seconds/count);}
const near=(a,b,e=1e-4)=>assert.ok(Math.abs(a-b)<e,'Expected '+a+' close to '+b);
test('island directions and acceleration are camera independent; diagonals do not move faster',()=>{
 const n=fixture(),e=fixture(),d=fixture();n.controls.move.y=1;e.controls.move.x=1;d.controls.move={x:1,y:1};
 step(n,1);step(e,1);step(d,1);
 assert.ok(n.object.position.z<-2);near(n.object.position.x,0);near(n.controller.state.heading,0);near(e.controller.state.heading,Math.PI/2,.001);
 near(Math.hypot(d.object.position.x,d.object.position.z),e.object.position.x);d.controls.move={x:0,y:0};step(d,1);assert.equal(d.controller.state.moving,false);
 const stopped=d.object.position.clone();step(d,1);assert.ok(d.object.position.distanceTo(stopped)<.0001);
});
test('collision uses corrected support and no gait progresses through a wall',()=>{
 const f=fixture({resolveMovement:(next,old)=>next.copy(old),terrain:p=>p.x>0?water():{isLand:true,groundHeight:.1,waterLevel:0}});
 f.controls.move.x=1;step(f,1);near(f.object.position.x,0);near(f.object.position.y,.1);near(f.controller.state.horizontalSpeed,0);near(f.controller.state.gaitPhase,0);assert.equal(f.controller.state.mode,'land');
});
for(const fps of [30,60])test('belly hop anticipates, flies and lands exactly once at '+fps+' Hz',()=>{
 const f=fixture();f.controls.ascend=true;f.controls.dive=true;const stages=new Set();let peak=0;
 for(let i=0;i<fps*2;i++){f.controller.update(1/fps);const s=f.controller.state;stages.add(s.jumpStage);peak=Math.max(peak,s.jumpHeight);assert.equal(s.grounded,s.mode==='land'&&!s.airborne);}
 assert.deepEqual([...stages].sort(),['air','anticipation','idle','landing']);assert.ok(peak>.45);assert.equal(f.events.motion.filter(e=>e.type==='hop').length,1);assert.equal(f.events.motion.filter(e=>e.type==='land').length,1);near(f.object.position.y,.04);assert.ok(f.object.position.z<-.05);
});
test('a belly hop across a shoreline lands in water once and cannot reuse held dive',()=>{
 const f=fixture({terrain:p=>p.z>=-.05?{isLand:true,groundHeight:.04,waterLevel:0}:water()});
 f.controls.dive=true;step(f,1);assert.equal(f.controller.state.mode,'surface');assert.equal(f.events.motion.filter(e=>e.type==='splash').length,1);assert.equal(f.events.motion.filter(e=>e.type==='dive').length,0);
 f.controls.dive=false;f.controller.update(1/60);f.controls.dive=true;f.controller.update(1/60);assert.equal(f.controller.state.mode,'underwater');
});
test('real queued taps between frames trigger hop and interaction once',()=>{
 const f=fixture();f.queued.add('ascend');f.queued.add('action');f.controller.update(1/60);assert.equal(f.controller.state.jumpStage,'anticipation');assert.equal(f.events.actions.length,1);
 step(f,1);assert.equal(f.events.actions.length,1);assert.equal(f.events.motion.filter(e=>e.type==='hop').length,1);
 const sea=fixture({terrain:water});sea.queued.add('dive');sea.controller.update(1/60);assert.equal(sea.controller.state.mode,'underwater');
 sea.queued.add('ascend');sea.controller.update(1/60);assert.equal(sea.controller.state.mode,'surface');
});
test('diving consumes oxygen and depletion returns safely to surface',()=>{
 const f=fixture({terrain:water,initialOxygen:.05});f.controls.dive=true;f.controller.update(.1);assert.equal(f.controller.state.mode,'surface');assert.equal(f.controller.state.forcedAscent,true);near(f.object.position.y,.06);
 step(f,1);assert.ok(f.controller.state.oxygen>18);assert.equal(f.controller.state.forcedAscent,false);assert.equal(f.events.motion.filter(e=>e.type==='dive').length,1);
 f.controls.dive=false;f.controller.update(1/60);f.controls.dive=true;step(f,1);assert.equal(f.controller.state.mode,'underwater');assert.ok(f.object.position.y<-1);
 f.controls.ascend=true;f.controller.update(1/60);assert.equal(f.controller.state.mode,'surface');
});
test('sprint spends energy only while moving and recovery remains bounded',()=>{
 const f=fixture({initialEnergy:50}),normal=fixture();f.controls.move.x=1;f.controls.sprint=true;normal.controls.move.x=1;step(f,1);step(normal,1);
 assert.ok(f.object.position.x>normal.object.position.x*1.4);assert.ok(f.controller.state.energy<50);const energy=f.controller.state.energy;f.controls.move.x=0;f.controls.sprint=false;step(f,1);assert.ok(f.controller.state.energy>energy);
 const exhausted=fixture({initialEnergy:4.1});exhausted.controls.move.x=1;exhausted.controls.sprint=true;step(exhausted,.2);assert.ok(exhausted.controller.state.energy>=0);assert.equal(exhausted.controller.state.sprinting,false);
});
test('pause freezes motion, jump and vitals and discards held/queued actions on resume',()=>{
 const f=fixture({initialEnergy:50,initialOxygen:50});f.controls.ascend=true;step(f,.25);f.controller.setEnabled(false);const before=f.controller.getState(),events=f.events.states.length;
 f.controls.action=true;f.controls.dive=true;f.controls.move.x=1;f.queued.add('action');step(f,2);
 assert.deepEqual(f.controller.getState(),before);assert.equal(f.events.states.length,events);assert.equal(f.events.actions.length,0);
 f.controller.setEnabled(true);step(f,1);assert.equal(f.events.actions.length,0);assert.equal(f.events.motion.filter(e=>e.type==='hop').length,1);
});
test('travel clears old momentum and jump; camera focus does not retain a live vector',()=>{
 const f=fixture();f.controls.move.x=1;f.controls.ascend=true;step(f,.3);assert.equal(f.controller.state.airborne,true);
 f.controls.action=true;f.controller.teleport({x:10,y:3,z:8});assert.equal(f.controller.state.jumpStage,'idle');near(f.controller.velocity.length(),0);near(f.object.position.y,.04);
 const target=f.events.focus.at(-1);assert.equal(target.snap,true);assert.deepEqual(target.p.toArray(),[10,.04,8]);f.controller.update(1/60);assert.equal(f.events.actions.length,0);assert.deepEqual(target.p.toArray(),[10,.04,8]);
 f.controller.setCameraFocus({});f.controller.setCameraFocus(null);assert.deepEqual(f.events.care,[true,false]);
});
test('an action opening a modal stops movement in the same frame; invalid deltas cannot act',()=>{
 const f=fixture();f.controls.action=true;f.controls.move.x=1;const before=f.object.position.clone();
 for(const dt of [0,-1,NaN,Infinity])f.controller.update(dt);assert.deepEqual(f.object.position.toArray(),before.toArray());assert.equal(f.events.actions.length,0);
 f.controller.onAction=()=>f.controller.setEnabled(false);f.controller.update(1/60);assert.equal(f.controller.enabled,false);assert.deepEqual(f.object.position.toArray(),before.toArray());
});
