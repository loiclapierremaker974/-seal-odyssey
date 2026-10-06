import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoastalMovement } from '../src/world/coastalCollision.js';

const cliff = {x:25,z:-20,rx:4,rz:3,bottom:-5,top:15};
test('a swimming seal cannot pass through a solid cliff, and depth is retained', () => {
  const position = {x:21.2,y:-2,z:-20}, previous = {x:20,y:-2,z:-20};
  assert.equal(resolveCoastalMovement(position,previous,.4,[cliff]),true);
  assert.ok(position.x <= 20.6);assert.equal(position.y,-2);
});
test('open lagoon movement and clear water below a cliff are retained', () => {
  for(const position of [{x:0,y:0,z:-13},{x:25,y:-6,z:-20}]) {
    const before={...position};
    assert.equal(resolveCoastalMovement(position,before,.4,[cliff]),false);
    assert.deepEqual(position,before);
  }
});
test('centre and world-edge contacts remain finite and inside the water bounds', () => {
  const centre={x:25,y:1,z:-20};
  resolveCoastalMovement(centre,{...centre},.4,[cliff]);
  assert.ok(Number.isFinite(centre.x+centre.z));assert.ok(centre.x>29);
  const edge={x:44,y:-1,z:48};
  assert.equal(resolveCoastalMovement(edge,{x:42,y:-1,z:42},.4,[]),true);
  assert.deepEqual(edge,{x:43,y:-1,z:43});
});
