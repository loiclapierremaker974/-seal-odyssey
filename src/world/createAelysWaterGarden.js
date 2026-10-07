import * as THREE from 'three';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;

/** A bounded damped contact spring, independent of the rendered surface. */
export function stepWaterGardenSpring(spring,delta,target=0){
  const dt=clamp(finite(delta),0,.05);
  const goal=clamp(finite(target),-.08,0);
  spring.velocity+=((goal-spring.offset)*82-spring.velocity*17)*dt;
  spring.offset=clamp(spring.offset+spring.velocity*dt,-.10,.018);
  if(!Number.isFinite(spring.offset)||!Number.isFinite(spring.velocity)){
    spring.offset=0;spring.velocity=0;
  }
  return spring;
}

function leafGeometry(lowPower){
  const rings=lowPower?3:5,segments=lowPower?24:40,p=[0,.032,0],c=[.25,.57,.29],idx=[];
  const green=new THREE.Color(0x3d8550),edge=new THREE.Color(0x75ad58),vein=new THREE.Color(0x92b95b),color=new THREE.Color();
  for(let r=1;r<=rings;r++)for(let s=0;s<=segments;s++){
    const t=r/rings,a=.16+s/segments*(Math.PI*2-.32);
    const radius=t*(1+.035*Math.sin(a*7));
    const rib=Math.pow(Math.max(0,Math.cos(a*9)),16)*.012*t;
    p.push(Math.cos(a)*radius,.032*(1-t*t)+rib,Math.sin(a)*radius);
    color.copy(green).lerp(edge,t*t*.75).lerp(vein,Math.pow(Math.max(0,Math.cos(a*9)),16)*.18);
    c.push(color.r,color.g,color.b);
  }
  for(let s=0;s<segments;s++)idx.push(0,s+2,s+1);
  for(let r=0;r<rings-1;r++)for(let s=0;s<segments;s++){
    const a=1+r*(segments+1)+s,b=a+segments+1;
    idx.push(a,a+1,b,b,a+1,b+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  geometry.setIndex(idx);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

/** Decorative, responsive water flora; these leaves are not movement platforms. */
export function createAelysWaterGarden({lowPower=false,terrainHeight=()=>-2,surfaceHeight=()=>0,onContact=null}={}){
  const group=new THREE.Group();group.name='Aelys · jardin de surface';
  const candidates=[
    [-4.0,-.8],[-5.1,-1.3],[-3.6,-3.0],[-6.1,-2.0],[-7.0,-3.5],[-4.5,-5.2],
    [4.7,-1.3],[5.9,-2.8],[6.7,-4.1],[4.9,-5.5],[-8.4,-5.1],[-5.2,-7.2],
    [7.4,-6.0],[5.8,-8.2],[-8.8,-8.0],[-7.0,-9.6],
  ];
  const pads=[];
  for(let i=0;i<candidates.length&&pads.length<(lowPower?8:16);i++){
    const [x,z]=candidates[i];if(terrainHeight(x,z)>-.12)continue;
    pads.push({x,z,radius:.23+(i%4)*.042,phase:i*2.399,yaw:i*1.7,offset:0,velocity:0,inside:false,cooldown:0,flower:i%3===0});
  }
  const flowers=pads.filter(p=>p.flower);
  const leafMat=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.48,clearcoat:.55,clearcoatRoughness:.26,side:THREE.DoubleSide});
  const leaves=new THREE.InstancedMesh(leafGeometry(lowPower),leafMat,pads.length);leaves.name='Feuilles flottantes nervurées';leaves.frustumCulled=false;leaves.receiveShadow=!lowPower;
  group.add(leaves);
  const petalMat=new THREE.MeshPhysicalMaterial({color:0xf2c6cf,roughness:.45,clearcoat:.25,emissive:0x702439,emissiveIntensity:.16});
  const petals=new THREE.InstancedMesh(new THREE.SphereGeometry(1,lowPower?8:12,lowPower?5:8),petalMat,flowers.length*7);
  petals.name='Corolles aquatiques';petals.frustumCulled=false;
  const cores=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial({color:0xffe1a1,emissive:0xffba49,emissiveIntensity:.65,roughness:.45}),flowers.length);
  cores.name='Cœurs dorés du jardin';cores.frustumCulled=false;
  const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.022,1,6),new THREE.MeshStandardMaterial({color:0x477743,roughness:.7}),flowers.length);
  stems.name='Tiges flottantes';stems.frustumCulled=false;
  group.add(petals,cores,stems);
  const transform=new THREE.Object3D(),meshes=[leaves,petals,cores,stems];let disposed=false;
  function update(delta=0,elapsed=0,position=null,state={}){
    if(disposed)return;
    const dt=clamp(finite(delta),0,.05),time=finite(elapsed),touching=state.mode==='surface'&&!state.airborne;
    let flower=0;
    for(let i=0;i<pads.length;i++){
      const pad=pads[i],distance=position?Math.hypot(position.x-pad.x,position.z-pad.z):Infinity;
      const influence=touching?clamp(1-distance/.82):0;
      const inside=influence>.45;
      pad.cooldown=Math.max(0,pad.cooldown-dt);
      if(inside&&!pad.inside&&pad.cooldown===0){
        pad.cooldown=.8;onContact?.(pad.x,pad.z,.18+influence*.10);
      }
      pad.inside=inside;stepWaterGardenSpring(pad,dt,-influence*.065);
      const water=finite(surfaceHeight(pad.x,pad.z,time),0);
      const bob=Math.sin(time*1.3+pad.phase)*.005;
      const bank=pad.offset*.9;
      transform.position.set(pad.x,water+.024+pad.offset+bob,pad.z);
      transform.rotation.set(bank*Math.sin(pad.yaw),pad.yaw+Math.sin(time*.45+pad.phase)*.018,bank*Math.cos(pad.yaw));
      transform.scale.set(pad.radius,1,pad.radius*.88);transform.updateMatrix();leaves.setMatrixAt(i,transform.matrix);
      if(!pad.flower)continue;
      const centreY=water+.024+pad.offset+bob+.17;
      for(let j=0;j<7;j++){
        const a=j/7*Math.PI*2+pad.yaw;
        transform.position.set(pad.x+Math.cos(a)*.095,centreY-.01,pad.z+Math.sin(a)*.095);
        transform.rotation.set(Math.sin(a)*.20,a+Math.PI/2,Math.cos(a)*-.20);
        transform.scale.set(.055,.031,.13);transform.updateMatrix();petals.setMatrixAt(flower*7+j,transform.matrix);
      }
      transform.position.set(pad.x,centreY+.02,pad.z);transform.rotation.set(0,0,0);transform.scale.set(.063,.035,.063);
      transform.updateMatrix();cores.setMatrixAt(flower,transform.matrix);
      transform.position.y=centreY-.095;transform.scale.set(1,.16,1);transform.updateMatrix();stems.setMatrixAt(flower,transform.matrix);
      flower++;
    }
    for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
  group.userData.update=update;
  group.userData.kind='responsive-water-garden';
  group.userData.padCount=pads.length;
  group.userData.pads=pads;
  group.userData.dispose=()=>{
    if(disposed)return;disposed=true;group.removeFromParent();
    const geometries=new Set(),materials=new Set();
    group.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);
      for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();
  };
  update(0,0);return group;
}
export default createAelysWaterGarden;
