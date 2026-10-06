const BUTTON_NAMES = Object.freeze(['action', 'dive', 'ascend', 'sprint']);

const KEY_TO_BUTTON = Object.freeze({
  KeyE: 'action',
  KeyF: 'action',
  Enter: 'action',
  KeyQ: 'dive',
  KeyC: 'dive',
  ControlLeft: 'dive',
  ControlRight: 'dive',
  Space: 'ascend',
  KeyR: 'ascend',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
});

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);

function clampUnitPair(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 1 || length === 0) return { x, y };
  return { x: x / length, y: y / length };
}

function resolveElement(value, scope) {
  if (!value) return null;
  if (typeof value === 'string') return scope?.querySelector(value) || null;
  return value;
}

/**
 * Unifies keyboard, pointer, touch joystick and programmatic HUD input.
 *
 * Public integration surface:
 * - `getState()` returns `{ move, look, action, dive, ascend, sprint }`;
 * - `consumePressed(name)` consumes a one-frame button edge;
 * - `consumeLookDelta()` consumes pointer/touch camera drag in pixels;
 * - `setMove`, `setLook`, and `setAction` accept input from another HUD;
 * - `attachVirtualControls(elements)` binds existing DOM controls;
 * - `destroy()` removes listeners and generated controls.
 */
export class InputController {
  constructor({
    canvas,
    root,
    createTouchControls = 'auto',
    preventDefault = true,
    onInputModeChange,
  } = {}) {
    if (!canvas) throw new Error('InputController requires a canvas element.');

    this.canvas = canvas;
    this.document = canvas.ownerDocument || globalThis.document;
    this.window = this.document?.defaultView || globalThis.window;
    this.root = root || this.document?.body;
    this.preventDefault = preventDefault;
    this.onInputModeChange = onInputModeChange;

    this._listeners = [];
    this._keys = new Set();
    this._keyboardButtons = Object.create(null);
    this._virtualButtons = Object.create(null);
    this._externalButtons = Object.create(null);
    this._pressed = new Set();
    this._moveJoystick = { x: 0, y: 0 };
    this._externalMove = { x: 0, y: 0 };
    this._externalLook = { x: 0, y: 0 };
    this._lookDelta = { x: 0, y: 0, pointerType: 'mouse' };
    this._lookPointer = null;
    this._mode = 'keyboard';
    this._touchOverlay = null;
    this._customControlsCleanup = null;
    this._previousTouchAction = canvas.style.touchAction;
    this._previousUserSelect = canvas.style.userSelect;

    this.state = {
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      action: false,
      dive: false,
      ascend: false,
      sprint: false,
      inputMode: this._mode,
    };

    for (const name of BUTTON_NAMES) {
      this._keyboardButtons[name] = false;
      this._virtualButtons[name] = false;
      this._externalButtons[name] = false;
    }

    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    this._bindBaseEvents();

    const coarsePointer = this.window?.matchMedia?.('(pointer: coarse)').matches;
    const shouldCreateTouch = createTouchControls === true
      || (createTouchControls === 'auto' && coarsePointer);
    if (shouldCreateTouch) this._createTouchControls();
  }

  _listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    this._listeners.push([target, type, handler, options]);
  }

  _setMode(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this.state.inputMode = mode;
    this.onInputModeChange?.(mode);
  }

  _isInterfaceTarget(event, buttonKeysOnly = false) {
    const targets = event.composedPath?.() || [event.target];
    return targets.some((target) => {
      if (target === this.canvas) return false;
      if (target?.closest?.(
        'input, select, textarea, [role="dialog"], [contenteditable=""], [contenteditable="true"]',
      )) return true;
      const button = target?.closest?.('button, a[href], [role="button"]');
      return Boolean(button && (!buttonKeysOnly || [
        'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      ].includes(event.code)));
    });
  }

  _bindBaseEvents() {
    this._listen(this.window, 'keydown', (event) => {
      if (event.defaultPrevented || this._isInterfaceTarget(event, true)) return;
      const isMovement = MOVEMENT_KEYS.has(event.code);
      const button = KEY_TO_BUTTON[event.code];
      if (!isMovement && !button) return;
      if (this.preventDefault) event.preventDefault();
      this._setMode('keyboard');
      this._keys.add(event.code);
      if (button) this._setButtonSource('keyboard', button, true);
      this._updateMoveState();
    }, { passive: false });

    this._listen(this.window, 'keyup', (event) => {
      const isMovement = MOVEMENT_KEYS.has(event.code);
      const button = KEY_TO_BUTTON[event.code];
      if (!isMovement && !button) return;
      if (this.preventDefault && !this._isInterfaceTarget(event)) event.preventDefault();
      this._keys.delete(event.code);
      if (button) this._setButtonSource('keyboard', button, false);
      this._updateMoveState();
    }, { passive: false });

    this._listen(this.window, 'blur', () => this.reset());
    this._listen(this.canvas, 'contextmenu', (event) => event.preventDefault());

    this._listen(this.canvas, 'pointerdown', (event) => {
      if (this._lookPointer !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
      this.canvas.focus?.({ preventScroll: true });
      this._lookPointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType || 'mouse',
      };
      this._setMode(event.pointerType === 'touch' ? 'touch' : 'pointer');
      this.canvas.setPointerCapture?.(event.pointerId);
      if (this.preventDefault) event.preventDefault();
    }, { passive: false });

    this._listen(this.canvas, 'pointermove', (event) => {
      if (!this._lookPointer || event.pointerId !== this._lookPointer.id) return;
      const movementX = event.pointerType === 'mouse' && Number.isFinite(event.movementX)
        ? event.movementX
        : event.clientX - this._lookPointer.x;
      const movementY = event.pointerType === 'mouse' && Number.isFinite(event.movementY)
        ? event.movementY
        : event.clientY - this._lookPointer.y;
      this._lookDelta.x += movementX;
      this._lookDelta.y += movementY;
      this._lookDelta.pointerType = this._lookPointer.type;
      this._lookPointer.x = event.clientX;
      this._lookPointer.y = event.clientY;
      if (this.preventDefault) event.preventDefault();
    }, { passive: false });

    const endLook = (event) => {
      if (!this._lookPointer || event.pointerId !== this._lookPointer.id) return;
      this.canvas.releasePointerCapture?.(event.pointerId);
      this._lookPointer = null;
    };
    this._listen(this.canvas, 'pointerup', endLook);
    this._listen(this.canvas, 'pointercancel', endLook);
  }

  _setButtonSource(source, name, pressed) {
    if (!BUTTON_NAMES.includes(name)) return;
    const sourceState = source === 'keyboard'
      ? this._keyboardButtons
      : source === 'virtual'
        ? this._virtualButtons
        : this._externalButtons;
    const wasDown = this.isDown(name);
    sourceState[name] = Boolean(pressed);
    const isDown = this.isDown(name);
    this.state[name] = isDown;
    if (!wasDown && isDown) this._pressed.add(name);
  }

  _updateMoveState() {
    const keyboardX = (this._keys.has('KeyD') || this._keys.has('ArrowRight') ? 1 : 0)
      - (this._keys.has('KeyA') || this._keys.has('ArrowLeft') ? 1 : 0);
    const keyboardY = (this._keys.has('KeyW') || this._keys.has('ArrowUp') ? 1 : 0)
      - (this._keys.has('KeyS') || this._keys.has('ArrowDown') ? 1 : 0);
    const combined = clampUnitPair(
      keyboardX + this._moveJoystick.x + this._externalMove.x,
      keyboardY + this._moveJoystick.y + this._externalMove.y,
    );
    this.state.move.x = combined.x;
    this.state.move.y = combined.y;
  }

  _bindJoystick(element, output, knob) {
    let activePointer = null;
    const move = (event) => {
      if (activePointer !== event.pointerId) return;
      const rect = element.getBoundingClientRect();
      const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.36);
      let dx = event.clientX - (rect.left + rect.width / 2);
      let dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy);
      if (length > radius) {
        dx = (dx / length) * radius;
        dy = (dy / length) * radius;
      }
      output.x = dx / radius;
      output.y = -dy / radius;
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this._updateMoveState();
      if (this.preventDefault) event.preventDefault();
    };
    const down = (event) => {
      if (activePointer !== null) return;
      activePointer = event.pointerId;
      element.setPointerCapture?.(event.pointerId);
      this._setMode('touch');
      move(event);
    };
    const up = (event) => {
      if (activePointer !== event.pointerId) return;
      activePointer = null;
      output.x = 0;
      output.y = 0;
      if (knob) knob.style.transform = 'translate(0px, 0px)';
      this._updateMoveState();
    };
    this._listen(element, 'pointerdown', down, { passive: false });
    this._listen(element, 'pointermove', move, { passive: false });
    this._listen(element, 'pointerup', up);
    this._listen(element, 'pointercancel', up);
  }

  _bindButton(element, name) {
    if (!element) return;
    const down = (event) => {
      this._setMode('touch');
      this._setButtonSource('virtual', name, true);
      element.setPointerCapture?.(event.pointerId);
      element.dataset.pressed = 'true';
      if (this.preventDefault) event.preventDefault();
      event.stopPropagation();
    };
    const up = (event) => {
      this._setButtonSource('virtual', name, false);
      delete element.dataset.pressed;
      event.stopPropagation();
    };
    this._listen(element, 'pointerdown', down, { passive: false });
    this._listen(element, 'pointerup', up);
    this._listen(element, 'pointercancel', up);
    this._listen(element, 'lostpointercapture', up);
  }

  _createTouchControls() {
    if (!this.document || !this.root || this._touchOverlay) return;
    const overlay = this.document.createElement('div');
    overlay.className = 'seal-input-layer';
    overlay.dataset.generatedControls = 'true';
    Object.assign(overlay.style, {
      position: this.root === this.document.body ? 'fixed' : 'absolute',
      inset: '0',
      zIndex: '30',
      pointerEvents: 'none',
      touchAction: 'none',
      userSelect: 'none',
    });

    const joystick = this.document.createElement('div');
    joystick.className = 'seal-move-joystick';
    joystick.setAttribute('role', 'application');
    joystick.setAttribute('aria-label', 'Joystick de deplacement');
    Object.assign(joystick.style, {
      position: 'absolute',
      left: 'max(20px, env(safe-area-inset-left))',
      bottom: 'max(22px, env(safe-area-inset-bottom))',
      width: '118px',
      height: '118px',
      borderRadius: '50%',
      border: '1px solid rgba(213, 247, 244, .42)',
      background: 'rgba(4, 30, 37, .28)',
      boxShadow: 'inset 0 0 22px rgba(71, 224, 216, .12)',
      pointerEvents: 'auto',
      touchAction: 'none',
      backdropFilter: 'blur(3px)',
    });
    const knob = this.document.createElement('div');
    Object.assign(knob.style, {
      position: 'absolute',
      left: '36px',
      top: '36px',
      width: '46px',
      height: '46px',
      borderRadius: '50%',
      background: 'rgba(189, 242, 235, .58)',
      border: '1px solid rgba(255,255,255,.72)',
      boxShadow: '0 4px 15px rgba(0, 13, 18, .3)',
      transition: 'transform 45ms linear',
      pointerEvents: 'none',
    });
    joystick.append(knob);

    const actionTray = this.document.createElement('div');
    Object.assign(actionTray.style, {
      position: 'absolute',
      right: 'max(18px, env(safe-area-inset-right))',
      bottom: 'max(20px, env(safe-area-inset-bottom))',
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 64px)',
      gap: '10px',
      alignItems: 'end',
      pointerEvents: 'none',
    });

    const makeButton = (name, label, glyph) => {
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = `seal-input-${name}`;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<span aria-hidden="true">${glyph}</span>`;
      Object.assign(button.style, {
        width: name === 'action' ? '72px' : '58px',
        height: name === 'action' ? '72px' : '58px',
        borderRadius: '50%',
        border: '1px solid rgba(220, 255, 250, .52)',
        color: '#effffc',
        background: name === 'action'
          ? 'rgba(34, 178, 169, .56)'
          : 'rgba(4, 30, 37, .48)',
        boxShadow: '0 5px 18px rgba(0, 13, 18, .3)',
        font: '600 11px/1 system-ui, sans-serif',
        letterSpacing: '.02em',
        pointerEvents: 'auto',
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
      });
      this._bindButton(button, name);
      return button;
    };

    const sprint = makeButton('sprint', 'Acceleration', 'VITE');
    const action = makeButton('action', 'Interagir', 'ECHO');
    const ascend = makeButton('ascend', 'Remonter', 'HAUT');
    const dive = makeButton('dive', 'Plonger', 'BAS');
    actionTray.append(sprint, action, ascend, dive);
    overlay.append(joystick, actionTray);
    this.root.append(overlay);
    this._touchOverlay = overlay;
    this._bindJoystick(joystick, this._moveJoystick, knob);
  }

  /**
   * Binds controls rendered by another HUD. Elements may be nodes or selectors.
   * Calling this method again replaces only the previous custom bindings.
   */
  attachVirtualControls({
    moveZone,
    moveKnob,
    actionButton,
    diveButton,
    ascendButton,
    sprintButton,
    scope = this.document,
  } = {}) {
    this._customControlsCleanup?.();
    const listenerStart = this._listeners.length;
    const zone = resolveElement(moveZone, scope);
    if (zone) {
      this._bindJoystick(
        zone,
        this._moveJoystick,
        resolveElement(moveKnob, scope),
      );
    }
    this._bindButton(resolveElement(actionButton, scope), 'action');
    this._bindButton(resolveElement(diveButton, scope), 'dive');
    this._bindButton(resolveElement(ascendButton, scope), 'ascend');
    this._bindButton(resolveElement(sprintButton, scope), 'sprint');

    const cleanup = () => {
      const customListeners = this._listeners.splice(listenerStart);
      for (const [target, type, handler, options] of customListeners) {
        target.removeEventListener(type, handler, options);
      }
    };
    this._customControlsCleanup = cleanup;
    return cleanup;
  }

  /** Programmatic movement input, normally supplied by an external HUD. */
  setMove(x = 0, y = 0) {
    const value = clampUnitPair(Number(x) || 0, Number(y) || 0);
    this._externalMove.x = value.x;
    this._externalMove.y = value.y;
    if (value.x || value.y) this._setMode('touch');
    this._updateMoveState();
  }

  /** Programmatic continuous camera axis in the -1..1 range. */
  setLook(x = 0, y = 0) {
    const value = clampUnitPair(Number(x) || 0, Number(y) || 0);
    this._externalLook.x = value.x;
    this._externalLook.y = value.y;
    this.state.look.x = value.x;
    this.state.look.y = value.y;
  }

  /** Programmatic button input: action, dive, ascend or sprint. */
  setAction(name, pressed) {
    if (pressed) this._setMode('touch');
    this._setButtonSource('external', name, pressed);
  }

  isDown(name) {
    return Boolean(
      this._keyboardButtons[name]
      || this._virtualButtons[name]
      || this._externalButtons[name]
    );
  }

  consumePressed(name) {
    const pressed = this._pressed.has(name);
    this._pressed.delete(name);
    return pressed;
  }

  consumeLookDelta() {
    const result = {
      x: this._lookDelta.x,
      y: this._lookDelta.y,
      pointerType: this._lookDelta.pointerType,
    };
    this._lookDelta.x = 0;
    this._lookDelta.y = 0;
    return result;
  }

  /** Returns a stable read-only-by-convention input snapshot. */
  getState() {
    this._updateMoveState();
    for (const name of BUTTON_NAMES) this.state[name] = this.isDown(name);
    return this.state;
  }

  showTouchControls(visible = true) {
    if (!this._touchOverlay && visible) this._createTouchControls();
    if (this._touchOverlay) this._touchOverlay.hidden = !visible;
  }

  reset() {
    this._keys.clear();
    for (const name of BUTTON_NAMES) {
      this._keyboardButtons[name] = false;
      this._virtualButtons[name] = false;
      this.state[name] = this._externalButtons[name];
    }
    this._moveJoystick.x = 0;
    this._moveJoystick.y = 0;
    this._lookDelta.x = 0;
    this._lookDelta.y = 0;
    this._lookPointer = null;
    this._pressed.clear();
    this._updateMoveState();
  }

  destroy() {
    this._customControlsCleanup = null;
    for (const [target, type, handler, options] of this._listeners.splice(0)) {
      target.removeEventListener(type, handler, options);
    }
    this._touchOverlay?.remove();
    this._touchOverlay = null;
    this.canvas.style.touchAction = this._previousTouchAction;
    this.canvas.style.userSelect = this._previousUserSelect;
    this.reset();
  }
}

export default InputController;
