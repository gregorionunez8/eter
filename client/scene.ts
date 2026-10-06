import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { classes, monsters, npcs, balance } from '../shared/content';
import { obstacles, world } from '../shared/world';
import type { ClassId } from '../shared/content';
import type { Point } from '../shared/model';

export interface VisibleEntity extends Point { id: string; classId?: ClassId; definitionId?: string; name?: string; hp: number; maxHp?: number; animation: string }
export interface VisibleLoot extends Point { id: string; kind: string; name: string; ownerId: string; exclusiveUntil: number }
interface Animated { group: THREE.Group; target: Point; legs: THREE.Object3D[]; arms: THREE.Object3D[]; animation: string }
export class Scene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-22, 22, 22, -22, 0.1, 300);
  actors = new Map<string, Animated>();
  drops = new Map<string, THREE.Group>();
  raycaster = new THREE.Raycaster();
  ground: THREE.Mesh;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  labels = new Map<string, HTMLDivElement>();
  focus = new THREE.Vector3(0, 0, 10);
  zoom = 24;
  viewWidth = 1;
  viewHeight = 1;
  selected?: string;
  selfId = '';
  showLootNames = true;
  showIds = false;
  time = 0;
  frameInterval = 0;
  serverNow = Date.now();
  marker: THREE.Mesh;
  effects: { mesh: THREE.Mesh; until: number }[] = [];
  projectiles: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number }[] = [];
  crystal: THREE.Mesh;
  particles: THREE.Points;
  running = true;
  started = false;
  resizeObserver: ResizeObserver;
  renderedFrames = 0;
  frameTimes: number[] = [];
  renderTimes: number[] = [];
  visualEvents: Record<string, number> = {};
  presentedVisuals: Record<string, number> = {};
  daylight = 1;
  labelSizes = new Map<string, { width: number; height: number }>();
  labelsDirty = true;
  constructor(readonly canvasHost: HTMLElement, readonly labelHost: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const context = this.renderer.getContext();
    const rendererExtension = context.getExtension('WEBGL_debug_renderer_info');
    const rendererName = rendererExtension ? String(context.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL)) : '';
    this.renderer.domElement.dataset.renderer = rendererName;
    if (/swiftshader|llvmpipe|software|basic render/i.test(rendererName)) {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
      this.frameInterval = 1000 / 30;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasHost.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xc5d6d8);
    this.scene.fog = new THREE.Fog(0xc5d6d8, 80, 170);
    this.ambient = new THREE.HemisphereLight(0xdfeaff, 0x73825c, 2.2); this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffead0, 3); this.sun.position.set(30, 50, 20); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45 }); this.sun.shadow.bias = -0.0005; this.scene.add(this.sun, this.sun.target);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x819967, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.ground.userData = { kind: 'ground' }; this.scene.add(this.ground);
    this.platform(0, 0, 46, 46, 0xb9baa1, 0.02);
    this.platform(0, 0, 7, 160, 0xc4b597, 0.035); this.platform(0, 0, 160, 7, 0xc4b597, 0.035);
    this.platform(-49, 24, 48, 50, 0x627e5c, 0.025); this.platform(52, 0, 45, 56, 0x9e9b85, 0.025); this.platform(0, -55, 48, 40, 0x7e9490, 0.025);
    // Paths cross every gate and remain readable in the surroundings.
    this.platform(0, 0, 6, 150, 0xc9bb9e, 0.04); this.platform(0, 0, 150, 6, 0xc9bb9e, 0.04);
    for (const obstacle of obstacles) {
      if (obstacle.kind === 'building') this.house(obstacle.x, obstacle.z, obstacle.width, obstacle.depth);
      if (obstacle.kind === 'tree') this.tree(obstacle.x, obstacle.z);
      if (obstacle.id.startsWith('ruin-')) {
        const pillar = obstacle.id.includes('pillar');
        const stone = this.mesh(pillar ? new THREE.CylinderGeometry(0.7, 0.9, 4, 7) : new THREE.BoxGeometry(obstacle.width, 1.5, obstacle.depth), 0xb1b4a1);
        stone.position.set(obstacle.x, pillar ? 2 : 0.75, obstacle.z); this.scene.add(stone);
        if (pillar) {
          const capital = this.mesh(new THREE.BoxGeometry(1.75, 0.35, 1.75), 0xc3c6b1); capital.position.set(obstacle.x, 4.15, obstacle.z); this.scene.add(capital);
        }
      }
      if (obstacle.kind === 'rock') {
        const rock = this.mesh(new THREE.DodecahedronGeometry(1.2, 0), 0x939b92); rock.position.set(obstacle.x, 0.8, obstacle.z); rock.scale.set(1, 0.8, 1); this.scene.add(rock);
      }
    }
    const base = this.mesh(new THREE.CylinderGeometry(2.9, 3.2, 0.6, 12), 0xe4dcc4); base.position.y = 0.3; this.scene.add(base);
    const ring = this.mesh(new THREE.TorusGeometry(2.35, 0.15, 6, 24), 0xb7a878); ring.rotation.x = Math.PI / 2; ring.position.y = 0.7; this.scene.add(ring);
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.7), new THREE.MeshStandardMaterial({ color: 0x91dddf, emissive: 0x4b9ca5, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.25 }));
    this.crystal.scale.set(0.8, 2, 0.8); this.crystal.position.y = 3.7; this.scene.add(this.crystal);
    const glow = new THREE.PointLight(0x8adee2, 10, 18); glow.position.y = 4; this.scene.add(glow);
    for (const x of [-8, 8]) {
      const basin = this.mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.5, 16), 0xddd7bf); basin.position.set(x, 0.3, -5); this.scene.add(basin);
      const water = this.mesh(new THREE.CircleGeometry(1.4, 24), 0x76b3bb); water.rotation.x = -Math.PI / 2; water.position.set(x, 0.58, -5); this.scene.add(water);
      const pillar = this.mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 8), 0xe5ddc4); pillar.position.set(x, 1.1, -5); this.scene.add(pillar);
    }
    for (const npc of npcs) {
      const figure = this.humanoid(npc.id, 'VANGUARD', npc.id === 'lyra' || npc.id === 'sylwen' || npc.id === 'elyra' ? 0x817d97 : 0x857253);
      figure.group.position.set(npc.x, 0, npc.z); figure.group.userData = { kind: 'npc', id: npc.id }; this.scene.add(figure.group);
      this.label(`npc-${npc.id}`, `${npc.name}<small>${npc.role}</small>`, 'npc-label');
    }
    const positions = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) { positions[i * 3] = Math.sin(i * 4.7) * 3; positions[i * 3 + 1] = 1 + (i % 12) / 2; positions[i * 3 + 2] = Math.cos(i * 4.7) * 3; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc0f3ec, size: 0.08, transparent: true, opacity: 0.65 })); this.scene.add(this.particles);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0xf5dc96, side: THREE.DoubleSide })); this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.08; this.marker.visible = false; this.scene.add(this.marker);
    this.batchScenery();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvasHost); this.resize();
    this.renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * 0.015, 14, 34); this.resize(); }, { passive: false });
  }
  mesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh { const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.85 })); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
  batchScenery(): void {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<string, { geometries: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial; shadow: boolean }>();
    const originals: THREE.Mesh[] = [];
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object === this.ground || object === this.crystal || object === this.marker || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      let parent: THREE.Object3D | null = object;
      while (parent) { if (parent.userData.kind === 'npc') return; parent = parent.parent; }
      const key = `${object.material.color.getHex()}-${object.castShadow}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometries: [], material: object.material.clone(), shadow: object.castShadow }; batches.set(key, batch); }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld); batch.geometries.push(geometry); originals.push(object);
    });
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.geometries); if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.shadow; mesh.receiveShadow = true; this.scene.add(mesh);
      batch.geometries.forEach(g => g.dispose());
    }
    for (const mesh of originals) { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  }
  platform(x: number, z: number, width: number, depth: number, color: number, y: number): void { const mesh = this.mesh(new THREE.PlaneGeometry(width, depth), color); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.castShadow = false; this.scene.add(mesh); }
  house(x: number, z: number, width: number, depth: number): void {
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const body = this.mesh(new THREE.BoxGeometry(width, 4.5, depth), 0xe1d7bb); body.position.y = 2.25; group.add(body);
    const roof = this.mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.8, 2.5, 4), x < 0 ? 0x887264 : 0x657f87); roof.rotation.y = Math.PI / 4; roof.position.y = 5.5; roof.scale.z = depth / width; group.add(roof);
    for (const dx of [-width / 2 + 0.2, width / 2 - 0.2]) { const timber = this.mesh(new THREE.BoxGeometry(0.25, 4.6, depth + 0.1), 0x806e56); timber.position.set(dx, 2.3, 0); group.add(timber); }
    const door = this.mesh(new THREE.BoxGeometry(1.2, 2.2, 0.12), 0x806345); door.position.set(0, 1.1, depth / 2 + 0.02); group.add(door);
    for (const dx of [-width / 3, width / 3]) { const window = this.mesh(new THREE.BoxGeometry(0.8, 1, 0.12), 0xc1d3c4); window.position.set(dx, 2.6, depth / 2 + 0.02); group.add(window); }
    this.scene.add(group);
  }
  tree(x: number, z: number): void {
    const trunk = this.mesh(new THREE.CylinderGeometry(0.2, 0.32, 2.5, 5), 0x826849); trunk.position.set(x, 1.25, z); this.scene.add(trunk);
    for (let i = 0; i < 2; i++) { const leaves = this.mesh(new THREE.IcosahedronGeometry(1.5 - i * 0.3, 0), i ? 0x789360 : 0x5f8158); leaves.position.set(x, 2.8 + i, z); this.scene.add(leaves); }
  }
  humanoid(id: string, classId: ClassId, override?: number): Animated {
    const group = new THREE.Group(), color = override ?? classes[classId].color;
    const body = this.mesh(new THREE.CylinderGeometry(classId === 'RANGER' ? 0.28 : 0.36, 0.3, 0.85, 6), color); body.position.y = 1.15; group.add(body);
    const head = this.mesh(new THREE.SphereGeometry(0.23, 8, 6), 0xc9a889); head.position.y = 1.85; group.add(head);
    const hair = this.mesh(new THREE.SphereGeometry(0.25, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), classId === 'RANGER' ? 0x846b42 : 0x514b42); hair.position.y = 1.9; group.add(hair);
    const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [];
    for (const sign of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sign * 0.16, 0.8, 0); const shape = this.mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 5), 0x574f43); shape.position.y = -0.35; leg.add(shape); legs.push(leg); group.add(leg);
      const arm = new THREE.Group(); arm.position.set(sign * 0.42, 1.5, 0); const sleeve = this.mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 5), color); sleeve.position.y = -0.3; arm.add(sleeve); arms.push(arm); group.add(arm);
    }
    if (classId === 'VANGUARD') { const sword = this.mesh(new THREE.BoxGeometry(0.08, 1.1, 0.16), 0xcbd2ce); sword.position.set(0.15, -0.7, 0.25); sword.rotation.x = -0.6; arms[1].add(sword); }
    if (classId === 'ARCANIST') { const staff = this.mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.7, 6), 0x7e6042); staff.position.set(0.15, -0.4, 0.3); arms[1].add(staff); const gem = this.mesh(new THREE.OctahedronGeometry(0.18), 0x8bcbd5); gem.position.set(0.15, 0.5, 0.3); arms[1].add(gem); }
    if (classId === 'RANGER') { const bow = this.mesh(new THREE.TorusGeometry(0.5, 0.045, 5, 12, Math.PI), 0xb9975c); bow.position.set(0.1, -0.2, 0.3); bow.rotation.z = -Math.PI / 2; arms[0].add(bow); }
    group.userData = { kind: 'player', id, classId }; return { group, target: { x: 0, z: 0 }, legs, arms, animation: 'idle' };
  }
  creature(entity: VisibleEntity): Animated {
    const def = monsters.find(m => m.id === entity.definitionId)!;
    if (['rogue', 'orc-scout'].includes(def.id)) { const actor = this.humanoid(entity.id, 'VANGUARD', def.color); actor.group.userData = { kind: 'monster', id: entity.id }; return actor; }
    const group = new THREE.Group(); group.userData = { kind: 'monster', id: entity.id };
    const size = def.id === 'stone-golem' ? 1.4 : def.id === 'forest-wolf' ? 0.7 : 0.6;
    const body = this.mesh(def.id.includes('beetle') ? new THREE.SphereGeometry(size, 8, 6) : new THREE.IcosahedronGeometry(size, 0), def.color); body.position.y = size; if (def.id === 'forest-wolf') body.scale.z = 1.6; group.add(body);
    for (const side of [-1, 1]) { const eye = this.mesh(new THREE.SphereGeometry(0.07, 6, 4), 0xecd9a6); eye.position.set(side * size * 0.35, size * 1.3, size * 0.85); group.add(eye); }
    if (def.id === 'sproutling' || def.id === 'thornling') { const leaf = this.mesh(new THREE.ConeGeometry(0.3, 0.8, 5), 0x729a51); leaf.position.y = size * 2 + 0.2; group.add(leaf); }
    const legs: THREE.Object3D[] = [];
    for (const side of [-1, 1]) { const leg = this.mesh(new THREE.CylinderGeometry(0.1, 0.12, size, 4), def.color); leg.position.set(side * size * 0.7, size * 0.4, 0); leg.rotation.z = side * 0.4; group.add(leg); legs.push(leg); }
    return { group, target: entity, legs, arms: [], animation: 'idle' };
  }
  label(id: string, html: string, className: string): HTMLDivElement { const element = document.createElement('div'); element.className = `world-label ${className}`; element.dataset.entityId = id; element.innerHTML = html; this.labelHost.append(element); this.labels.set(id, element); this.labelsDirty = true; return element; }
  sync(players: VisibleEntity[], creatures: VisibleEntity[], loot: VisibleLoot[], selfId: string, now: number): void {
    this.selfId = selfId; this.serverNow = now;
    const entities = [...players, ...creatures.filter(m => m.hp > 0)], active = new Set(entities.map(e => e.id));
    for (const [id, actor] of this.actors) if (!active.has(id)) { this.disposeGroup(actor.group); this.actors.delete(id); this.labels.get(id)?.remove(); this.labels.delete(id); }
    for (const entity of entities) {
      let actor = this.actors.get(entity.id);
      if (!actor) {
        actor = entity.classId ? this.humanoid(entity.id, entity.classId) : this.creature(entity);
        actor.group.position.set(entity.x, 0, entity.z); this.scene.add(actor.group); this.actors.set(entity.id, actor);
        this.label(entity.id, '', entity.classId ? 'player-label' : 'monster-label');
      }
      actor.target = { x: entity.x, z: entity.z }; actor.animation = entity.animation;
      const label = this.labels.get(entity.id)!;
      const def = entity.definitionId ? monsters.find(m => m.id === entity.definitionId) : undefined;
      const name = entity.name ?? def?.name ?? '';
      label.textContent = `${name}${def ? ` · ${def.level}` : ''}${this.showIds ? ` [${entity.id.slice(0, 8)}]` : ''}`;
      const bar = document.createElement('span'); bar.className = 'entity-hp'; bar.style.setProperty('--hp', `${Math.max(0, entity.hp / (entity.maxHp ?? def?.hp ?? 1) * 100)}%`); label.append(bar);
      label.classList.toggle('selected', entity.id === this.selected);
    }
    const activeLoot = new Set(loot.map(d => d.id));
    for (const [id, group] of this.drops) if (!activeLoot.has(id)) { this.disposeGroup(group); this.drops.delete(id); this.labels.get(id)?.remove(); this.labels.delete(id); }
    for (const drop of loot) {
      let group = this.drops.get(drop.id);
      if (!group) {
        group = new THREE.Group(); group.userData = { kind: 'loot', id: drop.id }; group.position.set(drop.x, 0, drop.z);
        const geometry = drop.kind === 'ether' ? new THREE.OctahedronGeometry(0.24) : drop.kind === 'crowns' ? new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8) : new THREE.BoxGeometry(0.45, 0.2, 0.6);
        const material = new THREE.MeshStandardMaterial({ color: drop.kind === 'ether' ? 0x88dedf : drop.kind === 'crowns' ? 0xdfbc67 : 0xc3b499, emissive: drop.kind === 'ether' ? 0x3c9d9f : 0x000000, emissiveIntensity: 0.7 });
        const mesh = new THREE.Mesh(geometry, material); mesh.position.y = 0.22; group.add(mesh);
        if (drop.kind === 'ether') {
          const motes = new THREE.BufferGeometry(); motes.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0.6, 0, 0.2, 0.9, 0.1, 0, 0.4, -0.3], 3)); group.add(new THREE.Points(motes, new THREE.PointsMaterial({ color: 0xc2ffff, size: 0.09 })));
        }
        this.scene.add(group); this.drops.set(drop.id, group); this.label(drop.id, '', `loot-label ${drop.kind === 'ether' ? 'ether-label' : ''}`);
      }
      const label = this.labels.get(drop.id)!; label.textContent = `${drop.name}${drop.exclusiveUntil > now && drop.ownerId !== selfId ? ' 🔒' : ''}`; label.hidden = !this.showLootNames;
    }
    if (!this.started) { this.started = true; requestAnimationFrame(this.animate); }
    this.labelsDirty = true;
  }
  disposeGroup(group: THREE.Object3D): void { this.scene.remove(group); group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { object.geometry.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(m => m.dispose()); } }); }
  pick(clientX: number, clientY: number): { kind: string; id?: string; point: Point } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const candidates: THREE.Object3D[] = [this.ground, ...[...this.actors.values()].map(actor => actor.group)];
    candidates.push(...this.drops.values());
    for (const npc of this.scene.children.filter(c => c.userData.kind === 'npc')) candidates.push(npc as THREE.Group);
    const hits = this.raycaster.intersectObjects(candidates, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.kind) object = object.parent;
      // Players have no click action in this slice; their models must not swallow walking clicks.
      if (!object || object.userData.kind === 'player') continue;
      return { kind: object.userData.kind as string, id: object.userData.id as string | undefined, point: { x: hit.point.x, z: hit.point.z } };
    }
  }
  project(point: Point, height = 2.5): { x: number; y: number; visible: boolean } {
    const p = new THREE.Vector3(point.x, height, point.z).project(this.camera);
    return { x: (p.x + 1) / 2 * this.viewWidth, y: (1 - p.y) / 2 * this.viewHeight, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }
  destination(point: Point): void { this.marker.position.set(point.x, 0.09, point.z); this.marker.visible = true; window.setTimeout(() => { this.marker.visible = false; }, 1200); }
  effect(event: { x: number; z: number; kind: string; amount?: number; sourceId?: string }): void {
    this.visualEvents[event.kind] = (this.visualEvents[event.kind] ?? 0) + 1;
    const source = event.sourceId ? this.actors.get(event.sourceId) : undefined;
    if (source && (event.kind === 'magic' || source.group.userData.classId === 'RANGER') && event.amount) {
      const arrow = source.group.userData.classId === 'RANGER';
      const mesh = new THREE.Mesh(arrow ? new THREE.ConeGeometry(0.07, 0.75, 5) : new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: arrow ? 0xe5d1a0 : 0x9fdde9 }));
      const from = source.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), to = new THREE.Vector3(event.x, 1, event.z);
      if (arrow) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      mesh.position.copy(from); this.scene.add(mesh); this.projectiles.push({ mesh, from, to, start: performance.now(), duration: Math.max(120, from.distanceTo(to) * 25) });
      const kind = arrow ? 'arrow-projectile' : 'magic-projectile'; this.visualEvents[kind] = (this.visualEvents[kind] ?? 0) + 1;
      mesh.userData.visualKind = kind;
    }
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 16), new THREE.MeshBasicMaterial({ color: event.kind === 'magic' ? 0x99dbef : 0xf0d39b, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); mesh.rotation.x = -Math.PI / 2; mesh.position.set(event.x, 0.3, event.z); this.scene.add(mesh); this.effects.push({ mesh, until: performance.now() + 450 });
    mesh.userData.visualKind = event.kind;
    if (event.amount) { const label = this.label(`damage-${performance.now()}`, String(event.amount), 'damage-label'); const p = this.project(event, 2); label.style.transform = `translate(${p.x}px,${p.y}px)`; window.setTimeout(() => { this.labels.forEach((v, k) => { if (v === label) this.labels.delete(k); }); label.remove(); }, 700); }
  }
  resize(): void { const width = this.canvasHost.clientWidth, height = this.canvasHost.clientHeight; this.viewWidth = width; this.viewHeight = height; this.renderer.setSize(width, height); const aspect = width / Math.max(1, height); this.camera.left = -this.zoom * aspect; this.camera.right = this.zoom * aspect; this.camera.top = this.zoom; this.camera.bottom = -this.zoom; this.camera.updateProjectionMatrix(); }
  animate = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    const now = performance.now();
    if (now - this.time < this.frameInterval) return;
    if (this.renderedFrames) { this.frameTimes.push(now - this.time); if (this.frameTimes.length > 300) this.frameTimes.shift(); }
    const dt = Math.min(0.05, (now - this.time) / 1000 || 0.016); this.time = now;
    for (const actor of this.actors.values()) {
      const dx = actor.target.x - actor.group.position.x, dz = actor.target.z - actor.group.position.z;
      const displacement = Math.hypot(dx, dz);
      if (displacement > 15) actor.group.position.set(actor.target.x, 0, actor.target.z);
      else { actor.group.position.x += dx * (1 - Math.exp(-dt * 14)); actor.group.position.z += dz * (1 - Math.exp(-dt * 14)); }
      if (displacement > 0.02) actor.group.rotation.y = Math.atan2(dx, dz);
      const walking = actor.animation === 'walk', attacking = actor.animation === 'attack' || actor.animation === 'skill';
      actor.legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(now * 0.01 + i * Math.PI) * 0.5 : 0; });
      actor.arms.forEach((arm, i) => { arm.rotation.x = attacking ? -1 + Math.sin(now * 0.02) * 0.5 : walking ? Math.sin(now * 0.01 + i * Math.PI) * 0.3 : 0; });
    }
    const self = this.actors.get(this.selfId);
    if (self) this.focus.lerp(self.group.position, 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.focus).add(new THREE.Vector3(35, 45, 35)); this.camera.lookAt(this.focus);
    this.sun.target.position.copy(this.focus); this.sun.position.copy(this.focus).add(new THREE.Vector3(30, 50, 20));
    const day = (Math.sin((this.serverNow + now % 100) / balance.dayNightCycleDuration * Math.PI * 2) + 1) / 2;
    this.daylight = day;
    this.sun.intensity = 0.7 + day * 2.3; this.ambient.intensity = 1.4 + day * 0.8;
    const sky = new THREE.Color(0x647e98).lerp(new THREE.Color(0xc5d6d8), day); (this.scene.background as THREE.Color).copy(sky); (this.scene.fog as THREE.Fog).color.copy(sky);
    this.crystal.rotation.y += dt * 0.12; this.crystal.position.y = 3.7 + Math.sin(now * 0.001) * 0.15; this.particles.rotation.y += dt * 0.06;
    this.layoutLabels();
    for (const group of this.drops.values()) group.rotation.y += dt * 0.2;
    this.effects = this.effects.filter(effect => { if (effect.until < now) { this.disposeGroup(effect.mesh); return false; } effect.mesh.scale.multiplyScalar(1 + dt * 5); return true; });
    this.projectiles = this.projectiles.filter(projectile => {
      const progress = Math.min(1, (now - projectile.start) / projectile.duration);
      projectile.mesh.position.lerpVectors(projectile.from, projectile.to, progress);
      if (progress >= 1) { this.disposeGroup(projectile.mesh); return false; }
      return true;
    });
    this.renderer.render(this.scene, this.camera);
    for (const { mesh } of [...this.effects, ...this.projectiles]) {
      const kind = mesh.userData.visualKind as string; this.presentedVisuals[kind] = (this.presentedVisuals[kind] ?? 0) + 1;
    }
    this.renderTimes.push(performance.now() - now); if (this.renderTimes.length > 300) this.renderTimes.shift();
    this.renderedFrames++; this.renderer.domElement.dataset.ready = 'true';
  };
  layoutLabels(): void {
    // Batch measurements before writes, and reuse them between network snapshots.
    if (this.labelsDirty) {
      for (const [id, element] of this.labels) {
        if (element.classList.contains('damage-label') || element.hidden) continue;
        element.style.display = '';
      }
      for (const [id, element] of this.labels) {
        if (!element.classList.contains('damage-label') && !element.hidden) this.labelSizes.set(id, { width: element.offsetWidth, height: element.offsetHeight });
      }
      for (const id of this.labelSizes.keys()) if (!this.labels.has(id)) this.labelSizes.delete(id);
      this.labelsDirty = false;
    }
    const entries: { id: string; point: Point; height: number; interactive: boolean }[] = [];
    for (const [id, group] of this.drops) entries.push({ id, point: { x: group.position.x, z: group.position.z }, height: 0.8, interactive: true });
    for (const npc of npcs) entries.push({ id: `npc-${npc.id}`, point: npc, height: 2.7, interactive: true });
    for (const [id, actor] of this.actors) entries.push({ id, point: { x: actor.group.position.x, z: actor.group.position.z }, height: actor.group.userData.kind === 'monster' ? 2 : 2.6, interactive: actor.group.userData.kind === 'monster' });
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const entry of entries) {
      const element = this.labels.get(entry.id)!;
      if (element.hidden) continue;
      const p = this.project(entry.point, entry.height), size = this.labelSizes.get(entry.id) ?? { width: 120, height: 22 };
      if (!p.visible) { element.style.display = 'none'; continue; }
      const x = Math.max(size.width / 2 + 4, Math.min(this.viewWidth - size.width / 2 - 4, p.x));
      let y = p.y;
      if (entry.interactive) {
        for (let attempt = 0; attempt < 100; attempt++) {
          const rect = { left: x - size.width / 2, right: x + size.width / 2, top: y - size.height, bottom: y };
          const collision = placed.find(other => rect.left < other.right + 4 && rect.right > other.left - 4 && rect.top < other.bottom + 4 && rect.bottom > other.top - 4);
          if (!collision) { placed.push(rect); break; }
          y = collision.top - 4;
        }
      }
      element.style.display = y >= size.height && y < this.viewHeight ? '' : 'none';
      element.style.left = `${x}px`; element.style.top = `${y}px`;
    }
  }
  /** Read-only acceptance diagnostics; no commands or mutable game objects are exposed. */
  diagnostics(point?: Point) {
    return {
      ready: this.renderedFrames > 0, renderedFrames: this.renderedFrames,
      renderer: this.renderer.domElement.dataset.renderer, shadows: this.renderer.shadowMap.enabled,
      zoom: this.zoom, daylight: this.daylight, sun: this.sun.intensity, ambient: this.ambient.intensity,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      frameTimes: [...this.frameTimes], renderTimes: [...this.renderTimes], visualEvents: { ...this.visualEvents }, presentedVisuals: { ...this.presentedVisuals },
      focus: { x: this.focus.x, z: this.focus.z },
      actors: [...this.actors].map(([id, actor]) => ({ id, x: actor.group.position.x, z: actor.group.position.z, animation: actor.animation })),
      drops: [...this.drops].map(([id, group]) => ({ id, meshes: group.children.map(child => ({ type: child.type, geometry: (child as THREE.Mesh).geometry?.type, emissive: ((child as THREE.Mesh).material as THREE.MeshStandardMaterial)?.emissive?.getHex() })) })),
      projected: point ? this.project(point, 0) : undefined,
      groundHit: point ? (() => { const p = this.project(point, 0); return this.pick(p.x, p.y); })() : undefined,
    };
  }
  placeLabel(id: string, point: Point, height: number, offset = 0): void { const element = this.labels.get(id); if (!element) return; const p = this.project(point, height); element.style.display = p.visible ? '' : 'none'; element.style.left = `${p.x}px`; element.style.top = `${p.y - offset}px`; }
  destroy(): void { this.running = false; this.resizeObserver.disconnect(); this.scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { object.geometry.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(m => m.dispose()); } }); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); this.labelHost.replaceChildren(); }
}
