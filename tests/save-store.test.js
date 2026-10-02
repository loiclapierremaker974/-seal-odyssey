import test from "node:test";
import assert from "node:assert/strict";

import { ECHO_IDS, GameState, SAVE_SCHEMA_VERSION } from "../src/core/GameState.js";
import {
  MemoryStorage,
  SaveStore,
  UnsupportedSaveVersionError,
} from "../src/persistence/SaveStore.js";

const FIXED_TIME = "2026-10-02T12:00:00.000Z";

test("SaveStore round-trips versioned GameState through injected storage", () => {
  const storage = new MemoryStorage();
  const store = new SaveStore({
    storage,
    key: "test-save",
    clock: () => FIXED_TIME,
  });
  const state = new GameState(undefined, { clock: () => FIXED_TIME });
  state.setOxygen(37);
  state.setEnergy(61);
  state.discoverEcho(ECHO_IDS[0]);
  state.patchLuma({ trust: 42, mood: { state: "happy" } });

  const envelope = store.save(state);
  assert.equal(envelope.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(envelope.savedAt, FIXED_TIME);
  assert.equal(store.hasSave(), true);

  const restored = store.load({ throwOnError: true });
  assert.ok(restored instanceof GameState);
  assert.equal(restored.oxygen, 37);
  assert.equal(restored.energy, 61);
  assert.deepEqual(restored.discoveredEchoIds, [ECHO_IDS[0]]);
  assert.equal(restored.lumaTrust, 42);
  assert.equal(restored.lumaMood.state, "happy");
});

test("SaveStore has an in-memory fallback when local storage throws", () => {
  const brokenStorage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
    removeItem() {
      throw new Error("storage blocked");
    },
  };
  const fallback = new MemoryStorage();
  const store = new SaveStore({
    storage: brokenStorage,
    fallbackStorage: fallback,
    clock: () => FIXED_TIME,
  });

  store.save(new GameState());
  assert.equal(store.usingFallback, true);
  assert.ok(fallback.getItem(store.key));
  assert.ok(store.load() instanceof GameState);
});

test("SaveStore handles corrupt data without crashing by default", () => {
  const storage = new MemoryStorage({ bad: "{not-json" });
  const store = new SaveStore({ storage, key: "bad" });

  assert.equal(store.load(), null);
  assert.ok(store.lastError instanceof SyntaxError);
  assert.throws(() => store.load({ throwOnError: true }), SyntaxError);
});

test("schema-zero flat saves migrate oxygen, energy, Echoes and Luma state", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "legacy",
    JSON.stringify({
      version: 0,
      oxygen: 41,
      energy: 58,
      echoes: [ECHO_IDS[0], ECHO_IDS[1]],
      siteActivated: false,
      luma: {
        trust: 55,
        mood: { state: "playful", stress: 3 },
        needs: { hunger: 44, hygiene: 70 },
      },
    }),
  );
  const store = new SaveStore({ storage, key: "legacy", clock: () => FIXED_TIME });
  const migrated = store.load({ throwOnError: true });

  assert.equal(migrated.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(migrated.oxygen, 41);
  assert.equal(migrated.energy, 58);
  assert.deepEqual(migrated.discoveredEchoIds, ECHO_IDS.slice(0, 2));
  assert.equal(migrated.lumaTrust, 55);
  assert.equal(migrated.lumaMood.state, "playful");
  assert.equal(migrated.lumaNeeds.hunger, 44);
});

test("future save schemas are rejected rather than silently downgraded", () => {
  const storage = new MemoryStorage({
    future: JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION + 1, state: {} }),
  });
  const store = new SaveStore({ storage, key: "future" });

  assert.throws(
    () => store.load({ throwOnError: true }),
    UnsupportedSaveVersionError,
  );
});

test("clear removes only this SaveStore key", () => {
  const storage = new MemoryStorage({ unrelated: "keep" });
  const store = new SaveStore({ storage, key: "save" });
  store.save(new GameState());
  store.clear();

  assert.equal(store.hasSave(), false);
  assert.equal(storage.getItem("unrelated"), "keep");
});
