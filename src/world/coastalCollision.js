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
