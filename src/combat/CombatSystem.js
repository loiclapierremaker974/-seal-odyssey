import { ENCOUNTERS } from './encounters.js';

export { ENCOUNTERS } from './encounters.js';

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, immutable(item)]),
    ));
  }
  return value;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ELEMENT_LABELS = { water: 'eau', light: 'lumière', current: 'courant' };
// Action affinities are configurable combat rules, not lineage/species mappings.
const WEAKNESS = { water: 'current', current: 'light', light: 'water' };

export const COMBAT_ACTIONS = immutable([
  {
    id: 'swift-wave', label: 'Onde rapide', element: 'water',
    description: 'Une onde légère apaise rapidement la manifestation.',
    cost: 8, power: 14, cooldown: 0,
  },
  {
    id: 'strong-wave', label: 'Onde ample', element: 'light',
    description: 'Une résonance plus forte, coûteuse et suivie de deux tours de récupération.',
    cost: 20, power: 28, cooldown: 2,
  },
  {
    id: 'guard', label: 'Protection', element: 'light',
    description: 'Réduit la prochaine riposte de 78 % et prépare une onde abritée.',
    cost: 6, power: 0, cooldown: 1,
  },
  {
    id: 'dodge', label: 'Esquive', element: 'current',
    description: 'Évite un jaillissement ciblé. Une onde diffuse reste partiellement ressentie.',
    cost: 8, power: 0, cooldown: 2,
  },
  {
    id: 'observe', label: 'Observer', element: 'current',
    description: 'Révèle la résonance sensible et prépare une combinaison pendant deux tours.',
    cost: 0, power: 0, cooldown: 0,
  },
  {
    id: 'comfort', label: 'Réconfort', element: 'light',
    description: 'Restaure l’énergie de rencontre et un peu de sérénité grâce au lien avec Luma.',
    cost: 0, power: 0, cooldown: 2,
  },
]);

const emptyCombo = () => ({
  ready: false, label: '', element: null, source: null,
  turnsRemaining: 0, multiplier: 1,
});

function intentFor(opponent, turn) {
  const id = opponent.pattern[(turn - 1) % opponent.pattern.length];
  const charged = opponent.charged && id !== 'gather';
  const multiplier = charged ? 1.6 : 1;
  const definitions = {
    rush: {
      label: charged ? 'Jaillissement renforcé' : 'Jaillissement',
      description: 'Un mouvement ciblé approche. Une esquive peut l’éviter entièrement.',
      power: Math.round(opponent.attack * 1.25 * multiplier), evadable: true,
    },
    pulse: {
      label: charged ? 'Onde diffuse renforcée' : 'Onde diffuse',
      description: 'L’onde couvre toute l’arène. La protection convient mieux que l’esquive.',
      power: Math.round(opponent.attack * multiplier), evadable: false,
    },
    gather: {
      label: 'Résonance en préparation',
      description: 'La manifestation se rassemble sans riposter. Son prochain mouvement sera renforcé.',
      power: 0, evadable: false,
    },
  };
  return { id, ...definitions[id], element: opponent.element, charged: Boolean(charged) };
}

/**
 * Deterministic appeasement encounter. Serenity and energy exist only here;
 * this module never mutates a seal, a save, or exploration vitals.
 */
export class CombatSystem {
  #state;

  constructor({ encounterId = ENCOUNTERS[0].id, lumaTrust = 24 } = {}) {
    const encounter = ENCOUNTERS.find(item => item.id === encounterId);
    if (!encounter) throw new RangeError('Unknown encounter: ' + encounterId);
    const numericTrust = Number(lumaTrust);
    const trust = clamp(Number.isFinite(numericTrust) ? numericTrust : 24, 0, 100);
    this.#state = {
      encounter, turn: 1, completedTurns: 0, status: 'active', result: null,
      luma: {
        name: 'Luma', lineage: 'Soluma', serenity: 100, maxSerenity: 100,
        energy: 60, maxEnergy: 60, trust, element: 'light',
      },
      opponent: { ...encounter.opponent, resolve: encounter.opponent.maxResolve,
        weakness: null, charged: false },
      intent: null, combo: emptyCombo(),
      cooldowns: Object.fromEntries(COMBAT_ACTIONS.map(action => [action.id, 0])),
    };
    this.#state.intent = intentFor(this.#state.opponent, this.#state.turn);
  }

  getState() {
    const state = this.#state;
    const actions = COMBAT_ACTIONS.map(action => {
      const cooldownRemaining = state.cooldowns[action.id];
      const disabledReason = state.status !== 'active' ? 'finished'
        : cooldownRemaining > 0 ? 'cooldown'
          : state.luma.energy < action.cost ? 'energy' : null;
      return { ...action, cooldownRemaining, available: !disabledReason,
        disabledReason, comboReady: state.combo.ready && action.power > 0 };
    });
    return immutable({ ...state, actions });
  }

  #response(accepted, events, reason) {
    return immutable({ accepted, ...(reason ? { reason } : {}),
      state: this.getState(), events });
  }

  #finish(result, events) {
    this.#state.status = result;
    this.#state.result = result;
    this.#state.combo = emptyCombo();
    this.#state.intent = null;
    events.push({ type: result, actor: 'luma',
      text: result === 'victory' ? 'La manifestation retrouve son calme.'
        : result === 'retreat' ? 'Luma s’éloigne en sécurité.'
          : 'Luma se met à l’abri. Son état dans le monde reste inchangé.' });
  }

  act(actionId) {
    const state = this.#state;
    if (state.status !== 'active') return this.#response(false, [], 'finished');
    const action = COMBAT_ACTIONS.find(item => item.id === actionId);
    if (!action) return this.#response(false, [], 'unknown-action');
    if (state.cooldowns[action.id] > 0) return this.#response(false, [], 'cooldown');
    if (state.luma.energy < action.cost) return this.#response(false, [], 'energy');

    const events = [];
    const initialCombo = state.combo;
    for (const id of Object.keys(state.cooldowns)) {
      state.cooldowns[id] = Math.max(0, state.cooldowns[id] - 1);
    }
    state.cooldowns[action.id] = action.cooldown;
    state.luma.energy -= action.cost;
    state.luma.element = action.element;
    events.push({ type: 'action', actor: 'luma', actionId: action.id,
      element: action.element, text: 'Luma choisit ' + action.label.toLowerCase() + '.' });

    if (action.power > 0) {
      const combo = state.combo;
      const element = combo.ready ? combo.element : action.element;
      const affinity = WEAKNESS[state.opponent.element] === element ? 1.3
        : WEAKNESS[element] === state.opponent.element ? 0.8 : 1;
      const power = Math.max(1, Math.round(
        action.power * affinity * (combo.ready ? combo.multiplier : 1),
      ));
      const amount = Math.min(state.opponent.resolve, power);
      state.opponent.resolve = Math.max(0, state.opponent.resolve - amount);
      state.luma.element = element;
      events[0].element = element;
      events[0].combo = combo.ready;
      events.push({ type: 'hit', actor: 'luma', target: 'opponent',
        actionId: action.id, element, amount, combo: combo.ready,
        text: (combo.ready ? combo.label + ' : ' : '') +
          'l’agitation diminue de ' + amount + '.' });
      state.combo = emptyCombo();
    } else if (action.id === 'observe') {
      const element = WEAKNESS[state.opponent.element];
      state.opponent.weakness = element;
      state.combo = { ready: true, label: 'Résonance accordée', element,
        source: 'observe', turnsRemaining: 2, multiplier: 1.45 };
      events.push({ type: 'observe', actor: 'luma', element,
        text: 'La manifestation est sensible à la résonance de ' + ELEMENT_LABELS[element] + '.' });
    } else if (action.id === 'comfort') {
      const energy = Math.min(state.luma.maxEnergy - state.luma.energy,
        24 + Math.floor(state.luma.trust / 10));
      const serenity = Math.min(state.luma.maxSerenity - state.luma.serenity,
        8 + Math.floor(state.luma.trust / 25));
      state.luma.energy += energy;
      state.luma.serenity += serenity;
      events.push({ type: 'comfort', actor: 'luma', amount: energy, serenity,
        element: 'light', text: 'Le lien rend ' + energy +
          ' points d’énergie et ' + serenity + ' points de sérénité.' });
    }

    state.completedTurns += 1;
    if (state.opponent.resolve === 0) {
      this.#finish('victory', events);
      return this.#response(true, events);
    }

    const intent = state.intent;
    events.push({ type: 'action', actor: 'opponent', actionId: intent.id,
      element: intent.element, text: intent.label + '.' });
    if (intent.id === 'gather') {
      state.opponent.charged = true;
      if (action.id === 'guard' || action.id === 'dodge') {
        events.push({ type: action.id, actor: 'luma', amount: 0,
          text: 'Luma conserve ses appuis pendant cette préparation.' });
      }
    } else {
      let amount = intent.power;
      if (action.id === 'guard') {
        amount = Math.round(amount * 0.22);
        events.push({ type: 'guard', actor: 'luma', amount: intent.power - amount,
          element: 'light', text: 'La protection amortit la résonance.' });
        state.combo = { ready: true, label: 'Onde abritée', element: 'light',
          source: 'guard', turnsRemaining: 1, multiplier: 1.2 };
      } else if (action.id === 'dodge') {
        amount = intent.evadable ? 0 : Math.round(amount * 0.65);
        events.push({ type: 'dodge', actor: 'luma', amount: intent.power - amount,
          element: 'current', text: intent.evadable
            ? 'Luma évite le jaillissement.' : 'L’onde diffuse atteint encore Luma.' });
        if (intent.evadable) {
          state.combo = { ready: true, label: 'Courant retourné', element: 'current',
            source: 'dodge', turnsRemaining: 1, multiplier: 1.3 };
        }
      }
      state.opponent.charged = false;
      amount = Math.min(state.luma.serenity, amount);
      state.luma.serenity = Math.max(0, state.luma.serenity - amount);
      if (amount > 0) {
        events.push({ type: 'hit', actor: 'opponent', target: 'luma',
          actionId: intent.id, element: intent.element, amount,
          text: 'La sérénité diminue de ' + amount + '.' });
      }
    }

    if (state.luma.serenity === 0) {
      this.#finish('defeat', events);
    } else {
      if (state.combo === initialCombo && state.combo.ready) {
        state.combo.turnsRemaining -= 1;
        if (state.combo.turnsRemaining === 0) state.combo = emptyCombo();
      }
      state.turn += 1;
      state.intent = intentFor(state.opponent, state.turn);
    }
    return this.#response(true, events);
  }

  retreat() {
    if (this.#state.status !== 'active') return this.#response(false, [], 'finished');
    const events = [];
    this.#finish('retreat', events);
    return this.#response(true, events);
  }
}

export default CombatSystem;
