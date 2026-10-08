import test from 'node:test';
import assert from 'node:assert/strict';
import {ISLANDS} from '../src/world/islandDefinitions.js';
import {createOverworld,tileAt,isDry,TILE,facingDirection} from '../src/world/overworldData.js';
test('Authored island spawns, Echoes and Site remain on intended terrain',()=>{
 const maps=ISLANDS.map(createOverworld);
 for(const map of maps)assert.ok(isDry(tileAt(map,map.island.spawn.x,map.island.spawn.z)));
 assert.ok(isDry(tileAt(maps[0],2,2)));
 assert.ok(isDry(tileAt(maps[1],37,1)));
 assert.equal(tileAt(maps[1],45,-1),TILE.WATER);
 assert.equal(tileAt(maps[2],80,-2),TILE.STONE);
});
test('Lagoon shoreline and swimming routes have clearance for the player collider',()=>{
 const map=createOverworld(ISLANDS.find(i=>i.id==='lagune'));
 for(const [a,b] of [[{x:40,z:8},{x:40,z:1}],[{x:40,z:1},{x:37,z:1}],[{x:40,z:1},{x:40,z:-1}],[{x:40,z:-1},{x:45,z:-1}]]){
  for(let t=0;t<=1;t+=.01){
   const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   assert.ok(map.colliders.every(p=>Math.hypot(x-p.x,z-p.z)>=p.radius+.35),'Blocked shore or swim route at '+x+','+z);
  }
 }
});
test('Heading selects anatomically distinct cardinal poses',()=>{
 assert.equal(facingDirection(0),'north');assert.equal(facingDirection(Math.PI),'south');
 assert.equal(facingDirection(Math.PI/2),'east');assert.equal(facingDirection(-Math.PI/2),'west');
});
