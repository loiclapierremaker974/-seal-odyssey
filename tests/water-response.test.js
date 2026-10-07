import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterResponse, sampleAelysSurface } from '../src/world/WaterResponse.js';

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
