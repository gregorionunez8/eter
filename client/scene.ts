import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { classes, monsters, npcs, balance } from '../shared/content';
import { obstacles, world } from '../shared/world';
import type { ClassId } from '../shared/content';
import type { Point } from '../shared/model';
import { MaterialLibrary } from './materials';
import { Environment } from './environment';
import { Effects, type EffectEvent } from './effects';
import { LootArt } from './loot';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ActorFactory, type ActorRig, type EquipmentAppearance } from './actors';
import { presentation } from './presentation';

export interface VisibleEntity extends Point { id: string; classId?: ClassId; definitionId?: string; name?: string; hp: number; maxHp?: number; animation: string; targetId?: string; equipment?: EquipmentAppearance }
export interface VisibleLoot extends Point { id: string; kind: string; name: string; ownerId: string; exclusiveUntil: number; amount?: number; item?: { definitionId: string } }
type Animated = ActorRig;
export class Scene {
  materials = new MaterialLibrary();
  actorFactory = new ActorFactory(this.materials);
  lootArt = new LootArt(this.materials);
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  environment = new Environment(this.scene, this.materials);
  camera = new THREE.OrthographicCamera(-22, 22, 22, -22, 0.1, 300);
  actors = new Map<string, Animated>();
  drops = new Map<string, THREE.Group>();
  raycaster = new THREE.Raycaster();
  ground: THREE.Mesh;
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  labels = new Map<string, HTMLDivElement>();
  focus = new THREE.Vector3(0, 0, 10);
  zoom = presentation.camera.defaultHalfHeight;
  buildingOccluders: { meshes: THREE.Mesh[]; bounds: THREE.Box3; opacity: number }[] = [];
  occlusionRay = new THREE.Raycaster();
  viewWidth = 1;
  viewHeight = 1;
  selected?: string;
  selfId = '';
  showLootNames = true;
  showIds = false;
  time = 0;
  frameInterval = 0;
  softwareRenderer = false;
  serverNow = Date.now();
  marker: THREE.Mesh;
  targetMarker: THREE.Mesh;
  vfx: Effects;
  crystal: THREE.Mesh;
  particles: THREE.Points;
  contactShadows: THREE.InstancedMesh;
  contactTexture: THREE.CanvasTexture;
  running = true;
  started = false;
  resizeObserver: ResizeObserver;
  renderedFrames = 0;
  frameTimes: number[] = [];
  renderTimes: number[] = [];
  visualEvents: Record<string, number> = {};
  presentedVisuals: Record<string, number> = {};
  daylight = 1;
  environmentTarget?: THREE.WebGLRenderTarget;
  labelSizes = new Map<string, { width: number; height: number }>();
  labelsDirty = true;
  constructor(readonly canvasHost: HTMLElement, readonly labelHost: HTMLElement) {
    this.vfx = new Effects(this.scene, this.actors, labelHost, (p, h) => this.project(p, h), () => this.selfId);
    this.visualEvents = this.vfx.events; this.presentedVisuals = this.vfx.presented;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const context = this.renderer.getContext();
    const rendererExtension = context.getExtension('WEBGL_debug_renderer_info');
    const rendererName = rendererExtension ? String(context.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL)) : '';
    this.renderer.domElement.dataset.renderer = rendererName;
    const softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(rendererName);
    this.softwareRenderer = softwareRenderer;
    const legacyIntegratedRenderer = /Radeon R5 Graphics/i.test(rendererName);
    if (softwareRenderer) {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(0.5);
      this.materials.bumpEnabled = false;
      this.frameInterval = 100;
    } else if (legacyIntegratedRenderer) {
      // Keep HTML labels crisp and the same close composition on older GPUs.
      // Leave CPU time for input, networking and a second running client.
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 0.85));
      this.frameInterval = 1000 / 20;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if (this.materials.bumpEnabled) {
      const generator = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
      this.environmentTarget = generator.fromScene(room, 0.04); this.scene.environment = this.environmentTarget.texture;
      this.scene.environmentIntensity = 0.3;
      room.dispose(); generator.dispose();
    }
    canvasHost.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xc5d6d8);
    this.scene.fog = new THREE.Fog(0xc5d6d8, 80, 170);
    this.ambient = new THREE.HemisphereLight(0xdfeaff, 0x73825c, 2.2); this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffead0, 3); this.sun.position.set(30, 50, 20); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(legacyIntegratedRenderer ? 1024 : 2048, legacyIntegratedRenderer ? 1024 : 2048); Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 }); this.sun.shadow.bias = -0.0005; this.scene.add(this.sun, this.sun.target);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), this.materials.terrain());
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.ground.userData = { kind: 'ground' }; this.scene.add(this.ground);
    this.environment.ground(0, 0, 19, 19, 0xc0bba6, 0.02, 'street');
    this.environment.ground(0, 0, 4.5, 46, 0xaaa997, 0.05, 'street');
    this.environment.ground(0, 0, 46, 4.5, 0xaaa997, 0.05, 'street');
    for (const npc of npcs) this.environment.ground(npc.x, npc.z, 4.5, 4.5, 0xb1ac95, 0.04, 'street');
    for (const building of obstacles.filter(o => o.kind === 'building')) this.environment.ground(building.x, building.z, building.width + 2, building.depth + 2, 0xb4ae98, 0.03, 'street');
    for (const obstacle of obstacles) {
      if (obstacle.kind === 'building') this.house(obstacle.x, obstacle.z, obstacle.width, obstacle.depth);
      if (obstacle.kind === 'tree') this.tree(obstacle.x, obstacle.z);
      if (obstacle.id.startsWith('ruin-') || obstacle.id.startsWith('farm-landmark-ruin')) this.environment.ruin(obstacle.id, obstacle.x, obstacle.z, obstacle.width, obstacle.depth);
      if (obstacle.kind === 'rock') this.environment.rock(obstacle.x, obstacle.z, obstacle.width, obstacle.depth);
    }

    this.environment.monument();
    const crystalGeometry = new THREE.LatheGeometry([[0, -2.1], [0.38, -1.45], [0.64, -0.7], [0.56, 1.05], [0.24, 1.75], [0, 2.3]].map(p => new THREE.Vector2(p[0], p[1])), 6).toNonIndexed(); crystalGeometry.computeVertexNormals();
    const facetColors = new Float32Array(crystalGeometry.attributes.position.count * 3), palette = [0x79bacd, 0x9cd5df, 0x4f8eac, 0x7fb6c8, 0xa4d4d5, 0x5598b4];
    for (let i = 0; i < crystalGeometry.attributes.position.count; i += 3) {
      let x = 0, z = 0; for (let v = 0; v < 3; v++) { x += crystalGeometry.attributes.position.getX(i + v); z += crystalGeometry.attributes.position.getZ(i + v); }
      const color = new THREE.Color(palette[Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 6) % 6]);
      for (let v = 0; v < 3; v++) facetColors.set([color.r, color.g, color.b], (i + v) * 3);
    }
    crystalGeometry.setAttribute('color', new THREE.Float32BufferAttribute(facetColors, 3));
    this.crystal = new THREE.Mesh(crystalGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x386477, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.22 }));
    this.crystal.position.y = 3.7; this.scene.add(this.crystal);
    const glow = new THREE.PointLight(0x8adee2, 10, 18); glow.position.y = 4; this.scene.add(glow);
    for (const x of [-8, 8]) this.environment.fountain(x, -5);
    this.environment.regions();
    for (const npc of npcs) {
      const female = ['lyra', 'sylwen', 'elyra'].includes(npc.id);
      const figure = this.humanoid(npc.id, female ? 'RANGER' : ['orin', 'kael', 'seraph', 'reset-master'].includes(npc.id) ? 'ARCANIST' : 'VANGUARD', female ? 0x747d85 : npc.id === 'brom' ? 0x69757b : 0x857253);
      if (!['ronan', 'sylwen', 'kael'].includes(npc.id)) this.actorFactory.equip(figure, {});
      figure.group.position.set(npc.x, 0, npc.z); figure.group.userData = { kind: 'npc', id: npc.id }; this.scene.add(figure.group);
      this.label(`npc-${npc.id}`, `${npc.name}<small>${npc.role}</small>`, 'npc-label');
    }
    const positions = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) { positions[i * 3] = Math.sin(i * 4.7) * 3; positions[i * 3 + 1] = 1 + (i % 12) / 2; positions[i * 3 + 2] = Math.cos(i * 4.7) * 3; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc0f3ec, size: 0.08, transparent: true, opacity: 0.65 })); this.scene.add(this.particles);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0xf5dc96, side: THREE.DoubleSide })); this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.08; this.marker.visible = false; this.scene.add(this.marker);
    this.targetMarker = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.8, 48), new THREE.MeshBasicMaterial({ color: 0xead0a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.targetMarker.rotation.x = -Math.PI / 2; this.targetMarker.visible = false; this.scene.add(this.targetMarker);
    this.environment.details();
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext('2d')!, fade = shadowContext.createRadialGradient(32, 32, 4, 32, 32, 30);
    fade.addColorStop(0, '#ffffff'); fade.addColorStop(0.5, '#888888'); fade.addColorStop(1, '#000000'); shadowContext.fillStyle = fade; shadowContext.fillRect(0, 0, 64, 64);
    this.contactTexture = new THREE.CanvasTexture(shadowCanvas);
    this.contactShadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x132019, alphaMap: this.contactTexture, transparent: true, opacity: 0.4, depthWrite: false }), 150);
    this.contactShadows.frustumCulled = false; this.scene.add(this.contactShadows);
    this.batchScenery();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvasHost); this.resize();
    this.renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * presentation.camera.wheelSensitivity, presentation.camera.minHalfHeight, presentation.camera.maxHalfHeight); this.resize(); }, { passive: false });
  }
  mesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh { const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.85 })); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
  batchScenery(): void {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<string, { geometries: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial; shadow: boolean; building?: string }>();
    const buildings = new Map<string, THREE.Mesh[]>();
    const originals: THREE.Mesh[] = [];
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.animatedGlow || object === this.ground || object === this.crystal || object === this.marker || object instanceof THREE.InstancedMesh || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      let parent: THREE.Object3D | null = object;
      let building: string | undefined;
      while (parent) { if (parent.userData.kind === 'npc') return; if (parent.userData.occludingBuilding) building = parent.uuid; parent = parent.parent; }
      const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
      // Spatial batches can be culled. A single forest-sized mesh submits
      // distant geometry to the camera and shadow pass on every frame.
      const region = building ?? `${Math.floor(position.x / 16)},${Math.floor(position.z / 16)}`;
      const key = `${region}-${object.material.color.getHex()}-${object.castShadow}-${object.material.map?.uuid ?? "flat"}-${object.material.alphaMap?.uuid ?? ''}-${object.material.transparent}-${object.material.depthWrite}-${object.material.roughness}-${object.material.metalness}-${object.material.emissive.getHex()}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometries: [], material: object.material.clone(), shadow: object.castShadow, building }; batch.material.userData.shared = false; batches.set(key, batch); }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld); batch.geometries.push(geometry); originals.push(object);
    });
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.geometries); if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.shadow; mesh.receiveShadow = true; this.scene.add(mesh);
      if (batch.building) { const entries = buildings.get(batch.building) ?? []; entries.push(mesh); buildings.set(batch.building, entries); }
      batch.geometries.forEach(g => g.dispose());
    }
    for (const mesh of originals) { mesh.removeFromParent(); mesh.geometry.dispose(); if (!(mesh.material as THREE.Material).userData.shared) (mesh.material as THREE.Material).dispose(); }
    // Animated windows remain outside batches, but fade with the same building.
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.userData.animatedGlow) return;
      let parent = object.parent;
      while (parent) { if (parent.userData.occludingBuilding) { buildings.get(parent.uuid)?.push(object); break; } parent = parent.parent; }
    });
    this.scene.updateMatrixWorld(true);
    for (const meshes of buildings.values()) {
      const bounds = new THREE.Box3(); for (const mesh of meshes) bounds.union(new THREE.Box3().setFromObject(mesh));
      this.buildingOccluders.push({ meshes, bounds, opacity: 1 });
    }
  }
  updateOcclusion(self?: Animated, target?: Animated): void {
    const subjects = [self, target].filter((actor): actor is Animated => !!actor && actor.deadAt === undefined);
    for (const building of this.buildingOccluders) {
      const obscured = subjects.some(actor => [0.35, 1.25, 2].some(height => {
        const point = actor.group.position.clone(); point.y += height;
        const projected = point.clone().project(this.camera);
        this.occlusionRay.setFromCamera(new THREE.Vector2(projected.x, projected.y), this.camera);
        const intersection = this.occlusionRay.ray.intersectBox(building.bounds, new THREE.Vector3());
        return !!intersection && this.occlusionRay.ray.origin.distanceTo(intersection) < this.occlusionRay.ray.origin.distanceTo(point);
      }));
      const opacity = obscured ? presentation.buildingOccludedOpacity : 1;
      if (building.opacity === opacity) continue;
      building.opacity = opacity;
      for (const mesh of building.meshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.transparent = obscured; material.opacity = opacity; material.depthWrite = !obscured; material.needsUpdate = true;
        mesh.castShadow = !obscured;
      }
    }
  }
  platform(x: number, z: number, width: number, depth: number, color: number, y: number): void {
    const surface = width === 46 ? 'street' : width > 100 || depth > 100 ? 'dirt' : x > 30 || z < -40 ? 'rock' : 'grass';
    this.environment.ground(x, z, width, depth, color, y, surface);
  }
  house(x: number, z: number, width: number, depth: number): void { this.environment.building(x, z, width, depth); }
  tree(x: number, z: number): void { this.environment.tree(x, z); }
  humanoid(id: string, classId: ClassId, override?: number): Animated { return this.actorFactory.character(id, classId, override); }
  creature(entity: VisibleEntity): Animated { return this.actorFactory.monster(entity.id, entity.definitionId!); }
  label(id: string, html: string, className: string): HTMLDivElement { const element = document.createElement('div'); element.className = `world-label ${className}`; element.dataset.entityId = id; element.innerHTML = html; this.labelHost.append(element); this.labels.set(id, element); this.labelsDirty = true; return element; }
  sync(players: VisibleEntity[], creatures: VisibleEntity[], loot: VisibleLoot[], selfId: string, now: number): void {
    this.selfId = selfId; this.serverNow = now;
    const entities = [...players, ...creatures], active = new Set(entities.map(e => e.id));
    for (const [id, actor] of this.actors) if (!active.has(id)) { this.disposeGroup(actor.group); this.actors.delete(id); this.labels.get(id)?.remove(); this.labels.delete(id); }
    for (const entity of entities) {
      let actor = this.actors.get(entity.id);
      if (entity.hp <= 0) {
        if (!actor) continue;
        actor.deadAt ??= performance.now(); actor.animation = 'dead';
        this.labels.get(entity.id)!.hidden = true;
        if (performance.now() - actor.deadAt > 950) { this.disposeGroup(actor.group); this.actors.delete(entity.id); this.labels.get(entity.id)?.remove(); this.labels.delete(entity.id); }
        continue;
      }
      if (!actor) {
        actor = entity.classId ? this.humanoid(entity.id, entity.classId) : this.creature(entity);
        actor.group.position.set(entity.x, 0, entity.z); this.scene.add(actor.group); this.actors.set(entity.id, actor);
        this.label(entity.id, '', entity.classId ? 'player-label' : 'monster-label');
      }
      if (actor.deadAt !== undefined) { this.disposeGroup(actor.group); this.actors.delete(entity.id); this.labels.get(entity.id)?.remove(); this.labels.delete(entity.id); continue; }
      if (actor.lastHp !== undefined && entity.hp < actor.lastHp) actor.hitUntil = performance.now() + 180;
      actor.lastHp = entity.hp;
      if (entity.animation !== actor.animation) actor.actionAt = performance.now();
      actor.target = { x: entity.x, z: entity.z }; actor.animation = entity.animation;
      actor.group.userData.targetId = entity.targetId;
      if (entity.classId && entity.equipment) this.actorFactory.equip(actor, entity.equipment);
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
        group = this.lootArt.create(drop.kind, drop.item?.definitionId); group.userData = { kind: 'loot', id: drop.id }; group.position.set(drop.x, 0, drop.z);
        this.scene.add(group); this.drops.set(drop.id, group); this.label(drop.id, '', `loot-label ${drop.kind === 'ether' ? 'ether-label' : ''}`);
      }
      const label = this.labels.get(drop.id)!; label.textContent = `${drop.kind === 'crowns' && drop.amount !== undefined ? drop.amount.toLocaleString('en-US') + ' Crowns' : drop.name}${drop.exclusiveUntil > now && drop.ownerId !== selfId ? ' 🔒' : ''}`; label.hidden = !this.showLootNames;
    }
    if (!this.started) { this.started = true; requestAnimationFrame(this.animate); }
    this.labelsDirty = true;
  }
  disposeGroup(group: THREE.Object3D): void { this.scene.remove(group); group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { object.geometry.dispose(); if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(m => { if (!m.userData.shared) m.dispose(); }); } }); }
  pick(clientX: number, clientY: number): { kind: string; id?: string; point: Point } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const candidates: THREE.Object3D[] = [this.ground, ...[...this.actors.values()].filter(actor => actor.deadAt === undefined).map(actor => actor.group)];
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
  effect(event: EffectEvent): void { this.vfx.event(event); }
  resize(): void { const width = this.canvasHost.clientWidth, height = this.canvasHost.clientHeight; this.viewWidth = width; this.viewHeight = height; this.renderer.setSize(width, height); const aspect = width / Math.max(1, height); this.camera.left = -this.zoom * aspect; this.camera.right = this.zoom * aspect; this.camera.top = this.zoom; this.camera.bottom = -this.zoom; this.camera.updateProjectionMatrix(); }
  animate = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const interval = this.softwareRenderer && !document.hasFocus() ? Math.max(500, this.frameInterval) : this.frameInterval;
    if (now - this.time < interval) return;
    if (this.renderedFrames) { this.frameTimes.push(now - this.time); if (this.frameTimes.length > 300) this.frameTimes.shift(); }
    const dt = Math.min(0.05, (now - this.time) / 1000 || 0.016); this.time = now;
    for (const actor of this.actors.values()) {
      const dx = actor.target.x - actor.group.position.x, dz = actor.target.z - actor.group.position.z;
      const displacement = Math.hypot(dx, dz);
      if (displacement > 15) actor.group.position.set(actor.target.x, 0, actor.target.z);
      else { actor.group.position.x += dx * (1 - Math.exp(-dt * 14)); actor.group.position.z += dz * (1 - Math.exp(-dt * 14)); }
      if (displacement > 0.02) actor.group.rotation.y = Math.atan2(dx, dz);
      else if (actor.animation !== 'walk') {
        const facing = this.actors.get(actor.group.userData.targetId);
        if (facing && facing.deadAt === undefined) actor.group.rotation.y = Math.atan2(facing.group.position.x - actor.group.position.x, facing.group.position.z - actor.group.position.z);
      }
      this.actorFactory.animate(actor, now, dt);
    }
    const self = this.actors.get(this.selfId);
    const target = this.selected ? this.actors.get(this.selected) : undefined;
    this.targetMarker.visible = !!target && target.deadAt === undefined;
    if (target) this.targetMarker.position.set(target.group.position.x, 0.075, target.group.position.z);
    if (self) this.focus.lerp(self.group.position, 1 - Math.exp(-dt * 8));
    const offset = presentation.camera.offset;
    this.camera.position.copy(this.focus).add(new THREE.Vector3(offset.x, offset.y, offset.z)); this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
    this.updateOcclusion(self, target);
    this.sun.target.position.copy(this.focus); this.sun.position.copy(this.focus).add(new THREE.Vector3(30, 50, 20));
    const day = (Math.sin((this.serverNow + now % 100) / balance.dayNightCycleDuration * Math.PI * 2) + 1) / 2;
    this.daylight = day;
    this.environment.lighting(day);
    this.sun.intensity = 0.7 + day * 2.3; this.ambient.intensity = 1.4 + day * 0.15;
    this.sun.color.set(0xadc4ec).lerp(new THREE.Color(0xffe2b6), day);
    this.ambient.color.set(0x7799d2).lerp(new THREE.Color(0xd6e7e7), day);
    this.ambient.groundColor.set(0x33435f).lerp(new THREE.Color(0x73825c), day);
    this.renderer.toneMappingExposure = 0.78 + day * 0.27;
    (this.crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + (1 - day) * 0.55;
    const sky = new THREE.Color(0x647e98).lerp(new THREE.Color(0xc5d6d8), day); (this.scene.background as THREE.Color).copy(sky); (this.scene.fog as THREE.Fog).color.copy(sky);
    this.crystal.rotation.y += dt * 0.12; this.crystal.position.y = 3.7 + Math.sin(now * 0.001) * 0.15; this.particles.rotation.y += dt * 0.06;
    this.layoutLabels();
    let shadowIndex = 0; const shadowMatrix = new THREE.Matrix4(), shadowQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (const figure of [...this.actors.values()].map(actor => actor.group).concat(this.scene.children.filter(object => object.userData.kind === 'npc') as THREE.Group[])) {
      if (shadowIndex >= 150) break;
      const size = figure.userData.definitionId === 'stone-golem' ? 0.85 : figure.userData.definitionId?.includes('beetle') ? 0.65 : 0.43;
      shadowMatrix.compose(new THREE.Vector3(figure.position.x, 0.068, figure.position.z), shadowQuaternion, new THREE.Vector3(size, size, 1)); this.contactShadows.setMatrixAt(shadowIndex++, shadowMatrix);
    }
    this.contactShadows.count = shadowIndex; this.contactShadows.instanceMatrix.needsUpdate = true;
    for (const group of this.drops.values()) if (group.children.some(child => child instanceof THREE.Points)) group.rotation.y += dt * 0.2;
    this.vfx.update(now, dt);
    this.renderer.render(this.scene, this.camera);
    this.vfx.recordRendered();
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
      cameraElevationDegrees: Math.atan2(presentation.camera.offset.y, Math.hypot(presentation.camera.offset.x, presentation.camera.offset.z)) * 180 / Math.PI,
      characterScreenHeight: (() => { const actor = this.actors.get(this.selfId); return actor ? Math.abs(this.project(actor.group.position, 2.2).y - this.project(actor.group.position, 0).y) : 0; })(),
      fadedBuildings: this.buildingOccluders.filter(building => building.opacity < 1).length,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      memory: { ...this.renderer.info.memory },
      frameTimes: [...this.frameTimes], renderTimes: [...this.renderTimes], visualEvents: { ...this.visualEvents }, presentedVisuals: { ...this.presentedVisuals },
      focus: { x: this.focus.x, z: this.focus.z },
      actors: [...this.actors].map(([id, actor]) => ({ id, x: actor.group.position.x, z: actor.group.position.z, animation: actor.animation })),
      drops: [...this.drops].map(([id, group]) => ({ id, meshes: group.children.map(child => ({ type: child.type, geometry: (child as THREE.Mesh).geometry?.type, emissive: ((child as THREE.Mesh).material as THREE.MeshStandardMaterial)?.emissive?.getHex() })) })),
      projected: point ? this.project(point, 0) : undefined,
      groundHit: point ? (() => { const p = this.project(point, 0); return this.pick(p.x, p.y); })() : undefined,
    };
  }
  placeLabel(id: string, point: Point, height: number, offset = 0): void { const element = this.labels.get(id); if (!element) return; const p = this.project(point, height); element.style.display = p.visible ? '' : 'none'; element.style.left = `${p.x}px`; element.style.top = `${p.y - offset}px`; }
  destroy(): void { this.running = false; this.vfx.destroy(); this.resizeObserver.disconnect(); this.scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { object.geometry.dispose(); if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(m => m.dispose()); } }); this.environmentTarget?.dispose(); this.environment.dispose(); this.contactTexture.dispose(); this.lootArt.dispose(); this.materials.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); this.labelHost.replaceChildren(); }
}
