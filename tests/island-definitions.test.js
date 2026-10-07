import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCOUNTERS } from '../src/combat/encounters.js';
import { ECHOES, WORLD } from '../src/config/gameplay.js';
import { ISLANDS, EXPLORATION_ENCOUNTERS, islandById, isIslandFallbackLand } from '../src/world/islandDefinitions.js';
test('island cards keep canonical objectives and safe starting paths',()=>{
 assert.deepEqual(ISLANDS.map(i=>i.id),['rivage','lagune','ruines']);assert.deepEqual(ISLANDS.map(i=>i.center.x),[0,40,80]);assert.equal(islandById('missing'),null);
 assert.deepEqual(ISLANDS.flatMap(i=>i.echoes).map(e=>e.id).sort(),ECHOES.map(e=>e.id).sort());assert.equal(islandById('ruines').site.id,WORLD.ancientSiteId);
 for(const i of ISLANDS){assert.ok(isIslandFallbackLand(i,i.spawn.x,i.spawn.z));assert.ok(Object.isFrozen(i.spawn));assert.equal(i.bounds.maxX-i.bounds.minX,29);}
 assert.equal(isIslandFallbackLand('lagune',45,-1),false);assert.equal(isIslandFallbackLand('rivage',13,13),false);assert.equal(isIslandFallbackLand('rivage',NaN,4),false);
});
test('remapped encounters keep original combat identities and rewards without sharing mutable objects',()=>{
 assert.deepEqual(EXPLORATION_ENCOUNTERS.map(e=>e.id),ENCOUNTERS.map(e=>e.id));assert.deepEqual(EXPLORATION_ENCOUNTERS.map(e=>[e.islandId,e.position.x,e.position.z]),[['rivage',5,5],['lagune',45,-5],['ruines',75,-3]]);
 EXPLORATION_ENCOUNTERS.forEach((e,i)=>{assert.deepEqual(e.opponent,ENCOUNTERS[i].opponent);assert.deepEqual(e.reward,ENCOUNTERS[i].reward);assert.notEqual(e.opponent.pattern,ENCOUNTERS[i].opponent.pattern);const s=islandById(e.islandId).spawn;assert.ok(Math.hypot(e.position.x-s.x,e.position.z-s.z)>e.radius+.5);});
 assert.deepEqual(ENCOUNTERS.map(e=>e.position),[{x:4,z:3},{x:5,z:-8},{x:-8,z:-16}]);
});
