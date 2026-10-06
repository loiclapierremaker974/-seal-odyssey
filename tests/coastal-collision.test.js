import test from 'node:test';
import * as THREE from 'three';
import { createAelysBackdrop } from '../src/world/createAelysBackdrop.js';
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

test('irregular coastline collisions follow the visible outline rather than its inner core',()=>{
  const outline=new Float32Array([20,-23,28,-23,28,-17,20,-17]);
  const cliff={x:24,z:-20,rx:1,rz:1,broadRadius:10,bottom:-5,top:10,outlineAtHeight:()=>outline};
  const p={x:20.2,y:-2,z:-20};
  assert.equal(resolveCoastalMovement(p,{x:19,y:-2,z:-20},.4,[cliff]),true);
  assert.ok(p.x<19.6);assert.equal(p.y,-2);
});

test('sculpted coastal contours remain closed and follow the rendered rock triangles',()=>{
  for(const highDetail of [false,true]){
    const backdrop=createAelysBackdrop({highDetail});
    const geology=backdrop.getObjectByName('Falaises stratifiées');
    geology.material.side=THREE.DoubleSide;backdrop.updateMatrixWorld(true);
    for(const blocker of backdrop.userData.blockers){
      for(const y of [-4.6,-2,0,1.7]){
        const p=blocker.outlineAtHeight(y);
        assert.ok(p.length>=8&&p.every(Number.isFinite));
        assert.ok(Math.hypot(p[0]-p.at(-2),p[1]-p.at(-1))<1e-5,'The outline must be closed.');
        const point={x:p[0],y,z:p[1]};
        assert.equal(resolveCoastalMovement(point,{x:blocker.x,y,z:blocker.z},.1,[blocker]),true);
        assert.ok(Number.isFinite(point.x+point.z));
        assert.ok(Math.hypot(point.x-p[0],point.z-p[1])>=.099,'The first contour vertex must separate from the rock.');
      }
    }
    const blocker=backdrop.userData.blockers[1],outline=blocker.outlineAtHeight(1.7);
    for(let i=0;i<outline.length-2;i+=18){
      const point=new THREE.Vector3(outline[i],1.7,outline[i+1]);
      const normal=new THREE.Vector3(point.x-blocker.x,0,point.z-blocker.z).normalize();
      const ray=new THREE.Raycaster(point.clone().addScaledVector(normal,.15),normal.clone().negate(),0,.30);
      const hits=ray.intersectObject(geology);
      assert.ok(hits.some(hit=>hit.point.distanceTo(point)<1e-4),'Collision edge lies on a rendered cliff triangle.');
    }
    const geometries=new Set(),materials=new Set(),textures=new Set();
    backdrop.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){materials.add(o.material);for(const v of Object.values(o.material))if(v?.isTexture)textures.add(v);}});
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
  }
});

test('the repeated closing vertex has a valid separating normal',()=>{
  const outline=[20,-23,28,-23,28,-17,20,-17,20,-23];
  const blocker={x:24,z:-20,top:10,bottom:-5,broadRadius:10,outlineAtHeight:()=>outline};
  const p={x:20,y:0,z:-23};
  assert.equal(resolveCoastalMovement(p,{...p},.4,[blocker]),true);
  assert.ok(Math.hypot(p.x-20,p.z+23)>.4);
  assert.equal(p.y,0);
});
