import test from 'node:test';
import assert from 'node:assert/strict';
import {EncounterDirector} from '../src/combat/EncounterDirector.js';

const encounters=[
  {id:'shore',position:{x:4,z:3},radius:1.25},
  {id:'lagoon',position:{x:5,z:-8},radius:1.5},
];

test('an encounter starts once on entry and can be retried after leaving',()=>{
  const d=new EncounterDirector({encounters});
  assert.equal(d.update({x:0,z:0}),null);
  assert.equal(d.update({x:4,z:3}).id,'shore');
  for(let i=0;i<5;i++)assert.equal(d.update({x:4.1,z:3}),null);
  d.update({x:0,z:0});
  assert.equal(d.update({x:4,z:3}).id,'shore');
});

test('pauses and airborne movement defer the encounter without consuming entry',()=>{
  const d=new EncounterDirector({encounters}),p={x:4,z:3};
  assert.equal(d.update(p,{enabled:false}),null);
  assert.equal(d.update(p,{airborne:true,jumpStage:'air'}),null);
  assert.equal(d.update(p,{jumpStage:'landing'}),null);
  assert.equal(d.update(p).id,'shore');
});

test('restored encounters and saved progress do not trigger again',()=>{
  const d=new EncounterDirector({encounters,resolvedIds:['shore','unknown']});
  assert.equal(d.getNearby({x:4,z:3}),null);
  assert.equal(d.update({x:4,z:3}),null);
  assert.equal(d.update({x:5,z:-8}).id,'lagoon');
  assert.equal(d.markResolved('unknown'),false);
  assert.equal(d.markResolved('lagoon'),true);
  d.update({x:0,z:0});
  assert.equal(d.update({x:5,z:-8}),null);
});

test('explicit interaction suppresses repeat entry and malformed positions are ignored',()=>{
  const d=new EncounterDirector({encounters});
  assert.equal(d.getNearby({x:4,z:3}).id,'shore');
  d.suppressUntilExit('shore');
  assert.equal(d.update({x:4,z:3}),null);
  assert.equal(d.update({x:Infinity,z:0}),null);
  assert.equal(d.getNearby({x:0,z:NaN}),null);
  d.update({x:0,z:0});
  assert.equal(d.update({x:4,z:3}).id,'shore');
});
