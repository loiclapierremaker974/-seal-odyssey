import test from "node:test";
import assert from "node:assert/strict";

import {
  ANCIENT_SITE_ID,
  BUILD_VERSION,
  ECHO_IDS,
  GameState,
  SAVE_SCHEMA_VERSION,
  validateGameStateSnapshot,
} from "../src/core/GameState.js";

const FIXED_TIME = "2026-10-02T10:00:00.000Z";

test("GameState starts with versioned P0 progress and canonical Luma", () => {
  const state = new GameState(undefined, { clock: () => FIXED_TIME });

  assert.equal(state.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(state.buildVersion, BUILD_VERSION);
  assert.equal(state.oxygen, 100);
  assert.equal(state.energy, 100);
  assert.deepEqual(state.discoveredEchoIds, []);
  assert.equal(state.siteActivated, false);
  assert.equal(state.luma.name, "Luma");
  assert.equal(state.luma.lineage, "Soluma");
  assert.equal(typeof state.lumaTrust, "number");
  assert.equal(typeof state.lumaMood.state, "string");
  assert.equal(typeof state.lumaNeeds.hunger, "number");
  assert.equal(validateGameStateSnapshot(state.toJSON()).valid, true);
});

test("vitals clamp to their portable 0..100 range and emit changes", () => {
  const state = new GameState(undefined, { clock: () => FIXED_TIME });
  const changes = [];
  const unsubscribe = state.subscribe((change) => changes.push(change.type));

  assert.equal(state.adjustOxygen(-140), 0);
  assert.equal(state.adjustEnergy(-25), 75);
  assert.equal(state.setEnergy(500), 100);
  assert.equal(state.revision, 3);
  assert.deepEqual(changes, ["player.oxygen", "player.energy", "player.energy"]);

  unsubscribe();
  state.setOxygen(20);
  assert.equal(changes.length, 3);
});

test("three unique canonical Echoes gate Site activation", () => {
  const state = new GameState(undefined, { clock: () => FIXED_TIME });

  const early = state.activateAncientSite();
  assert.equal(early.success, false);
  assert.equal(early.reason, "echoes-required");
  assert.equal(early.missing, 3);
  assert.deepEqual(early.missingEchoIds, ECHO_IDS);

  const unknown = state.discoverEcho("echo-invente");
  assert.equal(unknown.success, false);
  assert.equal(unknown.reason, "unknown-echo");

  for (const [index, echoId] of ECHO_IDS.entries()) {
    const result = state.discoverEcho(echoId);
    assert.equal(result.success, true);
    assert.equal(result.newlyCollected, true);
    assert.equal(result.collected, index + 1);
    assert.equal(result.total, 3);
  }

  const duplicate = state.discoverEcho(ECHO_IDS[0]);
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.reason, "already-collected");
  assert.equal(state.echoCount, 3);

  const activation = state.activateAncientSite(ANCIENT_SITE_ID);
  assert.equal(activation.success, true);
  assert.equal(activation.activated, true);
  assert.equal(state.siteActivated, true);
  assert.equal(state.luma.memory.echoes.length, 3);
  assert.equal(state.luma.mood.state, "determined");

  const repeated = state.activateAncientSite();
  assert.equal(repeated.success, false);
  assert.equal(repeated.reason, "already-restored");
});

test("GameState snapshots are defensive copies", () => {
  const state = new GameState();
  const snapshot = state.toJSON();
  snapshot.player.oxygen = 1;
  snapshot.seals.luma.name = "Not Luma";

  assert.equal(state.oxygen, 100);
  assert.equal(state.luma.name, "Luma");
});

test("GameState refuses a legacy lineage substitution for Luma", () => {
  const state = new GameState();
  const impostor = state.luma;
  impostor.lineage = "Cendrelunes";

  assert.throws(() => state.updateLuma(impostor), /legacy concept|canonical/i);
  assert.equal(state.luma.lineage, "Soluma");
});
