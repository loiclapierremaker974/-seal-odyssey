import {
  ANCIENT_SITE_ID,
  BUILD_VERSION,
  ECHO_IDS,
  GameState,
  SAVE_SCHEMA_VERSION,
  assertValidGameStateSnapshot,
  createInitialGameState,
} from "../core/GameState.js";
import { createLumaSealData } from "../seals/SealEntity.js";

export const DEFAULT_SAVE_KEY = "seal-odyssey:save";

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nowIso() {
  return new Date().toISOString();
}

/** Minimal Storage-compatible implementation for tests and restricted browsers. */
export class MemoryStorage {
  constructor(seed = {}) {
    this._values = new Map(
      Object.entries(seed).map(([key, value]) => [String(key), String(value)]),
    );
  }

  get length() {
    return this._values.size;
  }

  key(index) {
    return [...this._values.keys()][index] ?? null;
  }

  getItem(key) {
    const normalized = String(key);
    return this._values.has(normalized) ? this._values.get(normalized) : null;
  }

  setItem(key, value) {
    this._values.set(String(key), String(value));
  }

  removeItem(key) {
    this._values.delete(String(key));
  }

  clear() {
    this._values.clear();
  }
}

export class SaveStoreError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "SaveStoreError";
  }
}

export class UnsupportedSaveVersionError extends SaveStoreError {
  constructor(version) {
    super(
      `Save schema ${String(version)} is newer than supported schema ${SAVE_SCHEMA_VERSION}`,
    );
    this.name = "UnsupportedSaveVersionError";
    this.version = version;
  }
}

function getBrowserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (
      storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function" &&
      typeof storage.removeItem === "function"
    ) {
      return storage;
    }
  } catch {
    // Accessing localStorage itself may throw in sandboxed/private contexts.
  }
  return null;
}

function ensureStorageLike(storage) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    throw new TypeError("storage must implement getItem, setItem and removeItem");
  }
  return storage;
}

export function createSaveEnvelope(gameState, savedAt = nowIso()) {
  const snapshot =
    gameState instanceof GameState ? gameState.toJSON() : clone(gameState);
  assertValidGameStateSnapshot(snapshot);
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    buildVersion: BUILD_VERSION,
    savedAt,
    state: snapshot,
  };
}

/**
 * Upgrade a parsed save object to the current envelope. Schema 0 covers the
 * flat shape used by early web prototypes; schema 1 is the P0 portable shape.
 */
export function migrateSaveEnvelope(input) {
  if (!isRecord(input)) {
    throw new SaveStoreError("Save payload must be an object");
  }

  // A schema-1 GameState snapshot is accepted directly for easy debugging.
  if (input.schemaVersion === SAVE_SCHEMA_VERSION && !input.state) {
    assertValidGameStateSnapshot(input);
    return createSaveEnvelope(input, input.updatedAt ?? nowIso());
  }

  const declaredVersion = Number.isInteger(input.schemaVersion)
    ? input.schemaVersion
    : Number.isInteger(input.version)
      ? input.version
      : 0;

  if (declaredVersion > SAVE_SCHEMA_VERSION) {
    throw new UnsupportedSaveVersionError(declaredVersion);
  }

  if (declaredVersion === SAVE_SCHEMA_VERSION) {
    if (!isRecord(input.state)) {
      throw new SaveStoreError("Schema-1 save envelope is missing its state object");
    }
    const envelope = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      buildVersion:
        typeof input.buildVersion === "string"
          ? input.buildVersion
          : input.state.buildVersion,
      savedAt: typeof input.savedAt === "string" ? input.savedAt : nowIso(),
      state: clone(input.state),
    };
    assertValidGameStateSnapshot(envelope.state);
    return envelope;
  }

  return migrateLegacySchemaZero(input);
}

function migrateLegacySchemaZero(input) {
  const legacy = isRecord(input.state) ? input.state : input;
  const initial = createInitialGameState();

  initial.player.oxygen = boundedLegacyNumber(
    legacy.player?.oxygen ?? legacy.oxygen,
    initial.player.oxygen,
  );
  initial.player.energy = boundedLegacyNumber(
    legacy.player?.energy ?? legacy.energy,
    initial.player.energy,
  );

  const rawEchoes =
    legacy.progress?.echoes?.discovered ??
    legacy.discoveredEchoIds ??
    legacy.echoes?.discovered ??
    legacy.echoes ??
    [];
  const discovered = Array.isArray(rawEchoes)
    ? [...new Set(rawEchoes.filter((id) => ECHO_IDS.includes(id)))]
    : [];

  const legacySiteActivated = Boolean(
    legacy.progress?.ancientSite?.activated ??
      legacy.ancientSiteActivated ??
      legacy.siteActivated,
  );
  // An activated legacy site implies its three prerequisites were met.
  initial.progress.echoes.discovered = legacySiteActivated
    ? [...ECHO_IDS]
    : discovered;
  initial.progress.ancientSite = {
    id: ANCIENT_SITE_ID,
    activated: legacySiteActivated,
    activatedAt:
      legacy.progress?.ancientSite?.activatedAt ??
      legacy.activatedAt ??
      (legacySiteActivated ? input.savedAt ?? null : null),
  };

  const legacyLuma = legacy.seals?.luma ?? legacy.luma;
  if (isCompleteSealData(legacyLuma)) {
    initial.seals.luma = clone(legacyLuma);
  } else if (isRecord(legacyLuma)) {
    const luma = createLumaSealData();
    const trust =
      legacyLuma.relationships?.guardianTrust ??
      legacyLuma.guardianTrust ??
      legacyLuma.trust;
    if (Number.isFinite(trust)) {
      luma.relationships.guardianTrust = boundedLegacyNumber(
        trust,
        luma.relationships.guardianTrust,
      );
    }
    if (isRecord(legacyLuma.mood)) {
      luma.mood = mergeBoundedValues(luma.mood, legacyLuma.mood);
      if (typeof legacyLuma.mood.state === "string") {
        luma.mood.state = legacyLuma.mood.state;
      }
    } else if (typeof legacyLuma.mood === "string") {
      luma.mood.state = legacyLuma.mood;
    }
    if (isRecord(legacyLuma.needs)) {
      luma.needs = mergeBoundedValues(luma.needs, legacyLuma.needs);
    }
    initial.seals.luma = luma;
  }

  for (const echoId of initial.progress.echoes.discovered) {
    if (!initial.seals.luma.memory.echoes.includes(echoId)) {
      initial.seals.luma.memory.echoes.push(echoId);
    }
  }

  initial.revision = Number.isInteger(legacy.revision) && legacy.revision >= 0
    ? legacy.revision
    : 0;
  initial.updatedAt =
    typeof legacy.updatedAt === "string"
      ? legacy.updatedAt
      : typeof input.savedAt === "string"
        ? input.savedAt
        : null;
  initial.schemaVersion = SAVE_SCHEMA_VERSION;
  initial.buildVersion = BUILD_VERSION;

  assertValidGameStateSnapshot(initial);
  return createSaveEnvelope(
    initial,
    typeof input.savedAt === "string" ? input.savedAt : nowIso(),
  );
}

function boundedLegacyNumber(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, value));
}

function mergeBoundedValues(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(base)) {
    if (key !== "state" && Number.isFinite(patch[key])) {
      result[key] = boundedLegacyNumber(patch[key], base[key]);
    }
  }
  return result;
}

function isCompleteSealData(value) {
  return (
    isRecord(value) &&
    isRecord(value.appearance) &&
    isRecord(value.needs) &&
    isRecord(value.mood) &&
    isRecord(value.preferences) &&
    isRecord(value.relationships) &&
    isRecord(value.memory) &&
    isRecord(value.state)
  );
}

export class SaveStore {
  constructor(options = {}) {
    const {
      storage = undefined,
      fallbackStorage = new MemoryStorage(),
      key = DEFAULT_SAVE_KEY,
      clock = nowIso,
    } = options;

    if (typeof key !== "string" || key.trim() === "") {
      throw new TypeError("Save key must be a non-empty string");
    }
    if (typeof clock !== "function") {
      throw new TypeError("SaveStore clock must be a function");
    }

    this.key = key;
    this.clock = clock;
    this.fallbackStorage = ensureStorageLike(fallbackStorage);
    this.primaryStorage =
      storage === undefined
        ? getBrowserStorage()
        : storage === null
          ? null
          : ensureStorageLike(storage);
    this.storage = this.primaryStorage ?? this.fallbackStorage;
    this.usingFallback = this.primaryStorage === null;
    this.lastError = null;
  }

  save(gameState) {
    const envelope = createSaveEnvelope(gameState, this.clock());
    const serialized = JSON.stringify(envelope);
    this._storageCall("setItem", this.key, serialized);
    return clone(envelope);
  }

  load(options = {}) {
    const { throwOnError = false } = options;
    this.lastError = null;
    const serialized = this._storageCall("getItem", this.key);
    if (serialized === null || serialized === undefined || serialized === "") {
      return null;
    }

    try {
      const parsed = JSON.parse(serialized);
      const envelope = migrateSaveEnvelope(parsed);
      return GameState.fromJSON(envelope.state, { clock: this.clock });
    } catch (error) {
      this.lastError = error;
      if (throwOnError) {
        throw error;
      }
      return null;
    }
  }

  loadSnapshot(options = {}) {
    const state = this.load(options);
    return state?.toJSON() ?? null;
  }

  hasSave() {
    return this._storageCall("getItem", this.key) !== null;
  }

  clear() {
    this._storageCall("removeItem", this.key);
  }

  exportRaw() {
    return this._storageCall("getItem", this.key);
  }

  importRaw(serialized, options = {}) {
    if (typeof serialized !== "string" || serialized.trim() === "") {
      throw new TypeError("Imported save must be a non-empty JSON string");
    }
    const envelope = migrateSaveEnvelope(JSON.parse(serialized));
    const normalized = JSON.stringify(envelope);
    this._storageCall("setItem", this.key, normalized);
    return this.load({ throwOnError: options.throwOnError ?? true });
  }

  _storageCall(method, ...args) {
    try {
      return this.storage[method](...args);
    } catch (error) {
      this.lastError = error;
      if (this.storage === this.fallbackStorage) {
        throw new SaveStoreError(`Fallback storage failed during ${method}`, {
          cause: error,
        });
      }
      this.storage = this.fallbackStorage;
      this.usingFallback = true;
      try {
        return this.storage[method](...args);
      } catch (fallbackError) {
        this.lastError = fallbackError;
        throw new SaveStoreError(`Storage failed during ${method}`, {
          cause: fallbackError,
        });
      }
    }
  }
}

export default SaveStore;
