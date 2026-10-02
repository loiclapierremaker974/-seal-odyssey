/**
 * Persistent, engine-agnostic seal domain entity.
 *
 * Need convention: hunger is a pressure (0 = fed, 100 = starving). Every
 * other need is a resource (0 = depleted, 100 = fulfilled).
 */

export const CANONICAL_LINEAGES = Object.freeze([
  "Soluma",
  "Glaicorés",
  "Velmousse",
  "Sealectes",
]);

export const LEGACY_LINEAGES = Object.freeze([
  "Cendrelunes",
  "Nacregivres",
  "Moussecrêtes",
  "Brumeciels",
]);

export const NEED_KEYS = Object.freeze([
  "hunger",
  "energy",
  "health",
  "hygiene",
  "comfort",
  "safety",
  "social",
  "stimulation",
]);

export const MOOD_VALUE_KEYS = Object.freeze([
  "stress",
  "curiosity",
  "confidence",
]);

export const TALENT_KEYS = Object.freeze([
  "diving",
  "memory",
  "gathering",
  "currents",
  "rescue",
  "care",
]);

const LIFE_STAGES = new Set(["baby", "juvenile", "adolescent", "adult"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, minimum = 0, maximum = 100) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`Expected a finite number, received ${String(value)}`);
  }
  return Math.min(maximum, Math.max(minimum, numericValue));
}

function validateString(errors, value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({ path, message: "must be a non-empty string" });
  }
}

function validateArray(errors, value, path) {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array" });
  }
}

function validateRange(errors, value, path) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    errors.push({ path, message: "must be a finite number between 0 and 100" });
  }
}

function validateRecord(errors, value, path) {
  if (!isRecord(value)) {
    errors.push({ path, message: "must be an object" });
    return false;
  }
  return true;
}

/**
 * Validate portable SealData. The returned error list is stable and suitable
 * for build-time data checks as well as user-facing debug panels.
 */
export function validateSealData(data, options = {}) {
  const { strictCanonicalLineage = true } = options;
  const errors = [];

  if (!validateRecord(errors, data, "seal")) {
    return { valid: false, errors };
  }

  validateString(errors, data.id, "id");
  validateString(errors, data.name, "name");
  validateString(errors, data.lineage, "lineage");

  if (LEGACY_LINEAGES.includes(data.lineage)) {
    errors.push({
      path: "lineage",
      message: `${data.lineage} is a legacy concept and cannot replace a current canonical lineage`,
    });
  } else if (strictCanonicalLineage && !CANONICAL_LINEAGES.includes(data.lineage)) {
    errors.push({
      path: "lineage",
      message: `must be one of: ${CANONICAL_LINEAGES.join(", ")}`,
    });
  }

  if (!LIFE_STAGES.has(data.lifeStage)) {
    errors.push({
      path: "lifeStage",
      message: `must be one of: ${[...LIFE_STAGES].join(", ")}`,
    });
  }
  if (!Number.isInteger(data.generation) || data.generation < 1) {
    errors.push({ path: "generation", message: "must be a positive integer" });
  }
  validateString(errors, data.origin, "origin");

  if (validateRecord(errors, data.appearance, "appearance")) {
    for (const key of ["baseTone", "eyeTone", "morphology"]) {
      validateString(errors, data.appearance[key], `appearance.${key}`);
    }
    validateArray(errors, data.appearance.patterns, "appearance.patterns");
    if (
      data.appearance.rareVariant !== null &&
      data.appearance.rareVariant !== undefined &&
      typeof data.appearance.rareVariant !== "string"
    ) {
      errors.push({
        path: "appearance.rareVariant",
        message: "must be a string or null",
      });
    }
  }

  if (validateRecord(errors, data.needs, "needs")) {
    for (const key of NEED_KEYS) {
      validateRange(errors, data.needs[key], `needs.${key}`);
    }
  }

  if (validateRecord(errors, data.mood, "mood")) {
    validateString(errors, data.mood.state, "mood.state");
    for (const key of MOOD_VALUE_KEYS) {
      validateRange(errors, data.mood[key], `mood.${key}`);
    }
  }

  if (validateRecord(errors, data.personality, "personality")) {
    validateArray(errors, data.personality.traits, "personality.traits");
    if (!Number.isInteger(data.personality.temperamentSeed)) {
      errors.push({
        path: "personality.temperamentSeed",
        message: "must be an integer",
      });
    }
  }

  if (validateRecord(errors, data.preferences, "preferences")) {
    if (!Array.isArray(data.preferences.foods) && !isRecord(data.preferences.foods)) {
      errors.push({
        path: "preferences.foods",
        message: "must be an array or a categorized food preference object",
      });
    }
    if (!isRecord(data.preferences.touchProfile)) {
      errors.push({ path: "preferences.touchProfile", message: "must be an object" });
    }
    for (const key of ["temperatures", "activities", "places"]) {
      validateArray(errors, data.preferences[key], `preferences.${key}`);
    }
  }

  if (validateRecord(errors, data.relationships, "relationships")) {
    validateRange(
      errors,
      data.relationships.guardianTrust,
      "relationships.guardianTrust",
    );
    if (!isRecord(data.relationships.seals)) {
      errors.push({ path: "relationships.seals", message: "must be an object" });
    } else {
      for (const [sealId, affinity] of Object.entries(data.relationships.seals)) {
        validateRange(errors, affinity, `relationships.seals.${sealId}`);
      }
    }
  }

  if (validateRecord(errors, data.talents, "talents")) {
    for (const key of TALENT_KEYS) {
      validateRange(errors, data.talents[key], `talents.${key}`);
    }
  }

  if (validateRecord(errors, data.memory, "memory")) {
    for (const key of ["events", "places", "echoes"]) {
      validateArray(errors, data.memory[key], `memory.${key}`);
    }
  }

  if (validateRecord(errors, data.genetics, "genetics")) {
    validateArray(errors, data.genetics.parents, "genetics.parents");
    validateArray(
      errors,
      data.genetics.inheritableTraits,
      "genetics.inheritableTraits",
    );
  }

  if (validateRecord(errors, data.state, "state")) {
    validateString(errors, data.state.habitat, "state.habitat");
    validateString(errors, data.state.activity, "state.activity");
    validateRange(errors, data.state.wetness, "state.wetness");
    validateArray(errors, data.state.injuryFlags, "state.injuryFlags");
    if (validateRecord(errors, data.state.position, "state.position")) {
      for (const axis of ["x", "y", "z"]) {
        if (!Number.isFinite(data.state.position[axis])) {
          errors.push({
            path: `state.position.${axis}`,
            message: "must be a finite number",
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export class SealDataValidationError extends TypeError {
  constructor(errors) {
    super(`Invalid SealData: ${errors.map(({ path, message }) => `${path} ${message}`).join("; ")}`);
    this.name = "SealDataValidationError";
    this.errors = clone(errors);
  }
}

export function assertValidSealData(data, options) {
  const validation = validateSealData(data, options);
  if (!validation.valid) {
    throw new SealDataValidationError(validation.errors);
  }
  return data;
}

export const LUMA_SEAL_DATA = Object.freeze({
  id: "luma",
  name: "Luma",
  lineage: "Soluma",
  lifeStage: "juvenile",
  generation: 1,
  origin: "Rivage d'Aelys",
  appearance: {
    baseTone: "light-silver-grey",
    patterns: ["natural-dark-grey-spots"],
    eyeTone: "deep-glossy-brown",
    morphology: "natural-rounded-grey-seal",
    rareVariant: null,
  },
  needs: {
    hunger: 22,
    energy: 88,
    health: 100,
    hygiene: 82,
    comfort: 86,
    safety: 90,
    social: 74,
    stimulation: 78,
  },
  mood: {
    state: "curious",
    stress: 12,
    curiosity: 88,
    confidence: 34,
  },
  personality: {
    traits: ["gentle", "curious", "loyal", "expressive", "playful"],
    temperamentSeed: 104729,
  },
  preferences: {
    foods: {
      favorites: ["silver-sprat", "tide-ration"],
      accepted: ["reef-herring", "tender-lumiflora"],
      refused: ["bitter-corallis"],
    },
    touchProfile: {
      caress: {
        preferredZones: ["head", "cheeks", "back"],
        sensitiveZones: ["front-flippers"],
        preferredStyle: "slow",
        maximumIntensity: 0.65,
        minimumTrust: 5,
      },
      bellyTap: {
        enjoys: true,
        preferredRhythm: "gentle-steady",
        maximumIntensity: 0.35,
        minimumTrust: 30,
        maximumStress: 64,
      },
      cleaning: {
        preferredTemperature: "lukewarm",
        preferredIntensity: "gentle",
        preferredTools: ["freshwater-rinse", "soft-kelp-brush"],
        sensitiveZones: ["eyes", "muzzle"],
      },
    },
    temperatures: ["mild", "lukewarm"],
    activities: ["calm-swimming", "diving", "bubble-play", "following"],
    places: ["Rivage d'Aelys", "Lagune des Murmures"],
  },
  relationships: {
    guardianTrust: 24,
    seals: {},
  },
  talents: {
    diving: 46,
    memory: 18,
    gathering: 22,
    currents: 20,
    rescue: 28,
    care: 16,
  },
  memory: {
    events: [],
    places: ["Rivage d'Aelys"],
    echoes: [],
  },
  genetics: {
    parents: [],
    inheritableTraits: ["silver-grey-tone", "natural-dark-spots", "curiosity"],
  },
  state: {
    position: { x: 0, y: 0, z: 0 },
    habitat: "Rivage d'Aelys",
    activity: "land-idle",
    wetness: 35,
    injuryFlags: [],
  },
});

export function createLumaSealData(overrides = {}) {
  const luma = clone(LUMA_SEAL_DATA);

  // Overrides are intentionally shallow by category, keeping the factory
  // convenient without silently dropping required nested fields.
  for (const [key, value] of Object.entries(overrides)) {
    if (isRecord(value) && isRecord(luma[key])) {
      luma[key] = { ...luma[key], ...clone(value) };
    } else {
      luma[key] = clone(value);
    }
  }

  assertValidSealData(luma);
  return luma;
}

export class SealEntity {
  constructor(data = createLumaSealData(), options = {}) {
    const candidate = clone(data);
    assertValidSealData(candidate, options);
    this._data = candidate;
  }

  static fromJSON(data, options) {
    return new SealEntity(data, options);
  }

  get id() {
    return this._data.id;
  }

  get name() {
    return this._data.name;
  }

  get lineage() {
    return this._data.lineage;
  }

  get guardianTrust() {
    return this._data.relationships.guardianTrust;
  }

  get mood() {
    return clone(this._data.mood);
  }

  get needs() {
    return clone(this._data.needs);
  }

  get preferences() {
    return clone(this._data.preferences);
  }

  get snapshot() {
    return this.toJSON();
  }

  setNeed(key, value) {
    if (!NEED_KEYS.includes(key)) {
      throw new RangeError(`Unknown seal need: ${key}`);
    }
    this._data.needs[key] = clamp(value);
    return this._data.needs[key];
  }

  adjustNeed(key, delta) {
    if (!Number.isFinite(delta)) {
      throw new TypeError("Need delta must be a finite number");
    }
    return this.setNeed(key, this._data.needs[key] + delta);
  }

  setMood(patch) {
    if (!isRecord(patch)) {
      throw new TypeError("Mood patch must be an object");
    }
    if (patch.state !== undefined) {
      validateStringOrThrow(patch.state, "mood.state");
      this._data.mood.state = patch.state;
    }
    for (const key of MOOD_VALUE_KEYS) {
      if (patch[key] !== undefined) {
        this._data.mood[key] = clamp(patch[key]);
      }
    }
    return this.mood;
  }

  adjustMood(changes) {
    if (!isRecord(changes)) {
      throw new TypeError("Mood changes must be an object");
    }
    const patch = {};
    if (changes.state !== undefined) {
      patch.state = changes.state;
    }
    for (const key of MOOD_VALUE_KEYS) {
      if (changes[key] !== undefined) {
        if (!Number.isFinite(changes[key])) {
          throw new TypeError(`Mood delta for ${key} must be a finite number`);
        }
        patch[key] = this._data.mood[key] + changes[key];
      }
    }
    return this.setMood(patch);
  }

  setGuardianTrust(value) {
    this._data.relationships.guardianTrust = clamp(value);
    return this._data.relationships.guardianTrust;
  }

  adjustGuardianTrust(delta) {
    if (!Number.isFinite(delta)) {
      throw new TypeError("Trust delta must be a finite number");
    }
    return this.setGuardianTrust(this.guardianTrust + delta);
  }

  setActivity(activity) {
    validateStringOrThrow(activity, "state.activity");
    this._data.state.activity = activity;
    return activity;
  }

  setPosition(position) {
    if (!isRecord(position) || !["x", "y", "z"].every((axis) => Number.isFinite(position[axis]))) {
      throw new TypeError("Position must contain finite x, y and z values");
    }
    this._data.state.position = {
      x: position.x,
      y: position.y,
      z: position.z,
    };
    return clone(this._data.state.position);
  }

  rememberEvent(event) {
    if (!isRecord(event) || typeof event.type !== "string" || event.type.trim() === "") {
      throw new TypeError("A memory event must be an object with a non-empty type");
    }
    this._data.memory.events.push(clone(event));
    return clone(event);
  }

  rememberPlace(placeId) {
    validateStringOrThrow(placeId, "placeId");
    if (!this._data.memory.places.includes(placeId)) {
      this._data.memory.places.push(placeId);
    }
    return [...this._data.memory.places];
  }

  rememberEcho(echoId) {
    validateStringOrThrow(echoId, "echoId");
    if (!this._data.memory.echoes.includes(echoId)) {
      this._data.memory.echoes.push(echoId);
    }
    return [...this._data.memory.echoes];
  }

  /** Apply an interaction outcome atomically to this entity. */
  applyOutcome(outcome = {}) {
    const before = this.toJSON();
    try {
      for (const [key, delta] of Object.entries(outcome.needsDelta ?? {})) {
        this.adjustNeed(key, delta);
      }
      this.adjustMood(outcome.moodDelta ?? {});
      if (outcome.moodState) {
        this.setMood({ state: outcome.moodState });
      }
      if (outcome.trustDelta !== undefined) {
        this.adjustGuardianTrust(outcome.trustDelta);
      }
      if (outcome.memoryEvent) {
        this.rememberEvent(outcome.memoryEvent);
      }
      assertValidSealData(this._data);
    } catch (error) {
      this._data = before;
      throw error;
    }
    return this.toJSON();
  }

  toJSON() {
    return clone(this._data);
  }
}

function validateStringOrThrow(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

export default SealEntity;
