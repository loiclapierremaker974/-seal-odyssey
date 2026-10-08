import { ISLANDS } from './islandDefinitions.js';
export const TILE=Object.freeze({OCEAN:-1,GRASS:0,SAND:1,PATH:2,STONE:3,WATER:4,FLOWERS:5,WOOD:6});
export const MAP_SIZE=30;
const hash=(x,z,seed=0)=>{const n=Math.sin(x*127.1+z*311.7+seed*73.9)*43758.5453;return n-Math.floor(n);};
const ellipse=(x,z,cx,cz,rx,rz)=>((x-cx)/rx)**2+((z-cz)/rz)**2<=1;
const segmentDistance=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);};
function pathsFor(id){
 if(id==='rivage')return [[[0,10],[0,-9]], [[-9,2],[8,2]], [[5,2],[5,8]], [[0,7],[9,7]], [[9,7],[9,11]]];
 if(id==='lagune')return [[[-8,9],[-8,-8]], [[-9,1],[-3,1]], [[-8,7],[0,7]], [[0,7],[0,10]], [[0,10],[9,10]]];
 return [[[0,10],[0,-10]], [[-9,-2],[9,-2]], [[0,7],[9,7]], [[9,7],[9,11]]];
}
/** Authored geography: material and collision are data, never guessed from artwork. */
export function createOverworld(island){
 const grid=new Int8Array(MAP_SIZE*MAP_SIZE).fill(TILE.OCEAN),paths=pathsFor(island.id);
 const map={island,grid,paths,props:[],points:[],colliders:[]};
 for(let row=0;row<MAP_SIZE;row++)for(let col=0;col<MAP_SIZE;col++){
  const x=col+.5-15,z=row+.5-15;
  const outside=(Math.abs(x)/12.6)**4+(Math.abs(z)/12.4)**4>1;
  let type=TILE.OCEAN;
  if(!outside){
   type=hash(col,row,1)>.80?TILE.FLOWERS:TILE.GRASS;
   if(z>7.2||Math.abs(x)>10.2)type=TILE.SAND;
   if(island.id==='rivage'&&ellipse(x,z,6,-4,2.7,3.2))type=TILE.WATER;
   if(island.id==='lagune'){
    if(x>-3.4||z>6.5)type=TILE.SAND;
    if(ellipse(x,z,3,-2,7.6,7.2))type=TILE.WATER;
    if(ellipse(x,z,-3,1,1.8,1.8))type=TILE.SAND;
   }
   if(island.id==='ruines'){
    if(ellipse(x,z,0,-2,5.2,4.8))type=TILE.STONE;
    if(ellipse(x,z,8,3,2.5,3))type=TILE.WATER;
   }
   const path=paths.some(([a,b])=>segmentDistance(x,z,a,b)<1.08);
   if(path&&type!==TILE.WATER)type=island.id==='ruines'?TILE.STONE:TILE.PATH;
  }
  // The boarding deck is an explicit walkable wood surface, over the shore.
  if(x>=8&&x<=10&&z>=9&&z<=13)type=TILE.WOOD;
  grid[row*MAP_SIZE+col]=type;
 }
 // One continuous band of sand keeps all land/water boundaries legible.
 const before=grid.slice();
 for(let row=1;row<29;row++)for(let col=1;col<29;col++){
  const at=row*30+col,t=before[at];if(t!==TILE.GRASS&&t!==TILE.FLOWERS)continue;
  if([at-1,at+1,at-30,at+30].some(i=>before[i]===TILE.WATER||before[i]===TILE.OCEAN))grid[at]=TILE.SAND;
 }
 const c=island.center,protectedPoint=(x,z)=>Math.hypot(x-island.spawn.x+c.x,z-island.spawn.z+c.z)<2.3
  ||(island.echoes||[]).some(e=>Math.hypot(x-(e.x-c.x),z-(e.z-c.z))<2)
  ||(island.site&&Math.hypot(x-(island.site.x-c.x),z-(island.site.z-c.z))<3)
  ||paths.some(([a,b])=>segmentDistance(x,z,a,b)<1.65)
  // Keep a clear route from the southern beach into the lagoon and its Echoes.
  ||(island.id==='lagune'&&segmentDistance(x,z,[0,8],[0,-2])<1.2)
  ||(island.id==='lagune'&&segmentDistance(x,z,[0,1],[-3,1])<1.2)
  ||(island.id==='lagune'&&segmentDistance(x,z,[0,-1],[5,-1])<1.2);
 const add=(kind,x,z,size,radius=0)=>{const p={kind,x:x+c.x,z:z+c.z,size,phase:hash(x,z,3)*Math.PI*2};map.props.push(p);if(radius>0)map.colliders.push({x:p.x,z:p.z,radius});return p;};
 // Curated forest belts; only the decorations within each belt vary.
 for(let z=-10.5;z<=8;z+=2.6)for(let x=-10.5;x<=10.5;x+=2.6){
  const xx=x+(hash(x,z,2)-.5)*.6,zz=z+(hash(x,z,4)-.5)*.6,type=tileAt(map,xx+c.x,zz+c.z);
  if(protectedPoint(xx,zz)||type===TILE.OCEAN||type===TILE.WATER||type===TILE.STONE||type===TILE.PATH||type===TILE.WOOD)continue;
  const north=zz<-4,side=Math.abs(xx)>4,seed=hash(x,z,5);
  if((north||side)&&seed>.14)add(type===TILE.SAND?'palm':'tree',xx,zz,2.6+(seed-.5)*.35,.42);
  else if(seed>.42)add('bush',xx,zz,1.05,.30);
 }
 for(const [x,z]of [[-6,6],[-4,-3],[5,-8],[10,-4],[-10,9]])if(!protectedPoint(x,z)&&isDry(tileAt(map,x+c.x,z+c.z)))add('rock',x,z,1.10,.42);
 for(let i=0;i<7;i++){
  const x=island.id==='lagune'?1+i*.9:6+Math.sin(i*1.7)*2,z=island.id==='lagune'?-7+Math.sin(i)*.8:-4+Math.cos(i*1.7)*2;
  if(tileAt(map,x+c.x,z+c.z)===TILE.WATER)add('reeds',x,z,.85,0);
 }
 if(island.id==='ruines'){
  for(const [x,z]of [[-3,-6],[3,-6],[-6,3],[6,-7]]){
   add('arch',x,z,2.65,0);map.colliders.push({x:c.x+x-.72,z:c.z+z,radius:.30},{x:c.x+x+.72,z:c.z+z,radius:.30});
  }
 }
 const descriptions={
  rivage:'Les sentiers fleuris rejoignent les berges. Le ponton au sud-est permet de rejoindre les Murmures.',
  lagune:'Les petites rives de sable permettent de se reposer. Les Échos les plus profonds demandent une plongée.',
  ruines:'La place centrale attend les trois Échos. Les arches s’ouvrent sur les jardins de l’Ancien Site.',
 };
 map.points.push({id:island.id+'-sign',kind:'sign',x:c.x-2,z:c.z+4,label:'Lire la borne du sentier',text:descriptions[island.id]});
 const next={rivage:'lagune',lagune:'ruines',ruines:'rivage'}[island.id],name=ISLANDS.find(i=>i.id===next).name;
 map.points.push({id:island.id+'-dock',kind:'dock',x:c.x+9,z:c.z+11,label:'Embarquer vers '+name,text:'Le ponton ouvre la traversée vers '+name+'.',travelTo:next});
 map.points.push({id:island.id+'-shell',kind:'shell',x:c.x-5,z:c.z+7,label:'Écouter le coquillage',text:'Luma approche son museau. Le coquillage laisse entendre le murmure des vagues.'});
 return map;
}
export function tileAt(map,x,z){
 const col=Math.floor(x-map.island.center.x+15),row=Math.floor(z-map.island.center.z+15);
 return col<0||col>=30||row<0||row>=30?TILE.OCEAN:map.grid[row*30+col];
}
export function isDry(type){return type!==TILE.OCEAN&&type!==TILE.WATER;}
export function sampleOverworld(map,x,z){
 const type=tileAt(map,x,z);return {type,isLand:isDry(type),blocked:map.colliders.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius)};
}
export function facingDirection(heading){
 const x=Math.sin(heading),north=Math.cos(heading);
 return Math.abs(x)>Math.abs(north)?x>0?'east':'west':north>=0?'north':'south';
}
