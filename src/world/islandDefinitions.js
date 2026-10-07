import { ENCOUNTERS } from '../combat/encounters.js';
import { ECHOES, WORLD } from '../config/gameplay.js';
export const ISLAND_PLANE_SIZE = 30;
export const ISLAND_NAVIGATION_HALF_SIZE = 14.5;
function freeze(value) {
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;
}
function clone(value) {
 if(Array.isArray(value))return value.map(clone);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)]));
 return value;
}
function bounds(x,z){const r=ISLAND_NAVIGATION_HALF_SIZE;return {minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r};}
function echo(id,x,z,requiresDive=false){
 const original=ECHOES.find(item=>item.id===id);if(!original)throw new Error('Unknown canonical Echo: '+id);
 return {id,name:original.name,x,z,requiresDive};
}
export const ISLANDS=freeze([
 {id:'rivage',name:'Rivage d’Aelys',kicker:'Le premier lien',description:'Une plage claire borde les bosquets côtiers. Luma découvre les premiers échos du Grand Courant.',center:{x:0,z:0},spawn:{x:0,y:.04,z:4},texture:'assets/exploration/aelys-island.png',bounds:bounds(0,0),landEllipses:[{x:0,z:0,rx:9,rz:9},{x:4.5,z:6,rx:6,rz:4.5}],deepPools:[],blockers:[],echoes:[echo('echo-rivage',2,2)],site:null},
 {id:'lagune',name:'Lagune des Murmures',kicker:'Sous la surface',description:'Des eaux cyan abritent des courants paisibles. Un bassin profond invite Luma à plonger pour retrouver un écho.',center:{x:40,z:0},spawn:{x:40,y:.04,z:8},texture:'assets/exploration/murmurs-island.png',bounds:bounds(40,0),landEllipses:[{x:40,z:0,rx:9,rz:9},{x:43.5,z:6,rx:6,rz:4.5}],deepPools:[{x:45,z:-1,rx:3,rz:3,depth:3.5}],blockers:[],echoes:[echo('echo-lagune',37,1),echo('echo-profondeur',45,-1,true)],site:null},
 {id:'ruines',name:'Ruines de l’Ancien Site',kicker:'Rallumer l’Onde Première',description:'Les échos recueillis rendent leur résonance aux vestiges de l’Ancien Site.',center:{x:80,z:0},spawn:{x:80,y:.04,z:5},texture:'assets/exploration/ancient-island.png',bounds:bounds(80,0),landEllipses:[{x:80,z:0,rx:9,rz:9},{x:84,z:6,rx:6,rz:4.5}],deepPools:[],blockers:[],echoes:[],site:{id:WORLD.ancientSiteId,x:80,z:-2}},
]);
const islandIndex=new Map(ISLANDS.map(island=>[island.id,island]));
export function islandById(id){return islandIndex.get(id)??null;}
const placements=freeze({'shore-remnant':{islandId:'rivage',x:5,z:5},'lagoon-knot':{islandId:'lagune',x:45,z:-5},'ruins-resonance':{islandId:'ruines',x:75,z:-3}});
export const EXPLORATION_ENCOUNTERS=freeze(ENCOUNTERS.map(encounter=>{
 const p=placements[encounter.id];if(!p)throw new Error('Missing encounter island: '+encounter.id);
 return {...clone(encounter),islandId:p.islandId,position:{x:p.x,z:p.z}};
}));
function inEllipse(x,z,e){if(!(e.rx>0&&e.rz>0))return false;return ((x-e.x)/e.rx)**2+((z-e.z)/e.rz)**2<=1;}
export function isIslandFallbackLand(islandOrId,x,z){
 const island=typeof islandOrId==='string'?islandById(islandOrId):islandOrId;
 if(!island||!Number.isFinite(x)||!Number.isFinite(z))return false;const b=island.bounds;
 if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return false;
 return island.landEllipses.some(e=>inEllipse(x,z,e))&&!island.deepPools.some(e=>inEllipse(x,z,e));
}
