import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraObstacles } from '../src/world/CameraObstacles.js';
import { GuardianController } from '../src/player/GuardianController.js';

test('an instanced shoreline rock shortens the camera arm before contact', () => {
  const query = new CameraObstacles({ clearance: .30 });
  const rock = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),new THREE.MeshStandardMaterial(),1);
  rock.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 3));
  query.add(rock);
  const target = new THREE.Vector3();
  const position = new THREE.Vector3(0, 0, 6);
  query.resolve(target, position);
  assert.ok(position.z > 1.6 && position.z < 1.8);
  assert.ok(position.toArray().every(Number.isFinite));
  const unobstructed = new THREE.Vector3(4, 0, 6);
  query.resolve(new THREE.Vector3(4, 0, 0), unobstructed);
  assert.deepEqual(unobstructed.toArray(), [4, 0, 6]);
  rock.geometry.dispose();rock.material.dispose();rock.dispose();
});
test('distant coastal geometry is rejected before triangle intersection', () => {
  const query = new CameraObstacles();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10),new THREE.MeshStandardMaterial());
  mesh.position.set(30, 0, -30);
  let calls = 0;mesh.raycast = () => { calls++; };
  query.add(mesh,{bounds:[new THREE.Box3(new THREE.Vector3(20,-5,-40),new THREE.Vector3(40,5,-20))]});
  const position = new THREE.Vector3(0, 0, 6);
  query.resolve(new THREE.Vector3(), position);
  assert.equal(calls, 0);assert.deepEqual(position.toArray(), [0, 0, 6]);
  mesh.geometry.dispose();mesh.material.dispose();
});
test('the post-interpolation camera and care snap remain before a solid wall', () => {
  const query = new CameraObstacles();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2,4,1),new THREE.MeshStandardMaterial());
  wall.position.set(0,.7,3);query.add(wall);
  const controller = new GuardianController({
    object:new THREE.Group(),camera:new THREE.PerspectiveCamera(52,1,.08,150),
    input:{getState:()=>({move:{x:0,y:0},look:{x:0,y:0}})},
    environment:{getEnvironmentAt:()=>({groundHeight:0,waterLevel:-2}),
      resolveCameraPosition:(target,position)=>query.resolve(target,position)},
  });
  controller.yaw=0;controller.pitch=0;
  controller.camera.position.set(0,.725,6);
  controller._updateCamera(1/60);
  assert.ok(controller.camera.position.z<=2.2+1e-6,'Smoothing must not retain a position behind the wall.');
  controller.setCameraFocus({yaw:0,pitch:0,distance:3.2,targetHeight:.86});
  controller._snapCamera();
  assert.ok(controller.camera.position.z<=2.2+1e-6);
  assert.ok(controller.camera.position.toArray().every(Number.isFinite));
  wall.geometry.dispose();wall.material.dispose();
});
test('an empty camera query preserves finite positions', () => {
  const query = new CameraObstacles();
  const target = new THREE.Vector3(2,.86,-3),position = new THREE.Vector3(2,1.2,.2),before=position.clone();
  assert.equal(query.resolve(target,position),position);
  assert.ok(position.distanceTo(before)<1e-12);
  assert.ok(position.toArray().every(Number.isFinite));
});
