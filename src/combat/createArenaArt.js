import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function leafGeometry(frond=false){
  const p=[],c=[],indices=[],dark=new THREE.Color(0x174c3d),light=new THREE.Color(0x9bc876),color=new THREE.Color();
  const strip=(points,tint)=>{const start=p.length/3;for(const point of points){p.push(...point);c.push(tint.r,tint.g,tint.b);}for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);};
  if(frond){
    for(let row=0;row<9;row++){const t=row/9,y=.15+t*1.1,reach=.16+Math.sin(t*Math.PI)*.37,lean=Math.sin(t*2.3)*.17;color.copy(dark).lerp(light,t*.78);
      for(const side of [-1,1])strip([[lean,y,0],[lean+side*reach*.68,y+.02,.015],[lean+side*reach,y+.18,.03],[lean+side*reach*.53,y+.12,-.014]],color);
    }strip([[-.018,0,0],[.018,0,0],[.18,1.35,.035],[.15,1.35,.035]],dark);
  }else{
    const rows=12;for(let row=0;row<=rows;row++){const t=row/rows,width=Math.pow(Math.sin(t*Math.PI),.8)*.19+.003;color.copy(dark).lerp(light,t*.76);
      for(const side of [-1,0,1]){p.push(side*width+Math.sin(t*2.5)*.17,t*1.22,Math.sin(t*Math.PI)*(.025+(side===0?.045:0)));const shade=side===0?1.14:1;c.push(color.r*shade,color.g*shade,color.b*shade);}}
    for(let row=0;row<rows;row++)for(let col=0;col<2;col++){const i=row*3+col;indices.push(i,i+3,i+1,i+1,i+3,i+4);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function roughStone(lowPower){
  const g=new THREE.IcosahedronGeometry(1,lowPower?2:3),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=1+.075*Math.sin(x*7+y*11+z*3)+.035*Math.cos(z*15-x*5);p.setXYZ(i,x*r,y*r,z*r);}
  g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function bumpTexture(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const v=130+Math.sin(x*1.8+y*.7)*19+Math.sin(x*.39-y*1.2)*16+Math.cos(y*.23+x*.61)*12,i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
  const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,5);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true;return t;
}
function windMaterial(clock){
  const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.79,side:THREE.DoubleSide});
  m.onBeforeCompile=s=>{s.uniforms.uArenaClock=clock;s.vertexShader='uniform float uArenaClock;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(uArenaClock*1.2+position.y*2.5+position.z*1.7)*0.026*position.y*position.y;');};
  m.customProgramCacheKey=()=> 'seal-arena-organic-sway-v2';return m;
}
function batch(parent,name,g,m,count,place){
  const mesh=new THREE.InstancedMesh(g,m,count),o=new THREE.Object3D();mesh.name=name;mesh.receiveShadow=true;
  for(let i=0;i<count;i++){place(o,i);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}mesh.computeBoundingSphere();parent.add(mesh);return mesh;
}
function coralGeometry(lowPower){
  const pieces=[];for(let branch=0;branch<9;branch++){
    const a=-1.15+branch/8*2.3,r=.35+(branch%3)*.13,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(Math.sin(a)*.13,.19,.02),new THREE.Vector3(Math.sin(a)*r,.43+(branch%2)*.08,.025*Math.cos(a)),new THREE.Vector3(Math.sin(a)*r*1.15,.71-.13*Math.abs(a),.025)]);
    pieces.push(new THREE.TubeGeometry(curve,lowPower?6:10,.021,5,false));
  }const result=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());return result;
}
/** Distinct original arenas share bounded batched organic scenery. */
export function createArenaLandscape({variant='shore',lowPower=false}={}){
  const group=new THREE.Group();group.name='Living arena '+variant;
  const clock={value:0},stoneGeo=roughStone(lowPower),bump=bumpTexture(),stone=new THREE.MeshStandardMaterial({color:variant==='shore'?0xbfb68c:variant==='lagoon'?0x5c8d86:0x778d7a,roughness:.84,bumpMap:bump,bumpScale:.075});
  const plant=windMaterial(clock),leafGeo=leafGeometry(),frondGeo=leafGeometry(true);
  const mesh=(g,m,x,y,z,sx=1,sy=1,sz=1)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.receiveShadow=true;group.add(o);return o;};
  const floorMaterial=new THREE.MeshStandardMaterial({color:variant==='shore'?0xe0c597:variant==='lagoon'?0x739f8f:0x657f79,roughness:.9,bumpMap:bump,bumpScale:.045});
  const floor=mesh(new THREE.PlaneGeometry(30,22),floorMaterial,0,-.035,-2);floor.rotation.x=-Math.PI/2;
  const waterMaterial=new THREE.MeshPhysicalMaterial({color:variant==='shore'?0x259baf:0x247f9b,roughness:.19,metalness:0,clearcoat:.75,clearcoatRoughness:.23,transparent:true,opacity:.80,depthWrite:false});
  waterMaterial.onBeforeCompile=s=>{s.uniforms.uArenaClock=clock;s.vertexShader='uniform float uArenaClock;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z += 0.018*sin(position.x*1.7+uArenaClock*1.1)+0.012*sin(position.y*2.1-uArenaClock*0.85);').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=normalize(vec3(-0.0306*cos(position.x*1.7+uArenaClock*1.1),-0.0252*cos(position.y*2.1-uArenaClock*0.85),1.0));');};
  waterMaterial.customProgramCacheKey=()=> 'seal-arena-water-v2';
  const water=mesh(new THREE.PlaneGeometry(28,15,lowPower?48:80,lowPower?28:48),waterMaterial,0,.003,variant==='shore'?-9.7:-6.9);water.name='Arena shallow water';water.rotation.x=-Math.PI/2;water.renderOrder=1;
  batch(group,'Weathered island ridges',stoneGeo,stone,lowPower?16:24,(o,i)=>{const n=lowPower?16:24,x=(i/(n-1)-.5)*24,h=1.1+Math.sin(i*1.6)*.5+(i%4)*.43;o.position.set(x,h*.37,-6.2-(i%3)*.75);o.rotation.set(.05*Math.sin(i),i*.77,0);o.scale.set(1.2+(i%3)*.4,h,1.2+(i%2)*.3);});
  batch(group,'Coastal broad leaves',leafGeo,plant,lowPower?96:180,(o,i)=>{const clusters=[-7.1,-5.9,-.85,1.1,5.8,7.2],x=clusters[i%6]+Math.sin(i*2.399)*.60;o.position.set(x,.02,-2.9-(i%7)*.3);o.rotation.set(.13*Math.sin(i),i*2.399,.18*Math.sin(i*.8));o.scale.setScalar(.55+(i%5)*.16);});
  batch(group,'Layered coastal fronds',frondGeo,plant,lowPower?42:78,(o,i)=>{const side=i%2?1:-1;o.position.set(side*(5.6+Math.sin(i*2.1)*1.1),.03,-1.8-(i%6)*.4);o.rotation.set(.12,i*2.399,side*.18*Math.sin(i*.7));o.scale.setScalar(.65+(i%4)*.20);});
  const stemMaterial=new THREE.MeshStandardMaterial({color:0x56754b,roughness:.91}),stemGeo=new THREE.CylinderGeometry(.055,.095,1,7);
  for(const side of [-1,1]){const stem=mesh(stemGeo,stemMaterial,side*7.2,1.27,-3.7,1,2.6,1);stem.rotation.z=-side*.22;}
  batch(group,'Framing leaf canopy',leafGeo,plant,lowPower?20:34,(o,i)=>{const side=i%2?1:-1;o.position.set(side*6.91,2.38,-3.7);o.rotation.set(.15+i*.035,i*2.399,side*(.68+(i%4)*.22));o.scale.set(1.3,1.25+(i%3)*.28,1.1);});
  const flowerMaterial=new THREE.MeshStandardMaterial({color:0xeecbb4,roughness:.7,side:THREE.DoubleSide}),petalGeo=new THREE.SphereGeometry(1,lowPower?8:12,6),flowers=lowPower?16:28,centers=new Float32Array(flowers*3);
  for(let i=0;i<flowers;i++){centers[i*3]=(i%2?1:-1)*(5+(i%5)*.42);centers[i*3+1]=.34+(i%4)*.15;centers[i*3+2]=-1.6-(i%6)*.46;}
  batch(group,'Flower stems',stemGeo,stemMaterial,flowers,(o,i)=>{const k=i*3;o.position.set(centers[k],centers[k+1]*.5,centers[k+2]);o.rotation.set(0,0,0);o.scale.set(.16,centers[k+1],.16);});
  const petals=batch(group,'Aelys littoral flowers',petalGeo,flowerMaterial,flowers*6,(o,i)=>{const k=Math.floor(i/6)*3,a=i%6/6*TAU;o.position.set(centers[k]+Math.cos(a)*.066,centers[k+1],centers[k+2]+Math.sin(a)*.066);o.rotation.set(0,-a,Math.sin(i)*.06);o.scale.set(.065,.018,.13);});
  const petalColor=new THREE.Color();for(let i=0;i<petals.count;i++){petalColor.set(i%18<6?0xffd2a1:i%18<12?0xd1b7e1:0xaed9c7);petals.setColorAt(i,petalColor);}
  if(variant==='lagoon'){
    const mat=new THREE.MeshStandardMaterial({color:0xd8987f,roughness:.72}),corals=batch(group,'Lagoon branching coral',coralGeometry(lowPower),mat,lowPower?16:28,(o,i)=>{const side=i%2?1:-1;o.position.set(side*(4.85+(i%5)*.5),.02,-.6-(i%7)*.4);o.rotation.set(.1*Math.sin(i),i*2.399,0);o.scale.setScalar(.65+(i%4)*.25);});
    const c=new THREE.Color();for(let i=0;i<corals.count;i++){c.set(i%3===0?0xe6a481:i%3===1?0x8cc9bc:0x9bb0d3);corals.setColorAt(i,c);}
  }
  if(variant==='ruins'){
    const columnGeo=new THREE.CylinderGeometry(.28,.34,1,12),capGeo=new THREE.BoxGeometry(.91,.19,.83),xs=[-6,-4.9,-1.6,1.6,4.9,6];
    batch(group,'Weathered ancient columns',columnGeo,stone,24,(o,i)=>{const x=xs[Math.floor(i/4)],row=i%4,h=Math.abs(x)<2?2.7:1.7+Math.abs(Math.sin(x));o.position.set(x,(row+.5)*h/4,-4.9);o.rotation.set(0,0,0);o.scale.set(1,h/4*.96,1);});
    batch(group,'Mossed column capitals',capGeo,stone,12,(o,i)=>{const x=xs[i%6],h=Math.abs(x)<2?2.7:1.7+Math.abs(Math.sin(x)),foot=i>=6;o.position.set(x,foot?.06:h,-4.9);o.rotation.set(0,foot?.08*x:0,0);o.scale.set(foot?1.2:1,foot?.75:1,foot?1.2:1);});
    mesh(new THREE.TorusGeometry(1.6,.24,10,lowPower?36:52,Math.PI),stone,0,2.7,-4.9);
    const pieces=[];for(let i=0;i<8;i++){const x=(i-3.5)*.57;pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x,3+Math.cos(x)*.6,-4.67),new THREE.Vector3(x+.14,2.65,-4.60),new THREE.Vector3(x-.10,1.76+(i%3)*.19,-4.61)]),10,.018,5,false));}
    const vines=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());mesh(vines,stemMaterial,0,0,0);
    batch(group,'Ancient site climbing ivy',leafGeo,plant,lowPower?48:84,(o,i)=>{const branch=i%8,x=(branch-3.5)*.57,y=1.4+(i%7)*.29;o.position.set(x+.13*Math.sin(i),y,-4.55);o.rotation.set(.3,i*2.399,(i%2?1:-1)*1.1);o.scale.setScalar(.18+(i%3)*.04);});
  }
  const foamMaterial=new THREE.MeshBasicMaterial({color:0xd5f3dd,transparent:true,opacity:.28,depthWrite:false}),foam=mesh(new THREE.TorusGeometry(1,.018,4,lowPower?32:48),foamMaterial,0,.035,variant==='shore'?-4:-3.2,6.8,1.8,1);foam.rotation.x=-Math.PI/2;
  group.userData.clock=clock;group.userData.update=t=>{clock.value=t;foamMaterial.opacity=.19+Math.sin(t*.9)*.045;};
  group.userData.features={variant,organic:true,leafInstances:(lowPower?158:292)+(variant==='ruins'?(lowPower?48:84):0),flowers,coral:variant==='lagoon',ivy:variant==='ruins'};return group;
}
function ribbonGeometry(lowPower,veils=false){
  const p=[],uv=[],indices=[],segments=lowPower?24:40;
  for(let stream=0;stream<3;stream++){const start=p.length/3;
    for(let row=0;row<=segments;row++){const t=row/segments,a=-1.4+t*2.8;for(const side of [-1,1]){
      const w=(veils?.065:.10)*Math.pow(Math.sin(t*Math.PI),.55),r=(veils?.63:.65)+(stream-1)*.105+side*w;
      if(veils)p.push(Math.cos(a+stream*2.09)*r,Math.sin(a+stream*2.09)*r,.15*Math.sin(t*TAU+stream));else p.push(Math.cos(a)*r*.55-.30,Math.sin(a)*r,(stream-1)*.065);
      uv.push(t,side<0?0:1);
    }}for(let row=0;row<segments;row++){const i=start+row*2;indices.push(i,i+2,i+1,i+1,i+2,i+3);}
  }
  if(!veils)for(let stream=0;stream<3;stream++){const start=p.length/3;
    for(let row=0;row<=segments;row++){const t=row/segments,w=.026*Math.pow(Math.sin(t*Math.PI),.6);for(const side of [-1,1]){p.push(-1.38+t*1.18,(stream-1)*.20+Math.sin(t*Math.PI*1.8+stream)*.064+side*w,-.08);uv.push(t,side<0?0:1);}}
    for(let row=0;row<segments;row++){const i=start+row*2;indices.push(i,i+2,i+1,i+1,i+2,i+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();return g;
}
function flowMaterial(color=0x56d3d8){
  const m=new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:0},uPhase:{value:0}},
    vertexShader:'varying vec2 vFlowUv; uniform float uPhase; void main(){ vFlowUv=uv; vec3 p=position; p.z+=sin(uv.x*18.0-uPhase*8.0)*0.023; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }',
    fragmentShader:'varying vec2 vFlowUv; uniform vec3 uColor; uniform float uOpacity; uniform float uPhase; void main(){ float edges=pow(max(0.0,sin(vFlowUv.y*3.141593)),0.7)*pow(max(0.0,sin(vFlowUv.x*3.141593)),0.5); float bands=0.7+0.3*sin(vFlowUv.x*28.0-uPhase*7.0); gl_FragColor=vec4(uColor*(0.85+bands*0.22),edges*uOpacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',transparent:true,depthWrite:false,side:THREE.DoubleSide,
  });m.color=m.uniforms.uColor.value;return m;
}
export function createArenaWaveRibbon({lowPower=false}={}){
  const material=flowMaterial(),mesh=new THREE.Mesh(ribbonGeometry(lowPower),material);mesh.name='Travelling water ribbons';mesh.frustumCulled=false;
  return{mesh,material,update(p,opacity){material.uniforms.uPhase.value=p;material.uniforms.uOpacity.value=opacity;}};
}
export function createCurrentVeils({lowPower=false}={}){
  const m=flowMaterial(0x72b4d8),mesh=new THREE.Mesh(ribbonGeometry(lowPower,true),m);mesh.name='Configurable current veils';
  mesh.userData.update=(t,color,calm)=>{m.color.copy(color);m.uniforms.uOpacity.value=.48+calm*.12;m.uniforms.uPhase.value=t;mesh.rotation.z=t*.38*(1-calm*.8);mesh.rotation.y=Math.sin(t*.7)*.34;mesh.scale.setScalar(1+Math.sin(t*1.9)*.035);};return mesh;
}
/** Four reusable recipient-local contact rings supplement the shared particle pool. */
export function createArenaImpactPool({lowPower=false}={}){
  const group=new THREE.Group();group.name='Pooled contact responses';const g=new THREE.RingGeometry(.92,1,lowPower?28:44),slots=[];
  for(let i=0;i<4;i++){const material=new THREE.MeshBasicMaterial({color:0x8ce8dc,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),mesh=new THREE.Mesh(g,material);mesh.visible=false;group.add(mesh);slots.push({mesh,material,age:1,duration:.46,strong:false});}
  let cursor=0;return{group,slots,reset(){for(const s of slots){s.age=1;s.mesh.visible=false;}},emit(x,y,z,color,strong=false){const s=slots[cursor++%slots.length];s.age=0;s.strong=Boolean(strong);s.mesh.position.set(x,y,z);s.material.color.copy(color);s.mesh.visible=true;s.mesh.scale.setScalar(.14);s.material.opacity=.68;},update(dt){for(const s of slots){if(!s.mesh.visible)continue;s.age+=dt;const p=clamp(s.age/s.duration);s.mesh.visible=p<1;s.mesh.scale.setScalar(.15+p*(s.strong?.92:.64));s.material.opacity=(1-p)*(s.strong?.72:.54);}}};
}
