import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GuardianController } from '../src/player/GuardianController.js';
import { MOVEMENT } from '../src/config/gameplay.js';
import { WaterResponse } from '../src/world/WaterResponse.js';

function fixture({ terrain = () => 1, position = [0, 1.025, 0], resolveMovement, surface } = {}) {
  const object = new THREE.Group();
  object.position.set(...position);
  const state = {
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
    dive: false, ascend: false, sprint: false, inputMode: 'keyboard',
  };
  const edges = new Set(), events = [], worldEvents = [], snapshots = [];
  const input = {
    getState: () => state,
    consumePressed(name) { const pressed = edges.has(name); edges.delete(name); return pressed; },
    consumeLookDelta: () => ({ x: 0, y: 0 }),
  };
  const environment = {
    getEnvironmentAt: p => ({ waterLevel: 0, groundHeight: terrain(p), surfaceHeight:surface?.(p), current: { x: 0, y: 0, z: 0 } }),
    resolveMovement,
    emitLumaMotion(type, p, strength) { worldEvents.push({ type, position: p, strength }); },
  };
  const controller = new GuardianController({
    object, camera: new THREE.PerspectiveCamera(), input, environment,
    onMotion: (type, payload) => events.push({ type, ...payload }),
    onStateChange: s => snapshots.push({ ...s }),
  });
  controller.yaw = 0;
  function button(name, pressed) {
    if (pressed && !state[name]) edges.add(name);
    state[name] = pressed;
  }
  function step(seconds, fps = 60) {
    for (let i = 0; i < Math.round(seconds * fps); i++) controller.update(1 / fps);
  }
  return { controller, object, state, edges, events, worldEvents, snapshots, button, step };
}

for (const fps of [30, 60, 120]) {
  test('belly hop has a stable arc and single takeoff/contact at ' + fps + ' Hz', () => {
    const f = fixture();
    f.button('ascend', true);
    let peak = 0, airFrames = 0, airHadLandMode = true;
    for (let i = 0; i < fps * 2; i++) {
      f.controller.update(1 / fps);
      const s = f.controller.state;
      peak = Math.max(peak, s.jumpHeight);
      if (s.airborne) {airFrames++;airHadLandMode &&= s.mode === 'land' && !s.grounded;}
    }
    assert.ok(Math.abs(peak - .3) < .005);
    assert.ok(Math.abs(airFrames / fps - .5) <= 1 / fps);
    assert.ok(airHadLandMode);
    assert.deepEqual(f.events.map(e => e.type), ['hop', 'land']);
    assert.deepEqual(f.worldEvents.map(e => e.type), ['hop', 'land']);
    assert.ok(Math.abs(f.events[0].peakHeight - .3) < 1e-9);
    assert.ok(Math.abs(f.events[1].peakHeight - .3) < .005);
    assert.equal(f.controller.state.jumpStage, 'idle');
    assert.equal(f.controller.state.grounded, true);
    assert.equal(f.controller.state.energy, 100);
    assert.equal(f.controller.state.oxygen, 100);
    assert.ok(f.object.position.z > .10 && f.object.position.z < .24, 'A stationary hop gives a small forward impulse.');
    const stages = f.snapshots.map(s => s.jumpStage);
    for (const stage of ['anticipation', 'air', 'landing']) assert.ok(stages.includes(stage));
    f.step(1, fps);assert.equal(f.events.filter(e => e.type === 'hop').length, 1);
  });
}

test('simultaneous ascend/dive edges are consumed without a queued second hop', () => {
  const f = fixture();f.button('ascend', true); f.button('dive', true);
  f.controller.update(1 / 60);assert.equal(f.edges.size, 0);
  f.step(2);assert.equal(f.events.filter(e => e.type === 'hop').length, 1);
});
test('walking to water emits one splash at contact, with no repeated surface cues', () => {
  const f = fixture({ terrain: p => p.z > -.3 ? 1 : -4.6 });
  f.state.move.y = 1;f.step(3);
  assert.equal(f.controller.state.mode, 'surface');
  assert.equal(f.events.filter(e => e.type === 'splash').length, 1);
  assert.equal(f.events.filter(e => e.type === 'hop').length, 0);
  assert.equal(f.controller.state.oxygen, 100);
  f.state.move.y = 0;f.button('ascend', true);f.step(2);
  assert.equal(f.events.filter(e => e.type === 'splash').length, 1);
});
test('a hop into water locks both held vertical inputs until all are released', () => {
  const f = fixture({ terrain: p => p.z > -.4 ? 1 : -4.6 });
  f.state.move.y = 1;f.button('ascend', true);f.button('dive', true);f.step(2);
  assert.equal(f.controller.state.mode, 'surface');assert.equal(f.controller.state.airborne, false);
  assert.equal(f.controller.state.oxygen, 100);assert.equal(f.events.filter(e => e.type === 'splash').length, 1);
  f.button('ascend', false);f.step(.3);assert.equal(f.controller.state.mode, 'surface');
  f.button('dive', false);f.step(1 / 60);f.button('dive', true);f.step(1);
  assert.equal(f.controller.state.mode, 'underwater');assert.ok(f.controller.state.oxygen < 100);
});
test('surface ascent stays below float height plus six centimetres', () => {
  const f = fixture({ terrain: () => -4.6, position: [0, .12, 0] });
  f.button('ascend', true);let maximum = f.object.position.y;
  for (let i = 0; i < 180; i++) {f.controller.update(1 / 60);maximum = Math.max(maximum, f.object.position.y);}
  assert.ok(maximum <= MOVEMENT.surfaceFloatHeight + .06 + 1e-9);
  assert.equal(f.controller.state.mode, 'surface');assert.equal(f.events.filter(e => e.type === 'splash').length, 0);
});
test('a lower landing support extends flight without dragging the trajectory down', () => {
  const f = fixture({ terrain: p => p.z > -.4 ? 1 : .2 });
  f.state.move.y = 1;f.button('ascend', true);
  let airFrames = 0, lowerSupportInAir = false;
  for (let i = 0; i < 120; i++) {
    f.controller.update(1 / 60);
    if (f.controller.state.airborne) {airFrames++;if (f.object.position.z <= -.4 && f.object.position.y > 1) lowerSupportInAir = true;}
  }
  assert.ok(lowerSupportInAir);assert.ok(airFrames / 60 > .65);
  assert.ok(Math.abs(f.object.position.y - .225) < 1e-9);assert.equal(f.events.filter(e => e.type === 'land').length, 1);
});
test('leaving the shore during anticipation cancels the hop without an aquatic launch', () => {
  const f = fixture({ terrain: p => p.z > -.005 ? 1 : -4.6 });
  f.state.move.y = 1;f.button('dive', true);f.step(2);
  assert.equal(f.events.filter(e => e.type === 'hop').length, 0);
  assert.equal(f.controller.state.jumpStage, 'idle');assert.equal(f.controller.state.mode, 'surface');
  assert.equal(f.controller.state.oxygen, 100);
});
test('airborne care pause preserves trajectory and drains every button edge', () => {
  const f = fixture();f.button('ascend', true);f.step(.3);
  const before = {y: f.object.position.y, velocity: f.controller.velocity.y,phase: f.controller.state.jumpPhase};
  f.controller.setEnabled(false);f.button('dive', true);f.edges.add('action');f.edges.add('sprint');f.step(.5);
  assert.equal(f.object.position.y, before.y);assert.equal(f.controller.velocity.y, before.velocity);
  assert.equal(f.controller.state.jumpPhase, before.phase);assert.equal(f.edges.size, 0);
  f.controller.setEnabled(true);f.step(1.5);
  assert.equal(f.controller.state.grounded, true);assert.deepEqual(f.events.map(e => e.type), ['hop', 'land']);
});
test('paused Luma still receives idle animation with zero movement speed', () => {
  const f = fixture(), updates = [];
  f.object.userData.update = (dt, s) => updates.push({ dt, speed: s.speed, horizontalSpeed: s.horizontalSpeed, moving: s.moving });
  f.state.move.y = 1;f.step(.2);f.controller.setEnabled(false);f.edges.add('ascend');f.controller.update(1 / 60);
  assert.deepEqual(updates.at(-1), { dt: 1 / 60, speed: 0, horizontalSpeed: 0, moving: false });
  f.controller.setEnabled(true);f.state.move.y = 0;f.step(.3);
  assert.equal(f.events.filter(e => e.type === 'hop').length, 0);
});
test('teleport cancels flight and immediately reports the new grounded state', () => {
  const f = fixture();f.button('ascend', true);f.step(.3);f.controller.teleport(new THREE.Vector3(2, 8, 2));
  assert.equal(f.controller.state.jumpStage, 'idle');assert.equal(f.controller.state.jumpHeight, 0);
  assert.equal(f.controller.state.airborne, false);assert.equal(f.controller.state.grounded, true);
  assert.equal(f.controller.velocity.length(), 0);assert.equal(f.object.position.y, 1.025);
  f.controller.teleport(new THREE.Vector3(2, 1.5, 2), { snapToEnvironment: false });
  assert.equal(f.controller.state.grounded, false);assert.equal(f.controller.state.airborne, true);
  assert.equal(f.controller.state.jumpStage, 'idle');
});
test('collision correction supplies the landing support and stops blocked gait travel', () => {
  const f = fixture({
    terrain: p => p.z < -.06 ? 3 : 1,
    resolveMovement(p, previous) {if (p.z >= -.06) return false;p.z = previous.z;return true;},
  });
  f.state.move.y = 1;f.button('ascend', true);f.step(1.5);
  assert.ok(f.object.position.z >= -.06);assert.equal(f.object.position.y, 1.025);
  assert.equal(f.controller.state.grounded, true);const phase = f.controller.state.gaitPhase;f.step(.2);
  assert.equal(f.controller.state.gaitPhase, phase);assert.equal(f.controller.state.moving, false);
  assert.ok(f.snapshots.some(s => s.moving === true));assert.ok(f.snapshots.some(s => s.moving === false));
});
test('event positions are immutable snapshots and the turning animation signal is bounded', () => {
  const f = fixture();f.button('ascend', true);f.step(.15);
  const event = f.events.find(e => e.type === 'hop'),start = event.position.clone();
  f.state.move.x = 1;f.step(1);assert.deepEqual(event.position.toArray(), start.toArray());
  assert.notEqual(event.position, f.worldEvents[0].position);
  assert.ok(Math.abs(f.controller.state.turn) <= 1);assert.ok(f.snapshots.some(s => s.moving));
});
test('underwater sprint still consumes energy and zero oxygen still forces ascent', () => {
  const f = fixture({ terrain: () => -4.6, position: [0, -2, 0] });
  f.state.move.y = 1;f.state.sprint = true;f.step(.5);
  assert.ok(f.controller.state.energy < 100);assert.ok(f.controller.state.oxygen < 100);
  f.controller.setVitals({ oxygen: 0 });f.button('dive', true);f.controller.update(1 / 60);
  assert.equal(f.controller.state.forcedAscent, true);assert.ok(f.controller.velocity.y > -MOVEMENT.diveSpeed);
});
for (const stage of ['anticipation', 'landing']) test('pause freezes ' + stage + ' and resumes its remaining pose', () => {
  const f = fixture();f.button('ascend', true);
  for (let i = 0; i < 90 && f.controller.state.jumpStage !== stage; i++) f.controller.update(1 / 60);
  assert.equal(f.controller.state.jumpStage, stage);const phase = f.controller.state.jumpPhase;
  f.controller.setEnabled(false);f.step(.3);assert.equal(f.controller.state.jumpStage, stage);
  assert.equal(f.controller.state.jumpPhase, phase);f.controller.setEnabled(true);f.step(1.5);
  assert.equal(f.controller.state.jumpStage, 'idle');assert.deepEqual(f.events.map(e => e.type), ['hop', 'land']);
});
test('an unmodelled raised step blocks an airborne seal rather than lifting it through stone', () => {
  const f = fixture({ terrain: p => p.z > -.16 ? 1 : 3 });f.state.move.y = 1;f.button('ascend', true);
  let maximum = f.object.position.y;
  for (let i = 0; i < 90; i++) {f.controller.update(1 / 60);maximum = Math.max(maximum, f.object.position.y);if (f.controller.state.jumpStage === 'landing') break;}
  assert.ok(maximum < 1.34);assert.ok(f.object.position.z >= -.16);assert.equal(f.controller.state.grounded, true);
});
test('held underwater ascent reaches the surface without becoming flight', () => {
  const f = fixture({ terrain: () => -4.6, position: [0, -1.4, 0] });f.button('ascend', true);f.step(3);
  assert.equal(f.controller.state.mode, 'surface');assert.ok(f.object.position.y <= MOVEMENT.surfaceFloatHeight + .06 + 1e-9);
  assert.equal(f.events.filter(e => e.type === 'hop').length, 0);
});
for(const fps of [30,60])test('surface waves and strong impacts preserve buoyancy and oxygen at '+fps+' Hz',()=>{
  let t=0;const response=new WaterResponse();
  const f=fixture({terrain:()=>-4.6,position:[0,-.14,0],surface:p=>.12*Math.sin(t*2)+response.sample(p.x,p.z)});
  for(let i=0;i<fps*10;i++){
    t=i/fps;response.update(t);
    if(i===fps)for(let j=0;j<8;j++)response.impact(0,0,1);
    f.controller.update(1/fps);
    assert.equal(f.controller.state.mode,'surface');
    assert.equal(f.controller.state.oxygen,100);
    assert.ok(Number.isFinite(f.object.position.y)&&Math.abs(f.controller.velocity.y)<2);
  }
  t=12;response.update(t);
  // Hold the wave phase to verify return to the shared floating target.
  f.step(3,fps);
  assert.ok(Math.abs(f.object.position.y-(.12*Math.sin(t*2)+MOVEMENT.surfaceFloatHeight))<.02);
  assert.equal(f.events.filter(e=>e.type==='splash').length,0);
});
test('surface support and underwater ceiling never put the belly below a shallow seabed',()=>{
  const f=fixture({terrain:()=>-.20,position:[0,-.14,0],surface:()=>-.2});
  f.button('dive',true);f.step(3);
  assert.ok(f.object.position.y>=-.20+MOVEMENT.bodyClearance-1e-9);
  assert.equal(f.controller.state.oxygen,100);
});

test('teleport and a shallow-water hop both resolve the seabed before care can pause',()=>{
  const ground=-.141021,surface=-.112357,floor=ground+MOVEMENT.bodyClearance;
  const floating=fixture({terrain:()=>ground,position:[0,2,0],surface:()=>surface});
  assert.ok(floating.object.position.y>=floor);
  floating.controller.teleport(new THREE.Vector3(2,2,2));
  assert.ok(floating.object.position.y>=floor);
  const hopping=fixture({terrain:p=>p.z>-.4?1:ground,surface:()=>surface});
  hopping.state.move.y=1;hopping.button('ascend',true);
  for(let i=0;i<180;i++){
    hopping.controller.update(1/60);
    if(hopping.object.position.z<-.4 && hopping.controller.state.jumpStage==='idle'){
      hopping.controller.setEnabled(false);
      assert.ok(hopping.object.position.y>=floor-1e-9);
      hopping.step(.3);assert.ok(hopping.object.position.y>=floor-1e-9);return;
    }
  }
  assert.fail('The hop should reach shallow-water support.');
});

test('shore waves preserve grounded land movement',()=>{
  const f=fixture({terrain:()=>-.10,surface:()=>.20,position:[0,0,0]});
  f.step(.3);
  assert.equal(f.controller.state.mode,'land');
  assert.equal(f.controller.state.grounded,true);
  assert.equal(f.controller.state.airborne,false);
  assert.equal(f.object.position.y,-.10+MOVEMENT.bodyClearance);
});
