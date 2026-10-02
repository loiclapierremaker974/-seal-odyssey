import {
  SealEntity,
  assertValidSealData,
  clamp,
  createLumaSealData,
} from "../seals/SealEntity.js";

export const BUILD_VERSION = "0.1.0-p0";
export const SAVE_SCHEMA_VERSION = 1;

export const ECHO_IDS = Object.freeze([
  "echo-rivage",
  "echo-lagune",
  "echo-profondeur",
]);

export const ANCIENT_SITE_ID = "site-onde-premiere";

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function defaultClock() {
  return new Date().toISOString();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createInitialGameState(overrides = {}) {
  const initial = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    buildVersion: BUILD_VERSION,
    revision: 0,
    updatedAt: null,
    player: {
      oxygen: 100,
      energy: 100,
    },
    progress: {
      echoes: {
        required: ECHO_IDS.length,
        discovered: [],
      },
      ancientSite: {
        id: ANCIENT_SITE_ID,
        activated: false,
        activatedAt: null,
      },
    },
    seals: {
      luma: createLumaSealData(),
    },
  };

  return mergeGameState(initial, overrides);
}

function mergeGameState(base, overrides) {
  if (!isRecord(overrides)) {
    throw new TypeError("GameState overrides must be an object");
  }

  const merged = clone(base);
  for (const key of ["schemaVersion", "buildVersion", "revision", "updatedAt"]) {
    if (overrides[key] !== undefined) {
      merged[key] = clone(overrides[key]);
    }
  }
  if (isRecord(overrides.player)) {
    merged.player = { ...merged.player, ...clone(overrides.player) };
  }
  if (isRecord(overrides.progress)) {
    merged.progress = { ...merged.progress, ...clone(overrides.progress) };
    if (isRecord(overrides.progress.echoes)) {
      merged.progress.echoes = {
        ...base.progress.echoes,
        ...clone(overrides.progress.echoes),
      };
    }
    if (isRecord(overrides.progress.ancientSite)) {
      merged.progress.ancientSite = {
        ...base.progress.ancientSite,
        ...clone(overrides.progress.ancientSite),
      };
    }
  }
  if (isRecord(overrides.seals)) {
    merged.seals = { ...merged.seals, ...clone(overrides.seals) };
  }
  return merged;
}

export function validateGameStateSnapshot(snapshot) {
  const errors = [];

  if (!isRecord(snapshot)) {
    return {
      valid: false,
      errors: [{ path: "state", message: "must be an object" }],
    };
  }

  if (snapshot.schemaVersion !== SAVE_SCHEMA_VERSION) {
    errors.push({
      path: "schemaVersion",
      message: `must equal ${SAVE_SCHEMA_VERSION}`,
    });
  }
  if (typeof snapshot.buildVersion !== "string" || snapshot.buildVersion.trim() === "") {
    errors.push({ path: "buildVersion", message: "must be a non-empty string" });
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) {
    errors.push({ path: "revision", message: "must be a non-negative integer" });
  }
  if (snapshot.updatedAt !== null && typeof snapshot.updatedAt !== "string") {
    errors.push({ path: "updatedAt", message: "must be a string or null" });
  }

  if (!isRecord(snapshot.player)) {
    errors.push({ path: "player", message: "must be an object" });
  } else {
    for (const key of ["oxygen", "energy"]) {
      if (!Number.isFinite(snapshot.player[key]) || snapshot.player[key] < 0 || snapshot.player[key] > 100) {
        errors.push({
          path: `player.${key}`,
          message: "must be a finite number between 0 and 100",
        });
      }
    }
  }

  if (!isRecord(snapshot.progress)) {
    errors.push({ path: "progress", message: "must be an object" });
  } else {
    const echoes = snapshot.progress.echoes;
    if (!isRecord(echoes)) {
      errors.push({ path: "progress.echoes", message: "must be an object" });
    } else {
      if (echoes.required !== ECHO_IDS.length) {
        errors.push({
          path: "progress.echoes.required",
          message: `must equal ${ECHO_IDS.length}`,
        });
      }
      if (!Array.isArray(echoes.discovered)) {
        errors.push({ path: "progress.echoes.discovered", message: "must be an array" });
      } else {
        const unique = new Set(echoes.discovered);
        if (unique.size !== echoes.discovered.length) {
          errors.push({
            path: "progress.echoes.discovered",
            message: "must not contain duplicates",
          });
        }
        for (const id of echoes.discovered) {
          if (!ECHO_IDS.includes(id)) {
            errors.push({
              path: "progress.echoes.discovered",
              message: `contains an unknown Echo id: ${String(id)}`,
            });
          }
        }
      }
    }

    const site = snapshot.progress.ancientSite;
    if (!isRecord(site)) {
      errors.push({ path: "progress.ancientSite", message: "must be an object" });
    } else {
      if (site.id !== ANCIENT_SITE_ID) {
        errors.push({
          path: "progress.ancientSite.id",
          message: `must equal ${ANCIENT_SITE_ID}`,
        });
      }
      if (typeof site.activated !== "boolean") {
        errors.push({
          path: "progress.ancientSite.activated",
          message: "must be a boolean",
        });
      }
      if (site.activatedAt !== null && typeof site.activatedAt !== "string") {
        errors.push({
          path: "progress.ancientSite.activatedAt",
          message: "must be a string or null",
        });
      }
      if (
        site.activated === true &&
        Array.isArray(echoes?.discovered) &&
        echoes.discovered.length !== ECHO_IDS.length
      ) {
        errors.push({
          path: "progress.ancientSite.activated",
          message: "cannot be true until all three Echoes are discovered",
        });
      }
    }
  }

  if (!isRecord(snapshot.seals) || !isRecord(snapshot.seals.luma)) {
    errors.push({ path: "seals.luma", message: "must contain Luma SealData" });
  } else {
    try {
      assertValidSealData(snapshot.seals.luma);
      if (
        snapshot.seals.luma.id !== "luma" ||
        snapshot.seals.luma.name !== "Luma" ||
        snapshot.seals.luma.lineage !== "Soluma"
      ) {
        errors.push({
          path: "seals.luma",
          message: "must preserve Luma as the canonical Soluma character",
        });
      }
    } catch (error) {
      for (const issue of error.errors ?? [{ path: "seals.luma", message: error.message }]) {
        errors.push({
          path: issue.path.startsWith("seals.") ? issue.path : `seals.luma.${issue.path}`,
          message: issue.message,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export class GameStateValidationError extends TypeError {
  constructor(errors) {
    super(`Invalid GameState: ${errors.map(({ path, message }) => `${path} ${message}`).join("; ")}`);
    this.name = "GameStateValidationError";
    this.errors = clone(errors);
  }
}

export function assertValidGameStateSnapshot(snapshot) {
  const validation = validateGameStateSnapshot(snapshot);
  if (!validation.valid) {
    throw new GameStateValidationError(validation.errors);
  }
  return snapshot;
}

export class GameState {
  constructor(initialState = undefined, options = {}) {
    this._clock = options.clock ?? defaultClock;
    if (typeof this._clock !== "function") {
      throw new TypeError("GameState clock must be a function");
    }
    this._listeners = new Set();

    const state =
      initialState === undefined
        ? createInitialGameState()
        : mergeGameState(createInitialGameState(), initialState);
    assertValidGameStateSnapshot(state);
    this._state = state;
  }

  static fromJSON(snapshot, options) {
    return new GameState(snapshot, options);
  }

  get schemaVersion() {
    return this._state.schemaVersion;
  }

  get buildVersion() {
    return this._state.buildVersion;
  }

  get revision() {
    return this._state.revision;
  }

  get oxygen() {
    return this._state.player.oxygen;
  }

  get energy() {
    return this._state.player.energy;
  }

  get discoveredEchoIds() {
    return [...this._state.progress.echoes.discovered];
  }

  get collectedEchoCount() {
    return this._state.progress.echoes.discovered.length;
  }

  get echoCount() {
    return this.collectedEchoCount;
  }

  get requiredEchoCount() {
    return this._state.progress.echoes.required;
  }

  get ancientSiteActivated() {
    return this._state.progress.ancientSite.activated;
  }

  get siteActivated() {
    return this.ancientSiteActivated;
  }

  get luma() {
    return clone(this._state.seals.luma);
  }

  get lumaTrust() {
    return this._state.seals.luma.relationships.guardianTrust;
  }

  get lumaMood() {
    return clone(this._state.seals.luma.mood);
  }

  get lumaNeeds() {
    return clone(this._state.seals.luma.needs);
  }

  get snapshot() {
    return this.toJSON();
  }

  setOxygen(value) {
    return this._setVital("oxygen", value);
  }

  setEnergy(value) {
    return this._setVital("energy", value);
  }

  adjustOxygen(delta) {
    return this.setOxygen(this.oxygen + finiteDelta(delta, "oxygen"));
  }

  adjustEnergy(delta) {
    return this.setEnergy(this.energy + finiteDelta(delta, "energy"));
  }

  _setVital(key, value) {
    const nextValue = clamp(value);
    if (this._state.player[key] === nextValue) {
      return nextValue;
    }
    this._commit(`player.${key}`, (draft) => {
      draft.player[key] = nextValue;
    });
    return nextValue;
  }

  discoverEcho(echoId) {
    const baseResult = {
      type: "echo",
      id: echoId,
      collected: this.collectedEchoCount,
      total: this.requiredEchoCount,
      required: this.requiredEchoCount,
      newlyCollected: false,
    };

    if (!ECHO_IDS.includes(echoId)) {
      return { ...baseResult, success: false, reason: "unknown-echo" };
    }
    if (this._state.progress.echoes.discovered.includes(echoId)) {
      return { ...baseResult, success: false, reason: "already-collected" };
    }
    if (this.ancientSiteActivated) {
      return { ...baseResult, success: false, reason: "site-already-restored" };
    }

    this._commit("echo.discovered", (draft) => {
      draft.progress.echoes.discovered.push(echoId);
      draft.seals.luma.memory.echoes.push(echoId);
      draft.seals.luma.memory.events.push({
        type: "echo-discovered",
        echoId,
      });
    });

    return {
      ...baseResult,
      success: true,
      newlyCollected: true,
      collected: this.collectedEchoCount,
      allCollected: this.collectedEchoCount === this.requiredEchoCount,
    };
  }

  activateAncientSite(siteId = ANCIENT_SITE_ID) {
    const result = {
      type: "site",
      id: siteId,
      activated: false,
      restored: false,
      collected: this.collectedEchoCount,
      total: this.requiredEchoCount,
    };

    if (siteId !== ANCIENT_SITE_ID) {
      return { ...result, success: false, reason: "unknown-site" };
    }
    if (this.ancientSiteActivated) {
      return { ...result, success: false, reason: "already-restored" };
    }
    if (this.collectedEchoCount < this.requiredEchoCount) {
      return {
        ...result,
        success: false,
        reason: "echoes-required",
        missing: this.requiredEchoCount - this.collectedEchoCount,
        missingEchoIds: ECHO_IDS.filter((id) => !this.discoveredEchoIds.includes(id)),
      };
    }

    const activatedAt = this._clock();
    this._commit("ancient-site.activated", (draft) => {
      draft.progress.ancientSite.activated = true;
      draft.progress.ancientSite.activatedAt = activatedAt;
      draft.seals.luma.memory.events.push({
        type: "ancient-site-activated",
        siteId,
      });
      draft.seals.luma.mood.state = "determined";
      draft.seals.luma.mood.confidence = clamp(
        draft.seals.luma.mood.confidence + 8,
      );
    });

    return {
      ...result,
      success: true,
      activated: true,
      restored: true,
      activatedAt,
    };
  }

  updateLuma(lumaOrEntity) {
    const luma =
      lumaOrEntity instanceof SealEntity ? lumaOrEntity.toJSON() : clone(lumaOrEntity);
    assertValidSealData(luma);
    if (luma.id !== "luma" || luma.name !== "Luma" || luma.lineage !== "Soluma") {
      throw new TypeError("GameState Luma must remain the canonical Luma Soluma");
    }
    this._commit("luma.updated", (draft) => {
      draft.seals.luma = luma;
    });
    return this.luma;
  }

  patchLuma({ trust, mood, needs } = {}) {
    const entity = new SealEntity(this._state.seals.luma);
    if (trust !== undefined) {
      entity.setGuardianTrust(trust);
    }
    if (mood !== undefined) {
      entity.setMood(mood);
    }
    if (needs !== undefined) {
      if (!isRecord(needs)) {
        throw new TypeError("Luma needs patch must be an object");
      }
      for (const [key, value] of Object.entries(needs)) {
        entity.setNeed(key, value);
      }
    }
    return this.updateLuma(entity);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("GameState listener must be a function");
    }
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  reset() {
    const previous = this.toJSON();
    this._state = createInitialGameState();
    this._emit({ type: "state.reset", previous, state: this.toJSON() });
    return this.toJSON();
  }

  _commit(type, mutator) {
    const previous = this.toJSON();
    const draft = clone(this._state);
    mutator(draft);
    draft.schemaVersion = SAVE_SCHEMA_VERSION;
    draft.buildVersion = BUILD_VERSION;
    draft.revision += 1;
    draft.updatedAt = this._clock();
    assertValidGameStateSnapshot(draft);
    this._state = draft;
    this._emit({ type, previous, state: this.toJSON() });
  }

  _emit(change) {
    for (const listener of this._listeners) {
      listener(change);
    }
  }

  toJSON() {
    return clone(this._state);
  }
}

function finiteDelta(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} delta must be a finite number`);
  }
  return value;
}

export default GameState;
