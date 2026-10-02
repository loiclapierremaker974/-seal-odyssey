import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  LUMA_SEAL_DATA,
  SealEntity,
  createLumaSealData,
  validateSealData,
} from "../src/seals/SealEntity.js";
import { CareSystem } from "../src/care/CareSystem.js";
import { ECHO_IDS, GameState } from "../src/core/GameState.js";

const FIXED_TIME = "2026-10-02T11:00:00.000Z";

test("the data-file Luma is valid canonical SealData", async () => {
  const path = new URL("../data/seals/luma.json", import.meta.url);
  const data = JSON.parse(await readFile(path, "utf8"));
  const validation = validateSealData(data);

  assert.deepEqual(validation, { valid: true, errors: [] });
  assert.deepEqual(data, LUMA_SEAL_DATA);
  const luma = new SealEntity(data);
  assert.equal(luma.name, "Luma");
  assert.equal(luma.lineage, "Soluma");
});

test("SealData validation reports ranges and legacy lineage conflicts", () => {
  const invalid = createLumaSealData();
  invalid.lineage = "Nacregivres";
  invalid.needs.health = 120;

  const validation = validateSealData(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(({ path }) => path === "lineage"));
  assert.ok(validation.errors.some(({ path }) => path === "needs.health"));
  assert.throws(() => new SealEntity(invalid), /Invalid SealData/);
});

test("SealEntity updates are bounded and serialized defensively", () => {
  const luma = new SealEntity(createLumaSealData());
  luma.adjustNeed("hunger", 500);
  luma.adjustMood({ stress: -500 });
  luma.adjustGuardianTrust(500);

  assert.equal(luma.needs.hunger, 100);
  assert.equal(luma.mood.stress, 0);
  assert.equal(luma.guardianTrust, 100);

  const snapshot = luma.toJSON();
  snapshot.relationships.guardianTrust = 0;
  assert.equal(luma.guardianTrust, 100);
});

test("favorite food relieves hunger and strengthens Luma's trust", () => {
  const luma = new SealEntity(
    createLumaSealData({ needs: { hunger: 80 }, relationships: { guardianTrust: 30 } }),
  );
  const care = new CareSystem(luma, { clock: () => FIXED_TIME });
  const result = care.feed("silver-sprat");

  assert.equal(result.success, true);
  assert.equal(result.response, "delighted");
  assert.equal(result.details.preference, "favorite");
  assert.equal(result.after.needs.hunger, 48);
  assert.equal(result.after.trust, 34);
  assert.equal(luma.mood.state, "happy");
});

test("a refused food preserves the individual preference and is remembered", () => {
  const luma = new SealEntity(createLumaSealData({ needs: { hunger: 80 } }));
  const care = new CareSystem(luma, { clock: () => FIXED_TIME });
  const result = care.feed("bitter-corallis");

  assert.equal(result.success, false);
  assert.equal(result.reason, "food-refused");
  assert.equal(result.after.needs.hunger, 80);
  assert.equal(result.deltas.trust, -1);
  assert.equal(luma.toJSON().memory.events.at(-1).accepted, false);
});

test("caress respects preferred and sensitive body zones", () => {
  const luma = new SealEntity(createLumaSealData());
  const care = new CareSystem(luma, { clock: () => FIXED_TIME });

  const preferred = care.caress({ zone: "head", style: "slow", intensity: 0.3 });
  assert.equal(preferred.success, true);
  assert.equal(preferred.response, "delighted");
  assert.ok(preferred.deltas.trust > 0);

  const sensitive = care.caress({
    zone: "front-flippers",
    style: "slow",
    intensity: 0.3,
  });
  assert.equal(sensitive.success, false);
  assert.equal(sensitive.reason, "sensitive-zone");
  assert.ok(sensitive.deltas.trust < 0);
});

test("belly tap is trust-gated and only accepts a gentle intensity", () => {
  const luma = new SealEntity(createLumaSealData());
  const care = new CareSystem(luma, { clock: () => FIXED_TIME });

  const tooSoon = care.gentleBellyTap();
  assert.equal(tooSoon.success, false);
  assert.equal(tooSoon.reason, "insufficient-trust");

  luma.setGuardianTrust(40);
  const tooStrong = care.bellyTap({ rhythm: "gentle-steady", intensity: 0.8 });
  assert.equal(tooStrong.success, false);
  assert.equal(tooStrong.reason, "not-gentle");

  luma.setMood({ stress: 10 });
  const gentle = care.gentleBellyTap({ rhythm: "gentle-steady" });
  assert.equal(gentle.success, true);
  assert.equal(gentle.response, "playful");
  assert.ok(gentle.deltas.trust > 0);
  assert.ok(gentle.deltas.needs.stimulation > 0);
});

test("cleaning rewards Luma's temperature, tool and intensity preferences", () => {
  const luma = new SealEntity(createLumaSealData({ needs: { hygiene: 40 } }));
  const care = new CareSystem(luma, { clock: () => FIXED_TIME });

  const result = care.clean({
    temperature: "lukewarm",
    intensity: "gentle",
    tool: "soft-kelp-brush",
    zone: "body",
  });

  assert.equal(result.success, true);
  assert.equal(result.details.preferred, true);
  assert.equal(result.after.needs.hygiene, 64);
  assert.ok(result.deltas.trust > 0);
});

test("syncSeal preserves quest memories before a long-lived care interaction", () => {
  const gameState = new GameState(undefined, { clock: () => FIXED_TIME });
  const care = new CareSystem(gameState.luma, { clock: () => FIXED_TIME });

  gameState.discoverEcho(ECHO_IDS[0]);
  care.syncSeal(gameState.luma);
  care.feed("tide-ration");
  gameState.updateLuma(care.seal);

  assert.deepEqual(gameState.luma.memory.echoes, [ECHO_IDS[0]]);
  assert.ok(
    gameState.luma.memory.events.some(({ type }) => type === "echo-discovered"),
  );
  assert.ok(
    gameState.luma.memory.events.some(({ type }) => type === "care-interaction"),
  );
});
