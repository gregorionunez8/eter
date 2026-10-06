import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { items, monsters, type ClassId, type Slot } from '../shared/content';
import type { Point } from '../shared/model';
import { MaterialLibrary, type Surface } from './materials';
import { characterArt } from './character-art';

export interface ActorRig {
  group: THREE.Group; target: Point; legs: THREE.Object3D[]; arms: THREE.Object3D[]; animation: string;
  torso: THREE.Object3D; head: THREE.Object3D; hands: THREE.Object3D[]; equipment: THREE.Object3D;
  equipmentKey: string; phase: number; hitUntil: number; deadAt?: number; lastHp?: number; actionAt?: number; spinUntil?: number;
  knees?: THREE.Object3D[]; elbows?: THREE.Object3D[]; interactUntil?: number;
}
export type EquipmentAppearance = Partial<Record<Slot, string>>;

/** Sculpted profiles and articulated parts give each original character a grounded silhouette. */
export class ActorFactory {
  constructor(readonly materials: MaterialLibrary) {}
  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: Surface, color: number, position: number[], scale?: number[]): THREE.Mesh {
    const material = this.materials.get(surface, 0xffffff); material.vertexColors = true;
    const tint = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]); if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  ellipsoid(parent: THREE.Object3D, surface: Surface, color: number, p: number[], s: number[]): THREE.Mesh {
    let geometry: THREE.BufferGeometry = new THREE.SphereGeometry(1, 12, 10);
    if (surface === 'rock') {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const fracture = 0.9 + 0.16 * Math.sin(x * 13 + p[0] * 7) * Math.cos(y * 11 + z * 9 + color);
        positions.setXYZ(i, x * fracture, y * fracture, z * fracture);
      }
      geometry = geometry.toNonIndexed(); geometry.computeVertexNormals();
    }
    return this.mesh(parent, geometry, surface, color, p, s);
  }
  profile(parent: THREE.Object3D, points: number[][], surface: Surface, color: number, p: number[], depth = 1): THREE.Mesh {
    return this.mesh(parent, new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 16), surface, color, p, [1, 1, depth]);
  }
  animalProfile(parent: THREE.Object3D, rings: number[][], color: number, position: number[]): THREE.Mesh {
    const xyz: number[] = [], uv: number[] = [], indices: number[] = [], segments = 20;
    rings.forEach(([z, y, width, height], row) => {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        xyz.push(Math.sin(angle) * width, y + Math.cos(angle) * height, z); uv.push(i / segments, row / (rings.length - 1));
        if (row && i) { const a = row * (segments + 1) + i, b = a - segments - 1; indices.push(a, b, a - 1, a - 1, b, b - 1); }
      }
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = this.mesh(parent, geometry, 'fur', color, position), colors = geometry.attributes.color;
    // Dark guard hairs along the back, lighter lower coat: readable anatomy
    // without a stack of oval primitives or a new texture per monster.
    const tint = new THREE.Color(color);
    for (let row = 0; row < rings.length; row++) for (let i = 0; i <= segments; i++) {
      const shade = 0.82 + (1 - Math.cos(i / segments * Math.PI * 2)) * 0.16;
      colors.setXYZ(row * (segments + 1) + i, tint.r * shade, tint.g * shade, tint.b * shade);
    }
    return mesh;
  }
  rod(parent: THREE.Object3D, from: number[], to: number[], radius: number, surface: Surface, color: number): THREE.Mesh {
    const a = new THREE.Vector3(...from as [number, number, number]), b = new THREE.Vector3(...to as [number, number, number]);
    const mesh = this.mesh(parent, new THREE.CylinderGeometry(radius * 0.75, radius, a.distanceTo(b), 8), surface, color, a.clone().add(b).multiplyScalar(0.5).toArray());
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return mesh;
  }
  face(head: THREE.Object3D, skin: number, female: boolean): void {
    const rings = [[-0.2, 0.055, 0.067], [-0.15, 0.093, 0.097], [-0.08, 0.13, 0.12], [0, 0.14, 0.137], [0.09, 0.137, 0.139], [0.16, 0.11, 0.115], [0.205, 0.055, 0.065], [0.22, 0.006, 0.008]];
    const positions: number[] = [], indices: number[] = [], uv: number[] = [], segments = 24;
    rings.forEach(([y, width, depth], row) => {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        positions.push(Math.sin(angle) * width * (female ? 0.94 : 1), y, Math.cos(angle) * depth); uv.push(i / segments, row / (rings.length - 1));
        if (row && i) { const a = row * (segments + 1) + i, b = a - segments - 1; indices.push(a, a - 1, b, a - 1, b - 1, b); }
      }
    });
    const face = new THREE.BufferGeometry(); face.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); face.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); face.setIndex(indices); face.computeVertexNormals();
    this.mesh(head, face, 'skin', skin, [0, 0, 0]);
    const nose = new THREE.BufferGeometry(); nose.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.058, 0.134, -0.023, -0.018, 0.139, 0, -0.025, 0.179, 0.023, -0.018, 0.139, 0, 0.058, 0.134, 0, -0.025, 0.179, -0.023, -0.018, 0.139, 0.023, -0.018, 0.139, 0, -0.025, 0.179], 3)); nose.setAttribute('uv', new THREE.Float32BufferAttribute(Array(18).fill(0), 2)); nose.computeVertexNormals(); this.mesh(head, nose, 'skin', skin, [0, 0, 0]);
    this.rod(head, [-0.033, -0.083, 0.118], [0.033, -0.083, 0.118], 0.004, 'skin', 0x936e5c);
    for (const side of [-1, 1]) {
      this.ellipsoid(head, 'skin', skin, [side * 0.14, -0.01, -0.005], [0.023, 0.047, 0.024]);
      this.ellipsoid(head, 'skin', 0xb7b3a4, [side * 0.052, 0.032, 0.127], [0.019, 0.007, 0.006]);
      this.ellipsoid(head, 'skin', 0x354446, [side * 0.052, 0.032, 0.132], [0.006, 0.006, 0.003]);
      this.rod(head, [side * 0.033, 0.058, 0.13], [side * 0.078, 0.054, 0.118], 0.0035, 'leather', female ? 0x654b36 : 0x46382f);
    }
  }
  costume(torso: THREE.Object3D, classId: ClassId, coat: number): void {
    const warrior = classId === 'VANGUARD', mage = classId === 'ARCANIST';
    const shape = new THREE.Shape(); shape.moveTo(-0.26, 0.5); shape.quadraticCurveTo(-0.2, 0.6, -0.1, 0.59); shape.lineTo(0, 0.56); shape.lineTo(0.1, 0.59); shape.quadraticCurveTo(0.2, 0.6, 0.26, 0.5); shape.lineTo(0.21, 0.2); shape.lineTo(0.09, 0.12); shape.lineTo(0, 0.08); shape.lineTo(-0.09, 0.12); shape.lineTo(-0.21, 0.2); shape.closePath();
    if (warrior) {
      const breastplate = new THREE.ExtrudeGeometry(shape, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.015, bevelSegments: 2 });
      const vertices = breastplate.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setZ(i, vertices.getZ(i) + Math.max(0, 1 - Math.abs(vertices.getX(i)) / 0.27) * 0.065);
      breastplate.computeVertexNormals();
      this.mesh(torso, breastplate, 'metal', 0x8b9b9e, [0, 0.07, 0.2]);
      this.rod(torso, [0, 0.24, 0.251], [0, 0.62, 0.251], 0.014, 'metal', 0xb5a576);
      for (const side of [-1, 1]) {
        this.rod(torso, [0, 0.24, 0.247], [side * 0.22, 0.43, 0.247], 0.009, 'metal', 0xb5a576);
        for (let i = 0; i < 3; i++) {
          const tasset = new THREE.Shape(); tasset.moveTo(-0.074, 0.065); tasset.lineTo(0.074, 0.065); tasset.lineTo(0.06, -0.065); tasset.quadraticCurveTo(0, -0.08, -0.06, -0.065); tasset.closePath();
          const plate = this.mesh(torso, new THREE.ExtrudeGeometry(tasset, { depth: 0.018, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.008, bevelSegments: 1 }), 'metal', coat, [side * (0.15 + i * 0.022), -0.035 - i * 0.075, 0.17]); plate.rotation.z = -side * 0.12;
          this.rod(torso, [side * 0.06, 0.62, 0.2], [side * 0.23, 0.65, 0.19], 0.012, 'metal', 0xc5b07b);
        }
      }
    } else {
      for (const side of [-1, 1]) {
        const trim = this.rod(torso, [side * 0.11, 0.64, 0.21], [side * 0.23, 0.26, 0.22], mage ? 0.012 : 0.018, mage ? 'metal' : 'leather', mage ? 0xab9768 : 0x96744e); trim.rotation.z += side * 0.03;
        if (mage) this.ellipsoid(torso, 'cloth', 0x4c657b, [side * 0.27, 0.55, 0], [0.17, 0.085, 0.23]);
        else for (let i = 0; i < 4; i++) this.rod(torso, [side * 0.05, 0.25 + i * 0.065, 0.235], [side * 0.2, 0.32 + i * 0.065, 0.23], 0.005, 'leather', 0xb5a080);
      }
      if (mage) {
        this.rod(torso, [-0.08, 0.63, 0.22], [0, 0.38, 0.24], 0.006, 'metal', 0xb8a374); this.rod(torso, [0.08, 0.63, 0.22], [0, 0.38, 0.24], 0.006, 'metal', 0xb8a374);
        const pendant = this.mesh(torso, new THREE.OctahedronGeometry(0.042), 'metal', 0x8bd1db, [0, 0.35, 0.25]); pendant.scale.y = 1.4;
      } else {
        this.profile(torso, [[0.22, -0.17], [0.24, -0.05], [0.23, 0.07]], 'leather', 0x6d6448, [0, 0, 0], 0.82);
        for (let i = 0; i < 3; i++) this.rod(torso, [0.14 + i * 0.035, 0.28, -0.24], [0.17 + i * 0.035, 0.75, -0.26], 0.008, 'wood', 0xbca17a);
      }
    }
    // Buckle studs and stitched belt read at character-selection distance.
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) this.ellipsoid(torso, 'metal', 0xaf996b, [side * (0.07 + i * 0.06), 0.14, 0.215], [0.009, 0.009, 0.005]);
  }
  character(id: string, classId: ClassId, override?: number, skinOverride?: number): ActorRig {
    const authored = characterArt(this, id, classId, override, skinOverride);
    if (authored) return authored;
    const group = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group(), equipment = new THREE.Group();
    group.userData = { kind: 'player', id, classId }; group.add(torso, equipment);
    const female = classId === 'RANGER', mage = classId === 'ARCANIST';
    const coat = override ?? (mage ? 0x405775 : female ? 0x4e6550 : 0x687d8b), leather = 0x554133, skin = skinOverride ?? 0xc6a082;
    const surface = mage ? 'cloth' : female ? 'leather' : 'metal';
    torso.position.y = 1.13;
    this.profile(torso, [[female ? 0.17 : 0.19, 0], [female ? 0.19 : 0.24, 0.1], [female ? 0.24 : 0.31, 0.4], [female ? 0.27 : 0.38, 0.6], [female ? 0.2 : 0.25, 0.69], [0.13, 0.73]], surface, coat, [0, 0, 0], 0.7);
    this.profile(torso, [[0.22, 0], [0.26, 0.05], [0.24, 0.12]], 'leather', leather, [0, 0.08, 0], 0.8);
    this.mesh(torso, new THREE.BoxGeometry(0.1, 0.09, 0.035), 'metal', 0xbd9b59, [0, 0.14, 0.205]);
    for (const side of [-1, 1]) {
      this.rod(torso, [side * 0.22, 0.11, 0.16], [side * 0.29, 0.62, 0.17], 0.035, 'leather', 0x9b7650);
      if (!mage) {
        const shoulder = this.mesh(torso, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'metal', female ? 0x829288 : 0xa5b1b5, [side * 0.32, 0.58, -0.01], [female ? 0.13 : 0.18, 0.08, 0.2]); shoulder.rotation.z = -side * 0.15;
        for (let i = 0; i < 2; i++) this.ellipsoid(torso, 'metal', coat, [side * (0.35 + i * 0.025), 0.54 - i * 0.055, 0], [0.12, 0.035, 0.16]);
      }
    }
    this.rod(torso, [0, 0.63, 0], [0, 0.85, 0], 0.075, 'skin', skin);
    torso.add(head); head.position.y = 0.91;
    this.face(head, skin, female);
    this.mesh(head, new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), 'leather', female ? 0x6f462b : 0x322b28, [0, 0.07, -0.01], [0.149, 0.168, 0.15]);
    if (female) {
      this.ellipsoid(head, 'leather', 0x6f462b, [0, -0.14, -0.14], [0.08, 0.25, 0.07]);
      for (const side of [-1, 1]) {
        this.ellipsoid(head, 'leather', 0x6f462b, [side * 0.124, -0.025, 0.01], [0.024, 0.12, 0.045]);
        for (let i = 0; i < 4; i++) this.ellipsoid(head, 'leather', i % 2 ? 0x7c583b : 0x6f462b, [side * 0.122, -0.13 - i * 0.044, 0], [0.022, 0.035, 0.025]);
      }
    }
    if (mage) {
      this.profile(group, [[0.4, 0.13], [0.37, 0.35], [0.28, 0.8], [0.23, 1.22]], 'cloth', coat, [0, 0, -0.035], 0.83);
      for (const side of [-1, 1]) this.rod(group, [side * 0.23, 1.14, 0.15], [side * 0.31, 0.18, 0.25], 0.023, 'metal', 0xa89865);
      const collar = this.profile(torso, [[0.17, 0], [0.23, 0.08], [0.18, 0.23]], 'cloth', 0x24374d, [0, 0.65, -0.04], 0.8); collar.rotation.x = -0.15;
    }
    const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [], hands: THREE.Group[] = [], knees: THREE.Group[] = [], elbows: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.13, 1.13, 0); group.add(leg); legs.push(leg);
      this.profile(leg, [[0.08, -0.55], [0.115, -0.45], [0.12, -0.15], [0.135, 0]], 'leather', leather, [0, 0, 0], 0.87);
      const knee = new THREE.Group(); knee.position.y = -0.53; leg.add(knee); knees.push(knee);
      this.profile(knee, [[0.065, -0.47], [0.08, -0.32], [0.105, -0.12], [0.08, 0]], mage ? 'leather' : surface, mage ? leather : coat, [0, 0, 0], 0.85);
      this.ellipsoid(knee, 'leather', 0x342c27, [0, -0.49, 0.05], [0.082, 0.085, 0.16]);
      for (const y of [-0.1, -0.26]) this.profile(knee, [[0.084, y], [0.086, y + 0.023]], 'leather', 0x8b6f4d, [0, 0, 0], 0.88);
      if (!mage) this.ellipsoid(knee, surface, 0x92988a, [0, 0.02, 0.072], [0.092, 0.095, 0.038]);
      const arm = new THREE.Group(); arm.position.set(side * (female ? 0.3 : 0.38), 0.6, 0); torso.add(arm); arms.push(arm);
      this.profile(arm, [[0.07, -0.38], [0.095, -0.3], [0.115, -0.1], [0.1, 0]], mage ? 'cloth' : 'leather', coat, [0, 0, 0], 0.9);
      const elbow = new THREE.Group(); elbow.position.y = -0.36; elbow.rotation.x = -0.12; arm.add(elbow); elbows.push(elbow);
      this.profile(elbow, [[0.052, -0.36], [0.075, -0.22], [0.085, -0.04], [0.06, 0.01]], mage ? 'cloth' : surface, coat, [0, 0, 0], 0.9);
      this.profile(elbow, [[0.079, -0.27], [0.083, -0.24], [0.079, -0.21]], 'leather', 0x8b6f4d, [0, 0, 0], 0.92);
      const hand = new THREE.Group(); hand.position.set(0, -0.39, 0); elbow.add(hand); hands.push(hand);
      this.ellipsoid(hand, 'skin', skin, [0, 0.015, 0], [0.045, 0.053, 0.026]);
      for (let finger = 0; finger < 4; finger++) this.ellipsoid(hand, 'skin', skin, [-0.032 + finger * 0.021, -0.051, 0.016], [0.012, 0.035 - Math.abs(1.5 - finger) * 0.004, 0.019]);
      this.ellipsoid(hand, 'skin', skin, [-side * 0.045, -0.011, 0.021], [0.017, 0.03, 0.016]);
      arm.rotation.z = side * 0.12;
    }
    this.costume(torso, classId, coat);
    const rig: ActorRig = { group, torso, head, equipment, legs, arms, hands, knees, elbows, target: { x: 0, z: 0 }, animation: 'idle', equipmentKey: '', phase: 0, hitUntil: 0 };
    // Merge static surfaces within each joint; animation pivots remain independent.
    this.skin(rig);
    this.equip(rig, { weapon: mage ? 'ether-staff' : female ? 'ash-bow' : 'iron-sword' });
    this.hitProxy(rig, 0.55, 2.15);
    return rig;
  }
  hitProxy(rig: ActorRig, radius: number, height: number): void {
    const material = new THREE.MeshBasicMaterial(); material.visible = false;
    const proxy = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.1, height - radius * 2), 4, 8), material);
    proxy.position.y = height / 2; proxy.userData.hitProxy = true; rig.group.add(proxy);
  }
  batchJoints(root: THREE.Object3D): void {
    for (const child of [...root.children]) if (child instanceof THREE.Group) this.batchJoints(child);
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of root.children) if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
      const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => { mesh.updateMatrix(); return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix); });
      const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
      if (!geometry) continue;
      const merged = new THREE.Mesh(geometry, material); merged.castShadow = merged.receiveShadow = true; root.add(merged);
      for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    }
  }
  /** Bake the authored joint geometry into rigid-weight skinned batches, one draw per material. */
  skin(rig: ActorRig): void {
    const root = rig.group, bones: THREE.Bone[] = [], pivots = new Map<THREE.Object3D, THREE.Bone>();
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const originals: THREE.Mesh[] = [];
    root.updateMatrixWorld(true);
    const visit = (object: THREE.Object3D, parent?: THREE.Bone) => {
      if (object === rig.equipment) return;
      const bone = new THREE.Bone(); bone.position.copy(object.position); bone.quaternion.copy(object.quaternion); bone.scale.copy(object.scale);
      if (object === root) { bone.position.set(0, 0, 0); bone.quaternion.identity(); bone.scale.set(1, 1, 1); }
      const index = bones.length; bones.push(bone); pivots.set(object, bone); if (parent) parent.add(bone);
      for (const child of object.children) {
        if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
          const geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrixWorld);
          const indices = new Uint16Array(geometry.attributes.position.count * 4), weights = new Float32Array(indices.length);
          for (let v = 0; v < geometry.attributes.position.count; v++) { indices[v * 4] = index; weights[v * 4] = 1; }
          geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
          const list = batches.get(child.material) ?? []; list.push(geometry); batches.set(child.material, list); originals.push(child);
        } else if (child instanceof THREE.Group) visit(child, bone);
      }
    };
    visit(root); root.clear(); root.add(bones[0], rig.equipment); root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose()); if (!geometry) continue;
      const mesh = new THREE.SkinnedMesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; mesh.bind(skeleton); root.add(mesh);
    }
    originals.forEach(m => m.geometry.dispose());
    rig.torso = pivots.get(rig.torso)!; rig.head = pivots.get(rig.head)!;
    rig.legs = rig.legs.map(p => pivots.get(p)!); rig.arms = rig.arms.map(p => pivots.get(p)!); rig.hands = rig.hands.map(p => pivots.get(p)!);
    rig.knees = rig.knees?.map(p => pivots.get(p)!); rig.elbows = rig.elbows?.map(p => pivots.get(p)!);
  }
  monster(id: string, definitionId: string): ActorRig {
    const def = monsters.find(m => m.id === definitionId)!;
    if (definitionId === 'rogue' || definitionId === 'orc-scout') {
      const rig = this.character(id, 'VANGUARD', def.color, definitionId === 'orc-scout' ? 0x879771 : undefined);
      rig.group.userData = { kind: 'monster', id, definitionId };
      if (definitionId === 'orc-scout') {
        rig.group.scale.set(1.14, 1.08, 1.14);
        for (const side of [-1, 1]) {
          this.rod(rig.head, [side * 0.11, -0.07, 0.1], [side * 0.09, 0.025, 0.19], 0.025, 'stone', 0xe4d5b3);
          this.ellipsoid(rig.head, 'leather', 0x73816a, [side * 0.17, 0.04, 0], [0.07, 0.055, 0.033]);
        }
      } else {
        this.profile(rig.head, [[0.17, -0.2], [0.21, 0.04], [0.16, 0.23], [0.02, 0.29]], 'cloth', 0x504846, [0, 0, -0.07]);
        this.ellipsoid(rig.head, 'cloth', 0x403a37, [0, -0.08, 0.14], [0.13, 0.055, 0.035]);
      }
      this.batchJoints(rig.head); return rig;
    }
    const group = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group(), equipment = new THREE.Group();
    group.userData = { kind: 'monster', id, definitionId }; group.add(torso, equipment); torso.add(head);
    const rig: ActorRig = { group, torso, head, equipment, legs: [], arms: [], hands: [], target: { x: 0, z: 0 }, animation: 'idle', equipmentKey: '', phase: 0, hitUntil: 0 };
    const beetle = definitionId.includes('beetle'), wolf = definitionId === 'forest-wolf', golem = definitionId === 'stone-golem';
    if (wolf) {
      torso.position.y = 1.04; head.position.set(0, 0.3, 0.75);
      this.animalProfile(torso, [[-0.82, 0, 0.02, 0.03], [-0.67, 0, 0.25, 0.28], [-0.42, 0.035, 0.27, 0.29], [-0.1, 0.04, 0.23, 0.23], [0.2, -0.015, 0.28, 0.36], [0.48, 0.04, 0.31, 0.4], [0.64, 0.17, 0.25, 0.32], [0.79, 0.3, 0.15, 0.19]], 0x727c82, [0, 0, 0]);
      this.animalProfile(head, [[-0.2, 0, 0.025, 0.04], [-0.12, 0.01, 0.17, 0.23], [0.07, 0, 0.18, 0.2], [0.19, -0.06, 0.13, 0.11], [0.37, -0.09, 0.095, 0.075], [0.48, -0.09, 0.073, 0.06]], 0x929da2, [0, 0, 0]);
      this.ellipsoid(head, 'fur', 0x202b2d, [0, -0.08, 0.48], [0.075, 0.047, 0.04]);
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape(); shape.moveTo(-0.1, 0); shape.lineTo(0, 0.28); shape.lineTo(0.12, 0);
        const ear = this.mesh(head, new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.01, bevelSegments: 1 }), 'fur', 0x586266, [side * 0.13, 0.16, -0.08]); ear.rotation.z = -side * 0.16;
        this.ellipsoid(head, 'metal', 0xcbab63, [side * 0.145, 0.03, 0.19], [0.025, 0.02, 0.02]);
      }
      this.animalProfile(torso, [[-0.63, 0.07, 0.11, 0.11], [-0.84, -0.06, 0.14, 0.14], [-1.05, -0.28, 0.13, 0.14], [-1.16, -0.48, 0.08, 0.11], [-1.17, -0.57, 0.005, 0.01]].reverse(), 0x606e75, [0, 0, 0]);
      for (const side of [-1, 1]) for (const z of [-0.47, 0.47]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.22, -0.15, z); torso.add(leg); rig.legs.push(leg);
        const hock = z < 0 ? -0.17 : 0.015;
        this.rod(leg, [0, 0, 0], [0, -0.4, hock], 0.085, 'fur', 0x777f83);
        this.rod(leg, [0, -0.4, hock], [0, -0.78, 0.04], 0.048, 'fur', 0x929b9e);
        this.ellipsoid(leg, 'fur', 0x727b7e, [0, -0.81, 0.1], [0.09, 0.055, 0.14]);
      }
    } else if (beetle) {
      torso.position.y = 0.65; head.position.set(0, -0.04, 0.67);
      const stone = definitionId === 'stone-beetle';
      this.ellipsoid(torso, stone ? 'rock' : 'leather', stone ? 0x727e7d : 0x8b7545, [0, 0.07, 0], [0.59, 0.43, 0.8]);
      for (const side of [-1, 1]) {
        this.ellipsoid(torso, stone ? 'rock' : 'metal', def.color, [side * 0.25, 0.18, -0.04], [0.31, 0.35, 0.71]);
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Group(); leg.position.set(side * 0.4, -0.1, (i - 1) * 0.42); torso.add(leg); rig.legs.push(leg);
          this.rod(leg, [0, 0, 0], [side * 0.43, -0.14, -0.08], 0.045, 'leather', 0x483e2d);
          this.rod(leg, [side * 0.43, -0.14, -0.08], [side * 0.58, -0.52, 0.12], 0.028, 'leather', 0x483e2d);
        }
        this.rod(head, [side * 0.14, 0.07, 0.1], [side * 0.28, 0.25, 0.35], 0.018, 'leather', 0x453b2c);
        this.rod(head, [side * 0.19, -0.04, 0.17], [side * 0.1, -0.06, 0.41], 0.04, 'metal', 0x4b473a);
        this.ellipsoid(head, 'metal', 0xdfa15d, [side * 0.15, 0.04, 0.2], [0.042, 0.03, 0.033]);
      }
      this.ellipsoid(head, 'leather', 0x574b36, [0, 0, 0], [0.25, 0.2, 0.26]);
      this.rod(torso, [0, 0.45, -0.65], [0, 0.47, 0.6], 0.025, 'metal', stone ? 0x9ba8a3 : 0x473e2c);
      if (stone) for (let i = 0; i < 5; i++) this.ellipsoid(torso, 'rock', 0x9ba8a3, [Math.sin(i * 2) * 0.3, 0.38, (i - 2) * 0.21], [0.14, 0.13, 0.19]);
    } else if (golem) {
      torso.position.y = 1.43; head.position.y = 1.02;
      this.ellipsoid(torso, 'rock', 0x687c7c, [0, 0.21, 0], [0.69, 0.7, 0.42]);
      this.ellipsoid(torso, 'rock', 0x93a09b, [0, 0.2, 0.18], [0.49, 0.49, 0.34]);
      this.ellipsoid(head, 'rock', 0x829490, [0, 0, 0], [0.3, 0.37, 0.28]);
      for (const side of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(side * 0.65, 0.59, 0); torso.add(arm); rig.arms.push(arm);
        this.ellipsoid(arm, 'rock', 0x879792, [0, -0.2, 0], [0.29, 0.4, 0.31]);
        this.ellipsoid(arm, 'rock', 0x6a7b77, [side * 0.04, -0.75, 0.05], [0.3, 0.35, 0.28]);
        this.ellipsoid(arm, 'rock', 0x9aa6a0, [side * 0.04, -1.04, 0.08], [0.3, 0.2, 0.32]);
        const leg = new THREE.Group(); leg.position.set(side * 0.32, -0.15, 0); torso.add(leg); rig.legs.push(leg);
        this.ellipsoid(leg, 'rock', 0x7e9089, [0, -0.32, 0], [0.24, 0.42, 0.26]);
        this.ellipsoid(leg, 'rock', 0x93a099, [0, -0.82, 0.04], [0.22, 0.29, 0.22]);
        this.ellipsoid(leg, 'rock', 0x647874, [0, -1.12, 0.13], [0.29, 0.16, 0.36]);
        this.ellipsoid(head, 'metal', 0x8eeee7, [side * 0.105, 0.035, 0.255], [0.05, 0.025, 0.015]);
      }
      this.mesh(torso, new THREE.OctahedronGeometry(0.16), 'metal', 0x8ce3df, [0, 0.33, 0.49]);
    } else {
      const thorn = definitionId === 'thornling'; torso.position.y = thorn ? 0.87 : 0.52;
      this.profile(torso, [[0.18, -0.3], [0.31, -0.11], [0.34, 0.17], [0.24, 0.43], [0.12, 0.49]], 'wood', thorn ? 0x696d40 : 0x87935c, [0, 0, 0], 0.8);
      head.position.y = 0.39;
      for (const side of [-1, 1]) {
        this.ellipsoid(head, 'metal', 0xe2d28a, [side * 0.09, 0.015, 0.17], [0.041, 0.033, 0.025]);
        const arm = new THREE.Group(); arm.position.set(side * 0.28, 0.18, 0); torso.add(arm); rig.arms.push(arm);
        this.rod(arm, [0, 0, 0], [side * 0.16, -0.26, 0.05], 0.057, 'wood', 0x657443);
        this.rod(arm, [side * 0.16, -0.26, 0.05], [side * 0.12, -0.43, 0.14], 0.037, 'wood', 0x657443);
        const leg = new THREE.Group(); leg.position.set(side * 0.17, -0.22, 0); torso.add(leg); rig.legs.push(leg);
        this.rod(leg, [0, 0, 0], [side * 0.05, -0.23, 0.1], 0.068, 'wood', 0x5c6940);
        this.ellipsoid(leg, 'wood', 0x6b7846, [side * 0.03, -0.26, 0.12], [0.12, 0.06, 0.17]);
      }
      for (let i = 0; i < (thorn ? 9 : 5); i++) {
        const a = i * 2.4, leaf = this.ellipsoid(head, 'grass', i % 2 ? 0x607e3e : 0x92a952, [Math.sin(a) * 0.17, 0.2 + i % 3 * 0.1, Math.cos(a) * 0.17], [0.07, thorn ? 0.32 : 0.24, 0.035]);
        leaf.rotation.set(Math.cos(a) * 0.8, a, Math.sin(a) * 0.8);
        if (thorn) this.rod(torso, [Math.sin(a) * 0.3, 0.1, Math.cos(a) * 0.24], [Math.sin(a) * 0.53, 0.2, Math.cos(a) * 0.44], 0.015, 'wood', 0xc4ba85);
      }
    }
    this.skin(rig); this.hitProxy(rig, golem ? 0.95 : beetle ? 0.75 : 0.6, golem ? 2.8 : wolf ? 1.5 : 1.35); return rig;
  }
  animate(rig: ActorRig, now: number, dt: number): void {
    const walking = rig.animation === 'walk', action = rig.animation === 'attack' || rig.animation === 'skill';
    const phase = (now - (rig.actionAt ?? now)) / (rig.animation === 'skill' ? 500 : 350);
    rig.phase += dt * (rig.group.userData.definitionId === 'stone-golem' ? 5 : 10);
    if (rig.deadAt !== undefined) {
      const t = Math.min(1, (now - rig.deadAt) / 650);
      rig.torso.rotation.x = -t * 1.4; rig.torso.position.y *= 1 - dt * 1.8;
      rig.group.scale.multiplyScalar(1 - dt * 0.1); return;
    }
    const female = rig.group.userData.classId === 'RANGER', mage = rig.group.userData.classId === 'ARCANIST';
    if ((rig.spinUntil ?? 0) > now) rig.group.rotation.y += dt * Math.PI * 4;
    rig.legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(rig.phase + i * Math.PI) * 0.43 : 0; });
    rig.knees?.forEach((knee, i) => { knee.rotation.x = walking ? Math.max(0, -Math.sin(rig.phase + i * Math.PI)) * 0.65 : 0.025; });
    rig.elbows?.forEach((elbow, i) => { elbow.rotation.x = action ? female ? (i ? -0.7 : -0.35) : mage ? -0.55 : -0.38 : -0.12; });
    rig.arms.forEach((arm, i) => {
      let angle = walking ? Math.sin(rig.phase + (i + 1) * Math.PI) * 0.23 : Math.sin(now * 0.0013) * 0.025;
      if (action) angle = mage ? -1.05 - Math.sin(Math.min(1, phase) * Math.PI) * 0.3 : female ? -1.35 + Math.sin(Math.min(1, phase) * Math.PI) * 0.12 : -0.2 - Math.sin(Math.min(1, phase) * Math.PI) * 1.9;
      arm.rotation.x = angle;
      arm.rotation.y = action && female ? (i ? -0.75 : 0.25) : action && !mage ? Math.sin(Math.min(1, phase) * Math.PI) * (i ? -0.7 : 0.2) : 0;
    });
    rig.torso.rotation.x = rig.hitUntil > now ? Math.sin((rig.hitUntil - now) / 180 * Math.PI) * -0.18 : walking ? 0.035 : 0;
    if ((rig.interactUntil ?? 0) > now) { rig.torso.rotation.x = Math.sin((rig.interactUntil! - now) / 350 * Math.PI) * 0.42; rig.arms[1].rotation.x = -0.35; }
    rig.torso.rotation.y = action && !mage && !female ? Math.sin(Math.min(1, phase) * Math.PI) * 0.36 : 0;
    rig.head.rotation.x = Math.sin(now * 0.001) * 0.02;
  }
  equip(rig: ActorRig, appearance: EquipmentAppearance): void {
    const key = JSON.stringify(appearance); if (key === rig.equipmentKey) return;
    rig.equipmentKey = key;
    for (const parent of [rig.equipment, rig.torso, rig.head, ...rig.legs, ...rig.hands, ...rig.knees ?? []]) for (const child of [...parent.children]) if (child.userData.gear) {
      child.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); child.removeFromParent();
    }
    const gear = new THREE.Group(); gear.userData.gear = true; rig.hands[1].add(gear);
    const weapon = appearance.weapon;
    if (weapon?.includes('bow')) {
      const bow = this.mesh(gear, new THREE.TorusGeometry(0.51, 0.028, 8, 24, Math.PI * 1.45), 'wood', 0xb19665, [0, 0.22, 0.14]); bow.rotation.z = -Math.PI * 0.72;
      this.rod(gear, [-0.32, -0.13, 0.14], [0.32, 0.57, 0.14], 0.006, 'cloth', 0xdcd4b6);
      this.rod(gear, [0, 0.17, -0.05], [0, 0.17, 0.65], 0.014, 'wood', 0x886c43);
    } else if (weapon?.includes('staff')) {
      this.rod(gear, [0, -0.6, 0.06], [0, 1.15, 0.06], 0.033, 'wood', 0x74543e);
      for (const side of [-1, 1]) this.rod(gear, [0, 1.01, 0.06], [side * 0.14, 1.2, 0.06], 0.023, 'metal', 0xbcab75);
      const gem = this.mesh(gear, new THREE.OctahedronGeometry(0.115), 'metal', 0x77e0e5, [0, 1.22, 0.06]); gem.scale.y = 1.7;
    } else if (weapon) {
      const shape = new THREE.Shape(); shape.moveTo(-0.065, 0); shape.lineTo(-0.052, -0.86); shape.lineTo(0, -1.07); shape.lineTo(0.052, -0.86); shape.lineTo(0.065, 0);
      this.mesh(gear, new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, steps: 1 }), 'metal', 0xd4dde1, [0, -0.17, 0.06]);
      this.rod(gear, [-0.18, -0.17, 0.06], [0.18, -0.17, 0.06], 0.024, 'metal', 0xb49762);
      this.rod(gear, [0, -0.15, 0.06], [0, 0.1, 0.06], 0.034, 'leather', 0x48362b);
      this.ellipsoid(gear, 'metal', 0xb49762, [0, 0.12, 0.06], [0.047, 0.04, 0.04]);
    }
    if (appearance.offhand) {
      const shield = new THREE.Group(); shield.userData.gear = true; rig.hands[0].add(shield);
      const shape = new THREE.Shape(); shape.moveTo(0, -0.2); shape.quadraticCurveTo(-0.28, -0.04, -0.27, 0.4); shape.lineTo(0, 0.55); shape.lineTo(0.27, 0.4); shape.quadraticCurveTo(0.28, -0.04, 0, -0.2);
      this.mesh(shield, new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1 }), 'wood', 0x987b55, [0, 0, 0.11]);
      for (const side of [-1, 1]) this.rod(shield, [side * 0.1, -0.1, 0.18], [side * 0.16, 0.43, 0.18], 0.025, 'metal', 0x919998);
      this.ellipsoid(shield, 'metal', 0xbca16e, [0, 0.2, 0.18], [0.07, 0.07, 0.05]); this.batchJoints(shield);
    }
    if (appearance.chest) {
      const def = items.find(i => i.id === appearance.chest), armor = new THREE.Group(); armor.userData.gear = true; rig.torso.add(armor);
      this.profile(armor, [[0.24, 0], [0.29, 0.22], [0.34, 0.46], [0.28, 0.55]], appearance.chest.includes('steel') ? 'metal' : 'cloth', def?.color ?? 0xabb2b2, [0, 0.17, 0], 0.76);
      for (const side of [-1, 1]) this.ellipsoid(armor, 'metal', 0xa59a7e, [side * 0.33, 0.57, 0], [0.15, 0.12, 0.19]);
      this.batchJoints(armor);
    }
    for (const slot of ['helmet', 'pants', 'gloves', 'boots'] as const) if (appearance[slot]) {
      const color = items.find(i => i.id === appearance[slot])?.color ?? 0x899797;
      if (slot === 'helmet') {
        const part = new THREE.Group(); part.userData.gear = true; rig.head.add(part);
        this.mesh(part, new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), 'metal', color, [0, 0.025, -0.01], [1, 1.2, 1]);
        this.rod(part, [-0.16, 0.065, 0.11], [0.16, 0.065, 0.11], 0.012, 'metal', 0xb5a576);
        this.rod(part, [0, 0.065, 0.19], [0, -0.07, 0.19], 0.013, 'metal', 0xb5a576); this.batchJoints(part);
      } else for (let i = 0; i < 2; i++) {
        const part = new THREE.Group(); part.userData.gear = true; (slot === 'gloves' ? rig.hands[i] : slot === 'boots' ? rig.knees?.[i] ?? rig.legs[i] : rig.legs[i]).add(part);
        this.ellipsoid(part, slot === 'boots' || slot === 'pants' ? 'leather' : 'metal', color, [0, slot === 'boots' ? rig.knees ? -0.37 : -0.9 : slot === 'pants' ? -0.3 : 0, slot === 'boots' ? 0.05 : 0], slot === 'gloves' ? [0.06, 0.07, 0.04] : [0.1, slot === 'pants' ? 0.27 : 0.15, 0.115]);
      }
    }
    this.batchJoints(rig.equipment); this.batchJoints(gear);
  }
}
