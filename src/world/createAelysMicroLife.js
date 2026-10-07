import * as THREE from 'three';
import { WORLD } from '../config/gameplay.js';
const TAU=Math.PI*2;
function finiteGround(query,x,z){try{const h=query(x,z);return Number.isFinite(h)?h:NaN;}catch{return NaN;}}
function wingGeometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.46,.018,.42,1,.008,.26,.76,.014,-.05,.84,.005,-.37,.32,.012,-.43],3));
  g.setIndex([0,1,2,0,2,3,0,3,4,0,4,5]);g.computeVertexNormals();return g;
}
/** Decorative, bounded micro-fauna; generic silhouettes do not establish species canon. */
export function createAelysMicroLife({terrainHeight,lowPower=false,islandCenter=WORLD.islandCenter,spawn=WORLD.spawn,waterLevel=WORLD.waterLevel}={}){
  if(typeof terrainHeight!=='function')throw new TypeError('createAelysMicroLife requires a terrainHeight query.');
  const group=new THREE.Group();group.name='Petite vie du rivage';
  const antCount=lowPower?12:28,flutterCount=lowPower?4:10,glowCount=Math.ceil(flutterCount/3);
  const centerX=Number.isFinite(islandCenter?.x)?islandCenter.x:0,centerZ=Number.isFinite(islandCenter?.z)?islandCenter.z:5;
  const spawnX=Number.isFinite(spawn?.x)?spawn.x:centerX,spawnZ=Number.isFinite(spawn?.z)?spawn.z:centerZ,sea=Number.isFinite(waterLevel)?waterLevel:0;
  const bodyGeometry=new THREE.SphereGeometry(1,lowPower?6:8,lowPower?4:5),limbGeometry=new THREE.CylinderGeometry(1,1,1,lowPower?4:5,1),membraneGeometry=wingGeometry();
  const earthyMaterial=new THREE.MeshStandardMaterial({color:0x403225,roughness:.88,metalness:0});
  const membraneMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.78,metalness:0,transparent:true,opacity:.76,depthWrite:false,side:THREE.DoubleSide});
  const glowMaterial=new THREE.MeshBasicMaterial({color:0xc6dda3,transparent:true,opacity:.52,depthWrite:false});
  const antBodies=new THREE.InstancedMesh(bodyGeometry,earthyMaterial,antCount*3),antLimbs=new THREE.InstancedMesh(limbGeometry,earthyMaterial,antCount*14);
  const flutterBodies=new THREE.InstancedMesh(bodyGeometry,earthyMaterial,flutterCount*2),wings=new THREE.InstancedMesh(membraneGeometry,membraneMaterial,flutterCount*2),glows=new THREE.InstancedMesh(bodyGeometry,glowMaterial,glowCount);
  antBodies.name='Fourmis — abdomen thorax tête';antLimbs.name='Fourmis — six pattes articulées et antennes';
  flutterBodies.name='Insectes ailés — silhouettes';wings.name='Insectes ailés — membranes';glows.name='Lucioles — lueur discrète';
  const meshes=[antBodies,antLimbs,flutterBodies,wings,glows],geometries=[bodyGeometry,limbGeometry,membraneGeometry],materials=[earthyMaterial,membraneMaterial,glowMaterial];
  for(const mesh of meshes){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(centerX,sea+2,centerZ),9);mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);}
  const transform=new THREE.Object3D(),segmentDirection=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),colour=new THREE.Color();
  const antOffsetX=new Float64Array(antCount),antOffsetZ=new Float64Array(antCount),antPreviousX=new Float64Array(antCount),antPreviousZ=new Float64Array(antCount),antHeading=new Float64Array(antCount);
  const flutterOffsetX=new Float64Array(flutterCount),flutterOffsetZ=new Float64Array(flutterCount);
  let previousTime=null,initialized=false,disposed=false,restoration=0,restorationTarget=0;
  const colonySign=spawnX>=centerX?-1:1,colonyX=centerX+colonySign*3.75,colonyZ=centerZ+.65;
  for(let i=0;i<flutterCount;i++){const firefly=i%3===0;colour.setHex(firefly?0xb2ab80:i%2?0xc7b780:0x85aead);wings.setColorAt(i*2,colour);wings.setColorAt(i*2+1,colour);}
  function body(mesh,index,x,y,z,yaw,sx,sy,sz){transform.position.set(x,y,z);transform.rotation.set(0,yaw,0);transform.scale.set(sx,sy,sz);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);}
  function segment(index,ax,ay,az,bx,by,bz,radius){
    const dx=bx-ax,dy=by-ay,dz=bz-az,length=Math.sqrt(dx*dx+dy*dy+dz*dz);
    transform.position.set((ax+bx)*.5,(ay+by)*.5,(az+bz)*.5);segmentDirection.set(dx,dy,dz).multiplyScalar(1/Math.max(length,.000001));
    transform.quaternion.setFromUnitVectors(up,segmentDirection);transform.scale.set(radius,length,radius);transform.updateMatrix();antLimbs.setMatrixAt(index,transform.matrix);
  }
  function hideAnt(index){for(let part=0;part<3;part++)body(antBodies,index*3+part,0,0,0,0,0,0,0);for(let limb=0;limb<14;limb++)body(antLimbs,index*14+limb,0,0,0,0,0,0,0);}
  function update(elapsed,lumaPosition){
    if(disposed)return;
    const time=Number.isFinite(elapsed)?Math.max(0,Math.min(elapsed,10000000)):previousTime??0;
    const dt=previousTime===null?1/60:Math.max(0,Math.min(time-previousTime,.1));previousTime=time;
    const groundBlend=1-Math.exp(-dt*9),airBlend=1-Math.exp(-dt*3.5);
    restoration+=(restorationTarget-restoration)*(1-Math.exp(-dt*1.4));membraneMaterial.opacity=.76+restoration*.035;glowMaterial.opacity=.52+restoration*.12;
    const hasLuma=Number.isFinite(lumaPosition?.x)&&Number.isFinite(lumaPosition?.y)&&Number.isFinite(lumaPosition?.z);
    const lx=hasLuma?lumaPosition.x:0,ly=hasLuma?lumaPosition.y+.3:0,lz=hasLuma?lumaPosition.z:0;
    for(let i=0;i<antCount;i++){
      const phase=i*TAU/antCount,angle=phase+time*.14,lane=i%2?.06:-.06,rx=.76+lane,rz=1.12+lane;
      const baseX=colonyX+Math.cos(angle)*rx,baseZ=colonyZ+Math.sin(angle)*rz,baseGround=finiteGround(terrainHeight,baseX,baseZ);
      let goalX=0,goalZ=0;
      if(hasLuma&&Math.abs(ly-baseGround)<1.1){
        const dx=baseX-lx,dz=baseZ-lz,distance=Math.sqrt(dx*dx+dz*dz);
        if(distance<.95){const strength=(1-distance/.95)*.72;goalX=(distance>.001?dx/distance:Math.cos(angle))*strength;goalZ=(distance>.001?dz/distance:Math.sin(angle))*strength;}
      }
      antOffsetX[i]+=(goalX-antOffsetX[i])*groundBlend;antOffsetZ[i]+=(goalZ-antOffsetZ[i])*groundBlend;
      let x=baseX+antOffsetX[i],z=baseZ+antOffsetZ[i],ground=finiteGround(terrainHeight,x,z);
      if(!Number.isFinite(ground)||ground<sea+.15||Math.abs(x-centerX)<1.7||Math.hypot(x-spawnX,z-spawnZ)<1.7){x=baseX;z=baseZ;ground=baseGround;antOffsetX[i]=0;antOffsetZ[i]=0;}
      if(!Number.isFinite(ground)||ground<sea+.15||Math.abs(x-centerX)<1.7||Math.hypot(x-spawnX,z-spawnZ)<1.7){hideAnt(i);continue;}
      const dx=initialized?x-antPreviousX[i]:-Math.sin(angle)*rx,dz=initialized?z-antPreviousZ[i]:Math.cos(angle)*rz;
      if(dx*dx+dz*dz>.00000001){const target=Math.atan2(dx,dz),difference=Math.atan2(Math.sin(target-antHeading[i]),Math.cos(target-antHeading[i]));antHeading[i]+=initialized?difference*groundBlend:difference;}
      antPreviousX[i]=x;antPreviousZ[i]=z;
      const yaw=antHeading[i],fx=Math.sin(yaw),fz=Math.cos(yaw),rightX=fz,rightZ=-fx,bob=Math.sin(time*14+phase)*.0015;
      body(antBodies,i*3,x-fx*.041,ground+.031+bob,z-fz*.041,yaw,.025,.021,.034);
      body(antBodies,i*3+1,x,ground+.033+bob,z,yaw,.019,.016,.024);
      body(antBodies,i*3+2,x+fx*.046,ground+.034+bob,z+fz*.046,yaw,.021,.019,.022);
      for(let si=0;si<2;si++){
        const side=si?1:-1;
        for(let row=0;row<3;row++){
          const phaseWalk=time*14+phase+(row%2===si?0:Math.PI),lift=Math.max(0,Math.sin(phaseWalk))*.008,longitudinal=-.021+row*.021,stride=Math.cos(phaseWalk)*.01;
          const hipX=x+fx*longitudinal+rightX*side*.009,hipZ=z+fz*longitudinal+rightZ*side*.009;
          const kneeX=x+fx*(longitudinal+stride*.5)+rightX*side*.032,kneeZ=z+fz*(longitudinal+stride*.5)+rightZ*side*.032;
          const footX=x+fx*(longitudinal+stride)+rightX*side*.053,footZ=z+fz*(longitudinal+stride)+rightZ*side*.053,footGround=finiteGround(terrainHeight,footX,footZ);
          const footY=(Number.isFinite(footGround)?footGround:ground)+.003+lift,limb=i*14+(si*3+row)*2;
          segment(limb,hipX,ground+.031,hipZ,kneeX,ground+.043,kneeZ,.0022);segment(limb+1,kneeX,ground+.043,kneeZ,footX,footY,footZ,.0019);
        }
        const headX=x+fx*.056,headZ=z+fz*.056;
        segment(i*14+12+si,headX+rightX*side*.008,ground+.046,headZ+rightZ*side*.008,x+fx*.091+rightX*side*.018,ground+.052,z+fz*.091+rightZ*side*.018,.0015);
      }
    }
    let glowIndex=0;
    for(let i=0;i<flutterCount;i++){
      const phase=i*2.399,firefly=i%3===0,side=i%2?1:-1,anchorX=centerX+side*(3.05+(i%3)*.36),anchorZ=centerZ-1.8+(i%4)*1.17,angle=time*(firefly?.32:.43)+phase;
      const baseX=anchorX+Math.cos(angle)*.26,baseZ=anchorZ+Math.sin(angle*1.12)*.3,baseGround=finiteGround(terrainHeight,baseX,baseZ);
      const baseY=(Number.isFinite(baseGround)?Math.max(baseGround,sea+.2):sea+.4)+(firefly?.48:.83)+Math.sin(time*1.3+phase)*.095;
      let goalX=0,goalZ=0;
      if(hasLuma){const dx=baseX-lx,dy=baseY-ly,dz=baseZ-lz,distance=Math.sqrt(dx*dx+dy*dy+dz*dz);if(distance<1.3){const strength=(1-distance/1.3)*.7,horizontal=Math.hypot(dx,dz);goalX=(horizontal>.001?dx/horizontal:Math.cos(phase))*strength;goalZ=(horizontal>.001?dz/horizontal:Math.sin(phase))*strength;}}
      flutterOffsetX[i]+=(goalX-flutterOffsetX[i])*airBlend;flutterOffsetZ[i]+=(goalZ-flutterOffsetZ[i])*airBlend;
      const x=baseX+flutterOffsetX[i],z=baseZ+flutterOffsetZ[i],ground=finiteGround(terrainHeight,x,z),minimum=Number.isFinite(ground)?Math.max(ground,sea+.2):sea+.4,avoidance=Math.hypot(flutterOffsetX[i],flutterOffsetZ[i]);
      const y=Math.max(baseY+avoidance*.13,minimum+.34),yaw=Math.atan2(-Math.sin(angle),Math.cos(angle*1.12)),size=firefly?.65:1,fx=Math.sin(yaw),fz=Math.cos(yaw);
      body(flutterBodies,i*2,x,y,z,yaw,.008*size,.01*size,.03*size);body(flutterBodies,i*2+1,x+fx*.034*size,y+.001,z+fz*.034*size,yaw,.009*size,.008*size,.009*size);
      const flap=.28+Math.sin(time*(firefly?17:11)+phase)*.78;
      for(let wing=0;wing<2;wing++){const ws=wing?1:-1;transform.position.set(x+fz*ws*.005,y,z-fx*ws*.005);transform.rotation.set(0,yaw+(ws<0?Math.PI:0),flap,'YXZ');transform.scale.set(firefly?.039:.081,1,firefly?.047:.091);transform.updateMatrix();wings.setMatrixAt(i*2+wing,transform.matrix);}
      if(firefly){const pulse=.78+Math.sin(time*1.8+phase)*.22,radius=.009*pulse;body(glows,glowIndex,x-fx*.024*size,y,z-fz*.024*size,yaw,radius,radius,radius*1.1);glowIndex++;}
    }
    initialized=true;for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
  group.userData.profile=lowPower?'low':'high';group.userData.counts=Object.freeze({ants:antCount,flutter:flutterCount,glows:glowCount});
  group.userData.update=update;group.userData.setRestoration=value=>{restorationTarget=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;};
  group.userData.dispose=()=>{if(disposed)return;disposed=true;group.removeFromParent();group.clear();for(const mesh of meshes)mesh.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();};
  update(0,null);return group;
}
export default createAelysMicroLife;
