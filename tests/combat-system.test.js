import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem, COMBAT_ACTIONS, ENCOUNTERS } from '../src/combat/CombatSystem.js';

const action = (state, id) => state.actions.find(item => item.id === id);
const clone = value => JSON.parse(JSON.stringify(value));

function assertBounds(state) {
  assert.ok(state.luma.energy >= 0 && state.luma.energy <= state.luma.maxEnergy);
  assert.ok(state.luma.serenity >= 0 && state.luma.serenity <= state.luma.maxSerenity);
  assert.ok(state.opponent.resolve >= 0 && state.opponent.resolve <= state.opponent.maxResolve);
  assert.ok(Object.values(state.cooldowns).every(value => Number.isInteger(value) && value >= 0));
  assert.equal(state.result, state.status === 'active' ? null : state.status);
}

test('encounters use isolated manifestations at the three intended exploration positions', () => {
  assert.deepEqual(ENCOUNTERS.map(item => [item.arena, item.position.x, item.position.z]),
    [['shore', 4, 3], ['lagoon', 5, -8], ['ruins', -8, -16]]);
  assert.equal(new Set(ENCOUNTERS.map(item => item.id)).size, 3);
  assert.ok(ENCOUNTERS.every(item => item.radius > 0 && item.opponent.maxResolve > 0));
  assert.ok(Object.isFrozen(ENCOUNTERS[0].opponent.pattern));
  assert.ok(Object.isFrozen(ENCOUNTERS[0].reward));
});

test('initial state, trust bounds and invalid encounter IDs are explicit', () => {
  const combat = new CombatSystem();
  const state = combat.getState();
  assert.equal(state.status, 'active');
  assert.equal(state.luma.lineage, 'Soluma');
  assert.equal(state.luma.serenity, 100);
  assert.equal(state.luma.energy, 60);
  assert.equal(state.luma.trust, 24);
  assert.equal(state.turn, 1);
  assert.equal(state.opponent.weakness, null);
  assert.deepEqual(state.actions.map(item => item.id),
    ['swift-wave', 'strong-wave', 'guard', 'dodge', 'observe', 'comfort']);
  assert.equal(new CombatSystem({ lumaTrust: -50 }).getState().luma.trust, 0);
  assert.equal(new CombatSystem({ lumaTrust: 150 }).getState().luma.trust, 100);
  assert.equal(new CombatSystem({ lumaTrust: NaN }).getState().luma.trust, 24);
  assert.throws(() => new CombatSystem({ encounterId: 'missing' }), RangeError);
  assertBounds(state);
});

test('unknown actions are rejected atomically without advancing any state', () => {
  const combat = new CombatSystem();
  const before = clone(combat.getState());
  const result = combat.act('missing');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'unknown-action');
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.deepEqual(combat.getState(), before);
});

test('strong-wave cooldown blocks exactly two subsequent accepted actions', () => {
  const combat = new CombatSystem();
  assert.equal(combat.act('strong-wave').accepted, true);
  assert.equal(action(combat.getState(), 'strong-wave').cooldownRemaining, 2);
  const before = clone(combat.getState());
  const rejected = combat.act('strong-wave');
  assert.equal(rejected.reason, 'cooldown');
  assert.deepEqual(combat.getState(), before);
  combat.act('observe');
  assert.equal(action(combat.getState(), 'strong-wave').cooldownRemaining, 1);
  assert.equal(combat.act('strong-wave').reason, 'cooldown');
  combat.act('guard');
  assert.equal(action(combat.getState(), 'strong-wave').available, true);
  assert.equal(combat.act('strong-wave').accepted, true);
});

test('energy rejection is atomic and observing still allows play at low energy', () => {
  const combat = new CombatSystem({ encounterId: 'ruins-resonance' });
  for (const id of ['strong-wave', 'guard', 'dodge', 'strong-wave']) {
    assert.equal(combat.act(id).accepted, true);
  }
  assert.equal(combat.getState().luma.energy, 6);
  const before = clone(combat.getState());
  assert.equal(action(combat.getState(), 'swift-wave').disabledReason, 'energy');
  const result = combat.act('swift-wave');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'energy');
  assert.deepEqual(combat.getState(), before);
  assert.equal(combat.act('observe').accepted, true);
});

test('observation reveals an affinity, strengthens the next wave and consumes the combo', () => {
  const baseline = new CombatSystem().act('swift-wave');
  const combat = new CombatSystem();
  const observed = combat.act('observe');
  assert.equal(observed.state.opponent.weakness, 'light');
  assert.equal(observed.state.combo.ready, true);
  assert.equal(observed.state.combo.turnsRemaining, 2);
  assert.ok(action(observed.state, 'swift-wave').comboReady);
  assert.ok(observed.events.some(event => event.type === 'observe'));
  const combined = combat.act('swift-wave');
  const hit = combined.events.find(event => event.type === 'hit' && event.actor === 'luma');
  assert.equal(hit.element, 'light');
  assert.equal(hit.target, 'opponent');
  assert.equal(hit.combo, true);
  assert.ok(hit.amount > baseline.events.find(event => event.actor === 'luma' && event.type === 'hit').amount);
  assert.equal(combined.state.combo.ready, false);
  assert.equal(combined.state.opponent.weakness, 'light');
});

test('an observation combo expires after two non-offensive actions', () => {
  const combat = new CombatSystem();
  combat.act('observe');
  const comfort = combat.act('comfort');
  assert.equal(comfort.state.combo.turnsRemaining, 1);
  // The third shore intention gathers without striking, so dodge adds no combo.
  const expired = combat.act('dodge');
  assert.equal(expired.state.combo.ready, false);
});

test('reading intentions distinguishes protection from evasion and unlocks defensive combos', () => {
  const dodge = new CombatSystem().act('dodge');
  const guard = new CombatSystem().act('guard');
  assert.equal(dodge.state.luma.serenity, 100);
  assert.ok(guard.state.luma.serenity < 100 && guard.state.luma.serenity > 95);
  assert.equal(dodge.state.combo.source, 'dodge');
  assert.equal(guard.state.combo.source, 'guard');
  const diffuseDodge = new CombatSystem({ encounterId: 'lagoon-knot' }).act('dodge');
  const diffuseGuard = new CombatSystem({ encounterId: 'lagoon-knot' }).act('guard');
  assert.ok(diffuseGuard.state.luma.serenity > diffuseDodge.state.luma.serenity);
  assert.equal(diffuseDodge.state.combo.ready, false);
  assert.ok(diffuseDodge.events.some(event => event.type === 'hit' && event.target === 'luma'));
});

test('a visible gathering turn announces the stronger next intention', () => {
  const combat = new CombatSystem({ encounterId: 'ruins-resonance' });
  assert.equal(combat.getState().intent.id, 'gather');
  assert.equal(combat.getState().intent.power, 0);
  const prepared = combat.act('observe');
  assert.equal(prepared.state.intent.id, 'pulse');
  assert.equal(prepared.state.intent.charged, true);
  assert.equal(prepared.state.intent.power, 24);
  const released = combat.act('guard');
  assert.equal(released.state.opponent.charged, false);
  assert.equal(released.state.intent.charged, false);
});

test('comfort restores isolated encounter energy with bounded trust influence', () => {
  const perform = trust => {
    const combat = new CombatSystem({ lumaTrust: trust });
    for (const id of ['guard', 'dodge', 'strong-wave']) assert.equal(combat.act(id).accepted, true);
    assert.equal(combat.getState().luma.energy, 26);
    return combat.act('comfort');
  };
  const low = perform(0);
  const high = perform(100);
  assert.equal(low.events.find(event => event.type === 'comfort').amount, 24);
  assert.equal(high.events.find(event => event.type === 'comfort').amount, 34);
  assert.equal(low.state.luma.energy, 50);
  assert.equal(high.state.luma.energy, 60);
  assertBounds(low.state);
  assertBounds(high.state);
});

test('all three encounters can be appeased with observation and resonant waves', () => {
  for (const encounter of ENCOUNTERS) {
    const combat = new CombatSystem({ encounterId: encounter.id });
    let result;
    for (let i = 0; i < 30 && combat.getState().status === 'active'; i++) {
      const state = combat.getState();
      const id = !state.combo.ready ? 'observe'
        : action(state, 'strong-wave').available ? 'strong-wave'
          : action(state, 'swift-wave').available ? 'swift-wave' : 'comfort';
      result = combat.act(id);
      assert.equal(result.accepted, true);
      assertBounds(result.state);
    }
    assert.equal(result.state.result, 'victory');
    assert.equal(result.state.opponent.resolve, 0);
    assert.ok(result.state.luma.serenity > 0);
    assert.equal(result.events.filter(event => event.type === 'victory').length, 1);
    assert.ok(!result.events.some(event => event.actor === 'opponent'));
    const before = clone(combat.getState());
    assert.equal(combat.act('observe').reason, 'finished');
    assert.equal(combat.retreat().reason, 'finished');
    assert.deepEqual(combat.getState(), before);
    assert.ok(before.actions.every(item => !item.available));
  }
});

test('defeat and retreat each resolve once without changing persistent Luma data', () => {
  const seal = Object.freeze({ trust: 24, health: 81, energy: 43 });
  const combat = new CombatSystem({ encounterId: 'ruins-resonance', lumaTrust: seal.trust });
  let result;
  for (let i = 0; i < 30 && combat.getState().status === 'active'; i++) result = combat.act('observe');
  assert.equal(result.state.result, 'defeat');
  assert.equal(result.state.luma.serenity, 0);
  assert.equal(result.state.opponent.resolve, result.state.opponent.maxResolve);
  assert.equal(result.events.filter(event => event.type === 'defeat').length, 1);
  assert.equal(combat.act('observe').reason, 'finished');
  assert.deepEqual(seal, { trust: 24, health: 81, energy: 43 });
  const fresh = new CombatSystem({ lumaTrust: seal.trust });
  const before = fresh.getState();
  const retreat = fresh.retreat();
  assert.equal(retreat.state.result, 'retreat');
  assert.equal(retreat.state.turn, before.turn);
  assert.deepEqual(retreat.state.luma, before.luma);
  assert.equal(retreat.events.filter(event => event.type === 'retreat').length, 1);
  assert.equal(fresh.retreat().reason, 'finished');
  assert.equal(new CombatSystem().getState().luma.serenity, 100);
});

test('snapshots, actions, encounter data and returned events cannot mutate the engine', () => {
  const combat = new CombatSystem();
  const before = combat.getState();
  assert.throws(() => { before.luma.energy = 0; }, TypeError);
  assert.throws(() => { before.encounter.position.x = 900; }, TypeError);
  assert.throws(() => { before.actions[0].cost = 0; }, TypeError);
  assert.throws(() => { COMBAT_ACTIONS.push({ id: 'extra' }); }, TypeError);
  const result = combat.act('observe');
  assert.throws(() => { result.events[0].actor = 'opponent'; }, TypeError);
  assert.throws(() => { result.events.push({ type: 'victory' }); }, TypeError);
  assert.throws(() => { result.state.combo.turnsRemaining = 100; }, TypeError);
  assert.equal(before.opponent.weakness, null);
  assert.equal(before.turn, 1);
  assert.equal(combat.getState().luma.energy, 60);
  assert.equal(combat.getState().opponent.weakness, 'light');
});

test('mixed action sequences preserve resource bounds and rejection atomicity', () => {
  let seed = 7341;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let run = 0; run < 30; run++) {
    const combat = new CombatSystem({
      encounterId: ENCOUNTERS[run % ENCOUNTERS.length].id, lumaTrust: random() * 100,
    });
    for (let step = 0; step < 100 && combat.getState().status === 'active'; step++) {
      const before = clone(combat.getState());
      assert.ok(before.actions.some(item => item.available));
      const id = COMBAT_ACTIONS[Math.floor(random() * COMBAT_ACTIONS.length)].id;
      const result = combat.act(id);
      assertBounds(result.state);
      if (!result.accepted) assert.deepEqual(result.state, before);
    }
  }
});
