import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ActorFactory, ActorRig } from './actors';
import type { ClassId } from '../shared/content';

const sources = new Map<string, GLTF>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const templates = new Map<string, ActorRig>();
let loading: Promise<void> | undefined;
/** Only CC0 runtime assets are loaded. Simulation and animations remain Éter-owned. */
export function loadCharacterArt(): Promise<void> {
  return loading ??= (async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    await Promise.all(['outfits/Male_Ranger', 'outfits/Male_Peasant', 'outfits/Female_Ranger', 'base/Superhero_Male_FullBody', 'base/Superhero_Female_FullBody'].map(async name => {
      sources.set(name, await loader.loadAsync(`/models/${name}.gltf`));
    }));
  })();
}

function surface(source: THREE.Material, classId: ClassId, override?: number, skinOverride?: number, software = false): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source;
  const key = `${source.uuid}:${classId}:${override}:${skinOverride}:${software}`;
  let material = materialCache.get(key);
  if (!material) {
    material = source.clone(); material.userData.shared = true; material.side = THREE.FrontSide;
    // Exported vertex colors are authoring masks, not the retained atlas color.
    material.vertexColors = false;
    if (software) { material.normalMap = null; material.roughnessMap = null; material.metalnessMap = null; material.roughness = 0.85; material.metalness = 0.1; }
    if (/Peasant|Ranger/.test(source.name)) material.color.set(override ?? (classId === 'ARCANIST' ? 0x7092bf : classId === 'RANGER' ? 0x8cac81 : 0x9ba6ad));
    else if (skinOverride && /Superhero|Regular/.test(source.name)) material.color.set(skinOverride);
    materialCache.set(key, material);
  }
  return material;
}

/** Bake a neutral downward-arm pose, then rebuild world-aligned bones. This
 * retains authored smooth weights and UVs while allowing our existing attack,
 * gait, pickup and equipment pivots to drive the imported anatomy consistently. */
export function characterArt(factory: ActorFactory, id: string, classId: ClassId, override?: number, skinOverride?: number): ActorRig | undefined {
  const name = classId === 'RANGER' ? 'Female_Ranger' : classId === 'ARCANIST' ? 'Male_Peasant' : 'Male_Ranger';
  const source = sources.get(`outfits/${name}`), anatomy = sources.get(`base/Superhero_${classId === 'RANGER' ? 'Female' : 'Male'}_FullBody`);
  if (!source || !anatomy) return;
  const templateKey = `${classId}:${override}:${skinOverride}:${factory.materials.bumpEnabled}`;
  const cached = templates.get(templateKey);
  if (cached) return decorate(factory, copyRig(cached, id), classId);
  const posed = clone(source.scene); posed.updateMatrixWorld(true);
  let originalSkeleton!: THREE.Skeleton;
  posed.traverse(o => { if (o instanceof THREE.SkinnedMesh) originalSkeleton ??= o.skeleton; });
  const originalBones = originalSkeleton.bones;
  const old = (name: string) => originalBones.find(b => b.name === name)!;
  for (const side of ['r', 'l']) {
    const arm = old(`upperarm_${side}`), hand = old(`hand_${side}`);
    const direction = hand.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3())).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(direction, new THREE.Vector3(side === 'r' ? -0.12 : 0.12, -1, 0).normalize());
    const parentRotation = arm.parent!.getWorldQuaternion(new THREE.Quaternion());
    arm.quaternion.copy(parentRotation.clone().invert().multiply(rotation).multiply(parentRotation).multiply(arm.quaternion));
    posed.updateMatrixWorld(true);
  }
  originalSkeleton.update();
  const scale = 2.15 / (old('Head').getWorldPosition(new THREE.Vector3()).y + 0.2);
  const positions = originalBones.map(b => b.getWorldPosition(new THREE.Vector3()).multiplyScalar(scale));
  const bones = originalBones.map((b, i) => { const bone = new THREE.Bone(); bone.name = b.name; bone.position.copy(positions[i]); return bone; });
  const group = new THREE.Group(); group.userData = { kind: 'player', id, classId };
  originalBones.forEach((b, i) => {
    const parent = originalBones.indexOf(b.parent as THREE.Bone);
    if (parent >= 0) { bones[i].position.sub(positions[parent]); bones[parent].add(bones[i]); } else group.add(bones[i]);
  });
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones), batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const collect = (geometry: THREE.BufferGeometry, material: THREE.Material) => { const list = batches.get(material) ?? []; list.push(geometry); batches.set(material, list); };
  posed.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh) || Array.isArray(o.material)) return;
    if (classId !== 'RANGER' && o.name.includes('Head_Hood')) return;
    const geometry = o.geometry.clone(), attribute = geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) {
      const point = o.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(attribute, i)).applyMatrix4(o.matrixWorld).multiplyScalar(scale);
      attribute.setXYZ(i, point.x, point.y, point.z);
    }
    for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(attribute)) geometry.deleteAttribute(attribute);
    geometry.computeVertexNormals(); collect(geometry.toNonIndexed(), surface(o.material, classId, override, skinOverride, !factory.materials.bumpEnabled)); geometry.dispose();
  });
  const headIndex = originalBones.findIndex(b => b.name === 'Head'), targetHead = positions[headIndex], headBounds = new THREE.Box3();
  anatomy.scene.updateMatrixWorld(true);
  anatomy.scene.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh) || Array.isArray(o.material)) return;
    const baseHead = o.skeleton.bones.find(b => b.name === 'Head')!;
    const baseHeadIndex = o.skeleton.bones.indexOf(baseHead), basePosition = baseHead.getWorldPosition(new THREE.Vector3());
    const geometry = o.geometry, pos = geometry.attributes.position, joints = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
    const kept: number[] = [];
    for (let i = 0; i < (geometry.index?.count ?? pos.count); i += 3) {
      const vertices = [0, 1, 2].map(j => geometry.index?.getX(i + j) ?? i + j);
      let head = true;
      for (const v of vertices) { let weight = 0; for (let j = 0; j < 4; j++) if (joints.getComponent(v, j) === baseHeadIndex) weight += weights.getComponent(v, j); if (weight < 0.45) head = false; }
      if (head) kept.push(...vertices);
    }
    const result = new THREE.BufferGeometry(), xyz: number[] = [], uv: number[] = [], indices: number[] = [], influences: number[] = [];
    for (const v of kept) {
      const point = o.applyBoneTransform(v, new THREE.Vector3().fromBufferAttribute(pos, v)).applyMatrix4(o.matrixWorld).sub(basePosition).multiplyScalar(scale * 0.87).add(targetHead);
      headBounds.expandByPoint(point);
      xyz.push(point.x, point.y, point.z); uv.push(geometry.attributes.uv.getX(v), geometry.attributes.uv.getY(v)); indices.push(headIndex, 0, 0, 0); influences.push(1, 0, 0, 0);
    }
    result.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3)); result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); result.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); result.setAttribute('skinWeight', new THREE.Float32BufferAttribute(influences, 4)); result.computeVertexNormals();
    if (kept.length) collect(result, surface(o.material, classId, undefined, skinOverride, !factory.materials.bumpEnabled)); else result.dispose();
  });
  // Upstream Head pivots at the neck. Derive the attachment center from the
  // retained anatomy instead of guessing an offset for each exported body.
  if (!headBounds.isEmpty()) {
    bones[headIndex].position.add(headBounds.getCenter(new THREE.Vector3()).sub(targetHead));
    group.updateMatrixWorld(true); skeleton.calculateInverses();
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    if (geometry) { const mesh = new THREE.SkinnedMesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; mesh.bind(skeleton); group.add(mesh); }
  }
  const bone = (name: string) => bones.find(b => b.name === name)!;
  const equipment = new THREE.Group(); equipment.name = 'eter-equipment'; group.add(equipment);
  const rig: ActorRig = { group, torso: bone('pelvis'), head: bone('Head'), equipment, legs: [bone('thigh_r'), bone('thigh_l')], knees: [bone('calf_r'), bone('calf_l')], arms: [bone('upperarm_r'), bone('upperarm_l')], elbows: [bone('lowerarm_r'), bone('lowerarm_l')], hands: [bone('hand_r'), bone('hand_l')], target: { x: 0, z: 0 }, animation: 'idle', equipmentKey: '', phase: 0, hitUntil: 0 };
  // Cache only immutable imported anatomy/clothing. Procedural attachments use
  // each scene's own material library and are never retained by this cache.
  templates.set(templateKey, copyRig(rig, 'template'));
  originalSkeleton.dispose();
  return decorate(factory, rig, classId);
}

function copyRig(source: ActorRig, id: string): ActorRig {
  const group = clone(source.group) as THREE.Group; group.userData = { ...source.group.userData, id };
  group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry = o.geometry.clone(); });
  const object = (original: THREE.Object3D) => group.getObjectByName(original.name)!;
  return { group, torso: object(source.torso), head: object(source.head), equipment: object(source.equipment), legs: source.legs.map(object), knees: source.knees?.map(object), arms: source.arms.map(object), elbows: source.elbows?.map(object), hands: source.hands.map(object), target: { x: 0, z: 0 }, animation: 'idle', equipmentKey: '', phase: 0, hitUntil: 0 };
}

function decorate(factory: ActorFactory, rig: ActorRig, classId: ClassId): ActorRig {
  if (classId === 'VANGUARD') factory.costume(rig.torso, classId, 0x617989);
  if (classId === 'ARCANIST') {
    const robe = factory.profile(rig.torso, [[0.38, -1.02], [0.34, -0.8], [0.26, -0.25], [0.23, 0.08]], 'cloth', 0x304b6b, [0, 0, 0], 0.8);
    const vertices = robe.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const fold = 1 + Math.cos(Math.atan2(vertices.getZ(i), vertices.getX(i)) * 10) * 0.035;
      vertices.setXYZ(i, vertices.getX(i) * fold, vertices.getY(i), vertices.getZ(i) * fold);
    }
    robe.geometry.computeVertexNormals();
    for (const side of [-1, 1]) factory.rod(rig.torso, [side * 0.11, 0.6, 0.19], [side * 0.12, 0.08, 0.22], 0.013, 'metal', 0xb8a374);
    factory.mesh(rig.torso, new THREE.OctahedronGeometry(0.045), 'metal', 0x8bd1db, [0, 0.4, 0.23]);
  }
  // Hooded Ranger uses the authored hood; the other classes retain short hair.
  if (classId !== 'RANGER') factory.mesh(rig.head, new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), 'leather', 0x332b27, [0, 0.055, -0.018], [0.148, 0.147, 0.15]);
  factory.batchJoints(rig.torso); factory.batchJoints(rig.head);
  factory.equip(rig, { weapon: classId === 'ARCANIST' ? 'ether-staff' : classId === 'RANGER' ? 'ash-bow' : 'iron-sword' });
  factory.hitProxy(rig, 0.55, 2.15);
  return rig;
}
