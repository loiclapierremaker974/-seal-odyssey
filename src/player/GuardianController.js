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
    onMotion,
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
    this.onMotion = onMotion;
    this.enabled = true;

    this.velocity = new THREE.Vector3();
    this._previousPosition = object.position.clone();
    this._jumpClock = 0;
    this._jumpLaunchY = 0;
    this._jumpPeakHeight = 0;
    this._jumpStartedFromRest = false;
    this._landingStrength = 1;
    this._verticalBlocked = false;
    this._waterImpactStrength = null;
    this._wasInWater = false;
    this.yaw = CAMERA.initialYaw;
    this.pitch = CAMERA.initialPitch;
    this._cameraFocus = null;
    this._cameraLookTarget = object.position.clone();
    this._lastVitals = { energy: -1, oxygen: -1 };
    this._energyRecoveryClock = VITALS.energyRecoveryDelay;
    this._lastMode = null;
    this._lastSprinting = false;
    this._lastMoving = null;
    this._lastJumpStage = null;
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
      jumpStage: 'idle',
      jumpPhase: 0,
      jumpHeight: 0,
      landing: 0,
      airborne: false,
      gaitPhase: 0,
      turn: 0,
      horizontalSpeed: 0,
      verticalSpeed: 0,
      overWater: false,
    };

    const sample = this._sampleEnvironment(this.object.position);
    this.state.mode = sample.groundHeight >= sample.waterLevel - 0.14
      ? 'land' : this._resolveMode(sample, 'land');
    this._snapToValidHeight(sample);
    this._updateMotionState(0, sample);
    this._wasInWater = this._isInWater(sample);
    this._snapCamera();
    this._emitState(true);
  }

  _sampleEnvironment(position) {
    const sample = this.environment?.getEnvironmentAt?.(position) || {};
    return {
      ...sample,
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
    };
  }

  _resolveMode(sample, previousMode = this.state.mode) {
    if (this.state.jumpStage === 'air') return 'land';
    const { waterLevel, groundHeight } = sample;
    const surfaceLevel = sample.surfaceHeight ?? waterLevel;
    const y = this.object.position.y;
    const shoreIsLand = groundHeight >= waterLevel - 0.14;

    if (shoreIsLand && y <= groundHeight + 0.72) return 'land';
    if (previousMode === 'underwater' && y < surfaceLevel - 0.22) return 'underwater';
    if (y < surfaceLevel - 0.52) return 'underwater';
    return 'surface';
  }

  _snapToValidHeight(sample) {
    if (this.state.mode === 'land') {
      this.object.position.y = sample.groundHeight + MOVEMENT.bodyClearance;
      this.velocity.y = 0;
    } else if (this.state.mode === 'surface') {
      const floatY = Math.max(sample.groundHeight + MOVEMENT.bodyClearance,
        (sample.surfaceHeight ?? sample.waterLevel) + MOVEMENT.surfaceFloatHeight);
      this.object.position.y = THREE.MathUtils.clamp(
        this.object.position.y, floatY, floatY + MOVEMENT.surfaceRiseAllowance);
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


  _setJumpStage(stage) {
    this._jumpClock = 0;
    this.state.jumpStage = stage;
    this.state.jumpPhase = 0;
    this.state.landing = 0;
    this.state.airborne = stage === 'air';
    if (stage === 'air') this.state.grounded = false;
  }

  _emitMotion(type, strength = 1, peakHeight = this._jumpPeakHeight) {
    const position = this.object.position.clone();
    const force = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1);
    this.environment?.emitLumaMotion?.(type, position.clone(), force);
    this.onMotion?.(type, { position, strength: force, peakHeight });
  }

  _consumeTransientInputs() {
    for (const name of ['dive', 'ascend', 'action', 'sprint']) {
      this.input.consumePressed?.(name);
    }
    const input = this.input.getState();
    if (input.dive || input.ascend) this._verticalBlocked = true;
  }

  /** Horizontal movement is corrected before the separate support/height pass. */
  _updateLand(delta, desiredDirection, speed) {
    const air = this.state.jumpStage === 'air';
    const rhythm = air ? 1 : .92 + .13 * Math.sin(this.state.gaitPhase);
    const anticipation = this.state.jumpStage === 'anticipation' ? .42 : 1;
    const target = desiredDirection.multiplyScalar(speed * rhythm * anticipation);
    const blend = expStep(air ? 2.2 : MOVEMENT.landAcceleration, delta);
    this.velocity.x += (target.x - this.velocity.x) * blend;
    this.velocity.z += (target.z - this.velocity.z) * blend;
    this.object.position.x += this.velocity.x * delta;
    this.object.position.z += this.velocity.z * delta;
    return this._sampleEnvironment(this.object.position);
  }

  _updateLandHeight(delta, sample) {
    let land = sample.groundHeight >= sample.waterLevel - 0.14;
    let groundY = sample.groundHeight + MOVEMENT.bodyClearance;
    let supportY = land ? groundY
      : Math.max(groundY, (sample.surfaceHeight ?? sample.waterLevel) + MOVEMENT.surfaceFloatHeight);
    let airDelta = delta;

    if (this.state.jumpStage === 'anticipation') {
      if (!land) {
        // The shore was left before takeoff: keep the input lock, cancel hop.
        this._setJumpStage('idle');
      } else {
        this.object.position.y = groundY;
        this.velocity.y = 0;
        this._jumpClock += delta;
        this.state.jumpPhase = Math.min(1,
          this._jumpClock / MOVEMENT.jumpAnticipation);
        if (this._jumpClock < MOVEMENT.jumpAnticipation) return sample;
        airDelta = Math.max(0,
          this._jumpClock - MOVEMENT.jumpAnticipation);
        this._setJumpStage('air');
        this._jumpLaunchY = this.object.position.y;
        this._jumpPeakHeight = 0;
        this.velocity.y = MOVEMENT.jumpVelocity;
        if (this._jumpStartedFromRest) {
          // A small impulse, then the ordinary land response gently brakes it.
          this.velocity.x += Math.sin(this.object.rotation.y) * MOVEMENT.jumpForwardImpulse;
          this.velocity.z += Math.cos(this.object.rotation.y) * MOVEMENT.jumpForwardImpulse;
        }
        const peak = MOVEMENT.jumpVelocity ** 2 /
          (2 * MOVEMENT.jumpGravity);
        this._emitMotion('hop', 1, peak);
      }
    }

    if (this.state.jumpStage === 'air') {
      this.object.position.y += this.velocity.y * airDelta
        - 0.5 * MOVEMENT.jumpGravity * airDelta * airDelta;
      this.velocity.y -= MOVEMENT.jumpGravity * airDelta;
      this._jumpClock += airDelta;
      this.state.jumpPhase = Math.min(1,
        this._jumpClock / MOVEMENT.jumpFlightTime);
      this._jumpPeakHeight = Math.max(this._jumpPeakHeight,
        this.object.position.y - this._jumpLaunchY);

      // A raised solid step blocks horizontal travel rather than teleporting
      // the seal upward through its underside.
      if (land && supportY > this._previousPosition.y + 0.06 &&
          this.object.position.y < supportY) {
        this.object.position.x = this._previousPosition.x;
        this.object.position.z = this._previousPosition.z;
        this.velocity.x = this.velocity.z = 0;
        sample = this._sampleEnvironment(this.object.position);
        land = sample.groundHeight >= sample.waterLevel - 0.14;
        groundY = sample.groundHeight + MOVEMENT.bodyClearance;
        supportY = land ? groundY
          : Math.max(groundY, (sample.surfaceHeight ?? sample.waterLevel) + MOVEMENT.surfaceFloatHeight);
      }

      if (this.object.position.y <= supportY &&
          (this.velocity.y <= 0 || land)) {
        const impact = Math.abs(this.velocity.y);
        this.object.position.y = supportY;
        if (land) {
          this._landingStrength = THREE.MathUtils.clamp(
            impact / MOVEMENT.jumpVelocity, 0.15, 1);
          this.velocity.y = 0;
          this._setJumpStage('landing');
          this.state.landing = this._landingStrength;
          this.state.grounded = true;
          this._emitMotion('land', this._landingStrength);
        } else {
          this._waterImpactStrength = THREE.MathUtils.clamp(
            impact / MOVEMENT.jumpVelocity, 0.25, 1);
          this.velocity.y = Math.max(-0.35, this.velocity.y);
          this._setJumpStage('idle');
          this._verticalBlocked = true;
        }
      }
      return sample;
    }

    if (this.state.jumpStage === 'landing') {
      this._jumpClock += delta;
      this.state.jumpPhase = Math.min(1,
        this._jumpClock / MOVEMENT.jumpLanding);
      this.state.landing = this._landingStrength *
        (1 - this.state.jumpPhase) ** 2;
      if (!land || this._jumpClock >= MOVEMENT.jumpLanding) {
        this._setJumpStage('idle');
      }
    }

    this.velocity.y = 0;
    if (land) this.object.position.y = groundY;
    else this.object.position.y +=
      (supportY - this.object.position.y) * expStep(6, delta);
    return sample;
  }

  _isInWater(sample) {
    const overWater = sample.groundHeight < sample.waterLevel - 0.14;
    // Hysteresis prevents small surface bobbing from repeating the entry cue.
    const margin = this._wasInWater ? 0.60 : MOVEMENT.surfaceRiseAllowance;
    return overWater && this.state.jumpStage !== 'air' &&
      this.object.position.y <=
        (sample.surfaceHeight ?? sample.waterLevel) + MOVEMENT.surfaceFloatHeight + margin + 1e-6;
  }

  _updateMotionState(delta, sample, distance = 0) {
    const land = sample.groundHeight >= sample.waterLevel - 0.14;
    const supportY = land ? sample.groundHeight + MOVEMENT.bodyClearance
      : Math.max(sample.groundHeight + MOVEMENT.bodyClearance,
          (sample.surfaceHeight ?? sample.waterLevel) + MOVEMENT.surfaceFloatHeight);
    this.state.overWater = !land;
    this.state.grounded = this.state.mode === 'land' &&
      this.state.jumpStage !== 'air' &&
      Math.abs(this.object.position.y - supportY) < 0.06;
    this.state.airborne = this.state.jumpStage === 'air' ||
      (land && !this.state.grounded &&
       this.object.position.y > supportY + 0.06);
    this.state.jumpHeight = this.state.airborne
      ? Math.max(0, this.object.position.y - supportY) : 0;
    this.state.horizontalSpeed = delta > 0 ? distance / delta : 0;
    this.state.verticalSpeed = this.velocity.y;
    this.state.speed = Math.hypot(
      this.state.horizontalSpeed, this.state.verticalSpeed);
    this.state.normalizedSpeed = THREE.MathUtils.clamp(
      this.state.speed /
        (MOVEMENT.underwaterSpeed * MOVEMENT.sprintMultiplier), 0, 1);
    this.state.moving = this.state.horizontalSpeed > 0.05 ||
      (this.state.mode !== 'land' && Math.abs(this.velocity.y) > 0.08);
    if (!this.state.airborne) {
      const stride = this.state.mode === 'land'
        ? MOVEMENT.landStrideLength : MOVEMENT.swimStrideLength;
      this.state.gaitPhase = (this.state.gaitPhase +
        distance / stride * Math.PI * 2) % (Math.PI * 2);
    }
  }

  _updateSurface(delta, desiredDirection, speed, sample, inputState) {
    const target = desiredDirection.multiplyScalar(speed);
    const blend = expStep(MOVEMENT.waterAcceleration, delta);
    this.velocity.x += (target.x - this.velocity.x) * blend;
    this.velocity.z += (target.z - this.velocity.z) * blend;

    const surfaceY = (sample.surfaceHeight ?? sample.waterLevel) + MOVEMENT.surfaceFloatHeight;
    let verticalTarget = THREE.MathUtils.clamp((surfaceY - this.object.position.y) * 5, -1.4, 1.4);
    if (inputState.dive) verticalTarget = -MOVEMENT.diveSpeed;
    const ascendLimit = surfaceY + MOVEMENT.surfaceRiseAllowance;
    const previousY = this.object.position.y;
    if (inputState.ascend) {
      verticalTarget = previousY < ascendLimit
        ? MOVEMENT.ascendSpeed : Math.min(0, verticalTarget);
    }
    this.velocity.y += (verticalTarget - this.velocity.y) * expStep(5.5, delta);
    this.object.position.addScaledVector(this.velocity, delta);
    if (inputState.ascend && previousY <= ascendLimit &&
        this.object.position.y > ascendLimit) {
      this.object.position.y = ascendLimit;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    const nextSample = this._sampleEnvironment(this.object.position);
    const lowerBound = nextSample.groundHeight + MOVEMENT.bodyClearance;
    if (this.object.position.y < lowerBound) {
      this.object.position.y=lowerBound;
      this.velocity.y=Math.max(0,this.velocity.y);
    }
    return nextSample;
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
    const upperBound = Math.max(lowerBound, (nextSample.surfaceHeight ?? nextSample.waterLevel) + MOVEMENT.surfaceFloatHeight);
    if (this.object.position.y > upperBound) {
      this.object.position.y = upperBound;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    return nextSample;
  }

  _rotateGuardian(delta, desiredDirection) {
    const previousYaw = this.object.rotation.y;
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
    const yawStep = Math.atan2(
      Math.sin(this.object.rotation.y - previousYaw),
      Math.cos(this.object.rotation.y - previousYaw));
    const turn = THREE.MathUtils.clamp(
      yawStep / Math.max(0.001, delta) * 0.14, -1, 1);
    this.state.turn += (turn - this.state.turn) * expStep(7, delta);
    const targetPitch = this.state.mode === 'underwater' && this.state.speed > 0.12
      ? THREE.MathUtils.clamp(-Math.atan2(this.velocity.y, horizontalSpeed || 0.01) * 0.58, -0.45, 0.45)
      : 0;
    this.object.rotation.x += (
      targetPitch - this.object.rotation.x
    ) * expStep(MOVEMENT.turnResponsiveness * 0.65, delta);
    this.object.rotation.z += (0 - this.object.rotation.z) * expStep(7, delta);
  }

  _cameraParameters() {
    if (this._cameraFocus) return this._cameraFocus;
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
    const yaw = this._cameraFocus?.yaw ?? this.yaw;
    const pitch = this._cameraFocus?.pitch ?? this.pitch;
    const horizontalDistance = Math.cos(pitch) * distance;
    const desired = target.clone().add(new THREE.Vector3(
      Math.sin(yaw) * horizontalDistance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * horizontalDistance,
    ));
    const cameraSample = this._sampleEnvironment(desired);
    desired.y = Math.max(
      desired.y,
      cameraSample.groundHeight + CAMERA.collisionClearance,
    );
    if (this.state.mode === 'underwater') {
      desired.y = Math.min(desired.y, (cameraSample.surfaceHeight ?? cameraSample.waterLevel) - 0.08);
    }
    this.environment?.resolveCameraPosition?.(target,desired);
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
    // Use Luma's current target so smoothing cannot retain an obstructed view.
    this.environment?.resolveCameraPosition?.(target,this.camera.position);
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

    if (force || this.state.sprinting !== this._lastSprinting || modeChanged ||
        this.state.moving !== this._lastMoving ||
        this.state.jumpStage !== this._lastJumpStage) {
      this._lastSprinting = this.state.sprinting;
      this._lastMoving = this.state.moving;
      this._lastJumpStage = this.state.jumpStage;
      this.onStateChange?.(this.getState());
    }
  }

  /** Advances movement, vitals, proxy animation and camera by one frame. */

  update(delta) {
    const dt = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.05);
    const inputState = this.input.getState();
    // Separate reads consume simultaneous keyboard/touch edges completely.
    const diveEdge = Boolean(this.input.consumePressed?.('dive'));
    const ascendEdge = Boolean(this.input.consumePressed?.('ascend'));
    this.input.consumePressed?.('sprint');
    const verticalHeld = Boolean(inputState.dive || inputState.ascend);
    if (!verticalHeld) this._verticalBlocked = false;
    this._applyLook(dt, inputState);

    if (!this.enabled || dt === 0) {
      this.input.consumePressed?.('action');
      if (verticalHeld) this._verticalBlocked = true;
      this.object.userData.update?.(dt, {
        ...this.state, speed: 0, horizontalSpeed: 0,
        moving: false, sprinting: false,
      });
      this._updateCamera(Math.max(dt, 1 / 120));
      return this.getState();
    }

    this._previousPosition.copy(this.object.position);
    const previousMode = this.state.mode;
    let sample = this._sampleEnvironment(this.object.position);
    this.state.mode = this._resolveMode(sample, previousMode);
    const movementMode = this.state.mode;
    const onGround = movementMode === 'land' &&
      this.state.jumpStage !== 'air' &&
      Math.abs(this.object.position.y -
        (sample.groundHeight + MOVEMENT.bodyClearance)) < 0.08;
    if (onGround && !this._verticalBlocked && this.state.jumpStage === 'idle' &&
        (diveEdge || ascendEdge)) {
      this._jumpStartedFromRest =
        Math.hypot(this.velocity.x, this.velocity.z) < 0.08 &&
        Math.hypot(inputState.move.x, inputState.move.y) < 0.08;
      this._setJumpStage('anticipation');
      this._verticalBlocked = true;
    }
    if ((this.state.jumpStage === 'air' ||
         this.state.jumpStage === 'anticipation') && verticalHeld) {
      this._verticalBlocked = true;
    }
    const verticalAllowed = movementMode !== 'land' &&
      !this._verticalBlocked;
    if (diveEdge && verticalAllowed) {
      this._touchDiveDirection =
        inputState.inputMode === 'touch' &&
        movementMode === 'underwater' ? 1 : -1;
    }
    const effectiveInput = {
      ...inputState,
      dive: Boolean(verticalAllowed && inputState.dive &&
        this._touchDiveDirection < 0),
      ascend: Boolean(verticalAllowed && (inputState.ascend ||
        (inputState.dive && this._touchDiveDirection > 0))),
    };
    const desiredDirection =
      this._movementBasis(movementMode, effectiveInput);
    const moving = desiredDirection.lengthSq() > 0.008 ||
      effectiveInput.dive || effectiveInput.ascend;
    const wantsSprint = Boolean(effectiveInput.sprint && moving);
    const sprinting = wantsSprint &&
      this.state.energy > VITALS.minimumSprintEnergy;
    let baseSpeed = MOVEMENT.landSpeed;
    if (movementMode === 'surface') baseSpeed = MOVEMENT.surfaceSpeed;
    if (movementMode === 'underwater') baseSpeed = MOVEMENT.underwaterSpeed;
    this._updateVitals(dt, movementMode === 'underwater',
      sprinting, moving);
    this.state.sprinting = sprinting && this.state.energy > 0;
    const speed = baseSpeed *
      (this.state.sprinting ? MOVEMENT.sprintMultiplier : 1);

    if (movementMode === 'land') {
      sample = this._updateLand(dt, desiredDirection, speed, sample);
    } else if (movementMode === 'surface') {
      sample = this._updateSurface(dt, desiredDirection, speed,
        sample, effectiveInput);
    } else {
      sample = this._updateUnderwater(dt, desiredDirection, speed,
        sample, effectiveInput);
    }

    const arrivalVelocityY = this.velocity.y;
    if (this.environment?.resolveMovement?.(this.object.position,
        this._previousPosition,
        this.object.userData.collisionRadius || 0.4)) {
      this.velocity.x = this.velocity.z = 0;
      sample = this._sampleEnvironment(this.object.position);
    }
    if (movementMode === 'land') {
      sample = this._updateLandHeight(dt, sample);
    } else if (sample.groundHeight >= sample.waterLevel - 0.14 &&
        this.object.position.y <=
        sample.groundHeight + MOVEMENT.bodyClearance) {
      this.object.position.y =
        sample.groundHeight + MOVEMENT.bodyClearance;
      this.velocity.y = 0;
    }

    this.state.mode = this._resolveMode(sample, this.state.mode);
    if (previousMode === 'land' && this.state.mode !== 'land' &&
        verticalHeld) this._verticalBlocked = true;
    const inWater = this._isInWater(sample);
    if (inWater && !this._wasInWater) {
      const strength = this._waterImpactStrength ??
        THREE.MathUtils.clamp(Math.abs(this.velocity.y) /
          MOVEMENT.jumpVelocity, 0.25, 1);
      this._verticalBlocked = true;
      this.velocity.y = Math.max(-0.35, this.velocity.y);
      this._emitMotion('splash', strength,
        this._waterImpactStrength === null ? 0 : this._jumpPeakHeight);
      this._waterImpactStrength = null;
    }
    this._wasInWater = inWater;
    const distance = Math.hypot(
      this.object.position.x - this._previousPosition.x,
      this.object.position.z - this._previousPosition.z);
    this._updateMotionState(dt, sample, distance);
    if (previousMode !== 'land' && this.state.grounded) {
      this._emitMotion('land', THREE.MathUtils.clamp(
        Math.abs(arrivalVelocityY) / MOVEMENT.jumpVelocity, 0.15, 0.5), 0);
    }
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
    this._setJumpStage('idle');
    this._jumpPeakHeight = 0;
    this._waterImpactStrength = null;
    this._consumeTransientInputs();
    this.object.position.copy(position);
    this.velocity.set(0, 0, 0);
    const sample = this._sampleEnvironment(this.object.position);
    this.state.mode = snapToEnvironment &&
      sample.groundHeight >= sample.waterLevel - 0.14
      ? 'land' : this._resolveMode(sample, this.state.mode);
    if (snapToEnvironment) this._snapToValidHeight(sample);
    this._updateMotionState(0, sample);
    this.state.sprinting = false;
    this.state.turn = 0;
    this._wasInWater = this._isInWater(sample);
    if (snapCamera) this._snapCamera();
    this._emitState(true);
  }


  /** A gentle portrait view during care; normal exploration settings persist. */
  setCameraFocus(focus = null) {
    this._cameraFocus = focus ? { distance: 2.8, targetHeight: .48, pitch: .12, yaw: this.object.rotation.y + .28, ...focus } : null;
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (next === this.enabled) return;
    this._consumeTransientInputs();
    this.enabled = next;
    if (!next) {
      this.velocity.x = this.velocity.z = 0;
      if (this.state.jumpStage !== 'air') this.velocity.y = 0;
      this.state.speed = this.state.normalizedSpeed = 0;
      this.state.horizontalSpeed = 0;
      this.state.moving = this.state.sprinting = false;
      this._emitState();
    }
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
