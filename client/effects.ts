import * as THREE from 'three';
import type { ActorRig } from './actors';
import type { Point } from '../shared/model';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export interface EffectEvent extends Point { kind: string; amount?: number; sourceId?: string; targetId?: string; skillId?: string; fromX?: number; fromZ?: number; lootKind?: string; critical?: boolean }
interface Visual { object: THREE.Object3D; start: number; duration: number; kind: string; update: (t: number, dt: number) => void }
interface FloatingNumber { element: HTMLDivElement; point: Point; start: number; duration: number }

/** Bounded, reusable event-driven feedback. Rendering never applies rewards or damage. */
export class Effects {
  private active: Visual[] = [];
  private numbers: FloatingNumber[] = [];
  events: Record<string, number> = {};
  presented: Record<string, number> = {};
  constructor(private scene: THREE.Scene, private actors: Map<string, ActorRig>, private labels: HTMLElement, private project: (p: Point, height?: number) => { x: number; y: number; visible: boolean }, private self: () => string) {}
  private dispose(object: THREE.Object3D): void { object.removeFromParent(); object.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { o.geometry.dispose(); if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => { if (!m.userData.shared) m.dispose(); }); } }); }
  private add(object: THREE.Object3D, kind: string, duration: number, update: Visual['update']): void {
    if (this.active.length >= 100) this.dispose(this.active.shift()!.object);
    this.scene.add(object); this.active.push({ object, kind, duration, start: performance.now(), update });
  }
  private burst(point: Point, color: number, kind: string, amount = 18, radius = 1, height = 1): void {
    const positions = new Float32Array(amount * 3), velocities = new Float32Array(amount * 3);
    for (let i = 0; i < amount; i++) { const a = i * 2.399; velocities.set([Math.cos(a) * radius, 0.3 + i % 5 * 0.16, Math.sin(a) * radius], i * 3); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size: 0.075, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(geometry, material); particles.position.set(point.x, height, point.z);
    this.add(particles, kind, 500, t => {
      for (let i = 0; i < amount; i++) { positions[i * 3] = velocities[i * 3] * t; positions[i * 3 + 1] = velocities[i * 3 + 1] * t - t * t * 0.8; positions[i * 3 + 2] = velocities[i * 3 + 2] * t; }
      geometry.attributes.position.needsUpdate = true; material.opacity = (1 - t) * 0.9;
    });
  }
  private ring(point: Point, color: number, radius: number, kind: string, duration = 600): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 64), material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(point.x, 0.1, point.z);
    this.add(mesh, kind, duration, t => { mesh.scale.setScalar(0.25 + radius * t); material.opacity = (1 - t) * 0.75; });
  }
  private damage(event: EffectEvent, point = event): void {
    const element = document.createElement('div'); element.className = `world-label damage-label ${event.kind === 'received' && event.targetId === this.self() ? 'received' : event.kind === 'magic' ? 'magical' : ''} ${event.critical ? 'critical' : ''}`;
    element.textContent = event.kind === 'miss' ? 'MISS' : `${event.critical ? '✦ ' : ''}${Math.round(event.amount ?? 0)}`;
    this.labels.append(element); if (this.numbers.length >= 35) this.numbers.shift()!.element.remove();
    this.numbers.push({ element, point: { ...point }, start: performance.now(), duration: 800 });
  }
  private projectile(event: EffectEvent, arrow: boolean, fan = 0): void {
    const source = event.sourceId ? this.actors.get(event.sourceId) : undefined; if (!source) return;
    source.group.updateMatrixWorld(true);
    const from = source.hands[1]?.getWorldPosition(new THREE.Vector3()) ?? source.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    from.y = Math.max(0.8, from.y); const to = new THREE.Vector3(event.x, 1, event.z);
    const color = arrow ? 0xd8c697 : event.skillId === 'arc-surge' ? 0x91a7ff : 0x80e4e5;
    const group = new THREE.Group(); group.position.copy(from);
    if (arrow) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xc2a779 })); shaft.rotation.x = Math.PI / 2; group.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), new THREE.MeshBasicMaterial({ color: 0xd2dbd8 })); head.rotation.x = Math.PI / 2; head.position.z = 0.43; group.add(head);
    } else {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshBasicMaterial({ color })); group.add(core);
      const corona = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })); group.add(corona);
    }
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, arrow ? 0.025 : 0.08, 0.9, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); trail.rotation.x = Math.PI / 2; trail.position.z = -0.45; group.add(trail);
    const kind = arrow ? 'arrow-projectile' : 'magic-projectile'; this.events[kind] = (this.events[kind] ?? 0) + 1;
    const duration = Math.max(120, Math.min(550, from.distanceTo(to) * 30));
    let cancelled = false;
    this.add(group, kind, duration, t => {
      if (event.targetId && !this.actors.has(event.targetId)) { cancelled = true; group.visible = false; return; }
      group.position.lerpVectors(from, to, t);
      if (fan) { const direction = to.clone().sub(from).normalize(); group.position.x += direction.z * Math.sin(t * Math.PI) * fan; group.position.z -= direction.x * Math.sin(t * Math.PI) * fan; }
      group.lookAt(to);
      if (t >= 1 && !cancelled) { this.burst(event, color, event.kind, 12, 0.6); if (event.amount) this.damage(event); }
    });
  }
  event(event: EffectEvent): void {
    this.events[event.kind] = (this.events[event.kind] ?? 0) + 1;
    const source = event.sourceId ? this.actors.get(event.sourceId) : undefined;
    const target = event.targetId ? this.actors.get(event.targetId) : undefined;
    if (source && (event.amount || event.kind === 'miss')) { source.group.rotation.y = Math.atan2(event.x - source.group.position.x, event.z - source.group.position.z); source.actionAt = performance.now(); }
    if (target) target.hitUntil = performance.now() + 180;
    if (event.kind === 'miss') { this.damage(event); return; }
    if (event.kind === 'received') { this.burst(event, event.targetId === this.self() ? 0xb96d62 : 0xd6c7ab, event.kind, 9, 0.45); this.damage(event); return; }
    if (event.kind === 'death') {
      if (target?.group.userData.kind === 'player') {
        const corpse = clone(target.group), materials: THREE.Material[] = []; corpse.position.set(event.x, 0, event.z); corpse.userData.kind = 'effect';
        corpse.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry = o.geometry.clone(); o.material = (Array.isArray(o.material) ? o.material : [o.material]).map(m => { const copy = m.clone(); copy.userData.shared = false; copy.transparent = true; materials.push(copy); return copy; }); } });
        this.add(corpse, 'death', 950, t => { corpse.rotation.x = Math.min(1, t * 1.8) * -1.35; materials.forEach(m => { m.opacity = Math.min(1, (1 - t) * 3); }); });
      }
      this.ring(event, 0x739a9e, 1.8, event.kind, 750); this.burst(event, 0x819c9a, event.kind, 14, 1.2, 0.4); return;
    }
    if (event.kind === 'pickup') { if (source) source.interactUntil = performance.now() + 350; this.burst(event, event.lootKind === 'ether' ? 0x94eae5 : event.lootKind === 'crowns' ? 0xd8b968 : 0xd7d5b2, event.kind, 9, 0.6, 0.35); return; }
    const arrow = source?.group.userData.classId === 'RANGER';
    if (event.amount && (event.kind === 'magic' || arrow)) { this.projectile(event, arrow); if (event.skillId === 'multi-shot') { this.projectile({ ...event, amount: undefined }, true, 0.65); this.projectile({ ...event, amount: undefined }, true, -0.65); } return; }
    if (event.amount) {
      this.damage(event); this.burst(event, 0xe3bd8e, event.kind, 12, 0.75);
      const arc = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.04, 28, 1, 0, Math.PI * 0.75), new THREE.MeshBasicMaterial({ color: 0xeed1a4, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      arc.position.set(event.x, 1.1, event.z); arc.rotation.set(-0.6, source?.group.rotation.y ?? 0, -0.6);
      this.add(arc, event.kind, 260, t => { arc.rotation.z += 0.09; (arc.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.55; }); return;
    }
    const point = source ? { x: source.group.position.x, z: source.group.position.z } : event;
    const skill = event.skillId;
    if (skill === 'whirlwind') { this.ring(point, 0xe2ca95, 4, event.kind); this.burst(point, 0xc5b58d, event.kind, 28, 3.8, 0.6); if (source) source.spinUntil = performance.now() + 500; }
    else if (skill === 'frost-nova') { this.ring(point, 0xa5ddeb, 5, event.kind); this.burst(point, 0xbde9f2, event.kind, 36, 4.8, 0.25); }
    else if (skill === 'blink') { if (event.fromX !== undefined && event.fromZ !== undefined) { this.burst({ x: event.fromX, z: event.fromZ }, 0x84b6e4, event.kind, 24, 0.9); this.ring({ x: event.fromX, z: event.fromZ }, 0x8abce1, 1.2, event.kind); } this.burst(event, 0x91dce6, event.kind, 24, 0.9); this.ring(event, 0x80cce0, 1.2, event.kind); }
    else if (skill === 'war-cry') { this.ring(point, 0xe0b967, 2.5, event.kind, 900); this.burst(point, 0xd9b670, event.kind, 22, 1.7); }
    else if (skill === 'natures-grace') { this.ring(point, 0x94bd82, 2, event.kind, 1000); this.burst(point, 0xb2dba5, event.kind, 20, 1.1, 0.3); }
    else if (skill === 'quickstep' || skill === 'charge') { this.ring(point, skill === 'charge' ? 0xdbc098 : 0x90b8a3, 1.7, event.kind, 450); this.burst(point, skill === 'charge' ? 0xc8b18b : 0xb2caa0, event.kind, 14, 1.7, 0.3); }
    else { this.ring(point, arrow ? 0xc9c59c : 0x92c8df, 1.2, event.kind, 400); this.burst(point, arrow ? 0xd2c7a2 : 0x91cddf, event.kind, 9, 0.65); }
  }
  update(now: number, dt: number): void {
    const existing = this.active; this.active = [];
    for (const visual of existing) {
      const progress = Math.min(1, (now - visual.start) / visual.duration); visual.update(progress, dt);
      if (progress >= 1) this.dispose(visual.object); else this.active.push(visual);
    }
    this.numbers = this.numbers.filter(n => {
      const t = (now - n.start) / n.duration;
      if (t >= 1) { n.element.remove(); return false; }
      const p = this.project(n.point, 1.8 + t * 0.8); n.element.style.left = `${p.x}px`; n.element.style.top = `${p.y}px`; n.element.style.display = p.visible ? '' : 'none'; n.element.style.opacity = String(1 - t * t); return true;
    });
  }
  recordRendered(): void { for (const v of this.active) if (v.object.visible) this.presented[v.kind] = (this.presented[v.kind] ?? 0) + 1; }
  destroy(): void { this.active.forEach(v => this.dispose(v.object)); this.numbers.forEach(n => n.element.remove()); this.active = []; this.numbers = []; }
}
