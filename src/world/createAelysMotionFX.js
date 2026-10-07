import * as THREE from 'three';

// Bounded reusable contact particles; no geometry is allocated during motion.
export function createAelysMotionFX({ lowPower = false, waterLevel = 0, surfaceHeight } = {}) {
  const group = new THREE.Group(), count = lowPower ? 36 : 72;
  const position = new Float32Array(count * 3), velocity = new Float32Array(count * 3);
  const colour = new Float32Array(count * 3), life = new Float32Array(count);
  const size = new Float32Array(count), age = new Float32Array(count), duration = new Float32Array(count);
  const kind = new Uint8Array(count);
  const sand = new THREE.Color('#dbc28e'), spray = new THREE.Color('#d1fff2');
  const geometry = new THREE.BufferGeometry();
  for (const [name, data, itemSize] of [['position', position, 3], ['color', colour, 3], ['aLife', life, 1], ['aSize', size, 1]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(data, itemSize).setUsage(THREE.DynamicDrawUsage));
  }
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `
      attribute vec3 color; attribute float aLife; attribute float aSize;
      varying vec3 vColor; varying float vLife;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vColor=color; vLife=aLife;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        gl_PointSize=clamp(aSize*190./max(1.,-mvPosition.z),1.,16.);
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vLife;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 q=gl_PointCoord*2.-1.; float d=dot(q,q);
        float alpha=(1.-smoothstep(.2,1.,d))*vLife*.7;
        if(alpha<.01) discard;
        gl_FragColor=vec4(vColor,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; points.renderOrder = 6; group.add(points);
  const ringGeometry = new THREE.RingGeometry(.78, 1, lowPower ? 20 : 32);
  const rings = Array.from({ length: lowPower ? 3 : 4 }, () => {
    const mesh = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
      color: 0xe2fff2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI/2; mesh.visible = false; mesh.renderOrder = 5; group.add(mesh);
    return { mesh, age: 1, duration: 1, radius: 1, opacity: 0 };
  });
  let cursor = 0, ringCursor = 0, time = 0, timer = 0;
  function burst(at, strength, water, amount) {
    const tint = water ? spray : sand;
    for (let j=0; j<amount; j++) {
      const i=cursor++%count, k=i*3, angle=Math.random()*Math.PI*2, radius=Math.random()*.18;
      position[k]=at.x+Math.cos(angle)*radius; position[k+1]=at.y+.06; position[k+2]=at.z+Math.sin(angle)*radius;
      const speed=(.4+Math.random()*.8)*(.4+strength);
      velocity[k]=Math.cos(angle)*speed; velocity[k+1]=(.6+Math.random()*1.3)*(water?1.4:.65)*(strength+.35); velocity[k+2]=Math.sin(angle)*speed;
      colour[k]=tint.r; colour[k+1]=tint.g; colour[k+2]=tint.b;
      size[i]=water?.06+Math.random()*.035:.055+Math.random()*.07;
      duration[i]=(water?.55:.38)+Math.random()*.22; age[i]=0; life[i]=1; kind[i]=water?1:0;
    }
  }
  function ripple(at, strength=.3) {
    const r=rings[ringCursor++%rings.length];
    r.mesh.position.set(at.x,waterLevel+.065,at.z); r.age=0;
    r.duration=.65+strength*.35; r.radius=.55+strength*1.45; r.opacity=.16+strength*.30; r.mesh.visible=true;
  }
  function land(at, strength=.5) { burst(at,THREE.MathUtils.clamp(strength,0,1),false,lowPower?12:22); }
  function splash(at, strength=.5) {
    const s=THREE.MathUtils.clamp(strength,0,1), origin={x:at.x,y:waterLevel+.02,z:at.z};
    burst(origin,s,true,lowPower?16:30); ripple(origin,s);
  }
  function update(at, state={}, delta=0) {
    const dt=THREE.MathUtils.clamp(Number(delta)||0,0,.06); time+=dt; timer+=dt;
    const speed=THREE.MathUtils.clamp(state.normalizedSpeed||0,0,1);
    if (at && !state.airborne && timer>.24 && speed>.12) {
      if (state.mode==='surface') ripple(at,.08+speed*.10);
      else if (state.mode==='land') burst(at,.10,false,lowPower?2:3);
      timer=0;
    }
    for (let i=0;i<count;i++) {
      if(life[i]<=0)continue; const k=i*3; age[i]+=dt; life[i]=Math.max(0,1-age[i]/duration[i]);
      velocity[k+1]-=dt*(kind[i]?6.8:3.8);
      position[k]+=velocity[k]*dt; position[k+1]+=velocity[k+1]*dt; position[k+2]+=velocity[k+2]*dt;
    }
    for(const r of rings) {
      if(!r.mesh.visible)continue; r.age+=dt; const u=THREE.MathUtils.clamp(r.age/r.duration,0,1);
      r.mesh.visible=u<1; r.mesh.scale.setScalar(.12+u*r.radius); r.mesh.material.opacity=r.opacity*(1-u)*(1-u);
      const x=r.mesh.position.x,z=r.mesh.position.z;
      r.mesh.position.y=surfaceHeight ? surfaceHeight(x,z)+.035 : waterLevel+.065+Math.sin(x*.34+time*.72)*.075+Math.cos(z*.43-time*.56)*.052+Math.sin((x+z)*.77+time)*.022;
    }
    for(const name of ['position','color','aLife','aSize']) geometry.attributes[name].needsUpdate=true;
  }
  function dispose() { geometry.dispose(); material.dispose(); ringGeometry.dispose(); for(const r of rings)r.mesh.material.dispose(); }
  group.name='Éclaboussures et sable de Luma';
  Object.assign(group.userData,{update,land,splash,ripple,dispose});
  return group;
}
