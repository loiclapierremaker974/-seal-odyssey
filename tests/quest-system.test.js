import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ANCIENT_SITE_ID,
  ECHO_IDS,
  GameState,
} from "../src/core/GameState.js";
import {
  ONDE_PREMIERE_QUEST,
  QuestSystem,
  validateQuestDefinition,
} from "../src/quests/QuestSystem.js";

const FIXED_TIME = "2026-10-02T13:00:00.000Z";

async function loadQuestData() {
  const path = new URL("../data/quests/onde-premiere.json", import.meta.url);
  return JSON.parse(await readFile(path, "utf8"));
}

test("the Onde Première quest data validates", async () => {
  const definition = await loadQuestData();
  assert.deepEqual(validateQuestDefinition(definition), { valid: true, errors: [] });
  assert.deepEqual(definition, ONDE_PREMIERE_QUEST);
});

test("QuestSystem advances after three unique Echoes, then the Ancient Site", async () => {
  const definition = await loadQuestData();
  const gameState = new GameState(undefined, { clock: () => FIXED_TIME });
  const quests = new QuestSystem({ definitions: [definition], gameState });

  assert.equal(quests.getQuest("onde-premiere").currentStage.id, "retrouver-les-echos");
  assert.equal(quests.getActiveObjective().count, 0);

  for (const [index, echoId] of ECHO_IDS.entries()) {
    const result = quests.discoverEcho(echoId);
    assert.equal(result.success, true);
    assert.equal(gameState.echoCount, index + 1);
  }

  const afterEchoes = quests.getQuest("onde-premiere");
  assert.equal(afterEchoes.currentStage.id, "reactiver-le-site");
  assert.equal(afterEchoes.status, "active");

  const site = quests.activateAncientSite(ANCIENT_SITE_ID);
  assert.equal(site.success, true);
  assert.equal(gameState.siteActivated, true);
  assert.equal(quests.getQuest("onde-premiere").status, "completed");
  quests.dispose();
});

test("duplicate Echo events do not advance a unique objective", async () => {
  const definition = await loadQuestData();
  const quests = new QuestSystem({ definitions: [definition] });

  assert.equal(quests.discoverEcho(ECHO_IDS[0]).success, true);
  assert.equal(quests.discoverEcho(ECHO_IDS[0]).success, false);
  assert.equal(quests.getActiveObjective().count, 1);
});

test("QuestSystem derives restored progress from GameState", async () => {
  const definition = await loadQuestData();
  const gameState = new GameState(undefined, { clock: () => FIXED_TIME });
  for (const echoId of ECHO_IDS) {
    gameState.discoverEcho(echoId);
  }

  const quests = new QuestSystem({ definitions: [definition], gameState });
  assert.equal(quests.getQuest("onde-premiere").currentStage.id, "reactiver-le-site");

  gameState.activateAncientSite();
  assert.equal(quests.getQuest("onde-premiere").status, "completed");
  quests.dispose();
});

test("the Site cannot complete through QuestSystem before all Echoes", async () => {
  const definition = await loadQuestData();
  const gameState = new GameState();
  const quests = new QuestSystem({ definitions: [definition], gameState });

  const result = quests.activateAncientSite();
  assert.equal(result.success, false);
  assert.equal(result.reason, "echoes-required");
  assert.equal(quests.getQuest("onde-premiere").status, "active");
  quests.dispose();
});
