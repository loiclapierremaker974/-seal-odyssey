const ELEMENT_LABELS = Object.freeze({
  water: 'Eau',
  light: 'Lumière',
  wind: 'Vent',
  ice: 'Glace',
  nature: 'Nature',
  earth: 'Terre',
  shadow: 'Ombre',
  neutral: 'Courant',
});

const ACTION_ICONS = Object.freeze({
  'swift-wave': 'swift-wave.svg',
  'strong-wave': 'strong-wave.svg',
  guard: 'guard.svg',
  dodge: 'dodge.svg',
  observe: 'observe.svg',
  comfort: 'comfort.svg',
});

const OUTCOME_COPY = Object.freeze({
  victory: {
    title: 'Le courant s’apaise',
    description: 'Luma a dissipé l’agitation. Retrouvez le monde libre.',
  },
  defeat: {
    title: 'Reprendre son souffle',
    description: 'Luma a besoin d’une pause. Restez auprès d’elle pour reprendre votre souffle.',
  },
  retreat: {
    title: 'Une autre approche',
    description: 'Vous prenez de la distance. L’exploration continue.',
  },
});

let panelSequence = 0;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const elementLabel = (element) => ELEMENT_LABELS[element] || 'Courant';
const svgIcon = (id) => '<img class="battle-action__art" src="' +
  (import.meta.env?.BASE_URL ?? '/') + 'assets/battle-icons/' +
  (ACTION_ICONS[id] || ACTION_ICONS['swift-wave']) +
  '" width="48" height="48" alt="" aria-hidden="true" draggable="false">';

/**
 * Accessible commands for the fixed-camera arena.
 * The caller owns rendering, encounter state, animation timing and world input.
 */
export class BattlePanel {
  constructor({ mount = document.body, onAction, onRetreat, onClose } = {}) {
    if (!(mount instanceof Element)) {
      throw new TypeError('BattlePanel mount must be a DOM element.');
    }
    this.onAction = onAction;
    this.onRetreat = onRetreat;
    this.onClose = onClose;
    this.state = null;
    this.encounter = null;
    this.busy = false;
    this.previousFocus = null;
    this.lastActionId = null;
    this.actionButtons = new Map();
    this.abortController = new AbortController();

    const id = 'battle-' + (++panelSequence);
    this.element = document.createElement('section');
    this.element.className = 'battle-panel';
    this.element.hidden = true;
    this.element.tabIndex = -1;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', id + '-title');
    this.element.setAttribute('aria-describedby', id + '-intent');
    this.element.dataset.battleState = 'active';
    this.element.innerHTML = [
      '<header class="battle-header">',
      '  <div class="battle-header__top">',
      '    <div class="battle-heading">',
      '      <p class="battle-eyebrow" data-battle-location>Rencontre · Aqualys</p>',
      '      <h2 id="' + id + '-title" data-battle-title>Un courant à apaiser</h2>',
      '    </div>',
      '    <button type="button" class="battle-retreat" data-battle-retreat aria-label="Prendre de la distance et quitter le combat">',
      '      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H4v14h6m-1-7h12m-4-4 4 4-4 4"/></svg>',
      '      <span>Se retirer</span>',
      '    </button>',
      '  </div>',
      '  <div class="battle-vitals">',
      '    <div class="battle-vital battle-vital--luma">',
      '      <div class="battle-vital__label"><strong data-battle-luma-name>Luma</strong><span>Sérénité <b data-battle-serenity-value></b></span></div>',
      '      <div class="battle-vital__track" role="progressbar" aria-label="Sérénité de Luma" aria-valuemin="0" data-battle-serenity><i></i></div>',
      '    </div>',
      '    <div class="battle-vital battle-vital--opponent">',
      '      <div class="battle-vital__label"><strong data-battle-opponent-name>Agitation du courant</strong><span>Agitation <b data-battle-agitation-value></b></span></div>',
      '      <div class="battle-vital__track" role="progressbar" aria-label="Agitation de la menace" aria-valuemin="0" data-battle-agitation><i></i></div>',
      '    </div>',
      '  </div>',
      '  <p class="battle-intent" id="' + id + '-intent" data-battle-intent><span>À venir</span> <strong data-battle-intent-label></strong><span class="battle-intent__description" data-battle-intent-description></span></p>',
      '</header>',
      '<div class="battle-stage-window" aria-hidden="true"></div>',
      '<div class="battle-floats" aria-hidden="true">' + '<span class="battle-float" hidden></span>'.repeat(6) + '</div>',
      '<footer class="battle-command">',
      '  <div class="battle-context">',
      '    <span class="battle-turn" data-battle-turn>Tour 1</span>',
      '    <span class="battle-energy"><span>Énergie</span><span class="battle-energy__track" role="progressbar" aria-label="Énergie de la rencontre" aria-valuemin="0" data-battle-energy><i></i></span><b data-battle-energy-value></b></span>',
      '    <span class="battle-combo" data-battle-combo>Observez le courant.</span>',
      '  </div>',
      '  <p class="battle-feedback" data-battle-feedback role="status" aria-live="polite" aria-atomic="true">Choisissez un geste pour protéger Luma et apaiser le courant.</p>',
      '  <div class="battle-actions" role="group" aria-label="Choisir un geste de combat" data-battle-actions></div>',
      '  <section class="battle-result" data-battle-result hidden aria-labelledby="' + id + '-result">',
      '    <div><h3 id="' + id + '-result" data-battle-result-title></h3><p data-battle-result-description></p></div>',
      '    <button type="button" class="battle-return" data-battle-close>Retour à l’exploration <span aria-hidden="true">→</span></button>',
      '  </section>',
      '  <p class="battle-hint" data-battle-hint>Observer · préparer · protéger <span>Clavier : 1–6 · Échap pour se retirer</span></p>',
      '</footer>',
    ].join('\n');
    mount.append(this.element);
    const query = (name) => this.element.querySelector('[data-battle-' + name + ']');
    this.refs = {
      location: query('location'),
      title: query('title'),
      lumaName: query('luma-name'),
      opponentName: query('opponent-name'),
      serenity: query('serenity'),
      serenityValue: query('serenity-value'),
      agitation: query('agitation'),
      agitationValue: query('agitation-value'),
      energy: query('energy'),
      energyValue: query('energy-value'),
      intent: query('intent'),
      intentLabel: query('intent-label'),
      intentDescription: query('intent-description'),
      turn: query('turn'),
      combo: query('combo'),
      feedback: query('feedback'),
      actions: query('actions'),
      retreat: query('retreat'),
      result: query('result'),
      resultTitle: query('result-title'),
      resultDescription: query('result-description'),
      close: query('close'),
      hint: query('hint'),
    };
    this.floatingNodes = [...this.element.querySelectorAll('.battle-float')];
    this.#bind();
  }

  #bind() {
    const { signal } = this.abortController;
    this.refs.actions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-battle-action]');
      if (button && this.refs.actions.contains(button)) {
        this.#selectAction(button.dataset.battleAction);
      }
    }, { signal });
    this.refs.retreat.addEventListener('click', () => this.#requestRetreat(), { signal });
    this.refs.close.addEventListener('click', () => this.close(), { signal });
    window.addEventListener('keydown', (event) => {
      if (this.element.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (this.state?.status === 'active') this.#requestRetreat();
        else this.close();
        return;
      }
      if (event.key === 'Tab') {
        this.#trapFocus(event);
        return;
      }
      if (!event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && /^[1-6]$/.test(event.key)) {
        const action = this.state?.actions?.[Number(event.key) - 1];
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          this.#selectAction(action.id);
        }
      }
    }, { signal });
  }

  #focusable() {
    return [...this.element.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  #trapFocus(event) {
    const focusable = this.#focusable();
    if (!focusable.length) {
      event.preventDefault();
      this.element.focus({ preventScroll: true });
      return;
    }
    const index = focusable.indexOf(document.activeElement);
    if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusable.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? focusable.at(-1) : focusable[0]).focus({ preventScroll: true });
    }
  }

  #selectAction(id) {
    const action = this.state?.actions?.find((candidate) => candidate.id === id);
    if (this.element.hidden || this.busy || this.state?.status !== 'active' || !action || !this.#available(action)) return;
    this.lastActionId = id;
    this.busy = true;
    this.#renderActions();
    try {
      const result = this.onAction?.(id);
      if (result && typeof result.catch === 'function') {
        result.catch(() => this.#showCallbackError());
      }
    } catch {
      this.#showCallbackError();
    }
  }

  #requestRetreat() {
    if (this.element.hidden || this.busy || this.state?.status !== 'active') return;
    this.onRetreat?.();
  }

  #showCallbackError() {
    if (this.element.hidden) return;
    this.busy = false;
    this.refs.feedback.textContent = 'Le geste n’a pas abouti. Choisissez à nouveau.';
    this.#renderActions();
  }

  #available(action) {
    const cooldown = finite(action.cooldownRemaining);
    return action.available !== false && cooldown <= 0 && finite(action.cost) <= finite(this.state?.luma?.energy);
  }

  #renderActions() {
    const actions = this.state?.actions || [];
    const activeIds = new Set(actions.map((action) => action.id));
    this.actionButtons.forEach((button, id) => {
      if (!activeIds.has(id)) {
        button.remove();
        this.actionButtons.delete(id);
      }
    });
    actions.forEach((action, index) => {
      let button = this.actionButtons.get(action.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'battle-action';
        button.dataset.battleAction = action.id;
        button.innerHTML = '<span class="battle-action__icon">' + svgIcon(action.id) + '</span>' +
          '<span class="battle-action__label"></span><span class="battle-action__description"></span>' +
          '<span class="battle-action__meta"><b></b><small></small></span>';
        this.actionButtons.set(action.id, button);
        this.refs.actions.append(button);
      }
      const cooldown = Math.max(0, finite(action.cooldownRemaining));
      const cost = Math.max(0, finite(action.cost));
      const available = this.#available(action);
      button.disabled = this.busy || this.state?.status !== 'active' || !available;
      button.dataset.element = action.element || 'neutral';
      button.dataset.comboReady = String(Boolean(action.comboReady));
      button.querySelector('.battle-action__label').textContent = String(action.label || action.id);
      button.querySelector('.battle-action__description').textContent = String(action.description || '');
      button.querySelector('.battle-action__meta b').textContent = cost > 0 ? cost + ' énergie' : 'Sans coût';
      button.querySelector('.battle-action__meta small').textContent = cooldown > 0
        ? cooldown + (cooldown === 1 ? ' tour' : ' tours')
        : action.comboReady ? 'Enchaînement' : String(index + 1);
      const explanation = this.busy ? 'Le courant réagit.' : (!available ? String(action.disabledReason || (cooldown > 0 ? 'Ce geste se recharge.' : 'Énergie insuffisante.')) : '');
      const label = String(action.label || action.id) + '. ' + String(action.description || '') +
        ' Coût : ' + cost + ' énergie.' + (cooldown > 0 ? ' Disponible dans ' + cooldown + ' tours.' : '') +
        (action.comboReady ? ' Enchaînement préparé.' : '') + (explanation ? ' ' + explanation : '');
      button.setAttribute('aria-label', label);
      button.title = explanation || String(action.description || '');
    });
    this.refs.actions.setAttribute('aria-busy', String(this.busy));
  }

  #setBar(bar, output, value, maximum) {
    const max = Math.max(1, finite(maximum, 100));
    const current = Math.min(max, Math.max(0, finite(value)));
    bar.setAttribute('aria-valuemax', String(max));
    bar.setAttribute('aria-valuenow', String(current));
    bar.style.setProperty('--battle-fill', (current / max * 100) + '%');
    output.textContent = Math.round(current) + '/' + Math.round(max);
  }

  open({ encounter = {}, state } = {}) {
    if (this.element.hidden) this.previousFocus = document.activeElement;
    this.encounter = encounter;
    this.setFloatingNumbers(null);
    this.element.hidden = false;
    document.body.classList.add('battle-open');
    this.refs.location.textContent = String(encounter.location || encounter.biomeLabel || 'Rencontre · Aqualys');
    this.refs.title.textContent = String(encounter.title || encounter.name || 'Un courant à apaiser');
    this.setState(state || {}, { feedback: String(encounter.description || 'Observez le courant, protégez Luma et préparez vos gestes.') });
    const firstAction = this.refs.actions.querySelector('button:not([disabled])');
    (this.state?.status === 'active' ? (firstAction || this.refs.retreat) : this.refs.close).focus({ preventScroll: true });
  }

  setState(state, { busy = false, feedback = '', events = [] } = {}) {
    if (!state || typeof state !== 'object') return;
    const previousStatus = this.state?.status;
    this.state = state;
    this.busy = Boolean(busy);
    const status = state.status || 'active';
    const luma = state.luma || {};
    const opponent = state.opponent || {};
    const intent = state.intent || opponent.intent || {};
    this.element.dataset.battleState = status;
    this.element.dataset.battleBusy = String(this.busy);
    this.refs.lumaName.textContent = String(luma.name || 'Luma');
    this.refs.opponentName.textContent = String(opponent.name || 'Agitation du courant');
    this.#setBar(this.refs.serenity, this.refs.serenityValue, luma.serenity ?? luma.resolve, luma.maxSerenity ?? luma.maxResolve);
    this.#setBar(this.refs.agitation, this.refs.agitationValue, opponent.resolve, opponent.maxResolve);
    this.#setBar(this.refs.energy, this.refs.energyValue, luma.energy, luma.maxEnergy);
    this.refs.turn.textContent = 'Tour ' + Math.max(1, finite(state.turn, 1));
    this.refs.intent.dataset.battleIntent = String(intent.id || 'none');
    this.refs.intentLabel.textContent = status === 'active' ? String(intent.label || 'Le courant se prépare') : 'La rencontre est terminée';
    this.refs.intentDescription.textContent = status === 'active' && intent.description ? ' · ' + String(intent.description) : '';
    this.refs.intent.title = this.refs.intentLabel.textContent + this.refs.intentDescription.textContent;

    const combo = state.combo || {};
    this.refs.combo.dataset.battleCombo = combo.ready ? 'ready' : 'none';
    this.refs.combo.textContent = combo.ready
      ? String(combo.label || 'Enchaînement préparé') + (finite(combo.turnsRemaining) > 0 ? ' · ' + finite(combo.turnsRemaining) + ' tours' : '')
      : opponent.weakness ? 'Courant sensible : ' + elementLabel(opponent.weakness) : 'Observez pour lire le courant.';
    this.refs.combo.title = this.refs.combo.textContent;
    const messages = events.map((event) => event?.text).filter(Boolean);
    const text = feedback || messages.slice(-2).join(' ');
    if (text) {
      this.refs.feedback.textContent = String(text);
      this.refs.feedback.title = String(text);
    }
    this.#renderActions();
    const ended = status !== 'active';
    this.refs.close.disabled = this.busy;
    this.refs.retreat.disabled = this.busy;
    this.refs.actions.hidden = ended;
    this.refs.result.hidden = !ended;
    this.refs.retreat.hidden = ended;
    this.refs.hint.hidden = ended;
    if (ended) {
      const outcome = OUTCOME_COPY[status] || OUTCOME_COPY.retreat;
      this.refs.resultTitle.textContent = outcome.title;
      this.refs.resultDescription.textContent = String(state.resultDescription || outcome.description);
      if (!this.busy && !this.element.hidden && (previousStatus !== status || !this.refs.result.contains(document.activeElement))) this.refs.close.focus({ preventScroll: true });
    } else if (!this.busy && this.lastActionId) {
      const button = this.actionButtons.get(this.lastActionId);
      const focused = document.activeElement;
      if (focused === document.body || (this.refs.actions.contains(focused) && focused.disabled)) {
        const next = button && !button.disabled ? button : this.refs.actions.querySelector('button:not([disabled])');
        next?.focus({ preventScroll: true });
      }
    }
  }

  /** Six DOM nodes mirror the arena's bounded, already projected effect pool. */
  setFloatingNumbers(floats) {
    for (let index = 0; index < this.floatingNodes.length; index += 1) {
      const node = this.floatingNodes[index];
      const effect = floats?.[index];
      const visible = !this.element.hidden && Boolean(effect?.active) &&
        finite(effect.duration) > 0 && finite(effect.age) < finite(effect.duration) &&
        Number.isFinite(effect.screenX) && Number.isFinite(effect.screenY);
      node.hidden = !visible;
      if (!visible) continue;
      const label = String(effect.text || (effect.amount ? Math.round(effect.amount) : ''));
      if (node.textContent !== label) node.textContent = label;
      if (node.dataset.actor !== effect.actor) node.dataset.actor = effect.actor || 'opponent';
      node.style.left = (effect.screenX * 100) + '%';
      node.style.top = (effect.screenY * 100) + '%';
      node.style.opacity = String(Math.min(1, Math.max(0, (1 - effect.age / effect.duration) * 3)));
    }
  }

  close() {
    if (this.element.hidden || this.busy) return;
    this.element.hidden = true;
    this.setFloatingNumbers(null);
    document.body.classList.remove('battle-open');
    this.busy = false;
    const previousFocus = this.previousFocus;
    this.previousFocus = null;
    this.onClose?.();
    if (previousFocus?.isConnected && !previousFocus.inert && previousFocus.getClientRects?.().length) {
      previousFocus.focus?.({ preventScroll: true });
    }
  }

  destroy() {
    this.busy = false;
    this.close();
    this.abortController.abort();
    this.actionButtons.clear();
    this.element.remove();
  }
}

export default BattlePanel;
