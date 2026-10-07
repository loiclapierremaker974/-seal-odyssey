/** Entry-triggered encounters; leaving a zone is required before a retry. */
export class EncounterDirector {
  constructor({encounters=[],resolvedIds=[]}={}) {
    this.encounters=encounters;
    this.resolved=new Set(resolvedIds.filter(id=>encounters.some(e=>e.id===id)));
    this.inside=new Set();
  }
  getNearby(position) {
    if(!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return null;
    return this.encounters.find(e=>!this.resolved.has(e.id) &&
      Math.hypot(position.x-e.position.x,position.z-e.position.z)<=e.radius) || null;
  }
  update(position,{enabled=true,airborne=false,jumpStage='idle'}={}) {
    if(!enabled||airborne||jumpStage!=='idle')return null;
    if(!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return null;
    const next=new Set(this.encounters.filter(e=>
      Math.hypot(position.x-e.position.x,position.z-e.position.z)<=e.radius).map(e=>e.id));
    const encounter=this.encounters.find(e=>next.has(e.id)&&!this.inside.has(e.id)&&!this.resolved.has(e.id));
    this.inside=next;
    return encounter || null;
  }
  markResolved(id) {
    if(!this.encounters.some(e=>e.id===id))return false;
    this.resolved.add(id);return true;
  }
  suppressUntilExit(id) {this.inside.add(id);}
}
