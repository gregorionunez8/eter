import * as THREE from 'three';
import { obstacles, walkable } from '../shared/world';
import { MaterialLibrary, type Surface } from './materials';
import { npcs } from '../shared/content';
import { icon } from './icons';

/** Detailed scenery uses the existing authoritative footprints. Decorative ground cover is nonblocking. */
export class Environment {
  lamps: THREE.Mesh[] = [];
  private signTextures: THREE.Texture[] = [];
  private groundFade?: THREE.CanvasTexture;
  constructor(readonly scene: THREE.Scene, readonly materials: MaterialLibrary) {}
  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: Surface, color: number, p: number[], scale?: number[], repeat = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.materials.get(surface, color, repeat)); mesh.position.set(p[0], p[1], p[2]);
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(parent: THREE.Object3D, size: number[], surface: Surface, color: number, p: number[], repeat = 1): THREE.Mesh {
    return this.mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), surface, color, p, undefined, repeat);
  }
  illuminated(mesh: THREE.Mesh, color = 0xffc875): void {
    const original = mesh.material as THREE.MeshStandardMaterial, material = original.clone(); material.userData.shared = false;
    material.emissive.setHex(color); material.emissiveIntensity = 0.1; material.metalness = 0; mesh.material = material;
    mesh.userData.animatedGlow = true; this.lamps.push(mesh);
  }
  lighting(daylight: number): void { for (const lamp of this.lamps) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.04 + Math.max(0, 0.65 - daylight) * 1.6; }
  ground(x: number, z: number, width: number, depth: number, color: number, y: number, surface: Surface): void {
    const tileSize = surface === 'street' ? 2.5 : 5;
    if (!this.groundFade) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const context = canvas.getContext('2d')!;
      const data = context.createImageData(64, 64);
      for (let py = 0; py < 64; py++) for (let px = 0; px < 64; px++) {
        const edge = Math.min(px, py, 63 - px, 63 - py), value = Math.round(Math.min(1, edge / 5) * 255), index = (py * 64 + px) * 4;
        data.data.set([value, value, value, 255], index);
      }
      context.putImageData(data, 0, 0); this.groundFade = new THREE.CanvasTexture(canvas);
    }
    const material = this.materials.get(surface, color, width / tileSize, depth / tileSize).clone();
    material.userData.shared = false; material.alphaMap = this.groundFade; material.transparent = true; material.depthWrite = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.position.set(x, y, z); mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true; this.scene.add(mesh);
  }
  building(x: number, z: number, width: number, depth: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    g.userData.occludingBuilding = true;
    const height = width > 6 ? 3.8 : 4.4, roofColor = x < 0 ? 0x78604d : 0x526f79;
    this.box(g, [width, height, depth], 'stone', 0xd6d1bd, [0, height / 2, 0], 2);
    this.box(g, [width + 0.12, 0.32, depth + 0.12], 'stone', 0x9ba5a0, [0, 0.16, 0], 2);
    for (const y of [0.65, height - 0.16]) this.box(g, [width + 0.14, 0.16, depth + 0.14], 'wood', 0x594635, [0, y, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box(g, [0.23, height, 0.23], 'wood', 0x574434, [sx * width / 2, height / 2, sz * depth / 2]);
      for (let i = 0; i < 5; i++) this.box(g, [0.36, 0.25, 0.37], 'stone', 0xb7bbac, [sx * (width / 2 - 0.08), 0.25 + i * 0.34, sz * (depth / 2 - 0.08)]);
    }
    const roofShape = new THREE.Shape(); roofShape.moveTo(-width / 2 - 0.4, 0); roofShape.lineTo(0, 1.9); roofShape.lineTo(width / 2 + 0.4, 0); roofShape.closePath();
    this.mesh(g, new THREE.ExtrudeGeometry(roofShape, { depth: depth + 0.7, bevelEnabled: false }), 'roof', roofColor, [0, height, -depth / 2 - 0.35], undefined, 2);
    for (const side of [-1, 1]) {
      const slope = Math.atan2(1.9, width / 2 + 0.4), roofWidth = Math.hypot(width / 2 + 0.4, 1.9);
      for (let row = 0; row < 8; row++) {
        const fraction = (row + 0.5) / 8;
        const strip = this.box(g, [roofWidth / 8 + 0.05, 0.055, depth + 0.8], 'roof', row % 2 ? roofColor : roofColor + 0x080808, [side * (width / 2 + 0.4) * fraction, height + 1.9 * (1 - fraction) + 0.04, 0]);
        strip.rotation.z = -side * slope;
      }
      const beam = this.box(g, [roofWidth + 0.08, 0.14, 0.14], 'wood', 0x473b30, [side * (width / 4 + 0.2), height + 0.95, depth / 2 + 0.43]); beam.rotation.z = -side * slope;
      for (const front of [-1, 1]) {
        this.box(g, [0.13, 1.28, 0.13], 'wood', 0x574434, [side * width / 4, height + 0.45, front * (depth / 2 + 0.04)]);
      }
    }
    this.box(g, [0.8, 2.3, 0.8], 'stone', 0xa0a89e, [width / 3, height + 0.95, -depth / 4], 2);
    this.box(g, [1, 0.18, 1], 'stone', 0xb7b9aa, [width / 3, height + 2.13, -depth / 4]);
    for (const side of [-1, 1]) {
      const face = side * (depth / 2 + 0.03);
      this.box(g, [1.15, 2.25, 0.1], 'wood', 0x70533b, [0, 1.14, face]);
      for (const dx of [-0.69, 0.69]) this.box(g, [0.22, 2.42, 0.23], 'stone', 0xb7bcaf, [dx, 1.2, face]);
      this.box(g, [1.6, 0.22, 0.25], 'stone', 0xc5c5b4, [0, 2.45, face]);
      this.box(g, [1.4, 0.11, 0.27], 'stone', 0xb5b8a8, [0, 0.06, face + side * 0.1]);
      this.mesh(g, new THREE.TorusGeometry(0.075, 0.013, 5, 12), 'metal', 0xb6a16c, [0.35, 1.1, face + side * 0.07]);
      for (const dx of [-width / 3, width / 3]) {
        this.illuminated(this.box(g, [0.94, 1.25, 0.08], 'metal', 0x52696b, [dx, 2.46, face]));
        for (const horizontal of [false, true]) this.box(g, horizontal ? [0.99, 0.08, 0.15] : [0.075, 1.31, 0.15], 'wood', 0x675039, [dx, 2.46, face + side * 0.03]);
        for (const offset of [-0.52, 0.52]) this.box(g, [0.16, 1.4, 0.12], 'wood', 0x716046, [dx + offset, 2.46, face]);
        this.box(g, [1.3, 0.12, 0.36], 'stone', 0xbfc5b4, [dx, 1.78, face]);
      }
    }
    // Work areas stay inside building collision footprints and away from NPC interaction points.
    this.barrel(g, -width / 2 + 0.5, depth / 2 - 0.5);
    this.box(g, [0.75, 0.7, 0.75], 'wood', 0x967c51, [width / 2 - 0.55, 0.35, depth / 2 - 0.5]);
    for (const y of [0.12, 0.57]) this.box(g, [0.79, 0.05, 0.79], 'metal', 0x686b60, [width / 2 - 0.55, y, depth / 2 - 0.5]);
    if (x < 0 && z > 0 && z < 8) {
      this.box(g, [1.1, 0.55, 0.65], 'metal', 0x555e62, [width / 2 - 0.65, 0.9, 0.8]);
      this.box(g, [0.65, 0.55, 0.55], 'stone', 0x75817b, [width / 2 - 0.65, 0.3, 0.8]);
    }
    if (x > 0 && z > 0) {
      const awning = this.box(g, [width - 0.5, 0.06, 1], 'cloth', 0x718a81, [0, 2.3, depth / 2 + 0.1]); awning.rotation.x = 0.18;
      this.box(g, [2.5, 0.12, 0.7], 'wood', 0x72583d, [0, 0.85, depth / 2 - 0.3]);
      for (let i = 0; i < 6; i++) {
        this.mesh(g, new THREE.SphereGeometry(0.105, 10, 8), 'metal', i % 2 ? 0x547e9e : 0xa65a56, [-1 + i * 0.37, 1, depth / 2 - 0.3]);
        this.mesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.15, 8), 'wood', 0x92744b, [-1 + i * 0.37, 1.13, depth / 2 - 0.3]);
      }
    }
    const nearby = [...npcs].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    const signId = nearby.id === 'lyra' ? 'hp-potion' : ['elyra', 'seraph', 'kael'].includes(nearby.id) ? 'ether-staff' : nearby.id === 'sylwen' ? 'ash-bow' : nearby.id === 'orin' ? 'crowns' : 'iron-sword';
    const side = z > 0 ? -1 : 1, face = side * (depth / 2 + 0.22);
    this.box(g, [0.035, 0.65, 0.035], 'metal', 0x675f49, [width / 2 - 0.75, 3.5, face]);
    this.box(g, [0.86, 1.05, 0.08], 'wood', 0x584931, [width / 2 - 0.75, 2.8, face]);
    const signTexture = new THREE.TextureLoader().load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon(signId))); signTexture.colorSpace = THREE.SRGBColorSpace; this.signTextures.push(signTexture);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, side: THREE.DoubleSide })); sign.position.set(width / 2 - 0.75, 2.8, face + side * 0.055); g.add(sign);
  }
  barrel(parent: THREE.Object3D, x: number, z: number): void {
    const profile = [[0.31, 0], [0.37, 0.2], [0.4, 0.55], [0.37, 0.9], [0.31, 1]].map(p => new THREE.Vector2(p[0], p[1]));
    this.mesh(parent, new THREE.LatheGeometry(profile, 16), 'wood', 0x98734b, [x, 0, z]);
    for (const y of [0.16, 0.81]) { const band = this.mesh(parent, new THREE.TorusGeometry(0.368, 0.027, 5, 16), 'metal', 0x59605e, [x, y, z]); band.rotation.x = Math.PI / 2; }
    this.mesh(parent, new THREE.CylinderGeometry(0.315, 0.315, 0.04, 16), 'wood', 0x8b6b46, [x, 1, z]);
  }
  monument(): void {
    const g = new THREE.Group(); this.scene.add(g);
    for (let i = 0; i < 3; i++) this.mesh(g, new THREE.CylinderGeometry(2.5 - i * 0.18, 2.62 - i * 0.18, 0.14, 48), 'stone', 0xa8b5ac, [0, 0.1 + i * 0.14, 0]);
    this.mesh(g, new THREE.CylinderGeometry(1.15, 1.45, 0.7, 32), 'stone', 0xd0d2bd, [0, 0.76, 0], undefined, 2);
    this.mesh(g, new THREE.CylinderGeometry(1.6, 1.3, 0.18, 32), 'stone', 0xbdc7b8, [0, 1.19, 0]);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const x = Math.sin(angle) * 1.15, z = Math.cos(angle) * 1.15;
      this.box(g, [0.12, 0.57, 0.12], 'metal', 0xaa9463, [x, 0.77, z]);
      const rune = this.box(g, [0.1, 0.24, 0.025], 'metal', 0x83c9c7, [x * 1.12, 0.8, z * 1.12]); rune.rotation.y = angle;
      const inlay = this.box(g, [0.045, 0.03, 0.52], 'metal', 0x86b5ac, [Math.sin(angle) * 1.9, 0.54, Math.cos(angle) * 1.9]); inlay.rotation.y = angle;
    }
    for (let i = 0; i < 2; i++) {
      const orbit = this.mesh(g, new THREE.TorusGeometry(1.53, 0.035, 8, 64), 'metal', 0xb39d6b, [0, 3.25, 0]);
      orbit.rotation.set(Math.PI / 2 + (i ? 0.6 : -0.6), i ? 0.45 : -0.45, 0);
    }
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      this.mesh(g, new THREE.CylinderGeometry(0.12, 0.2, 1.4, 12), 'stone', 0xc2cbbb, [Math.sin(angle) * 2, 1.07, Math.cos(angle) * 2]);
      this.mesh(g, new THREE.OctahedronGeometry(0.12), 'metal', 0x83ced2, [Math.sin(angle) * 2, 1.84, Math.cos(angle) * 2]);
    }
  }
  tree(x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    const seed = Math.abs(x * 31 + z * 17), large = x < -30, slender = Math.floor(seed) % 3 === 0, height = (large ? slender ? 6.3 : 5.3 : 3.6) + seed % 3 * 0.3;
    const trunk = new THREE.CylinderGeometry(slender ? 0.12 : 0.18, large && !slender ? 0.46 : 0.27, height, 10, 7), trunkPositions = trunk.attributes.position;
    for (let i = 0; i < trunkPositions.count; i++) { const y = trunkPositions.getY(i); trunkPositions.setX(i, trunkPositions.getX(i) + Math.sin(y * 0.8 + seed) * 0.055); trunkPositions.setZ(i, trunkPositions.getZ(i) + Math.cos(y * 0.6 + seed) * 0.045); }
    trunk.computeVertexNormals();
    this.mesh(g, trunk, 'wood', slender ? 0xb5b2a0 : 0x76644d, [0, height / 2, 0], undefined, 3);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4 + seed, branch = this.mesh(g, new THREE.CylinderGeometry(0.04, 0.12, 1.7, 8), 'wood', 0x76644d, [Math.sin(angle) * 0.6, height * 0.73, Math.cos(angle) * 0.6]);
      branch.rotation.set(Math.cos(angle) * 0.8, 0, Math.sin(angle) * 0.8);
      for (let j = 0; j < 6; j++) {
        const reach = slender ? 0.5 + j % 3 * 0.23 : 0.8 + j % 3 * 0.5, leafSize = slender ? 2.1 : 2.8;
        const canopy = this.mesh(g, new THREE.PlaneGeometry(leafSize, leafSize), 'foliage', slender ? i % 2 ? 0xaabca1 : 0xc8cfa8 : i % 2 ? 0xa5b38e : 0xbfc69b, [Math.sin(angle) * reach, height * (slender ? 0.77 : 0.66) + j % 3 * 0.55 + i % 2 * 0.3, Math.cos(angle) * reach], [1, 0.8, 1]);
        canopy.rotation.set(j % 2 ? Math.PI * 0.2 : Math.PI * 0.65, angle + j * 1.2, j * 0.17);
      }
      const root = this.mesh(g, new THREE.CylinderGeometry(0.04, 0.16, 0.75, 8), 'wood', 0x76644d, [Math.sin(angle) * 0.24, 0.17, Math.cos(angle) * 0.24]); root.rotation.set(Math.cos(angle) * 1.1, 0, Math.sin(angle) * 1.1);
    }
  }
  rock(x: number, z: number, width = 1.8, depth = 1.8): void {
    const geometry = new THREE.SphereGeometry(1, 12, 9), positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i);
      const erosion = 0.85 + 0.12 * Math.sin(px * 13 + pz * 7 + x) * Math.cos(py * 9 + z);
      positions.setXYZ(i, px * erosion, py * erosion, pz * erosion);
    }
    geometry.computeVertexNormals();
    const height = width > 3 ? width * 0.9 : 1.2 + Math.abs(x + z) % 3 * 0.17;
    this.mesh(this.scene, geometry, 'rock', x > 30 ? 0xa69d87 : 0x929a89, [x, height * 0.48, z], [width * 0.48, height, depth * 0.48], 2);
  }
  ruin(id: string, x: number, z: number, width: number, depth: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    if (id.includes('pillar')) {
      const profile = [[0.8, 0], [0.8, 0.18], [0.58, 0.24], [0.55, 0.4], [0.49, 3.2], [0.65, 3.4], [0.69, 3.55]].map(p => new THREE.Vector2(p[0], p[1]));
      this.mesh(g, new THREE.LatheGeometry(profile, 20), 'stone', 0xb5b8a4, [0, 0, 0], undefined, 3);
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5;
        this.mesh(g, new THREE.CylinderGeometry(0.026, 0.026, 2.6, 6), 'stone', 0x929e91, [Math.sin(angle) * 0.5, 1.7, Math.cos(angle) * 0.5]);
      }
      this.box(g, [1.5, 0.2, 1.5], 'stone', 0xc0c2ac, [0, 3.65, 0]);
      const broken = this.box(g, [1.15, 0.12, 1.1], 'stone', 0xa7b19d, [0.03, 3.8, -0.1]); broken.rotation.z = 0.07;
      for (let i = 0; i < 3; i++) this.box(g, [0.08, 0.24, 0.045], 'metal', 0x719fa2, [-0.18 + i * 0.18, 2.5 + i * 0.1, 0.51]);
    } else {
      for (let row = 0; row < 5; row++) for (let i = 0; i < 4; i++) {
        if (row > 2 && (i === 0 || i === 3) || row === 4 && i === 2) continue;
        const stone = this.box(g, [width - 0.06, 0.32, depth / 4 - 0.03], 'stone', row % 2 ? 0xaab09c : 0xb9bca8, [0, 0.17 + row * 0.34, -depth / 2 + (i + 0.5) * depth / 4]); stone.rotation.y = (i % 2 ? 1 : -1) * 0.02;
      }
    }
    this.ground(x, z, width + 0.4, depth + 0.4, 0x747f84, 0.054, 'stone');
  }
  fountain(x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    const basin = [[0, 0], [1.7, 0], [1.72, 0.15], [1.53, 0.2], [1.48, 0.44], [1.66, 0.48], [1.66, 0.62], [1.4, 0.62], [1.4, 0.3], [0, 0.3]].map(p => new THREE.Vector2(p[0], p[1]));
    this.mesh(g, new THREE.LatheGeometry(basin, 40), 'stone', 0xc4c7b1, [0, 0.05, 0], undefined, 2);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.39, 40), new THREE.MeshStandardMaterial({ color: 0x659eaa, metalness: 0.35, roughness: 0.2, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.55; g.add(water);
    const pedestal = [[0.38, 0], [0.41, 0.15], [0.25, 0.24], [0.18, 1.3], [0.4, 1.4], [0.58, 1.48], [0.59, 1.6], [0.17, 1.65], [0.13, 2.0]].map(p => new THREE.Vector2(p[0], p[1]));
    this.mesh(g, new THREE.LatheGeometry(pedestal, 28), 'stone', 0xd0cdb6, [0, 0.38, 0]);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const arc = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.sin(angle) * 0.45, 1.96, Math.cos(angle) * 0.45), new THREE.Vector3(Math.sin(angle) * 0.68, 1.5, Math.cos(angle) * 0.68), new THREE.Vector3(Math.sin(angle) * 0.75, 0.58, Math.cos(angle) * 0.75)]);
      const stream = new THREE.Mesh(new THREE.TubeGeometry(arc, 8, 0.018, 4, false), water.material); g.add(stream);
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.009, 4, 16), water.material); ripple.rotation.x = Math.PI / 2; ripple.position.set(Math.sin(angle) * 0.75, 0.565, Math.cos(angle) * 0.75); g.add(ripple);
    }
  }
  regions(): void {
    // Farming clearings are blended directly into the terrain albedo.
    // Low ground detail never adds hidden collision to an existing farming area.
    for (let i = 0; i < 26; i++) {
      const x = 33 + i * 17 % 41, z = -27 + i * 19 % 56;
      if (!walkable({ x, z }) || Math.abs(z) < 5) continue;
      this.mesh(this.scene, new THREE.PlaneGeometry(0.8, 0.55), 'foliage', 0xb2a781, [x, 0.24, z]).rotation.y = i * 2.4;
    }
    for (let i = 0; i < 18; i++) {
      const x = -18 + i * 11 % 37, z = -41 - i * 7 % 31;
      if (!walkable({ x, z }) || Math.abs(x) < 5) continue;
      const slab = this.box(this.scene, [1.7, 0.075, 1.3], 'stone', 0x98a89c, [x, 0.07, z], 2); slab.rotation.y = i * 1.2;
      this.box(this.scene, [0.6, 0.12, 0.4], 'stone', 0xa9b5a1, [x + 0.6, 0.07, z + 0.6]);
    }
    // Worn crop rows and wildflowers give the open beginner fields a settled edge.
    for (let i = 0; i < 7; i++) this.ground(16, 28 + i * 0.8, 5, 0.22, 0x8f8160, 0.055, 'dirt');
    for (let i = 0; i < 80; i++) {
      const x = 13.7 + i % 10 * 0.5, z = 27.9 + Math.floor(i / 10) * 0.55;
      this.mesh(this.scene, new THREE.CylinderGeometry(0.009, 0.015, 0.44, 5), 'grass', 0xaca55e, [x, 0.25, z]);
      this.mesh(this.scene, new THREE.SphereGeometry(1, 6, 5), 'grass', 0xc8b974, [x, 0.49, z], [0.025, 0.073, 0.02]);
    }
    for (let i = 0; i < 55; i++) {
      const x = -29 - i * 11 % 43, z = 8 + i * 7 % 57;
      if (!walkable({ x, z }) || Math.abs(z) < 5) continue;
      const fern = this.mesh(this.scene, new THREE.PlaneGeometry(1, 0.65), 'foliage', 0x9fae87, [x, 0.29, z]); fern.rotation.set(-0.3, i * 2.4, 0);
    }
  }
  details(): void {
    for (const prop of obstacles.filter(o => o.kind === 'prop')) this.prop(prop.id, prop.x, prop.z);
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const geometry = new THREE.PlaneGeometry(0.11, 0.43, 1, 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 0) positions.setX(i, positions.getX(i) * 0.12);
    // Ground albedo is too dark on narrow back-facing blades. Keep grass softly
    // lit and untextured at this scale instead of producing black picket marks.
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x819458, emissive: 0x293c19, emissiveIntensity: 0.25, roughness: 1, side: THREE.DoubleSide });
    const grass = new THREE.InstancedMesh(geometry, grassMaterial, 3400); let count = 0;
    for (let i = 0; i < 3400; i++) {
      const x = ((i * 73.719) % 150) - 75, z = ((i * 37.331) % 150) - 75;
      if (Math.abs(x) < 25 && Math.abs(z) < 25 || Math.abs(x) < 4 || Math.abs(z) < 4 || x > 30 || z < -35 || !walkable({ x, z })) continue;
      p.set(x, 0.24, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.4); s.set(1, 0.6 + i % 4 * 0.15, 1); matrix.compose(p, q, s); grass.setMatrixAt(count++, matrix);
    }
    grass.count = count; grass.receiveShadow = true; grass.computeBoundingSphere(); this.scene.add(grass);
    for (let i = 0; i < 65; i++) {
      const x = (i * 37 % 130) - 65, z = (i * 61 % 132) - 66;
      if (Math.abs(x) < 26 && Math.abs(z) < 26 || Math.abs(x) < 6 || Math.abs(z) < 6) continue;
      this.mesh(this.scene, new THREE.SphereGeometry(0.4, 10, 8), 'rock', x > 30 ? 0x9c9b89 : 0x8a9380, [x, 0.1, z], [1.3, 0.6, 0.8]);
      if (x < -30) {
        this.mesh(this.scene, new THREE.CylinderGeometry(0.04, 0.045, 0.2, 6), 'wood', 0xc3b894, [x + 0.6, 0.1, z]);
        this.mesh(this.scene, new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'leather', 0xa47561, [x + 0.6, 0.2, z], [1, 0.6, 1]);
      }
    }
    // Lampposts and flower borders use already blocked city building corners.
    for (const o of obstacles.filter(o => o.kind === 'building')) {
      const x = o.x + o.width / 2 - 0.18, z = o.z - o.depth / 2 + 0.18;
      this.mesh(this.scene, new THREE.CylinderGeometry(0.045, 0.065, 2.7, 8), 'metal', 0x465358, [x, 1.35, z]);
      this.illuminated(this.box(this.scene, [0.32, 0.47, 0.32], 'metal', 0xb7a372, [x, 2.76, z]));
      for (let i = 0; i < 4; i++) this.mesh(this.scene, new THREE.SphereGeometry(0.09, 8, 6), 'cloth', i % 2 ? 0xc6a789 : 0x899b71, [o.x - o.width / 2 + 0.35 + i * 0.23, 0.35, o.z + o.depth / 2 - 0.2]);
    }
  }
  prop(id: string, x: number, z: number): void {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    if (id.startsWith('gate-')) {
      const labels: Record<string, [string, string]> = { 'gate-south': ['GREENFIELDS', 'Niv. 1–3'], 'gate-west': ['WHISPERWOOD', 'Niv. 6–10'], 'gate-east': ['STONEPASS', 'Niv. 14–18'], 'gate-north': ['ETHER RUINS', 'Niv. 24–32'] };
      const [title, levels] = labels[id];
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
      const context = canvas.getContext('2d')!; context.fillStyle = '#293032'; context.fillRect(0, 0, 512, 192); context.strokeStyle = '#b39a65'; context.lineWidth = 8; context.strokeRect(6, 6, 500, 180);
      context.textAlign = 'center'; context.fillStyle = '#efdbaf'; context.font = 'bold 36px Georgia'; context.fillText(title, 256, 78); context.font = '28px Arial'; context.fillStyle = '#bfcbc0'; context.fillText(levels, 256, 134);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.signTextures.push(texture);
      this.box(g, [0.15, 2.5, 0.15], 'wood', 0x66513c, [0, 1.25, 0]);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.05), new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 1 })); board.position.set(0.08, 2.2, 0.08); board.rotation.y = Math.PI / 4; g.add(board);
    } else if (id.includes('farm-fence')) {
      if (id.endsWith('east')) g.rotation.y = Math.PI / 2;
      for (let i = 0; i < 5; i++) this.box(g, [0.12, 0.8, 0.12], 'wood', 0x92815c, [-2.3 + i * 1.15, 0.4, 0]);
      for (const y of [0.29, 0.61]) this.box(g, [4.9, 0.07, 0.065], 'wood', 0x87754f, [0, y, 0]);
    } else if (id.includes('planter')) {
      this.box(g, [0.8, 0.4, 3], 'stone', 0xa4afa0, [0, 0.2, 0], 2);
      this.box(g, [0.62, 0.05, 2.8], 'dirt', 0x554c38, [0, 0.42, 0]);
      for (let i = 0; i < 8; i++) {
        this.mesh(g, new THREE.PlaneGeometry(0.75, 0.75), 'foliage', 0xa8b593, [0, 0.68, -1.2 + i * 0.34]).rotation.set(-0.5, i * 2.4, 0);
        this.mesh(g, new THREE.SphereGeometry(0.065, 8, 6), 'cloth', i % 2 ? 0xb6a0b9 : 0xe5c8a3, [0.12, 0.71, -1.15 + i * 0.34]);
      }
    } else if (id === 'forge') {
      this.mesh(g, new THREE.CylinderGeometry(0.4, 0.5, 0.64, 10), 'stone', 0x747d74, [0, 0.32, 0]);
      this.box(g, [0.9, 0.28, 0.45], 'metal', 0x56616b, [0, 0.85, 0]);
      this.box(g, [0.42, 0.32, 0.25], 'metal', 0x75818a, [-0.1, 0.67, 0]);
      const horn = this.mesh(g, new THREE.ConeGeometry(0.14, 0.48, 12), 'metal', 0x7e878b, [0.61, 0.84, 0]); horn.rotation.z = -Math.PI / 2;
      this.box(g, [0.4, 0.04, 0.25], 'wood', 0x8b6744, [0, 1.01, 0]);
      this.box(g, [0.18, 0.12, 0.2], 'metal', 0x717c7e, [0.17, 1.03, 0]);
    } else if (id === 'alchemy' || id === 'arcane-desk') {
      this.box(g, [1.2, 0.09, 0.7], 'wood', 0x8e7251, [0, 0.86, 0]);
      for (const side of [-1, 1]) this.box(g, [0.09, 0.82, 0.45], 'wood', 0x684e36, [side * 0.5, 0.41, 0]);
      for (let i = 0; i < 4; i++) {
        this.mesh(g, new THREE.SphereGeometry(0.1, 12, 8), 'metal', i % 2 ? 0x678ca0 : 0xb08264, [-0.4 + i * 0.25, 1.01, 0.06], [1, 1.1, 1]);
        this.mesh(g, new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8), 'wood', 0x9b8262, [-0.4 + i * 0.25, 1.13, 0.06]);
      }
      const book = this.box(g, [0.44, 0.09, 0.36], 'cloth', 0x5e667c, [0.2, 0.99, -0.15]); book.rotation.y = 0.2;
    } else if (id.includes('rack')) {
      for (const side of [-1, 1]) this.box(g, [0.09, 1.3, 0.12], 'wood', 0x6e523b, [side * 0.5, 0.65, 0]);
      this.box(g, [1.12, 0.1, 0.12], 'wood', 0x8b704c, [0, 1.25, 0]);
      for (let i = 0; i < 3; i++) {
        const weapon = this.box(g, [0.05, 0.92, 0.03], id === 'bow-rack' ? 'wood' : 'metal', id === 'bow-rack' ? 0xc1a073 : 0xbfc9c7, [-0.3 + i * 0.3, 0.75, 0.08]); weapon.rotation.z = 0.12;
        this.box(g, [0.22, 0.045, 0.07], 'metal', 0xa99366, [-0.3 + i * 0.3, 1.13, 0.08]);
      }
    } else if (id.includes('cart')) {
      this.box(g, [2.3, 0.18, 1.3], 'wood', 0x927448, [0, 0.65, 0]);
      for (const side of [-1, 1]) {
        this.box(g, [2.3, 0.6, 0.07], 'wood', 0x80603d, [0, 1, side * 0.6]);
        for (const end of [-1, 1]) {
          const wheel = this.mesh(g, new THREE.TorusGeometry(0.36, 0.045, 8, 20), 'wood', 0x6b533a, [end * 0.8, 0.38, side * 0.72]);
          for (let i = 0; i < 6; i++) { const spoke = this.box(g, [0.028, 0.7, 0.028], 'wood', 0x8b714b, [end * 0.8, 0.38, side * 0.72]); spoke.rotation.z = i * Math.PI / 3; }
          wheel.rotation.y = side < 0 ? Math.PI : 0;
        }
      }
      this.barrel(g, -0.65, 0); this.mesh(g, new THREE.SphereGeometry(0.34, 12, 10), 'cloth', 0xb6a67d, [0.45, 1.11, 0], [1, 1.3, 1]);
    } else {
      this.box(g, [2.5, 0.12, 0.7], 'wood', 0x8c7551, [0, 0.5, 0]);
      this.box(g, [2.5, 0.65, 0.08], 'wood', 0x8c7551, [0, 0.85, -0.32]);
      for (const side of [-1, 1]) this.box(g, [0.15, 0.5, 0.5], 'stone', 0xa9b0a1, [side * 0.95, 0.25, 0]);
    }
  }
  dispose(): void { for (const texture of this.signTextures) texture.dispose(); this.signTextures = []; this.groundFade?.dispose(); }
}
