import test from 'node:test';
import assert from 'node:assert/strict';
import { createAelysMotionFX } from '../src/world/createAelysMotionFX.js';

test('contact effects reuse bounded pools, expire and dispose shared resources once', () => {
  for (const lowPower of [true, false]) {
    const fx=createAelysMotionFX({lowPower}), points=fx.children[0];
    const attributes=points.geometry.attributes;
    assert.equal(attributes.position.count,lowPower?36:72);
    const arrays=Object.values(attributes).map(a=>a.array);
    for(let i=0;i<100;i++){
      fx.userData.land({x:i*.01,y:1,z:2},.5);
      fx.userData.splash({x:0,y:0,z:0},.8);
      fx.userData.update(null,{},1/60);
    }
    Object.values(attributes).forEach((a,i)=>{
      assert.equal(a.array,arrays[i]);
      for(const value of a.array)assert.ok(Number.isFinite(value));
    });
    for(let i=0;i<180;i++)fx.userData.update(null,{},1/60);
    assert.ok([...attributes.aLife.array].every(v=>v===0));
    assert.ok(fx.children.slice(1).every(r=>!r.visible));
    const resources=new Set();
    fx.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
    const counts=new Map();
    for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)||0)+1));
    fx.userData.dispose();
    for(const r of resources)assert.equal(counts.get(r),1);
  }
});
