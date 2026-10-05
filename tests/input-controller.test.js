import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../src/player/InputController.js';

function fixture() {
  class Target {
    constructor() { this.listeners = new Map(); this.style = {}; }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    emit(type, code, target = this) {
      const event = {
        code, target, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      };
      for (const callback of this.listeners.get(type) || []) callback(event);
      return event;
    }
  }
  const window = new Target();
  const canvas = new Target();
  canvas.ownerDocument = { defaultView: window };
  const input = new InputController({ canvas, createTouchControls: false });
  const button = { closest: () => button };
  return { window, canvas, input, button };
}

test('native button Enter/Space activation is not cancelled or sent to gameplay', () => {
  const { window, input, button } = fixture();
  assert.equal(window.emit('keydown', 'Enter', button).defaultPrevented, false);
  assert.equal(window.emit('keydown', 'Space', button).defaultPrevented, false);
  assert.equal(input.isDown('action'), false);
  assert.equal(input.isDown('ascend'), false);
  input.destroy();
});

test('canvas keyboard action still produces one input edge', () => {
  const { window, canvas, input } = fixture();
  assert.equal(window.emit('keydown', 'Enter', canvas).defaultPrevented, true);
  assert.equal(input.isDown('action'), true);
  assert.equal(input.consumePressed('action'), true);
  assert.equal(input.consumePressed('action'), false);
  window.emit('keyup', 'Enter', canvas);
  assert.equal(input.isDown('action'), false);
  input.destroy();
});

test('a key started in gameplay is released after focus moves into an interface', () => {
  const { window, canvas, input, button } = fixture();
  window.emit('keydown', 'KeyW', canvas);
  assert.equal(input.getState().move.y, 1);
  assert.equal(window.emit('keyup', 'KeyW', button).defaultPrevented, false);
  assert.equal(input.getState().move.y, 0);
  input.destroy();
});

test('interface arrows do not move the player and destroy detaches listeners', () => {
  const { window, canvas, input, button } = fixture();
  assert.equal(window.emit('keydown', 'ArrowUp', button).defaultPrevented, false);
  assert.equal(input.getState().move.y, 0);
  input.destroy();
  window.emit('keydown', 'KeyW', canvas);
  assert.equal(input.getState().move.y, 0);
});
