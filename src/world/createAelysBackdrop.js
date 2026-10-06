import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const UP=new THREE.Vector3(0,1,0), ONE=new THREE.Vector3(1,1,1);
const STONE=new THREE.Color('#c5bfaf'), ROCK=new THREE.Color('#adaca0'), MOSS=new THREE.Color('#4e6242');
function hash(x,y,z,seed=0){const n=Math.sin(x*12.9898+y*78.233+z*37.719+seed*17.123)*43758.5453;return n-Math.floor(n);}
function bucket(){return {positions:[],normals:[],colors:[],indices:[]};}
function transform(x,y,z,angle=0){return new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(UP,angle),ONE);}
function append(target,geometry,matrix,tint,seed=0){
  if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),colors=geometry.getAttribute('color');
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),p=new THREE.Vector3(),n=new THREE.Vector3(),offset=target.positions.length/3;
  for(let i=0;i<positions.count;i++){
    p.fromBufferAttribute(positions,i).applyMatrix4(matrix);
    n.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
    target.positions.push(p.x,p.y,p.z);target.normals.push(n.x,n.y,n.z);
    if(colors)target.colors.push(colors.getX(i),colors.getY(i),colors.getZ(i));
    else {const shade=.88+hash(p.x*.35,p.y*.35,p.z*.35,seed)*.15;target.colors.push(tint.r*shade,tint.g*shade,tint.b*shade);}
  }
  const index=geometry.getIndex();
  if(index)for(let i=0;i<index.count;i++)target.indices.push(offset+index.getX(i));
  else for(let i=0;i<positions.count;i++)target.indices.push(offset+i);
  geometry.dispose();
}
function finish(target){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(target.positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(target.normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(target.colors,3));
  const uv=[];
  for(let i=0;i<target.positions.length;i+=3){
    const x=target.positions[i],y=target.positions[i+1],z=target.positions[i+2];
    uv.push((x+z*.37)*.24,y*.22+z*.05);
  }
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(target.indices);g.computeBoundingSphere();return g;
}

function limestoneSurface(highDetail){
  const size=highDetail?512:256,data=new Uint8Array(size*size*4),colourData=new Uint8Array(size*size*4);
  const smooth=t=>t*t*(3-2*t),wrap=(n,p)=>((n%p)+p)%p;
  const noise=(u,v,cells)=>{
    const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
    const sample=(dx,dy)=>hash(wrap(ix+dx,cells),wrap(iy+dy,cells),cells,4.71);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(0,0),sample(1,0),fx),THREE.MathUtils.lerp(sample(0,1),sample(1,1),fx),fy);
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,coarse=noise(u,v,8),medium=noise(u,v,32),grain=noise(u,v,128);
    const crack=Math.pow(1-Math.abs(noise(u,v,10)*2-1),10);
    const layer=Math.pow(Math.max(0,Math.sin(v*Math.PI*26+noise(u,v,4)*1.7)),8),i=(y*size+x)*4;
    data[i]=Math.round((.52+(coarse-.5)*.2+(medium-.5)*.13+(grain-.5)*.07-crack*.12-layer*.06)*255);
    data[i+1]=Math.round((.82+grain*.12-layer*.035)*255);data[i+2]=data[i];data[i+3]=255;
    const brightness=218+(coarse-.5)*38+(medium-.5)*22+(grain-.5)*12-crack*32-layer*12;
    const iron=Math.max(0,noise(u+.21,v,6)-.55)*12;
    colourData[i]=Math.round(brightness+iron);colourData[i+1]=Math.round(brightness-iron*.4);
    colourData[i+2]=Math.round(brightness-iron*1.6);colourData[i+3]=255;
  }
  const map=new THREE.DataTexture(data,size,size);map.colorSpace=THREE.NoColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;
  const colour=new THREE.DataTexture(colourData,size,size);
  colour.colorSpace=THREE.SRGBColorSpace;colour.wrapS=colour.wrapT=THREE.RepeatWrapping;
  colour.minFilter=THREE.LinearMipmapLinearFilter;colour.magFilter=THREE.LinearFilter;
  colour.generateMipmaps=true;colour.anisotropy=4;colour.needsUpdate=true;
  return {relief:map,colour};
}

function cliffPoint(cliff,angle,t){
  const joint=Math.pow(Math.max(0,Math.cos(angle*9+cliff.seed)),12);
  const outline=.94+Math.sin(angle*3+cliff.seed)*.16+Math.cos(angle*7-cliff.seed*.7)*.085+Math.sin(angle*17+cliff.seed)*.025-joint*.085;
  const layerPhase=t*Math.PI*11+cliff.seed+Math.sin(angle*3+cliff.seed)*.65+Math.sin(angle*11+t*5)*.12;
  const shelf=.034*Math.tanh(Math.sin(layerPhase)*3.5);
  const fluting=.024*Math.sin(angle*29+Math.sin(t*7+cliff.seed)*1.7)*Math.sin(Math.PI*t);
  const profile=.80+Math.sin(t*Math.PI*.88)*.18+Math.pow(1-t,4)*.28+shelf+fluting+Math.sin(t*19+cliff.seed)*.025;
  const radius=cliff.radius*outline*profile;
  return new THREE.Vector3(
    cliff.x+Math.cos(angle)*radius*1.18+Math.sin(t*2.1+cliff.seed)*t*.75,
    THREE.MathUtils.lerp(-5.3,cliff.height+Math.sin(angle*2+cliff.seed)*.55+Math.cos(angle*5)*.25,t),
    cliff.z+Math.sin(angle)*radius*.86+Math.cos(t*1.7+cliff.seed)*t*.55);
}
function cliffGeometry(cliff,highDetail){
  const radial=highDetail?48:24,bands=highDetail?36:18,p=[],c=[],idx=[];
  for(let row=0;row<=bands;row++){
    const t=row/bands;
    for(let i=0;i<radial;i++){
      const angle=i*Math.PI*2/radial,point=cliffPoint(cliff,angle,t);p.push(point.x,point.y,point.z);
      const damp=THREE.MathUtils.lerp(.52,1,THREE.MathUtils.smoothstep(point.y,-.6,3.2));
      const stratum=.91+Math.sin(point.y*2.4+cliff.seed)*.065+Math.sin(point.y*7.2+angle*.35)*.030;
      const shade=stratum*damp*(.86+hash(point.x*.65,point.y*.2,point.z*.65,cliff.seed)*.16);
      const seam=Math.pow(.5+.5*Math.cos(angle*12+cliff.seed),10);
      const moss=THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(t,.38,.98)*seam*.82,0,.72);
      c.push(THREE.MathUtils.lerp(ROCK.r*shade,MOSS.r*.68,moss),THREE.MathUtils.lerp(ROCK.g*shade,MOSS.g*.76,moss),THREE.MathUtils.lerp(ROCK.b*shade,MOSS.b*.64,moss));
    }
  }
  for(let row=0;row<bands;row++)for(let i=0;i<radial;i++){
    const next=(i+1)%radial,a=row*radial+i,b=(row+1)*radial+i,cc=(row+1)*radial+next,d=row*radial+next;
    idx.push(a,b,cc,a,cc,d);
  }
  const center=p.length/3;p.push(cliff.x,cliff.height,cliff.z);c.push(ROCK.r*.93,ROCK.g*.93,ROCK.b*.93);
  const innerStart=p.length/3;
  for(let i=0;i<radial;i++){
    const point=cliffPoint(cliff,i*Math.PI*2/radial,1);
    p.push(THREE.MathUtils.lerp(cliff.x,point.x,.58),cliff.height,THREE.MathUtils.lerp(cliff.z,point.z,.58));
    c.push(ROCK.r*.95,ROCK.g*.95,ROCK.b*.95);
  }
  const outerStart=bands*radial;
  for(let i=0;i<radial;i++){
    const next=(i+1)%radial;
    idx.push(center,innerStart+next,innerStart+i,innerStart+i,outerStart+next,outerStart+i,innerStart+i,innerStart+next,outerStart+next);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

/** Intersect the rendered Float32 side triangles at the player's depth. */
function cliffBlocker(cliff,geometry,radial,bands){
  const p=geometry.getAttribute('position').array,index=geometry.getIndex().array;
  const segments=[],outline=[],used=new Uint8Array(radial*bands*2),limit=radial*bands*6;
  return {
    x:cliff.x,z:cliff.z,top:cliff.height+.8,bottom:-5.3,
    rx:cliff.radius*1.18,rz:cliff.radius*.86,broadRadius:cliff.radius*2.1,
    outlineAtHeight(y){
      segments.length=0;outline.length=0;
      for(let f=0;f<limit;f+=3){
        let hits=0,ax=0,az=0,bx=0,bz=0;
        for(let e=0;e<3;e++){
          const a=index[f+e]*3,b=index[f+(e+1)%3]*3,ya=p[a+1],yb=p[b+1];
          if(!((ya<=y&&yb>y)||(yb<=y&&ya>y)))continue;
          const t=(y-ya)/(yb-ya),x=p[a]+(p[b]-p[a])*t,z=p[a+2]+(p[b+2]-p[a+2])*t;
          if(hits++===0){ax=x;az=z;}else{bx=x;bz=z;}
        }
        if(hits===2&&(ax-bx)**2+(az-bz)**2>1e-12)segments.push(ax,az,bx,bz);
      }
      const count=segments.length/4;
      if(!count)return outline;
      used.fill(0,0,count);used[0]=1;outline.push(segments[0],segments[1]);
      let x=segments[2],z=segments[3];
      for(let step=1;step<=count;step++){
        outline.push(x,z);
        let found=-1,reverse=false;
        for(let i=1;i<count;i++){
          if(used[i])continue;
          const o=i*4;
          if((segments[o]-x)**2+(segments[o+1]-z)**2<1e-8){found=i;break;}
          if((segments[o+2]-x)**2+(segments[o+3]-z)**2<1e-8){found=i;reverse=true;break;}
        }
        if(found<0)break;
        used[found]=1;const o=found*4+(reverse?0:2);x=segments[o];z=segments[o+1];
      }
      let area=0;
      for(let i=0,j=outline.length-2;i<outline.length;j=i,i+=2)area+=outline[j]*outline[i+1]-outline[i]*outline[j+1];
      if(area<0)for(let i=0,j=outline.length-2;i<j;i+=2,j-=2){
        const x=outline[i],z=outline[i+1];outline[i]=outline[j];outline[i+1]=outline[j+1];outline[j]=x;outline[j+1]=z;
      }
      return outline;
    }
  };
}

function stoneBlock(width,height,depth,seed){
  const g=new THREE.BoxGeometry(width,height,depth),p=g.getAttribute('position'),amount=Math.min(width,height,depth)*.055;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    p.setXYZ(i,x+(hash(x,y,z,seed)-.5)*amount,y+(hash(y,z,x,seed+1)-.5)*amount,z+(hash(z,x,y,seed+2)-.5)*amount);
  }
  g.computeVertexNormals();return g;
}
function voussoir(a0,a1,inner,outer,depth){
  const outline=[[Math.cos(a0)*inner,Math.sin(a0)*inner],[Math.cos(a0)*outer,Math.sin(a0)*outer],[Math.cos(a1)*outer,Math.sin(a1)*outer],[Math.cos(a1)*inner,Math.sin(a1)*inner]],p=[];
  for(const z of [depth/2,-depth/2])for(const [x,y] of outline)p.push(x,y,z);
  const idx=[0,1,2,0,2,3,4,6,5,4,7,6];
  for(let i=0;i<4;i++){const next=(i+1)%4;idx.push(i,i+4,next+4,i,next+4,next);}
  const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(p,3));indexed.setIndex(idx);
  const g=indexed.toNonIndexed();indexed.dispose();g.computeVertexNormals();return g;
}
function arch(target,x,y,z,angle,highDetail,seed){
  const root=transform(x,y,z,angle),inner=2.3,outer=3.2,spring=3.65,depth=1.85,courses=highDetail?8:5;
  for(const side of [-1,1]){
    for(let row=0;row<courses;row++){
      const h=spring/courses;
      append(target,stoneBlock(outer-inner,h*.975,depth,seed+row+side*9),root.clone().multiply(transform(side*(inner+outer)/2,(row+.5)*h,0)),STONE,seed+row);
    }
    append(target,stoneBlock(1.35,.35,2.25,seed+side),root.clone().multiply(transform(side*2.75,.16,0)),STONE,seed);
    append(target,stoneBlock(1.22,.25,2.12,seed+side+2),root.clone().multiply(transform(side*2.75,spring-.09,0)),STONE,seed);
  }
  const segments=highDetail?19:13;
  for(let i=0;i<segments;i++)append(target,voussoir(i*Math.PI/segments+.0045,(i+1)*Math.PI/segments-.0045,inner,outer,depth),root.clone().multiply(transform(0,spring,0)),STONE,seed+i*.3);
}
function tower(target,x,y,z,height,radius,highDetail,seed){
  const courses=highDetail?10:6,radial=highDetail?9:7;
  for(let i=0;i<courses;i++){
    const h=height/courses,r=radius*(1-i/courses*.12);
    append(target,new THREE.CylinderGeometry(r*.99,r*1.01,h*.975,radial),transform(x+Math.sin(i*2.3+seed)*.025,y+(i+.5)*h,z,seed+i*.12),STONE,seed+i);
  }
  append(target,new THREE.CylinderGeometry(radius*1.03,radius*.9,.38,radial),transform(x,y+height,z,seed),STONE,seed+9);
  const crown=highDetail?7:5;
  for(let i=0;i<crown;i++){
    const a=i*Math.PI*2/crown+seed;if(i===1||i===crown-1)continue;
    append(target,stoneBlock(.46,.56+hash(i,0,0,seed)*.34,.52,seed+i),transform(x+Math.cos(a)*radius*.85,y+height+.44,z+Math.sin(a)*radius*.85,-a),STONE,seed+i);
  }
}
function mossPatch(x,y,z,radius,seed,highDetail){
  const radial=highDetail?11:7,p=[x,y+radius*.12,z],c=[MOSS.r,MOSS.g,MOSS.b],idx=[];
  for(let i=0;i<radial;i++){
    const a=i*Math.PI*2/radial,r=radius*(.78+hash(i,seed,0,seed)*.3);
    p.push(x+Math.cos(a)*r,y+hash(i,0,0,seed)*.06,z+Math.sin(a)*r);
    const shade=.82+hash(i,0,1,seed)*.3;c.push(MOSS.r*shade,MOSS.g*shade,MOSS.b*shade);
  }
  for(let i=0;i<radial;i++)idx.push(0,1+(i+1)%radial,1+i);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function waterfallGeometry(cliff,angle,width,highDetail){
  const count=highDetail?18:10,p=[],uv=[],idx=[],low=5.4/(cliff.height+5.3);
  for(let row=0;row<=count;row++){
    const t=THREE.MathUtils.lerp(low,.93,row/count),point=cliffPoint(cliff,angle,t),halfWidth=width*(.45+.08*Math.sin(row*1.6));
    for(const side of [-1,1]){
      p.push(point.x+Math.cos(angle)*.15-Math.sin(angle)*halfWidth*side,point.y,point.z+Math.sin(angle)*.15+Math.cos(angle)*halfWidth*side);
      uv.push((side+1)/2,row/count);
    }
  }
  for(let row=0;row<count;row++){const a=row*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function waterfallMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0}}]),
    vertexShader:`
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){
        vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader:`
      uniform float uTime;varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float edge=smoothstep(0.0,0.18,vUv.x)*smoothstep(0.0,0.18,1.0-vUv.x);
        float streak=pow(max(0.0,sin(vUv.y*145.0+uTime*5.8+sin(vUv.x*16.0)*2.0)),7.0);
        float thread=0.5+0.5*sin(vUv.x*47.0+sin(vUv.y*17.0+uTime)*0.7);
        vec3 colour=mix(vec3(0.41,0.68,0.67),vec3(0.86,0.91,0.83),streak*0.65+thread*0.16);
        gl_FragColor=vec4(colour,edge*(0.13+streak*0.27+thread*0.08));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  });
}
/** Coastal scenery built from indexed rock strata and individually shaped masonry. */
export function createAelysBackdrop({highDetail=true}={}){
  const group=new THREE.Group();group.name='Aelys — falaises et ruines côtières';
  const geology=bucket(),masonry=bucket(),vegetation=bucket(),identity=new THREE.Matrix4();
  const cliffs=[
    {x:-31,z:-19,radius:7.5,height:12.8,seed:2.1},{x:-36,z:-7,radius:5.2,height:8.4,seed:4.9},
    {x:-20,z:-35,radius:6,height:18.4,seed:1.1},{x:-6,z:-36,radius:7.4,height:13.5,seed:3.9},
    {x:12,z:-39,radius:7,height:18.7,seed:6.1},{x:29,z:-25,radius:7.1,height:15.2,seed:2.6},
    {x:36,z:-11,radius:5.3,height:10.5,seed:5.4}
  ];
  for(const cliff of cliffs){
    const cliffMesh=cliffGeometry(cliff,highDetail);
    cliff.blocker=cliffBlocker(cliff,cliffMesh,highDetail?48:24,highDetail?36:18);
    // Keep limestone breaks crisp while retaining smooth erosion on small bends.
    const shaded=toCreasedNormals(cliffMesh,Math.PI*32/180);
    if(shaded!==cliffMesh)cliffMesh.dispose();
    append(geology,shaded,identity,ROCK);
    for(let i=0;i<(highDetail?9:5);i++){
      const a=i*2.399963+cliff.seed,offset=cliff.radius*(.12+hash(i,1,0,cliff.seed)*.32);
      append(vegetation,mossPatch(cliff.x+Math.cos(a)*offset,cliff.height+.055,cliff.z+Math.sin(a)*offset,.8+hash(i,2,0,cliff.seed)*.9,cliff.seed+i,highDetail),identity,MOSS);
    }
    for(let i=0;i<(highDetail?5:3);i++){
      const a=i*1.23+cliff.seed,point=cliffPoint(cliff,a,.17);
      const rock=new THREE.IcosahedronGeometry(.85+hash(i,3,0,cliff.seed)*.75,highDetail?1:0);rock.scale(1.2,.72,1.05);
      append(geology,rock,transform(point.x,-.28,point.z,a),ROCK,cliff.seed+i);
    }
  }
  arch(masonry,-6,13.42,-35.7,.1,highDetail,8);
  tower(masonry,-11,13.42,-36.6,7.1,1.18,highDetail,1.6);
  tower(masonry,-19.5,18.3,-35.2,4.5,.92,highDetail,2.3);
  tower(masonry,12.2,18.55,-39.1,4.1,1.1,highDetail,4.1);
  arch(masonry,29,15.1,-24.7,-.45,highDetail,12);
  for(let i=0;i<6;i++)for(let row=0;row<(i<2?3:i<4?2:1);row++){
    append(masonry,stoneBlock(.94,.55,.78,31+i+row),transform(-11.3+i*.91,13.7+row*.54,-38.25,.05),STONE,i+row);
  }
  const fallen=new THREE.CylinderGeometry(.42,.53,2.8,highDetail?9:6);fallen.rotateZ(Math.PI/2);
  append(masonry,fallen,transform(-4.3,13.95,-38.1,-.3),STONE,22);
  const limestone=limestoneSurface(highDetail);
  for(const [data,roughness,name] of [[geology,.96,'Falaises stratifiées'],[masonry,.88,'Maçonnerie ancienne'],[vegetation,1,'Mousses des plateaux']]){
    const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness,metalness:0});
    if(data!==vegetation){
      material.map=limestone.colour;material.bumpMap=limestone.relief;material.roughnessMap=limestone.relief;material.roughness=1;
      material.bumpScale=data===geology?.22:.10;
    }
    const mesh=new THREE.Mesh(finish(data),material);mesh.name=name;
    mesh.castShadow=highDetail&&data===masonry;mesh.receiveShadow=highDetail;group.add(mesh);
  }
  const fallsMaterial=waterfallMaterial();
  for(const fall of [{cliff:cliffs[0],angle:.68,width:.56},{cliff:cliffs[5],angle:2.14,width:.42}]){
    const mesh=new THREE.Mesh(waterfallGeometry(fall.cliff,fall.angle,fall.width,highDetail),fallsMaterial);
    mesh.name='Cascade côtière';mesh.renderOrder=1;group.add(mesh);
  }
  group.userData.kind='aelys-backdrop';group.userData.isProcedural=true;
  group.userData.blockers=cliffs.map(cliff=>cliff.blocker);
  group.userData.update=time=>{if(Number.isFinite(time))fallsMaterial.uniforms.uTime.value=time;};
  return group;
}
