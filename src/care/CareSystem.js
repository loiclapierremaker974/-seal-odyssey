import { SealEntity, clamp } from "../seals/SealEntity.js";

export const CARE_INTERACTIONS = Object.freeze({
  FEED: "feed",
  CARESS: "caress",
  BELLY_TAP: "belly-tap",
  CLEAN: "clean",
});

export const DEFAULT_CARE_RULES = Object.freeze({
  feed: {
    favoriteHungerRelief: 32,
    acceptedHungerRelief: 24,
    unknownHungerRelief: 16,
    fullThreshold: 5,
  },
  caress: {
    stressRefusalThreshold: 90,
    defaultMinimumTrust: 5,
  },
  bellyTap: {
    defaultMinimumTrust: 30,
    defaultMaximumStress: 65,
    defaultMaximumIntensity: 0.35,
  },
  clean: {
    cleanThreshold: 98,
  },
});

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultClock() {
  return new Date().toISOString();
}

function mergeRules(base, overrides = {}) {
  const result = {};
  for (const [key, value] of Object.entries(base)) {
    result[key] = { ...value, ...(overrides[key] ?? {}) };
  }
  return result;
}

function finiteUnitInterval(value, fallback, label) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(candidate) || candidate < 0 || candidate > 1) {
    throw new RangeError(`${label} must be a number between 0 and 1`);
  }
  return candidate;
}

function nonEmptyString(value, fallback, label) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return candidate;
}

function asStringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizedFoodPreferences(foods) {
  if (Array.isArray(foods)) {
    const favorites = [];
    const accepted = [];
    const refused = [];
    for (const food of foods) {
      if (typeof food === "string") {
        accepted.push(food);
      } else if (isRecord(food) && typeof food.id === "string") {
        if (["favorite", "favourite", "loved"].includes(food.affinity)) {
          favorites.push(food.id);
        } else if (["refused", "disliked", "allergy"].includes(food.affinity)) {
          refused.push(food.id);
        } else {
          accepted.push(food.id);
        }
      }
    }
    return { favorites, accepted, refused };
  }
  if (isRecord(foods)) {
    return {
      favorites: asStringList(foods.favorites),
      accepted: asStringList(foods.accepted),
      refused: [
        ...asStringList(foods.refused),
        ...asStringList(foods.disliked),
      ],
    };
  }
  return { favorites: [], accepted: [], refused: [] };
}

/**
 * Executes tactile-care rules against one persistent SealEntity. The system
 * deliberately returns semantic feedback; animation/audio layers choose how
 * to render it.
 */
export class CareSystem {
  constructor(seal, options = {}) {
    this.seal = seal instanceof SealEntity ? seal : new SealEntity(seal);
    this.clock = options.clock ?? defaultClock;
    if (typeof this.clock !== "function") {
      throw new TypeError("CareSystem clock must be a function");
    }
    this.rules = mergeRules(DEFAULT_CARE_RULES, options.rules);
  }

  /**
   * Refresh the working entity from authoritative persistence before a care
   * gesture. This prevents a long-lived CareSystem from overwriting memories
   * or quest-driven mood changes added elsewhere since the previous gesture.
   */
  syncSeal(seal) {
    this.seal = seal instanceof SealEntity ? seal : new SealEntity(seal);
    return this.seal.toJSON();
  }

  setSeal(seal) {
    return this.syncSeal(seal);
  }

  interact(type, payload = {}) {
    switch (type) {
      case "feed":
      case "food":
        return this.feed(payload);
      case "caress":
      case "pet":
        return this.caress(payload);
      case "belly-tap":
      case "bellyTap":
      case "gentle-belly-tap":
        return this.bellyTap(payload);
      case "clean":
      case "wash":
      case "rinse":
        return this.clean(payload);
      default:
        throw new RangeError(`Unknown care interaction: ${String(type)}`);
    }
  }

  feed(foodOrPayload, options = {}) {
    const payload =
      typeof foodOrPayload === "string"
        ? { ...options, foodId: foodOrPayload }
        : foodOrPayload;
    if (!isRecord(payload)) {
      throw new TypeError("Feed payload must contain a foodId");
    }
    const foodId = nonEmptyString(payload.foodId ?? payload.id, undefined, "foodId");
    const preferences = normalizedFoodPreferences(this.seal.preferences.foods);
    const needs = this.seal.needs;

    if (needs.hunger <= this.rules.feed.fullThreshold) {
      return this._resolve(CARE_INTERACTIONS.FEED, {
        accepted: false,
        response: "content",
        reason: "not-hungry",
        feedback: `${this.seal.name} n'a plus faim.`,
      }, { foodId });
    }

    if (preferences.refused.includes(foodId)) {
      return this._resolve(CARE_INTERACTIONS.FEED, {
        accepted: false,
        response: "refused",
        reason: "food-refused",
        feedback: `${this.seal.name} détourne la tête devant cet aliment.`,
        trustDelta: -1,
        moodDelta: { stress: 2 },
        moodState: "wary",
      }, { foodId });
    }

    if (preferences.favorites.includes(foodId)) {
      return this._resolve(CARE_INTERACTIONS.FEED, {
        accepted: true,
        response: "delighted",
        feedback: `${this.seal.name} reconnaît l'un de ses aliments préférés.`,
        trustDelta: 4,
        needsDelta: {
          hunger: -this.rules.feed.favoriteHungerRelief,
          energy: 6,
          health: 1,
          comfort: 3,
        },
        moodDelta: { stress: -5, curiosity: 1, confidence: 2 },
        moodState: "happy",
      }, { foodId, preference: "favorite" });
    }

    if (preferences.accepted.includes(foodId)) {
      return this._resolve(CARE_INTERACTIONS.FEED, {
        accepted: true,
        response: "pleased",
        feedback: `${this.seal.name} accepte volontiers cet aliment.`,
        trustDelta: 2,
        needsDelta: {
          hunger: -this.rules.feed.acceptedHungerRelief,
          energy: 4,
          comfort: 1,
        },
        moodDelta: { stress: -3, confidence: 1 },
        moodState: "happy",
      }, { foodId, preference: "accepted" });
    }

    return this._resolve(CARE_INTERACTIONS.FEED, {
      accepted: true,
      response: "curious",
      reason: "unknown-preference",
      feedback: `${this.seal.name} goûte prudemment cet aliment inconnu.`,
      trustDelta: 1,
      needsDelta: {
        hunger: -this.rules.feed.unknownHungerRelief,
        energy: 2,
      },
      moodDelta: { stress: -1, curiosity: 3 },
      moodState: "curious",
    }, { foodId, preference: "unknown" });
  }

  caress(payload = {}) {
    if (!isRecord(payload)) {
      throw new TypeError("Caress payload must be an object");
    }
    const profile = this.seal.preferences.touchProfile?.caress ?? {};
    const zone = nonEmptyString(payload.zone, "head", "caress zone");
    const style = nonEmptyString(payload.style, "slow", "caress style");
    const intensity = finiteUnitInterval(payload.intensity, 0.35, "caress intensity");
    const minimumTrust = Number.isFinite(profile.minimumTrust)
      ? profile.minimumTrust
      : this.rules.caress.defaultMinimumTrust;
    const maximumIntensity = Number.isFinite(profile.maximumIntensity)
      ? profile.maximumIntensity
      : 0.7;
    const preferredZones = asStringList(profile.preferredZones);
    const sensitiveZones = asStringList(profile.sensitiveZones);

    if (this.seal.guardianTrust < minimumTrust) {
      return this._resolve(CARE_INTERACTIONS.CARESS, {
        accepted: false,
        response: "hesitant",
        reason: "insufficient-trust",
        feedback: `${this.seal.name} a besoin de plus de confiance avant ce contact.`,
        moodDelta: { stress: 1 },
      }, { zone, style, intensity });
    }

    if (
      sensitiveZones.includes(zone) ||
      intensity > maximumIntensity ||
      (this.seal.mood.stress >= this.rules.caress.stressRefusalThreshold && intensity > 0.2)
    ) {
      return this._resolve(CARE_INTERACTIONS.CARESS, {
        accepted: false,
        response: "uncomfortable",
        reason: sensitiveZones.includes(zone)
          ? "sensitive-zone"
          : intensity > maximumIntensity
            ? "too-intense"
            : "too-stressed",
        feedback: `${this.seal.name} s'écarte : le geste doit être plus doux.`,
        trustDelta: -2,
        moodDelta: { stress: 6, confidence: -1 },
        moodState: "uncomfortable",
      }, { zone, style, intensity });
    }

    const preferred =
      (preferredZones.length === 0 || preferredZones.includes(zone)) &&
      (!profile.preferredStyle || profile.preferredStyle === style);

    return this._resolve(CARE_INTERACTIONS.CARESS, {
      accepted: true,
      response: preferred ? "delighted" : "calmed",
      reason: preferred ? undefined : "tolerated-preference-mismatch",
      feedback: preferred
        ? `${this.seal.name} se détend sous cette caresse familière.`
        : `${this.seal.name} accepte la caresse, mais indique une autre préférence.`,
      trustDelta: preferred ? 3 : 1,
      needsDelta: {
        comfort: preferred ? 8 : 4,
        social: preferred ? 6 : 3,
      },
      moodDelta: {
        stress: preferred ? -9 : -4,
        confidence: preferred ? 2 : 1,
      },
      moodState: preferred ? "happy" : "calm",
    }, { zone, style, intensity, preferred });
  }

  bellyTap(payload = {}) {
    if (!isRecord(payload)) {
      throw new TypeError("Belly-tap payload must be an object");
    }
    const profile = this.seal.preferences.touchProfile?.bellyTap ?? {};
    const rhythm = nonEmptyString(
      payload.rhythm,
      profile.preferredRhythm ?? "gentle-steady",
      "belly-tap rhythm",
    );
    const intensity = finiteUnitInterval(payload.intensity, 0.2, "belly-tap intensity");
    const minimumTrust = Number.isFinite(profile.minimumTrust)
      ? profile.minimumTrust
      : this.rules.bellyTap.defaultMinimumTrust;
    const maximumStress = Number.isFinite(profile.maximumStress)
      ? profile.maximumStress
      : this.rules.bellyTap.defaultMaximumStress;
    const maximumIntensity = Number.isFinite(profile.maximumIntensity)
      ? profile.maximumIntensity
      : this.rules.bellyTap.defaultMaximumIntensity;

    if (profile.enjoys === false) {
      return this._resolve(CARE_INTERACTIONS.BELLY_TAP, {
        accepted: false,
        response: "refused",
        reason: "individual-preference",
        feedback: `${this.seal.name} n'apprécie pas les tapotements sur le ventre.`,
      }, { rhythm, intensity });
    }
    if (this.seal.guardianTrust < minimumTrust) {
      return this._resolve(CARE_INTERACTIONS.BELLY_TAP, {
        accepted: false,
        response: "hesitant",
        reason: "insufficient-trust",
        feedback: `${this.seal.name} protège son ventre tant que la confiance reste fragile.`,
      }, { rhythm, intensity });
    }
    if (this.seal.mood.stress > maximumStress) {
      return this._resolve(CARE_INTERACTIONS.BELLY_TAP, {
        accepted: false,
        response: "stressed",
        reason: "too-stressed",
        feedback: `${this.seal.name} doit d'abord retrouver son calme.`,
      }, { rhythm, intensity });
    }
    if (intensity > maximumIntensity) {
      return this._resolve(CARE_INTERACTIONS.BELLY_TAP, {
        accepted: false,
        response: "uncomfortable",
        reason: "not-gentle",
        feedback: "Le tapotement sur le ventre doit rester doux et maîtrisé.",
        trustDelta: -2,
        moodDelta: { stress: 7, confidence: -2 },
        moodState: "uncomfortable",
      }, { rhythm, intensity });
    }

    const preferred = !profile.preferredRhythm || profile.preferredRhythm === rhythm;
    return this._resolve(CARE_INTERACTIONS.BELLY_TAP, {
      accepted: true,
      response: preferred ? "playful" : "tolerated",
      reason: preferred ? undefined : "rhythm-preference-mismatch",
      feedback: preferred
        ? `${this.seal.name} répond avec entrain à ce rythme tout doux.`
        : `${this.seal.name} accepte les tapotements, mais préfère un autre rythme.`,
      trustDelta: preferred ? 4 : 1,
      needsDelta: {
        comfort: preferred ? 5 : 2,
        social: preferred ? 4 : 2,
        stimulation: preferred ? 7 : 3,
      },
      moodDelta: {
        stress: preferred ? -7 : -2,
        curiosity: preferred ? 2 : 1,
        confidence: preferred ? 3 : 1,
      },
      moodState: preferred ? "playful" : "calm",
    }, { rhythm, intensity, preferred });
  }

  gentleBellyTap(payload = {}) {
    return this.bellyTap({ ...payload, intensity: payload.intensity ?? 0.2 });
  }

  clean(payload = {}) {
    if (!isRecord(payload)) {
      throw new TypeError("Clean payload must be an object");
    }
    const profile = this.seal.preferences.touchProfile?.cleaning ?? {};
    const temperature = nonEmptyString(
      payload.temperature,
      "lukewarm",
      "cleaning temperature",
    );
    const intensity = nonEmptyString(payload.intensity, "gentle", "cleaning intensity");
    const tool = nonEmptyString(payload.tool, "freshwater-rinse", "cleaning tool");
    const zone = nonEmptyString(payload.zone, "body", "cleaning zone");
    const sensitiveZones = asStringList(profile.sensitiveZones);

    if (this.seal.needs.hygiene >= this.rules.clean.cleanThreshold) {
      return this._resolve(CARE_INTERACTIONS.CLEAN, {
        accepted: false,
        response: "content",
        reason: "already-clean",
        feedback: `${this.seal.name} est déjà propre et à l'aise.`,
      }, { temperature, intensity, tool, zone });
    }

    if (sensitiveZones.includes(zone)) {
      return this._resolve(CARE_INTERACTIONS.CLEAN, {
        accepted: false,
        response: "uncomfortable",
        reason: "sensitive-zone",
        feedback: `${this.seal.name} vous demande d'éviter cette zone sensible.`,
        trustDelta: -1,
        moodDelta: { stress: 4 },
        moodState: "uncomfortable",
      }, { temperature, intensity, tool, zone });
    }

    const preferred =
      (!profile.preferredTemperature || profile.preferredTemperature === temperature) &&
      (!profile.preferredIntensity || profile.preferredIntensity === intensity) &&
      (!Array.isArray(profile.preferredTools) || profile.preferredTools.includes(tool));

    return this._resolve(CARE_INTERACTIONS.CLEAN, {
      accepted: true,
      response: preferred ? "relaxed" : "tolerated",
      reason: preferred ? undefined : "care-preference-mismatch",
      feedback: preferred
        ? `${this.seal.name} se détend pendant ce nettoyage délicat.`
        : `${this.seal.name} est nettoyée, mais indique une autre préférence de soin.`,
      trustDelta: preferred ? 3 : 0,
      needsDelta: {
        hygiene: preferred ? 24 : 10,
        comfort: preferred ? 5 : -1,
        health: preferred ? 1 : 0,
      },
      moodDelta: {
        stress: preferred ? -6 : 2,
        confidence: preferred ? 1 : 0,
      },
      moodState: preferred ? "calm" : "neutral",
    }, { temperature, intensity, tool, zone, preferred });
  }

  _resolve(interaction, outcome, details) {
    const before = {
      trust: this.seal.guardianTrust,
      mood: this.seal.mood,
      needs: this.seal.needs,
    };
    const occurredAt = this.clock();
    const normalized = {
      accepted: Boolean(outcome.accepted),
      response: outcome.response ?? "neutral",
      reason: outcome.reason,
      feedback: outcome.feedback ?? "",
      trustDelta: outcome.trustDelta ?? 0,
      needsDelta: outcome.needsDelta ?? {},
      moodDelta: outcome.moodDelta ?? {},
      moodState: outcome.moodState,
    };

    // Even a refusal is remembered: preferences and trust would feel reset if
    // only successful gestures became part of the seal's history.
    this.seal.applyOutcome({
      trustDelta: normalized.trustDelta,
      needsDelta: normalized.needsDelta,
      moodDelta: normalized.moodDelta,
      moodState: normalized.moodState,
      memoryEvent: {
        type: "care-interaction",
        interaction,
        accepted: normalized.accepted,
        response: normalized.response,
        details: clone(details),
        occurredAt,
      },
    });

    const after = {
      trust: this.seal.guardianTrust,
      mood: this.seal.mood,
      needs: this.seal.needs,
    };

    return {
      type: "care",
      interaction,
      success: normalized.accepted,
      accepted: normalized.accepted,
      response: normalized.response,
      ...(normalized.reason ? { reason: normalized.reason } : {}),
      feedback: normalized.feedback,
      details: clone(details),
      deltas: {
        trust: after.trust - before.trust,
        needs: diffNumericRecord(before.needs, after.needs),
        mood: diffNumericRecord(before.mood, after.mood),
      },
      before,
      after,
      seal: this.seal.toJSON(),
      occurredAt,
    };
  }
}

function diffNumericRecord(before, after) {
  const result = {};
  for (const key of Object.keys(after)) {
    if (Number.isFinite(before[key]) && Number.isFinite(after[key])) {
      const delta = after[key] - before[key];
      if (delta !== 0) {
        result[key] = clamp(delta, -100, 100);
      }
    }
  }
  return result;
}

export default CareSystem;
