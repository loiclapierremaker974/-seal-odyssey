import * as THREE from 'three';
import {
  CAMERA,
  MOVEMENT,
  VITALS,
  WORLD,
} from '../config/gameplay.js';

const UP = new THREE.Vector3(0, 1, 0);

function expStep(responsiveness, delta) {
  return 1 - Math.exp(-responsiveness * delta);
}

function dampAngle(current, target, responsiveness, delta) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * expStep(responsiveness, delta);
}

function clampVital(value, maximum) {
  return THREE.MathUtils.clamp(Number(value) || 0, 0, maximum);
}

/**
 * Camera-relative controller for Luma on land, at the surface and underwater.
 *
 * `environment` is intentionally duck-typed.  AelysScene implements the two
 * expected methods: `getEnvironmentAt(position)` and `interact(position)`.
 * The state can be polled with `getState()` while hooks keep a HUD or save
 * model synchronized without coupling rendering to the data layer.
 */
export class GuardianController {
  constructor({
    object,
    camera,
    input,
    environment,
    initialEnergy = VITALS.maxEnergy,
    initialOxygen = VITALS.maxOxygen,
    onVitalsChange,
    onModeChange,
    onStateChange,
    onAction,
  } = {}) {
    if (!object) throw new Error('GuardianController requires a controlled object.');
    if (!camera) throw new Error('GuardianController requires a camera.');
    if (!input) throw new Error('GuardianController requires an InputController.');

    this.object = object;
    this.camera = camera;
    this.input = input;
    this.environment = environment;
    this.onVitalsChange = onVitalsChange;
    this.onModeChange = onModeChange;
    this.onStateChange = onStateChange;
    this.onAction = onAction;
    this.enabled = true;

    this.velocity = new THREE.Vector3();
    this.yaw = CAMERA.initialYaw;
    this.pitch = CAMERA.initialPitch;
    this._cameraLookTarget = object.position.clone();
    this._lastVitals = { energy: -1, oxygen: -1 };
    this._energyRecoveryClock = VITALS.energyRecoveryDelay;
    this._lastMode = null;
    this._lastSprinting = false;
    this._touchDiveDirection = -1;

    this.state = {
      mode: 'land',
      energy: clampVital(initialEnergy, VITALS.maxEnergy),
      oxygen: clampVital(initialOxygen, VITALS.maxOxygen),
      maxEnergy: VITALS.maxEnergy,
      maxOxygen: VITALS.maxOxygen,
      speed: 0,
      normalizedSpeed: 0,
      moving: false,
      sprinting: false,
      grounded: true,
      forcedAscent: false,
      lastInteraction: null,
    };

    const sample = this._sampleEnvironment(this.object.position);
    this.state.mode = this._resolveMode(sample, 'land');
    this._snapToValidHeight(sample);
    this._snapCamera();
    this._emitState(true);
  }

  _sampleEnvironment(position) {
    const sample = this.environment?.getEnvironmentAt?.(position) || {};
    return {
      waterLevel: Number.isFinite(sample.waterLevel) ? sample.waterLevel : WORLD.waterLevel,
      groundHeight: Number.isFinite(sample.groundHeight)
        ? sample.groundHeight
        : WORLD.seaFloor,
      current: sample.current?.isVector3
        ? sample.current
        : new THREE.Vector3(
          Number(sample.current?.x) || 0,
          Number(sample.current?.y) || 0,
          Number(sample.current?.z) || 0,
        ),
      ...sample,
    };
  }

  _resolveMode(sample, previousMode = this.state.mode) {
    const { waterLevel, groundHeight } = sample;
    const y = this.object.position.y;
    const shoreIsLand = groundHeight >= waterLevel - 0.14;

    if (shoreIsLand && y <= groundHeight + 0.72) return 'land';
    if (previousMode === 'underwater' && y < waterLevel - 0.22) return 'underwater';
    if (y < waterLevel - 0.52) return 'underwater';
    return 'surface';
  }

  _snapToValidHeight(sample) {
    if (this.state.mode === 'land') {
      this.object.position.y = sample.groundHeight + MOVEMENT.bodyClearance;
      this.velocity.y = 0;
    } else if (this.state.mode === 'surface') {
      this.object.position.y = Math.max(
        this.object.position.y,
        sample.waterLevel + MOVEMENT.surfaceFloatHeight,
      );
    } else {
      this.object.position.y = Math.max(
        this.object.position.y,
        sample.groundHeight + MOVEMENT.bodyClearance,
      );
    }
  }

  _applyLook(delta, inputState) {
    const pointerDelta = this.input.consumeLookDelta?.() || { x: 0, y: 0 };
    const pointerSensitivity = pointerDelta.pointerType === 'touch'
      ? CAMERA.touchLookSensitivity
      : CAMERA.lookSensitivity;
    this.yaw -= pointerDelta.x * pointerSensitivity;
    this.pitch += pointerDelta.y * pointerSensitivity;

    const lookAxis = inputState.look || { x: 0, y: 0 };
    this.yaw -= lookAxis.x * 1.9 * delta;
    this.pitch -= lookAxis.y * 1.55 * delta;
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.minPitch, CAMERA.maxPitch);
  }

  _movementBasis(mode, inputState) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (mode === 'underwater') {
      const movementPitch = THREE.MathUtils.clamp(this.pitch * 0.72, -0.38, 0.55);
      forward.multiplyScalar(Math.cos(movementPitch));
      forward.y = -Math.sin(movementPitch);
    }
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const desired = forward.multiplyScalar(inputState.move.y)
      .addScaledVector(right, inputState.move.x);
    if (desired.lengthSq() > 1) desired.normalize();
    return desired;
  }

  _updateVitals(delta, underwater, sprinting, moving) {
    if (sprinting) {
      const cost = underwater
        ? VITALS.underwaterSprintEnergyPerSecond
        : VITALS.sprintEnergyPerSecond;
      this.state.energy = clampVital(this.state.energy - cost * delta, VITALS.maxEnergy);
      this._energyRecoveryClock = 0;
    } else {
      this._energyRecoveryClock += delta;
      if (this._energyRecoveryClock >= VITALS.energyRecoveryDelay) {
        const recovery = moving ? 0.64 : 1;
        this.state.energy = clampVital(
          this.state.energy + VITALS.energyRecoveryPerSecond * recovery * delta,
          VITALS.maxEnergy,
        );
      }
    }

    if (underwater) {
      const oxygenCost = VITALS.oxygenUsePerSecond
        * (sprinting ? VITALS.oxygenSprintMultiplier : 1);
      this.state.oxygen = clampVital(
        this.state.oxygen - oxygenCost * delta,
        VITALS.maxOxygen,
      );
    } else {
      this.state.oxygen = clampVital(
        this.state.oxygen + VITALS.oxygenRecoveryPerSecond * delta,
        VITALS.maxOxygen,
      );
    }
    this.state.forcedAscent = underwater && this.state.oxygen <= 0.01;
  }

  _updateLand(delta, desiredDirection, speed, sample) {
    const target = desiredDirection.multiplyScalar(speed);
    const blend = expStep(MOVEMENT.landAcceleration, delta);
    this.velocity.x += (target.x - this.velocity.x) * blend;
    this.velocity.z += (target.z - this.velocity.z) * blend;
    this.velocity.y = 0;
    this.object.position.addScaledVector(this.velocity, delta);

    const nextSample = this._sampleEnvironment(this.object.position);
    if (nextSample.groundHeight >= nextSample.waterLevel - 0.14) {
      this.object.position.y = nextSample.groundHeight + MOVEMENT.bodyClearance;
    } else {
      this.object.position.y += (
        nextSample.waterLevel + MOVEMENT.surfaceFloatHeight - this.object.position.y
      ) * expStep(6, delta);
    }
    return nextSample;
  }

  _updateSurface(delta, desiredDirection, speed, sample, inputState) {
    const target = desiredDirection.multiplyScalar(speed);
    const blend = expStep(MOVEMENT.waterAcceleration, delta);
    this.velocity.x += (target.x - this.velocity.x) * blend;
    this.velocity.z += (target.z - this.velocity.z) * blend;

    const surfaceY = sample.waterLevel + MOVEMENT.surfaceFloatHeight;
    let verticalTarget = THREE.MathUtils.clamp((surfaceY - this.object.position.y) * 5, -1.4, 1.4);
    if (inputState.dive) verticalTarget = -MOVEMENT.diveSpeed;
    if (inputState.ascend) verticalTarget = MOVEMENT.ascendSpeed;
    this.velocity.y += (verticalTarget - this.velocity.y) * expStep(5.5, delta);
    this.object.position.addScaledVector(this.velocity, delta);
    return this._sampleEnvironment(this.object.position);
  }

  _updateUnderwater(delta, desiredDirection, speed, sample, inputState) {
    let verticalInput = (inputState.ascend ? 1 : 0) - (inputState.dive ? 1 : 0);
    if (this.state.forcedAscent) verticalInput = 1;

    const target = desiredDirection.multiplyScalar(speed);
    if (verticalInput > 0) target.y += MOVEMENT.ascendSpeed * verticalInput;
    if (verticalInput < 0) target.y += MOVEMENT.diveSpeed * verticalInput;
    if (!verticalInput && Math.abs(inputState.move.y) < 0.08) target.y += MOVEMENT.buoyancy;
    target.addScaledVector(sample.current, 1);

    const blend = expStep(MOVEMENT.underwaterAcceleration, delta);
    this.velocity.lerp(target, blend);
    this.object.position.addScaledVector(this.velocity, delta);

    const nextSample = this._sampleEnvironment(this.object.position);
    const lowerBound = Math.max(MOVEMENT.maxDepth, nextSample.groundHeight + MOVEMENT.bodyClearance);
    if (this.object.position.y < lowerBound) {
      this.object.position.y = lowerBound;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    if (this.object.position.y > nextSample.waterLevel + MOVEMENT.surfaceFloatHeight) {
      this.object.position.y = nextSample.waterLevel + MOVEMENT.surfaceFloatHeight;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    return nextSample;
  }

  _rotateGuardian(delta, desiredDirection) {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed > 0.06) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.object.rotation.y = dampAngle(
        this.object.rotation.y,
        targetYaw,
        MOVEMENT.turnResponsiveness,
        delta,
      );
    }
    const targetPitch = this.state.mode === 'underwater' && this.state.speed > 0.12
      ? THREE.MathUtils.clamp(-Math.atan2(this.velocity.y, horizontalSpeed || 0.01) * 0.58, -0.45, 0.45)
      : 0;
    this.object.rotation.x += (
      targetPitch - this.object.rotation.x
    ) * expStep(MOVEMENT.turnResponsiveness * 0.65, delta);
    this.object.rotation.z += (0 - this.object.rotation.z) * expStep(7, delta);
  }

  _cameraParameters() {
    if (this.state.mode === 'underwater') {
      return {
        distance: CAMERA.distanceUnderwater,
        targetHeight: CAMERA.targetHeightUnderwater,
      };
    }
    if (this.state.mode === 'surface') {
      return {
        distance: CAMERA.distanceWater,
        targetHeight: CAMERA.targetHeightWater,
      };
    }
    return {
      distance: CAMERA.distanceLand,
      targetHeight: CAMERA.targetHeightLand,
    };
  }

  _cameraDestination() {
    const { distance, targetHeight } = this._cameraParameters();
    const target = this.object.position.clone().addScaledVector(UP, targetHeight);
    const horizontalDistance = Math.cos(this.pitch) * distance;
    const desired = target.clone().add(new THREE.Vector3(
      Math.sin(this.yaw) * horizontalDistance,
      Math.sin(this.pitch) * distance,
      Math.cos(this.yaw) * horizontalDistance,
    ));
    const cameraSample = this._sampleEnvironment(desired);
    desired.y = Math.max(
      desired.y,
      cameraSample.groundHeight + CAMERA.collisionClearance,
    );
    if (this.state.mode === 'underwater') {
      desired.y = Math.min(desired.y, cameraSample.waterLevel - 0.08);
    }
    return { target, desired };
  }

  _snapCamera() {
    const { target, desired } = this._cameraDestination();
    this._cameraLookTarget.copy(target);
    this.camera.position.copy(desired);
    this.camera.lookAt(target);
  }

  _updateCamera(delta) {
    const { target, desired } = this._cameraDestination();
    this._cameraLookTarget.lerp(target, expStep(CAMERA.targetResponsiveness, delta));
    this.camera.position.lerp(desired, expStep(CAMERA.positionResponsiveness, delta));
    this.camera.lookAt(this._cameraLookTarget);
  }

  _handleAction() {
    if (!this.input.consumePressed?.('action')) return;
    const result = this.environment?.interact?.(this.object.position) || {
      success: false,
      reason: 'no-interaction-handler',
    };
    this.state.lastInteraction = result;
    this.onAction?.(result, {
      position: this.object.position.clone(),
      state: this.getState(),
    });
  }

  _emitState(force = false) {
    const modeChanged = force || this.state.mode !== this._lastMode;
    const vitalChanged = force
      || Math.abs(this.state.energy - this._lastVitals.energy) >= 0.05
      || Math.abs(this.state.oxygen - this._lastVitals.oxygen) >= 0.05;
    if (vitalChanged) {
      this._lastVitals.energy = this.state.energy;
      this._lastVitals.oxygen = this.state.oxygen;
      this.onVitalsChange?.({
        energy: this.state.energy,
        oxygen: this.state.oxygen,
        maxEnergy: this.state.maxEnergy,
        maxOxygen: this.state.maxOxygen,
        mode: this.state.mode,
        forcedAscent: this.state.forcedAscent,
      });
    }

    if (modeChanged) {
      const previous = this._lastMode;
      this._lastMode = this.state.mode;
      this.onModeChange?.(this.state.mode, previous);
    }

    if (force || this.state.sprinting !== this._lastSprinting || modeChanged) {
      this._lastSprinting = this.state.sprinting;
      this.onStateChange?.(this.getState());
    }
  }

  /** Advances movement, vitals, proxy animation and camera by one frame. */
  update(delta) {
    const dt = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.05);
    const inputState = this.input.getState();
    this._applyLook(dt, inputState);

    if (!this.enabled || dt === 0) {
      this._updateCamera(Math.max(dt, 1 / 120));
      return this.getState();
    }

    let sample = this._sampleEnvironment(this.object.position);
    this.state.mode = this._resolveMode(sample, this.state.mode);
    if (this.input.consumePressed?.('dive')) {
      this._touchDiveDirection = inputState.inputMode === 'touch' && this.state.mode === 'underwater'
        ? 1
        : -1;
    }
    const effectiveInput = {
      ...inputState,
      dive: Boolean(inputState.dive && this._touchDiveDirection < 0),
      ascend: Boolean(
        inputState.ascend || (inputState.dive && this._touchDiveDirection > 0)
      ),
    };
    const desiredDirection = this._movementBasis(this.state.mode, effectiveInput);
    const moving = desiredDirection.lengthSq() > 0.008
      || effectiveInput.dive
      || effectiveInput.ascend;
    const wantsSprint = Boolean(effectiveInput.sprint && moving);
    const sprinting = wantsSprint && this.state.energy > VITALS.minimumSprintEnergy;
    const multiplier = sprinting ? MOVEMENT.sprintMultiplier : 1;

    let baseSpeed = MOVEMENT.landSpeed;
    if (this.state.mode === 'surface') baseSpeed = MOVEMENT.surfaceSpeed;
    if (this.state.mode === 'underwater') baseSpeed = MOVEMENT.underwaterSpeed;

    this._updateVitals(dt, this.state.mode === 'underwater', sprinting, moving);
    this.state.sprinting = sprinting && this.state.energy > 0;
    const speed = baseSpeed * (this.state.sprinting ? multiplier : 1);

    if (this.state.mode === 'land') {
      sample = this._updateLand(dt, desiredDirection, speed, sample);
    } else if (this.state.mode === 'surface') {
      sample = this._updateSurface(dt, desiredDirection, speed, sample, effectiveInput);
    } else {
      sample = this._updateUnderwater(dt, desiredDirection, speed, sample, effectiveInput);
    }

    this.state.mode = this._resolveMode(sample, this.state.mode);
    this.state.speed = this.velocity.length();
    this.state.normalizedSpeed = THREE.MathUtils.clamp(
      this.state.speed / (MOVEMENT.underwaterSpeed * MOVEMENT.sprintMultiplier),
      0,
      1,
    );
    this.state.moving = moving && this.state.speed > 0.05;
    this.state.grounded = this.state.mode === 'land';

    this._rotateGuardian(dt, desiredDirection);
    this.object.userData.update?.(dt, this.state);
    this._handleAction();
    this._updateCamera(dt);
    this._emitState();
    return this.getState();
  }

  /** Applies saved vitals without exposing mutable internal state. */
  setVitals({ energy = this.state.energy, oxygen = this.state.oxygen } = {}) {
    this.state.energy = clampVital(energy, VITALS.maxEnergy);
    this.state.oxygen = clampVital(oxygen, VITALS.maxOxygen);
    this._emitState(true);
  }

  teleport(position, { snapToEnvironment = true, snapCamera = true } = {}) {
    this.object.position.copy(position);
    this.velocity.set(0, 0, 0);
    const sample = this._sampleEnvironment(this.object.position);
    this.state.mode = this._resolveMode(sample, this.state.mode);
    if (snapToEnvironment) this._snapToValidHeight(sample);
    if (snapCamera) this._snapCamera();
    this._emitState(true);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.velocity.set(0, 0, 0);
  }

  getState() {
    return {
      ...this.state,
      position: this.object.position,
      velocity: this.velocity,
      cameraYaw: this.yaw,
      cameraPitch: this.pitch,
    };
  }

  dispose({ disposeInput = false } = {}) {
    if (disposeInput) this.input.destroy?.();
    this.velocity.set(0, 0, 0);
  }
}

export default GuardianController;
