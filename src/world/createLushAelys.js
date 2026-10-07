import * as THREE from 'three';
const PALETTE={leaf:new THREE.Color('#538a51'),tip:new THREE.Color('#a9cf72'),stem:new THREE.Color('#69543a'),moss:new THREE.Color('#527549'),gold:new THREE.Color('#f0cd7e'),flower:new THREE.Color('#c9a3db'),kelp:new THREE.Color('#599d78'),coral:new THREE.Color('#dc9f85'),fish:new THREE.Color('#60bcb4'),eye:new THREE.Color('#142d32')};
function randomSource(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function bucket(){return{p:[],c:[],i:[]};}
function vertex(b,p,c){const i=b.p.length/3;b.p.push(p.x,p.y,p.z);b.c.push(c.r,c.g,c.b);return i;}
function finish(b){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));g.setIndex(b.i);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;}
function append(b,g,m,c){
  const offset=b.p.length/3,p=g.attributes.position,col=g.attributes.color,point=new THREE.Vector3(),shade=new THREE.Color();
  for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(m);if(col)shade.setRGB(col.getX(i),col.getY(i),col.getZ(i));else shade.copy(c);vertex(b,point,shade);}
  if(g.index){for(let i=0;i<g.index.count;i++)b.i.push(offset+g.index.getX(i));}else{for(let i=0;i<p.count;i++)b.i.push(offset+i);}g.dispose();
}
function leaf(b,start,end,width,color,rows=4,fold=.22){
  const axis=end.clone().sub(start),sideways=new THREE.Vector3(-axis.z,0,axis.x);if(sideways.lengthSq()<1e-8)sideways.set(1,0,0);sideways.normalize();
  const first=b.p.length/3,point=new THREE.Vector3(),shade=new THREE.Color();
  for(let row=0;row<=rows;row++){const t=row/rows,shape=Math.pow(Math.sin(Math.PI*t),.85);for(const side of [-1,0,1]){
    point.copy(start).addScaledVector(axis,t).addScaledVector(sideways,width*shape*side);point.y+=Math.sin(t*Math.PI)*width*.34-Math.abs(side)*width*shape*fold;
    shade.copy(color).lerp(PALETTE.tip,t*.22).multiplyScalar(side===0?1.10:.91);vertex(b,point,shade);
  }}
  for(let row=0;row<rows;row++){const a=first+row*3;b.i.push(a,a+3,a+1,a+1,a+3,a+4,a+1,a+4,a+2,a+2,a+4,a+5);}
}
function stem(b,start,middle,end,radius,color,lowPower){append(b,new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start,middle,end),lowPower?3:5,radius,lowPower?3:4,false),new THREE.Matrix4(),color);}
function fernGeometry(lowPower){
  const b=bucket(),fronds=lowPower?3:4,pairs=lowPower?6:9;
  for(let f=0;f<fronds;f++){
    const a=f*Math.PI*2/fronds+.25,dx=Math.cos(a),dz=Math.sin(a),pointAt=t=>new THREE.Vector3(dx*t*.70,.04+Math.sin(t*Math.PI*.68)*.83,dz*t*.70);
    stem(b,pointAt(0),new THREE.Vector3(dx*.15,.78,dz*.15),pointAt(1),.009,PALETTE.leaf,lowPower);
    for(let j=0;j<pairs;j++){const t=.16+j/pairs*.73,origin=pointAt(t),size=(.12+Math.sin(t*Math.PI)*.17)*(1-t*.35);for(const side of [-1,1]){
      const end=origin.clone().add(new THREE.Vector3(-dz*side*size+dx*size*.44,.035,dx*side*size+dz*size*.44));leaf(b,origin,end,size*.24,PALETTE.leaf,lowPower?3:4);
    }}
  }return finish(b);
}
function groveGeometry(lowPower,seed){
  const b=bucket(),random=randomSource(seed);
  for(let branch=0;branch<4;branch++){const a=branch*2.399,end=new THREE.Vector3(Math.cos(a)*.58,.88+branch*.11,Math.sin(a)*.58);stem(b,new THREE.Vector3(0,.03,0),new THREE.Vector3(0,.62,0),end,branch===0?.035:.021,PALETTE.stem,lowPower);}
  const count=lowPower?30:58;
  for(let i=0;i<count;i++){const a=i*2.399963,t=.20+random()*.75,r=Math.sqrt(t)*.67,root=new THREE.Vector3(Math.cos(a)*r,.63+random()*.63,Math.sin(a)*r);
    const end=root.clone().add(new THREE.Vector3(Math.cos(a)*(.26+random()*.16),.07+random()*.12,Math.sin(a)*(.26+random()*.16)));leaf(b,root,end,.085+random()*.04,PALETTE.leaf,lowPower?3:4);
  }return finish(b);
}
function mossGeometry(lowPower){
  const g=new THREE.IcosahedronGeometry(1,lowPower?0:1),p=g.attributes.position,colors=[],c=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),v=1+Math.sin(x*11+z*7)*.08;p.setXYZ(i,x*v,y*.34*v,z*v);c.copy(PALETTE.moss).lerp(PALETTE.tip,Math.max(0,y)*.19);colors.push(c.r,c.g,c.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function flowerGeometry(lowPower){
  const b=bucket(),stems=lowPower?2:3;
  for(let s=0;s<stems;s++){
    const a=s*2.4,head=new THREE.Vector3(Math.cos(a)*.14,.35+s*.075,Math.sin(a)*.14);
    stem(b,new THREE.Vector3(0,0,0),head.clone().multiplyScalar(.55),head,.008,PALETTE.leaf,lowPower);
    for(let petal=0;petal<5;petal++){const angle=petal/5*Math.PI*2;leaf(b,head,head.clone().add(new THREE.Vector3(Math.cos(angle)*.11,.025,Math.sin(angle)*.11)),.048,s%2?PALETTE.gold:PALETTE.flower,lowPower?2:3,.09);}
    append(b,new THREE.IcosahedronGeometry(.026,0),new THREE.Matrix4().makeTranslation(head.x,head.y+.014,head.z),PALETTE.gold);
  }return finish(b);
}
function kelpGeometry(lowPower){
  const b=bucket(),rows=lowPower?7:10;
  for(let blade=0;blade<3;blade++){const first=b.p.length/3,a=blade*2.1;
    for(let row=0;row<=rows;row++){const t=row/rows,width=Math.pow(Math.sin(Math.PI*t),.7)*.14+.006,cx=Math.sin(t*3.1+a)*t*.26,cz=Math.cos(t*2.6+a)*t*.18,color=PALETTE.kelp.clone().lerp(PALETTE.tip,t*.26);
      for(const side of [-1,0,1])vertex(b,new THREE.Vector3(cx+Math.cos(a+t*.6)*width*side,t*(2.45-blade*.16),cz+Math.sin(a+t*.6)*width*side+Math.abs(side)*width*.16),color);
    }
    for(let row=0;row<rows;row++){const i=first+row*3;b.i.push(i,i+3,i+1,i+1,i+3,i+4,i+1,i+4,i+2,i+2,i+4,i+5);}
  }return finish(b);
}
function coralGeometry(lowPower,seed){
  const b=bucket(),random=randomSource(seed),branches=lowPower?6:8;
  for(let i=0;i<branches;i++){const a=i*2.399,r=.16+random()*.20,h=.36+random()*.41,end=new THREE.Vector3(Math.cos(a)*r,h,Math.sin(a)*r);
    stem(b,new THREE.Vector3(0,.02,0),new THREE.Vector3(end.x*.20,h*.66,end.z*.20),end,.034+random()*.018,PALETTE.coral,lowPower);
    if(i%2===0)stem(b,end.clone().multiplyScalar(.60),new THREE.Vector3(end.x*1.2,h*.69,end.z*.95),new THREE.Vector3(end.x*1.5,h*.85,end.z*1.1),.022,PALETTE.gold,lowPower);
  }return finish(b);
}
function fishGeometry(lowPower){
  const b=bucket(),body=new THREE.SphereGeometry(1,lowPower?8:12,lowPower?5:7),p=body.attributes.position,colors=[],color=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x*.19,y*.070,z*.058);color.copy(PALETTE.fish).lerp(PALETTE.gold,Math.max(0,-y)*.70);colors.push(color.r,color.g,color.b);}
  body.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));append(b,body,new THREE.Matrix4(),PALETTE.fish);
  const a=vertex(b,new THREE.Vector3(-.14,0,0),PALETTE.gold),c=vertex(b,new THREE.Vector3(-.29,.090,.005),PALETTE.fish),d=vertex(b,new THREE.Vector3(-.25,0,0),PALETTE.gold),e=vertex(b,new THREE.Vector3(-.29,-.090,-.005),PALETTE.fish);b.i.push(a,c,d,a,d,e);
  for(const side of [-1,1]){
    const i=vertex(b,new THREE.Vector3(.03,-.02,side*.052),PALETTE.gold),j=vertex(b,new THREE.Vector3(-.04,-.07,side*.13),PALETTE.fish),k=vertex(b,new THREE.Vector3(-.06,0,side*.05),PALETTE.fish);b.i.push(i,j,k);
    append(b,new THREE.IcosahedronGeometry(.012,0),new THREE.Matrix4().makeTranslation(.105,.025,side*.052),PALETTE.eye);
  }return finish(b);
}
function organicMaterial(time,{sway=.025,height=1.4,emissive=0,fish=false,actor=null,reactive=false}={}){
  const material=new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:fish?.45:.86,metalness:0,side:THREE.DoubleSide,emissive:new THREE.Color('#6fa997'),emissiveIntensity:emissive});
  const parameters={time,sway:{value:sway},height:{value:height},actor:actor||{value:new THREE.Vector3(10000,10000,10000)},reactive:{value:reactive?1:0}};
  material.userData.lushShader=parameters;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uLushTime=time;shader.uniforms.uLushSway=parameters.sway;shader.uniforms.uLushHeight=parameters.height;shader.uniforms.uLushActor=parameters.actor;shader.uniforms.uLushReactive=parameters.reactive;
    shader.vertexShader=['uniform float uLushTime;','uniform float uLushSway;','uniform float uLushHeight;','uniform vec3 uLushActor;','varying float vLushPhase;','varying float vLushNear;',shader.vertexShader].join('\n');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',[
      '#include <begin_vertex>','float lushPhase = 0.0;','#ifdef USE_INSTANCING','lushPhase = dot(instanceMatrix[3].xz, vec2(0.37, 0.51));','vec3 lushWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;','#else','vec3 lushWorld = (modelMatrix * vec4(position, 1.0)).xyz;','#endif','vLushPhase = lushPhase;','vLushNear = 1.0 - smoothstep(0.55, 2.4, distance(lushWorld, uLushActor));',
      fish?'transformed.z += sin(uLushTime * 8.5 + lushPhase + position.x * 9.0) * 0.032 * clamp((-position.x - 0.07) / 0.20, 0.0, 1.0);':[
        'float lushWeight = pow(clamp(position.y / max(0.1, uLushHeight), 0.0, 1.0), 1.7);','transformed.x += sin(uLushTime * 0.92 + lushPhase + position.y * 1.7) * uLushSway * lushWeight;','transformed.z += cos(uLushTime * 0.71 + lushPhase * 1.13) * uLushSway * lushWeight * 0.65;',
      ].join('\n'),
    ].join('\n'));
    shader.fragmentShader=['uniform float uLushTime;','uniform float uLushReactive;','varying float vLushPhase;','varying float vLushNear;',shader.fragmentShader].join('\n');
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',['#include <emissivemap_fragment>','totalEmissiveRadiance *= (0.84 + 0.16 * sin(uLushTime * 0.9 + vLushPhase)) * (1.0 + vLushNear * uLushReactive * 2.4);'].join('\n'));
  };
  material.customProgramCacheKey=()=>fish?'lush-aelys-fish-v1':'lush-aelys-organic-v1';return material;
}
/** Original coastal flora and marine ambience. Compact builds only arena groves. */
export function createLushAelys({lowPower=false,compact=false,seed=8173,positions=null,terrainHeight=()=>compact?0:-2,waterLevel=0,pixelRatio=1}={}){
  const group=new THREE.Group();group.name=compact?'Bosquets des arènes':'Aelys — rivage vivant';
  const random=randomSource(seed),time={value:0},actor={value:new THREE.Vector3(10000,10000,10000)};
  let previousTime=0,disposed=false;const geometries=new Set(),materials=new Set(),meshes=[],matrix=new THREE.Object3D(),tint=new THREE.Color();
  const centres=positions||(compact?[{x:-4.8,z:-3.8},{x:4.8,z:-3.8}]:[{x:-4.3,z:7.5},{x:4.8,z:6.2},{x:-5,z:2.8},{x:5.4,z:1.3},{x:-3.8,z:10.4},{x:4.2,z:11}]);
  const exclusions=[{x:.25,z:5.6,r:1.95},{x:0,z:-13,r:3.3},{x:4.2,z:3.4,r:1.55},{x:-6.1,z:-.4,r:1.55},{x:2.3,z:-8.1,r:1.55}];
  const allowed=(x,z,land)=>compact||(!(land&&Math.abs(x)<1.8&&z>-17&&z<13)&&exclusions.every(p=>Math.hypot(x-p.x,z-p.z)>p.r));
  const groundAt=(x,z)=>{const v=Number(terrainHeight(x,z));return Number.isFinite(v)?v:waterLevel-2;};
  const counts=compact?{grove:lowPower?2:3,fern:lowPower?4:7,moss:lowPower?12:22,flower:lowPower?4:7,kelp:0,coral:0,fish:0,motes:lowPower?16:28}:{grove:lowPower?6:10,fern:lowPower?12:22,moss:lowPower?50:100,flower:lowPower?12:24,kelp:lowPower?14:26,coral:lowPower?16:32,fish:lowPower?12:24,motes:lowPower?64:140};
  function landPlacements(count,spread,size,flatten=1){
    const result=[];
    for(let n=0;n<count*18&&result.length<count;n++){
      const centre=centres[n%centres.length],a=random()*Math.PI*2,r=Math.sqrt(random())*spread,x=centre.x+Math.cos(a)*r,z=centre.z+Math.sin(a)*r,y=groundAt(x,z);
      if(y<waterLevel+(compact?-.1:.13)||!allowed(x,z,true))continue;
      const scale=size*(.72+random()*.48);result.push({x,y:y+.025,z,scale,sy:scale*flatten,yaw:random()*Math.PI*2});
    }return result;
  }
  function marinePlacements(count,size,kelp=false){
    const result=[];
    for(let n=0;n<count*25&&result.length<count;n++){
      const side=result.length%2?-1:1,x=side*(3.2+random()*6.3),z=-2.2-random()*15,y=groundAt(x,z);
      if(y>waterLevel-.75||!allowed(x,z,false))continue;
      const scale=size*(.68+random()*.68),sy=kelp?Math.min(scale,Math.max(.2,(waterLevel-y-.25)/2.45)):scale;
      result.push({x,y:y+.03,z,scale,sy,yaw:random()*Math.PI*2});
    }return result;
  }
  function batch(name,geometry,material,placements){
    geometries.add(geometry);materials.add(material);if(!placements.length)return null;
    const mesh=new THREE.InstancedMesh(geometry,material,placements.length);mesh.name=name;mesh.castShadow=false;mesh.receiveShadow=true;
    for(let i=0;i<placements.length;i++){
      const p=placements[i];matrix.position.set(p.x,p.y,p.z);matrix.rotation.set(0,p.yaw,0);matrix.scale.set(p.scale,p.sy,p.scale);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);
      tint.setRGB(.86+random()*.13,.89+random()*.11,.82+random()*.16);mesh.setColorAt(i,tint);
    }
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.30;group.add(mesh);meshes.push(mesh);return mesh;
  }
  batch('Bosquets côtiers aux feuilles pliées',groveGeometry(lowPower,seed+3),organicMaterial(time,{sway:.035}),landPlacements(counts.grove,.52,compact?.70:.93));
  batch('Fougères du rivage',fernGeometry(lowPower),organicMaterial(time,{sway:.026,height:.95}),landPlacements(counts.fern,1.35,.88));
  batch('Coussins de mousse',mossGeometry(lowPower),organicMaterial(time,{sway:0}),landPlacements(counts.moss,1.8,.32,.75));
  batch('Floraisons côtières',flowerGeometry(lowPower),organicMaterial(time,{sway:.024,height:.6,emissive:.06,actor,reactive:true}),landPlacements(counts.flower,1.4,.82));
  if(!compact){
    batch('Herbiers ondoyants',kelpGeometry(lowPower),organicMaterial(time,{sway:.18,height:2.45,emissive:.035}),marinePlacements(counts.kelp,1.08,true));
    batch('Jardins coralliens',coralGeometry(lowPower,seed+47),organicMaterial(time,{sway:.004,height:.8,emissive:.16,actor,reactive:true}),marinePlacements(counts.coral,.80));
  }
  const fishData=new Float32Array(counts.fish*7),avoidance=new Float32Array(counts.fish*3);let fish=null;
  if(counts.fish){
    const initial=[];
    for(let i=0;i<counts.fish;i++){
      const k=i*7,side=i%2?-1:1;fishData[k]=side*(4.3+(i%3)*.8);fishData[k+1]=-4.2-(i%4)*2.25;fishData[k+2]=random()*Math.PI*2;fishData[k+3]=1.25+random()*.90;fishData[k+4]=.09+random()*.07;fishData[k+5]=.72+random()*.55;fishData[k+6]=.75+random()*.85;
      initial.push({x:fishData[k],y:waterLevel-1.5,z:fishData[k+1],scale:fishData[k+5],sy:fishData[k+5],yaw:0});
    }
    fish=batch('Petits bancs lumineux',fishGeometry(lowPower),organicMaterial(time,{emissive:.10,fish:true}),initial);fish.frustumCulled=false;fish.receiveShadow=false;fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const motePositions=new Float32Array(counts.motes*3),moteSeeds=new Float32Array(counts.motes);
  for(let i=0;i<counts.motes;i++){
    const centre=centres[i%centres.length],a=random()*Math.PI*2,r=random()*1.8,x=centre.x+Math.cos(a)*r,z=centre.z+Math.sin(a)*r;
    motePositions[i*3]=x;motePositions[i*3+1]=groundAt(x,z)+.25+random()*1.3;motePositions[i*3+2]=z;moteSeeds[i]=random()*Math.PI*2;
  }
  const moteGeometry=new THREE.BufferGeometry();moteGeometry.setAttribute('position',new THREE.BufferAttribute(motePositions,3));moteGeometry.setAttribute('aSeed',new THREE.BufferAttribute(moteSeeds,1));moteGeometry.computeBoundingSphere();moteGeometry.boundingSphere.radius+=.35;
  const moteMaterial=new THREE.ShaderMaterial({
    uniforms:{uLushTime:time,uPixelRatio:{value:Math.min(1.5,Math.max(1,pixelRatio))},uTint:{value:new THREE.Color('#a5ead4')}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:['attribute float aSeed;','uniform float uLushTime;','uniform float uPixelRatio;','varying float vGlow;','void main() {','vec3 p = position;','p.x += sin(uLushTime * 0.48 + aSeed) * 0.16;','p.y += sin(uLushTime * 0.69 + aSeed * 1.7) * 0.15;','p.z += cos(uLushTime * 0.42 + aSeed) * 0.12;','vec4 view = modelViewMatrix * vec4(p, 1.0);','gl_Position = projectionMatrix * view;','gl_PointSize = clamp(22.0 / max(1.0, -view.z), 1.4, 5.0) * uPixelRatio;','vGlow = 0.12 + 0.24 * pow(0.5 + 0.5 * sin(uLushTime * 1.2 + aSeed), 2.0);','}'].join('\n'),
    fragmentShader:['uniform vec3 uTint;','varying float vGlow;','void main() {','float radius = length(gl_PointCoord - vec2(0.5));','float alpha = (1.0 - smoothstep(0.08, 0.5, radius)) * vGlow;','if (alpha < 0.015) discard;','gl_FragColor = vec4(uTint, alpha);','#include <tonemapping_fragment>','#include <colorspace_fragment>','}'].join('\n'),
  });
  const motes=new THREE.Points(moteGeometry,moteMaterial);motes.name='Lueurs discrètes des bosquets';group.add(motes);geometries.add(moteGeometry);materials.add(moteMaterial);
  group.userData.fishAvoidanceOffsets=avoidance;
  group.userData.update=(elapsed,lumaPosition=null)=>{
    if(disposed||!Number.isFinite(elapsed))return;
    const dt=Math.min(.10,Math.max(0,elapsed-previousTime));previousTime=elapsed;time.value=elapsed;
    const hasActor=lumaPosition&&Number.isFinite(lumaPosition.x)&&Number.isFinite(lumaPosition.y)&&Number.isFinite(lumaPosition.z);
    if(hasActor)actor.value.copy(lumaPosition);else actor.value.set(10000,10000,10000);if(!fish)return;
    const blend=1-Math.exp(-4.5*dt);
    for(let i=0;i<counts.fish;i++){
      const k=i*7,q=i*3,angle=fishData[k+2]+elapsed*fishData[k+4],r=fishData[k+3],routeX=fishData[k]+Math.cos(angle)*r,routeZ=fishData[k+1]+Math.sin(angle)*r*.65,routeY=waterLevel-fishData[k+6]+Math.sin(elapsed*1.15+angle)*.09;
      let ox=0,oy=0,oz=0;
      if(hasActor){
        const dx=routeX+avoidance[q]-lumaPosition.x,dy=routeY+avoidance[q+1]-lumaPosition.y,dz=routeZ+avoidance[q+2]-lumaPosition.z,distance=Math.hypot(dx,dy,dz),threat=Math.max(0,1-distance/2.5),force=threat*threat*1.8,length=Math.max(.001,distance);
        ox=(distance>.001?dx/length:Math.cos(angle))*force;oz=(distance>.001?dz/length:Math.sin(angle))*force;oy=Math.max(-.35,Math.min(.20,dy/length*force*.3));
      }
      avoidance[q]+=(ox-avoidance[q])*blend;avoidance[q+1]+=(oy-avoidance[q+1])*blend;avoidance[q+2]+=(oz-avoidance[q+2])*blend;
      const x=routeX+avoidance[q],z=routeZ+avoidance[q+2],y=Math.max(groundAt(x,z)+.40,routeY+avoidance[q+1]);matrix.position.set(x,y,z);
      const routeYaw=-Math.atan2(Math.cos(angle)*.65,-Math.sin(angle)),turn=Math.atan2(-avoidance[q+2],avoidance[q]||.001);
      matrix.rotation.set(0,routeYaw+Math.sin(turn-routeYaw)*Math.min(.55,Math.hypot(avoidance[q],avoidance[q+2])*.35),0);matrix.scale.setScalar(y<waterLevel-.22?fishData[k+5]:0);matrix.updateMatrix();fish.setMatrixAt(i,matrix.matrix);
    }fish.instanceMatrix.needsUpdate=true;
  };
  group.userData.dispose=()=>{if(disposed)return;disposed=true;group.removeFromParent();meshes.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();};
  group.userData.stats={lowPower,compact,drawCalls:group.children.length,triangles:meshes.reduce((sum,m)=>sum+(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3*m.count,0),instances:meshes.reduce((sum,m)=>sum+m.count,0),requestedCounts:counts};
  group.userData.revision='lush-aelys-v1';group.userData.update(0);return group;
}
export function disposeLushAelys(group){group?.userData?.dispose?.();}
export default createLushAelys;
