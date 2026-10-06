/**
 * Central gameplay and rendering tuning for the P0 vertical slice.
 *
 * All distances are expressed in Three.js world units, all speeds in units per
 * second, and all durations in seconds.  Keeping the values here lets the web
 * prototype evolve without scattering design constants through scene code.
 */

export const RENDER = Object.freeze({
  desktopPixelRatioCap: 1.75,
  mobilePixelRatioCap: 1.35,
  lowPowerPixelRatioCap: 1,
  desktopAntialias: true,
  mobileAntialias: false,
  shadowMapSize: 1024,
  cameraNear: 0.08,
  cameraFar: 150,
  fieldOfView: 52,
});

export const WORLD = Object.freeze({
  size: 96,
  waterLevel: 0,
  seaFloor: -4.6,
  islandCenter: Object.freeze({ x: 0, z: 5 }),
  islandRadius: 8.5,
  spawn: Object.freeze({ x: 0.25, y: 1.52, z: 5.6 }),
  ancientSiteId: 'site-onde-premiere',
  ancientSite: Object.freeze({ x: 0, z: -13 }),
});

export const ECHOES = Object.freeze([
  Object.freeze({
    id: 'echo-rivage',
    name: 'Echo du Rivage',
    position: Object.freeze({ x: 4.2, y: 1.25, z: 3.4 }),
    colour: 0xffd995,
  }),
  Object.freeze({
    id: 'echo-lagune',
    name: 'Echo de la Lagune',
    position: Object.freeze({ x: -6.1, y: -1.15, z: -0.4 }),
    colour: 0x70f5e3,
  }),
  Object.freeze({
    id: 'echo-profondeur',
    name: 'Echo des Profondeurs',
    position: Object.freeze({ x: 2.3, y: -3.25, z: -8.1 }),
    colour: 0x8fb6ff,
  }),
]);

export const MOVEMENT = Object.freeze({
  landSpeed: 3.25,
  surfaceSpeed: 3.8,
  underwaterSpeed: 4.25,
  sprintMultiplier: 1.65,
  landAcceleration: 11,
  waterAcceleration: 7,
  underwaterAcceleration: 5.5,
  landDrag: 9,
  waterDrag: 4.5,
  underwaterDrag: 2.5,
  turnResponsiveness: 10,
  diveSpeed: 2.8,
  ascendSpeed: 2.35,
  buoyancy: 0.34,
  surfaceFloatHeight: 0.12,
  bodyClearance: 0.025,
  maxDepth: -5.2,
});

export const VITALS = Object.freeze({
  maxEnergy: 100,
  maxOxygen: 100,
  sprintEnergyPerSecond: 17,
  underwaterSprintEnergyPerSecond: 21,
  energyRecoveryPerSecond: 13,
  energyRecoveryDelay: 0.6,
  minimumSprintEnergy: 4,
  oxygenUsePerSecond: 4.4,
  oxygenSprintMultiplier: 1.28,
  oxygenRecoveryPerSecond: 24,
  criticalOxygen: 18,
});

export const CAMERA = Object.freeze({
  distanceLand: 4.65,
  distanceWater: 5.5,
  distanceUnderwater: 5.8,
  targetHeightLand: 0.7,
  targetHeightWater: 0.45,
  targetHeightUnderwater: 0.15,
  initialYaw: 0.6,
  initialPitch: 0.02,
  minPitch: -0.28,
  maxPitch: 0.92,
  lookSensitivity: 0.0033,
  touchLookSensitivity: 0.0046,
  positionResponsiveness: 7.5,
  targetResponsiveness: 10,
  collisionClearance: 0.38,
});

export const INTERACTION = Object.freeze({
  echoRadius: 1.75,
  siteRadius: 2.8,
  promptRadius: 3.35,
});

/** A convenient aggregate for consumers that prefer one import. */
export const GAMEPLAY = Object.freeze({
  render: RENDER,
  world: WORLD,
  echoes: ECHOES,
  movement: MOVEMENT,
  vitals: VITALS,
  camera: CAMERA,
  interaction: INTERACTION,
});

export default GAMEPLAY;
