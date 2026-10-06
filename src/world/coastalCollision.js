
function resolvePolygon(position,radius,outline){
  let inside=false,best=Infinity,qx=0,qz=0,nx=0,nz=0;
  const count=outline.length/2;
  for(let i=0,j=count-1;i<count;j=i++){
    const ax=outline[j*2],az=outline[j*2+1],bx=outline[i*2],bz=outline[i*2+1];
    if((az>position.z)!==(bz>position.z)&&position.x<(bx-ax)*(position.z-az)/(bz-az)+ax)inside=!inside;
    const ex=bx-ax,ez=bz-az,lenSq=ex*ex+ez*ez;
    // Closed contours repeat their first vertex; such an edge has no normal.
    if(lenSq<1e-12)continue;
    const t=Math.max(0,Math.min(1,((position.x-ax)*ex+(position.z-az)*ez)/(lenSq||1)));
    const x=ax+t*ex,z=az+t*ez,d=(position.x-x)**2+(position.z-z)**2;
    if(d<best){best=d;qx=x;qz=z;const len=Math.sqrt(lenSq)||1;nx=ez/len;nz=-ex/len;}
  }
  if(!inside&&best>=radius*radius)return false;
  if(!inside&&best>1e-10){const len=Math.sqrt(best);nx=(position.x-qx)/len;nz=(position.z-qz)/len;}
  position.x=qx+nx*(radius+.003);position.z=qz+nz*(radius+.003);
  return true;
}

/**
 * Solid coastal ellipses and the lagoon boundary. Pure horizontal resolution:
 * no jumps onto cliffs, and no changes to the controller's depth/oxygen rules.
 */
export function resolveCoastalMovement(position, previous, radius, blockers, boundary = 43) {
  const initialX = position.x, initialZ = position.z;
  position.x = Math.max(-boundary, Math.min(boundary, position.x));
  position.z = Math.max(-boundary, Math.min(boundary, position.z));
  for (const cliff of blockers) {
    if (position.y < cliff.bottom - radius || position.y > cliff.top + radius) continue;
    if(cliff.outlineAtHeight){
      if(Math.hypot(position.x-cliff.x,position.z-cliff.z)>cliff.broadRadius+radius)continue;
      resolvePolygon(position,radius,cliff.outlineAtHeight(position.y));
      continue;
    }
    const rx = cliff.rx + radius, rz = cliff.rz + radius;
    let dx = (position.x - cliff.x) / rx, dz = (position.z - cliff.z) / rz;
    const distance = Math.hypot(dx, dz);
    if (distance >= 1) continue;
    if (distance < 1e-8) {
      dx = (previous.x - cliff.x) / rx; dz = (previous.z - cliff.z) / rz;
      if (Math.hypot(dx, dz) < 1e-8) dx = 1;
    }
    const length = Math.hypot(dx, dz);
    position.x = cliff.x + dx / length * rx * 1.001;
    position.z = cliff.z + dz / length * rz * 1.001;
  }
  return Math.abs(position.x - initialX) + Math.abs(position.z - initialZ) > 1e-8;
}
