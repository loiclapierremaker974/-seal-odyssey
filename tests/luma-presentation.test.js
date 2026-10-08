import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleLumaPresentation} from '../src/world/lumaPresentation.js';
test('All hop phases keep positive bounded proportions and make height visible',()=>{
 for(const stage of ['idle','anticipation','air','landing'])for(let p=0;p<=1;p+=.025){
  const pose=sampleLumaPresentation({mode:'land',jumpStage:stage,jumpPhase:p,jumpHeight:stage==='air'?Math.sin(p*Math.PI)*.48:0},3);
  assert.ok(pose.scaleX>.9&&pose.scaleX<1.15);assert.ok(pose.scaleY>.9&&pose.scaleY<1.15);
  assert.ok(pose.lift>=0&&pose.lift<.4);assert.ok(pose.shadowScale>.65);
 }
 assert.ok(sampleLumaPresentation({mode:'land',jumpHeight:.48},0).lift>.25);
});
test('Care remains settled even if movement state arrives from a swimming frame',()=>{
 const pose=sampleLumaPresentation({mode:'surface',speed:4.5,gaitPhase:2,turn:1},10,{care:true});
 assert.equal(pose.frame,0);assert.equal(pose.drive,0);assert.equal(pose.bank,0);
});
test('Water maintaining strokes move slowly at rest and the cycle is periodic',()=>{
 const state={mode:'surface',gaitPhase:0,speed:0};
 const a=sampleLumaPresentation(state,0),b=sampleLumaPresentation(state,4);
 assert.notEqual(a.frame,b.frame);assert.ok(a.drive>0&&a.drive<.2);
 const c=sampleLumaPresentation({...state,gaitPhase:Math.PI*2},0);
 assert.equal(a.frame,c.frame);
});
test('Idle land pose does not create a swimming stroke; malformed input stays finite',()=>{
 assert.equal(sampleLumaPresentation({mode:'land'},0).drive,0);
 const p=sampleLumaPresentation({speed:NaN,gaitPhase:Infinity,turn:Infinity,jumpHeight:NaN},NaN);
 for(const v of Object.values(p))assert.ok(Number.isFinite(v));
});
