import * as THREE from 'three';

/** Static broad bounds exclude distant geology before an actual mesh raycast. */
export class CameraObstacles {
  constructor({ clearance = .30 } = {}) {
    this.clearance = clearance;
    this.entries = [];
    this.raycaster = new THREE.Raycaster();
    this.direction = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.hits = [];
  }

  add(mesh, { bounds = null, dynamic = false } = {}) {
    if (!mesh?.isMesh || !mesh.geometry) return;
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const entry = { mesh, dynamic, boxes: [] };
    if (bounds) {
      entry.boxes = bounds.map(box => box.clone().expandByScalar(this.clearance));
    } else if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, this.matrix);
        this.matrix.premultiply(mesh.matrixWorld);
        entry.boxes.push(mesh.geometry.boundingBox.clone()
          .applyMatrix4(this.matrix).expandByScalar(this.clearance));
      }
    } else {
      entry.boxes.push(mesh.geometry.boundingBox.clone()
        .applyMatrix4(mesh.matrixWorld).expandByScalar(this.clearance));
    }
    this.entries.push(entry);
  }

  /** Mutates the proposed camera position, never Luma or a solid mesh. */
  resolve(target, position) {
    this.direction.subVectors(position, target);
    const distance = this.direction.length();
    if (!Number.isFinite(distance) || distance < 1e-6) return position;
    this.direction.multiplyScalar(1 / distance);
    this.raycaster.set(target, this.direction);
    this.raycaster.near = 0;
    let allowed = distance;
    for (const entry of this.entries) {
      const mesh = entry.mesh;
      if (!mesh.visible) continue;
      mesh.updateWorldMatrix(true, false);
      if (entry.dynamic) {
        entry.boxes[0].copy(mesh.geometry.boundingBox)
          .applyMatrix4(mesh.matrixWorld).expandByScalar(this.clearance);
      }
      const far = allowed + this.clearance;
      let nearby = false;
      for (const box of entry.boxes) {
        if (box.containsPoint(target)) { nearby = true; break; }
        if (this.raycaster.ray.intersectBox(box, this.point) &&
            this.point.distanceToSquared(target) <= far * far) {
          nearby = true; break;
        }
      }
      if (!nearby) continue;
      this.hits.length = 0;
      this.raycaster.far = far;
      mesh.raycast(this.raycaster, this.hits);
      for (const hit of this.hits) {
        if (hit.distance > 1e-5) {
          allowed = Math.min(allowed, Math.max(.001, hit.distance - this.clearance));
        }
      }
    }
    position.copy(target).addScaledVector(this.direction, allowed);
    this.hits.length = 0;
    return position;
  }
}
export default CameraObstacles;
