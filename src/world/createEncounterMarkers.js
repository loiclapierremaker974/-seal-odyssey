import * as THREE from 'three';

/** Original world signals for the three optional current encounters. */
export function createEncounterMarkers(encounters,{sampleEnvironment}={}) {
  const group=new THREE.Group();group.name='Rencontres des courants';
  const ringGeometry=new THREE.TorusGeometry(.62,.023,6,40);
  const coreGeometry=new THREE.IcosahedronGeometry(.12,1);
  const entries=[];
  for(const encounter of encounters) {
    const sample=sampleEnvironment(encounter.position);
    const y=Math.max(sample.groundHeight+.12,sample.waterLevel+.10);
    const marker=new THREE.Group();
    marker.name=encounter.name;marker.position.set(encounter.position.x,y,encounter.position.z);
    const material=new THREE.MeshBasicMaterial({color:0x9aecde,transparent:true,opacity:.78,depthWrite:false});
    const ring=new THREE.Mesh(ringGeometry,material);ring.rotation.x=-Math.PI/2;
    const core=new THREE.Mesh(coreGeometry,material);core.position.y=.48;
    const upperRing=new THREE.Mesh(ringGeometry,material);upperRing.scale.setScalar(.40);upperRing.position.y=.38;
    marker.add(ring,core,upperRing);group.add(marker);
    entries.push({id:encounter.id,marker,material,ring,core,upperRing,resolved:false});
  }
  group.userData.setResolved=ids=>{
    const resolved=new Set(ids);
    for(const entry of entries){
      entry.resolved=resolved.has(entry.id);
      entry.material.color.setHex(entry.resolved?0xe7c48b:0x9aecde);
      entry.material.opacity=entry.resolved?.30:.78;
      entry.core.visible=!entry.resolved;entry.upperRing.visible=!entry.resolved;
    }
  };
  group.userData.update=elapsed=>{
    for(let i=0;i<entries.length;i++){
      const e=entries[i],phase=elapsed*1.4+i;
      e.core.position.y=.48+Math.sin(phase)*.08;
      e.core.rotation.y=elapsed*.9;
      e.upperRing.rotation.z=elapsed*.6;
      e.ring.scale.setScalar(e.resolved?1:1+Math.sin(phase)*.045);
    }
  };
  return group;
}
