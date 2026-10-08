import * as THREE from 'three';
import {TILE,tileAt,isDry} from './overworldData.js';
const vertex='attribute float aType;attribute float aEdges;attribute float aGrass;varying vec2 vUv;varying vec2 vWorld;varying float vType;varying float vEdges;varying float vGrass;void main(){vUv=uv;vType=aType;vEdges=aEdges;vGrass=aGrass;vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xz;gl_Position=projectionMatrix*viewMatrix*p;}';
const fragment=`uniform sampler2D uMap;uniform float uTime;uniform vec4 uRipples[16];varying vec2 vUv;varying vec2 vWorld;varying float vType;varying float vEdges;varying float vGrass;
float bit(float mask,float index){return mod(floor(mask/exp2(index)),2.0);}
vec3 sampleTile(float type,vec2 p){return texture2D(uMap,(vec2(mod(type,3.0),1.0-floor(type/3.0))+clamp(p,vec2(.004),vec2(.996)))/vec2(3.0,2.0)).rgb;}
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ripple(vec2 p){float value=0.0;for(int i=0;i<16;i++){vec4 r=uRipples[i];float age=uTime-r.z;if(r.w>0.0&&age>=0.0&&age<1.8){float d=length(p-r.xy);value+=(1.0-smoothstep(.06,.22,abs(d-age*1.8)))*(1.0-age/1.8)*r.w;}}return value;}
void main(){
 vec2 p=vUv;float n=noise(floor(vWorld));if(n>.5)p.x=1.0-p.x;
 vec3 color=sampleTile(min(vType,5.0),p);
 if(vType<.5||vType>4.5&&vType<5.5){color*=.88+n*.05;color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,.84);}
 if(vType>1.5&&vType<2.5){
  float nearGrass=0.0;
  nearGrass=max(nearGrass,bit(vGrass,0.0)*(1.0-smoothstep(.04,.17,vUv.x)));
  nearGrass=max(nearGrass,bit(vGrass,1.0)*(1.0-smoothstep(.04,.17,1.0-vUv.x)));
  nearGrass=max(nearGrass,bit(vGrass,2.0)*(1.0-smoothstep(.04,.17,vUv.y)));
  nearGrass=max(nearGrass,bit(vGrass,3.0)*(1.0-smoothstep(.04,.17,1.0-vUv.y)));
  color=mix(color,sampleTile(0.0,p),nearGrass*.92);
 }
 if(vType>3.5&&vType<4.5){
  vec2 drift=vec2(sin(uTime*.45+vWorld.y*.7),cos(uTime*.37+vWorld.x*.8))*.012;
  float waves=sin(vWorld.x*.73+vWorld.y*.39-uTime*.47)*cos(vWorld.y*.91-uTime*.32);
  vec3 blue=mix(vec3(.018,.27,.32),vec3(.045,.49,.48),.52+waves*.18);
  color=mix(blue,sampleTile(4.0,clamp(p+drift,vec2(.006),vec2(.994))),.16);
  float threads=abs(sin(vWorld.x*2.8+sin(vWorld.y*1.7+uTime*.3))+cos(vWorld.y*2.9+sin(vWorld.x*1.9-uTime*.25)));
  color+=vec3(.10,.20,.14)*(1.0-smoothstep(.015,.075,threads))*.38;
  color+=vec3(.08,.14,.15)*ripple(vWorld);
  color+=sin(uTime*.6+vWorld.x*2.0+vWorld.y*.9)*.012;
 }
 if(vType>5.5){
  float plank=1.0-smoothstep(.0,.04,min(fract(vUv.y*4.0),1.0-fract(vUv.y*4.0)));
  float grain=sin(vWorld.x*37.0+sin(vWorld.y*7.0)*2.0)*.035;
  color=mix(vec3(.56,.36,.17),vec3(.76,.56,.30),.6+grain)-plank*.13;
 }
 float edge=1.0;
 if(bit(vEdges,0.0)>.5)edge=min(edge,vUv.x);
 if(bit(vEdges,1.0)>.5)edge=min(edge,1.0-vUv.x);
 if(bit(vEdges,2.0)>.5)edge=min(edge,vUv.y);
 if(bit(vEdges,3.0)>.5)edge=min(edge,1.0-vUv.y);
 if(edge<.13&&vType<5.5){float foam=(1.0-smoothstep(.015,.13,edge))*(.52+.18*sin(uTime*1.6+vWorld.x*3.4+vWorld.y*2.9));color=mix(color,vec3(.95,.98,.84),foam);}
 gl_FragColor=vec4(color,1.0);
 #include <colorspace_fragment>
}`;
export function createTerrainMesh(map,texture,clock,ripples){
 const positions=[],uvs=[],types=[],edges=[],grass=[],indices=[];let vertexCount=0;
 const around=[[-1,0],[1,0],[0,1],[0,-1]];
 for(let row=0;row<30;row++)for(let col=0;col<30;col++){
  const type=map.grid[row*30+col];if(type===TILE.OCEAN)continue;
  const x=map.island.center.x+col+.5-15,z=map.island.center.z+row+.5-15;
  let edge=0,g=0;around.forEach(([dx,dz],i)=>{const t=tileAt(map,x+dx,z+dz);if(isDry(type)&&!isDry(t))edge+=2**i;if(t===TILE.GRASS||t===TILE.FLOWERS)g+=2**i;});
  positions.push(x-.5,0,z+.5,x+.5,0,z+.5,x+.5,0,z-.5,x-.5,0,z-.5);uvs.push(0,0,1,0,1,1,0,1);
  for(let i=0;i<4;i++){types.push(type);edges.push(edge);grass.push(g);}indices.push(vertexCount,vertexCount+1,vertexCount+2,vertexCount,vertexCount+2,vertexCount+3);vertexCount+=4;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('aType',new THREE.Float32BufferAttribute(types,1));geometry.setAttribute('aEdges',new THREE.Float32BufferAttribute(edges,1));geometry.setAttribute('aGrass',new THREE.Float32BufferAttribute(grass,1));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const material=new THREE.ShaderMaterial({uniforms:{uMap:{value:texture},uTime:clock,uRipples:{value:ripples}},vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=-50;mesh.name='Authored '+map.island.id+' terrain';return mesh;
}
export function createComponentMask(atlas){
 const t=new THREE.DataTexture(atlas.mask,atlas.width,atlas.height,THREE.RedFormat,THREE.UnsignedByteType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.flipY=false;t.colorSpace=THREE.NoColorSpace;t.needsUpdate=true;return t;
}
export function makeObjectTexture(document,kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.clearRect(0,0,128,128);
 if(kind==='sign'){
  c.fillStyle='#805529';c.fillRect(59,68,10,47);c.strokeStyle='#45341c';c.lineWidth=4;c.strokeRect(59,68,10,47);
  c.fillStyle='#d8ba75';c.beginPath();c.roundRect(17,21,94,57,8);c.fill();c.stroke();c.strokeStyle='#6e572d';c.lineWidth=5;c.beginPath();c.moveTo(35,43);c.lineTo(92,43);c.moveTo(35,57);c.lineTo(74,57);c.stroke();
 }else if(kind==='shell'){
  c.fillStyle='#fae8c7';c.strokeStyle='#bd8d6f';c.lineWidth=3;c.beginPath();c.moveTo(64,96);c.bezierCurveTo(0,66,26,18,64,25);c.bezierCurveTo(103,18,128,66,64,96);c.fill();c.stroke();
  for(let i=0;i<5;i++){c.beginPath();c.moveTo(64,90);c.lineTo(32+i*16,35);c.stroke();}
 }else{
  c.strokeStyle='#e9d493';c.lineWidth=6;c.beginPath();c.arc(64,57,29,0,Math.PI*2);c.stroke();c.fillStyle='#70e4d6';c.beginPath();c.moveTo(64,29);c.lineTo(91,57);c.lineTo(64,86);c.lineTo(37,57);c.closePath();c.fill();c.fillStyle='#255a5c';c.beginPath();c.arc(64,57,12,0,Math.PI*2);c.fill();
 }
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
