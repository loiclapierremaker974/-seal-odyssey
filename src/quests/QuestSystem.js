import {
  ANCIENT_SITE_ID,
  ECHO_IDS,
  GameState,
} from "../core/GameState.js";

export const QUEST_PROGRESS_SCHEMA_VERSION = 1;

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const ONDE_PREMIERE_QUEST = Object.freeze({
  id: "onde-premiere",
  title: "L'Onde Première",
  description:
    "Retrouver trois Échos anciens, puis revenir au Site Ancien d'Aelys.",
  autoStart: true,
  stages: [
    {
      id: "retrouver-les-echos",
      title: "Retrouver les trois Échos",
      description:
        "Chaque Écho révèle une trace de l'histoire d'Aqualys et de la Fracture.",
      objectives: [
        {
          id: "trois-echos-anciens",
          event: "echo.discovered",
          label: "Échos anciens",
          requiredCount: 3,
          uniqueBy: "id",
          match: {
            field: "id",
            anyOf: [...ECHO_IDS],
          },
        },
      ],
      nextStageId: "reactiver-le-site",
    },
    {
      id: "reactiver-le-site",
      title: "Revenir au Site Ancien",
      description:
        "Rapporter les trois Échos afin de restaurer le Premier Écho du Grand Courant.",
      objectives: [
        {
          id: "site-onde-premiere",
          event: "site.activated",
          label: "Site Ancien activé",
          requiredCount: 1,
          uniqueBy: "id",
          match: {
            field: "id",
            equals: ANCIENT_SITE_ID,
          },
        },
      ],
      nextStageId: null,
    },
  ],
});

export function validateQuestDefinition(definition) {
  const errors = [];
  if (!isRecord(definition)) {
    return {
      valid: false,
      errors: [{ path: "quest", message: "must be an object" }],
    };
  }
  for (const key of ["id", "title"]) {
    if (typeof definition[key] !== "string" || definition[key].trim() === "") {
      errors.push({ path: key, message: "must be a non-empty string" });
    }
  }
  if (!Array.isArray(definition.stages) || definition.stages.length === 0) {
    errors.push({ path: "stages", message: "must be a non-empty array" });
    return { valid: false, errors };
  }

  const stageIds = new Set();
  for (const [stageIndex, stage] of definition.stages.entries()) {
    const path = `stages.${stageIndex}`;
    if (!isRecord(stage)) {
      errors.push({ path, message: "must be an object" });
      continue;
    }
    if (typeof stage.id !== "string" || stage.id.trim() === "") {
      errors.push({ path: `${path}.id`, message: "must be a non-empty string" });
    } else if (stageIds.has(stage.id)) {
      errors.push({ path: `${path}.id`, message: "must be unique" });
    } else {
      stageIds.add(stage.id);
    }
    if (!Array.isArray(stage.objectives) || stage.objectives.length === 0) {
      errors.push({ path: `${path}.objectives`, message: "must be a non-empty array" });
      continue;
    }
    const objectiveIds = new Set();
    for (const [objectiveIndex, objective] of stage.objectives.entries()) {
      const objectivePath = `${path}.objectives.${objectiveIndex}`;
      if (!isRecord(objective)) {
        errors.push({ path: objectivePath, message: "must be an object" });
        continue;
      }
      for (const key of ["id", "event", "label"]) {
        if (typeof objective[key] !== "string" || objective[key].trim() === "") {
          errors.push({
            path: `${objectivePath}.${key}`,
            message: "must be a non-empty string",
          });
        }
      }
      if (objectiveIds.has(objective.id)) {
        errors.push({ path: `${objectivePath}.id`, message: "must be unique in its stage" });
      }
      objectiveIds.add(objective.id);
      if (!Number.isInteger(objective.requiredCount) || objective.requiredCount < 1) {
        errors.push({
          path: `${objectivePath}.requiredCount`,
          message: "must be a positive integer",
        });
      }
      if (objective.match !== undefined && !isRecord(objective.match)) {
        errors.push({ path: `${objectivePath}.match`, message: "must be an object" });
      }
    }
  }

  for (const [stageIndex, stage] of definition.stages.entries()) {
    if (
      stage?.nextStageId !== null &&
      stage?.nextStageId !== undefined &&
      !stageIds.has(stage.nextStageId)
    ) {
      errors.push({
        path: `stages.${stageIndex}.nextStageId`,
        message: `references unknown stage ${String(stage.nextStageId)}`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export class QuestDefinitionError extends TypeError {
  constructor(errors) {
    super(`Invalid quest definition: ${errors.map(({ path, message }) => `${path} ${message}`).join("; ")}`);
    this.name = "QuestDefinitionError";
    this.errors = clone(errors);
  }
}

export function assertValidQuestDefinition(definition) {
  const validation = validateQuestDefinition(definition);
  if (!validation.valid) {
    throw new QuestDefinitionError(validation.errors);
  }
  return definition;
}

/**
 * Generic event-driven quest tracker. Objectives are entirely described by
 * quest data; this class contains no coordinate, rendering or input logic.
 */
export class QuestSystem {
  constructor(options = {}) {
    if (Array.isArray(options)) {
      options = { definitions: options };
    }
    const {
      definitions = [ONDE_PREMIERE_QUEST],
      gameState = null,
      progress = null,
      autoSync = true,
    } = options;

    if (!Array.isArray(definitions) || definitions.length === 0) {
      throw new TypeError("QuestSystem requires at least one quest definition");
    }
    this.definitions = new Map();
    for (const sourceDefinition of definitions) {
      const definition = clone(sourceDefinition);
      assertValidQuestDefinition(definition);
      if (this.definitions.has(definition.id)) {
        throw new QuestDefinitionError([
          { path: "id", message: `duplicate quest id ${definition.id}` },
        ]);
      }
      this.definitions.set(definition.id, definition);
    }

    if (gameState !== null && !(gameState instanceof GameState)) {
      throw new TypeError("QuestSystem gameState must be a GameState instance");
    }
    this.gameState = gameState;
    this._listeners = new Set();
    this._unsubscribeGameState = null;
    this._suppressEvents = false;
    this._progress = this._createInitialProgress();

    if (progress) {
      this.restore(progress);
    } else if (this.gameState) {
      this.syncFromGameState();
    }

    if (this.gameState && autoSync) {
      this._unsubscribeGameState = this.gameState.subscribe((change) => {
        this.syncFromGameState({
          emit: true,
          reset: change.type === "state.reset",
        });
      });
    }
  }

  _createInitialProgress() {
    const progress = {
      schemaVersion: QUEST_PROGRESS_SCHEMA_VERSION,
      quests: {},
    };
    for (const definition of this.definitions.values()) {
      progress.quests[definition.id] = createQuestProgress(definition);
    }
    return progress;
  }

  startQuest(questId) {
    const quest = this._requireQuestProgress(questId);
    if (quest.status === "inactive") {
      quest.status = "active";
      this._emit({ type: "quest.started", quest: this.getQuest(questId) });
    }
    return this.getQuest(questId);
  }

  recordEvent(event, payload = {}) {
    if (typeof event !== "string" || event.trim() === "") {
      throw new TypeError("Quest event must be a non-empty string");
    }
    if (!isRecord(payload)) {
      throw new TypeError("Quest event payload must be an object");
    }

    const updates = [];
    for (const definition of this.definitions.values()) {
      const progress = this._progress.quests[definition.id];
      if (progress.status !== "active") {
        continue;
      }
      const stage = definition.stages.find(({ id }) => id === progress.currentStageId);
      if (!stage) {
        continue;
      }
      let changed = false;
      for (const objective of stage.objectives) {
        if (objective.event !== event || !matchesObjective(objective, payload)) {
          continue;
        }
        const objectiveProgress = progress.objectives[objective.id];
        if (objectiveProgress.completed) {
          continue;
        }

        if (objective.uniqueBy) {
          const uniqueValue = payload[objective.uniqueBy];
          if (uniqueValue === undefined || uniqueValue === null) {
            continue;
          }
          if (objectiveProgress.uniqueValues.includes(uniqueValue)) {
            continue;
          }
          objectiveProgress.uniqueValues.push(clone(uniqueValue));
          objectiveProgress.count = objectiveProgress.uniqueValues.length;
        } else {
          objectiveProgress.count += Number.isFinite(payload.amount)
            ? Math.max(0, payload.amount)
            : 1;
        }
        objectiveProgress.count = Math.min(
          objective.requiredCount,
          objectiveProgress.count,
        );
        objectiveProgress.completed =
          objectiveProgress.count >= objective.requiredCount;
        changed = true;
      }

      if (!changed) {
        continue;
      }

      const stageCompleted = stage.objectives.every(
        ({ id }) => progress.objectives[id].completed,
      );
      let advanced = false;
      let completed = false;
      if (stageCompleted) {
        progress.completedStageIds.push(stage.id);
        if (stage.nextStageId) {
          progress.currentStageId = stage.nextStageId;
          installStageObjectives(definition, progress, stage.nextStageId);
          advanced = true;
        } else {
          progress.status = "completed";
          completed = true;
        }
      }

      updates.push({
        questId: definition.id,
        stageId: stage.id,
        stageCompleted,
        advanced,
        completed,
      });
    }

    const result = {
      success: updates.length > 0,
      event,
      payload: clone(payload),
      updates,
      state: this.toJSON(),
    };
    if (updates.length > 0 && !this._suppressEvents) {
      this._emit({ type: "quest.progressed", ...result });
    }
    return result;
  }

  discoverEcho(echoId) {
    if (this.gameState) {
      const worldResult = this.gameState.discoverEcho(echoId);
      // GameState listeners synchronize immediately; an explicit sync also
      // covers instances constructed with autoSync disabled.
      const questResult = worldResult.success
        ? {
            success: true,
            synchronized: true,
            state: this.syncFromGameState(),
          }
        : { success: false, updates: [] };
      return { ...worldResult, quest: questResult };
    }
    const quest = this.recordEvent("echo.discovered", { id: echoId });
    return {
      type: "echo",
      id: echoId,
      success: quest.success,
      collected: quest.success,
      quest,
    };
  }

  activateAncientSite(siteId = ANCIENT_SITE_ID) {
    if (this.gameState) {
      const worldResult = this.gameState.activateAncientSite(siteId);
      const questResult = worldResult.success
        ? {
            success: true,
            synchronized: true,
            state: this.syncFromGameState(),
          }
        : { success: false, updates: [] };
      return { ...worldResult, quest: questResult };
    }
    const quest = this.recordEvent("site.activated", { id: siteId });
    return {
      type: "site",
      id: siteId,
      success: quest.success,
      activated: quest.success,
      quest,
    };
  }

  handleWorldInteraction(interaction) {
    if (!isRecord(interaction)) {
      throw new TypeError("World interaction must be an object");
    }
    if (!interaction.success) {
      return { success: false, reason: interaction.reason ?? "interaction-failed" };
    }
    if (interaction.type === "echo") {
      if (this.gameState && !this.gameState.discoveredEchoIds.includes(interaction.id)) {
        return this.discoverEcho(interaction.id);
      }
      if (this.gameState) {
        return { success: true, synchronized: true, state: this.syncFromGameState() };
      }
      return this.recordEvent("echo.discovered", { id: interaction.id });
    }
    if (interaction.type === "site") {
      if (this.gameState && !this.gameState.siteActivated) {
        return this.activateAncientSite(interaction.id);
      }
      if (this.gameState) {
        return { success: true, synchronized: true, state: this.syncFromGameState() };
      }
      return this.recordEvent("site.activated", { id: interaction.id });
    }
    return { success: false, reason: "unsupported-interaction" };
  }

  syncFromGameState(options = {}) {
    if (!this.gameState) {
      return this.toJSON();
    }
    const previous = JSON.stringify(this._progress);
    if (options.reset) {
      this._progress = this._createInitialProgress();
    }
    this._suppressEvents = true;
    try {
      for (const echoId of this.gameState.discoveredEchoIds) {
        this.recordEvent("echo.discovered", { id: echoId });
      }
      if (this.gameState.siteActivated) {
        this.recordEvent("site.activated", { id: ANCIENT_SITE_ID });
      }
    } finally {
      this._suppressEvents = false;
    }
    if (options.emit && previous !== JSON.stringify(this._progress)) {
      this._emit({ type: "quest.synced", state: this.toJSON() });
    }
    return this.toJSON();
  }

  getQuest(questId) {
    const definition = this.definitions.get(questId);
    const progress = this._requireQuestProgress(questId);
    const stage = definition.stages.find(({ id }) => id === progress.currentStageId) ?? null;
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description ?? "",
      status: progress.status,
      currentStage: stage
        ? {
            id: stage.id,
            title: stage.title ?? stage.id,
            description: stage.description ?? "",
            objectives: stage.objectives.map((objective) => ({
              id: objective.id,
              label: objective.label,
              requiredCount: objective.requiredCount,
              ...clone(progress.objectives[objective.id]),
            })),
          }
        : null,
      completedStageIds: [...progress.completedStageIds],
    };
  }

  getActiveObjective(questId = "onde-premiere") {
    const quest = this.getQuest(questId);
    return quest.currentStage?.objectives.find(({ completed }) => !completed) ?? null;
  }

  get quests() {
    return [...this.definitions.keys()].map((id) => this.getQuest(id));
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("QuestSystem listener must be a function");
    }
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  restore(progress) {
    if (!isRecord(progress) || progress.schemaVersion !== QUEST_PROGRESS_SCHEMA_VERSION) {
      throw new TypeError(
        `Quest progress must use schema ${QUEST_PROGRESS_SCHEMA_VERSION}`,
      );
    }
    const candidate = this._createInitialProgress();
    for (const [questId, savedQuest] of Object.entries(progress.quests ?? {})) {
      if (!candidate.quests[questId] || !isRecord(savedQuest)) {
        continue;
      }
      const definition = this.definitions.get(questId);
      if (!["inactive", "active", "completed"].includes(savedQuest.status)) {
        throw new TypeError(`Invalid status for quest ${questId}`);
      }
      if (!definition.stages.some(({ id }) => id === savedQuest.currentStageId)) {
        throw new TypeError(`Unknown current stage for quest ${questId}`);
      }
      candidate.quests[questId] = clone(savedQuest);
    }
    this._progress = candidate;
    return this.toJSON();
  }

  toJSON() {
    return clone(this._progress);
  }

  dispose() {
    this._unsubscribeGameState?.();
    this._unsubscribeGameState = null;
    this._listeners.clear();
  }

  _requireQuestProgress(questId) {
    const progress = this._progress.quests[questId];
    if (!progress) {
      throw new RangeError(`Unknown quest: ${String(questId)}`);
    }
    return progress;
  }

  _emit(event) {
    for (const listener of this._listeners) {
      listener(event);
    }
  }
}

function createQuestProgress(definition) {
  const firstStage = definition.stages[0];
  const progress = {
    status: definition.autoStart === false ? "inactive" : "active",
    currentStageId: firstStage.id,
    completedStageIds: [],
    objectives: {},
  };
  installStageObjectives(definition, progress, firstStage.id);
  return progress;
}

function installStageObjectives(definition, progress, stageId) {
  const stage = definition.stages.find(({ id }) => id === stageId);
  if (!stage) {
    throw new RangeError(`Unknown stage ${stageId} in quest ${definition.id}`);
  }
  for (const objective of stage.objectives) {
    progress.objectives[objective.id] ??= {
      count: 0,
      completed: false,
      uniqueValues: [],
    };
  }
}

function matchesObjective(objective, payload) {
  if (!objective.match) {
    return true;
  }
  const value = payload[objective.match.field];
  if (Object.hasOwn(objective.match, "equals") && value !== objective.match.equals) {
    return false;
  }
  if (Array.isArray(objective.match.anyOf) && !objective.match.anyOf.includes(value)) {
    return false;
  }
  return true;
}

export default QuestSystem;
