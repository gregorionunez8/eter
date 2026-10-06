import * as THREE from 'three';
import { items } from '../shared/content';
import { MaterialLibrary } from './materials';
import { icon } from './icons';

/** Physical, original currency and gear presentations. Shared icon textures are bounded by content. */
export class LootArt {
  textures = new Map<string, THREE.Texture>();
  constructor(readonly materials: MaterialLibrary) {}
  create(kind: string, definitionId?: string): THREE.Group {
    const group = new THREE.Group();
    group.scale.setScalar(1.2);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color: 0x182120, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.065; group.add(shadow);
    if (kind === 'crowns') {
      for (let i = 0; i < 5; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 20), this.materials.get('metal', 0xe2bc6d));
        coin.position.set(i < 3 ? -0.1 : 0.15, 0.09 + (i % 3) * 0.037, i < 3 ? 0 : 0.09); group.add(coin);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 4, 20), this.materials.get('metal', 0xf0d49a));
        rim.rotation.x = Math.PI / 2; rim.position.copy(coin.position); rim.position.y += 0.022; group.add(rim);
      }
    } else if (kind === 'ether') {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), new THREE.MeshStandardMaterial({ color: 0x96e4eb, emissive: 0x3c9d9f, emissiveIntensity: 0.85, roughness: 0.2, metalness: 0.35 }));
      shard.scale.set(0.65, 1.7, 0.7); shard.position.y = 0.45; shard.rotation.z = 0.17; group.add(shard);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.37, 40), new THREE.MeshBasicMaterial({ color: 0x9bdbdf, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.08; group.add(halo);
      const motes = new THREE.BufferGeometry(); motes.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0.6, 0, 0.2, 0.9, 0.1, 0, 0.4, -0.3], 3)); group.add(new THREE.Points(motes, new THREE.PointsMaterial({ color: 0xc2ffff, size: 0.075 })));
    } else {
      const def = items.find(item => item.id === definitionId);
      const key = def?.id ?? 'chest';
      let texture = this.textures.get(key);
      if (!texture) {
        texture = new THREE.TextureLoader().load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon(key)));
        texture.colorSpace = THREE.SRGBColorSpace; this.textures.set(key, texture);
      }
      const item = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide, roughness: 0.7 }));
      item.rotation.x = -Math.PI / 2; item.rotation.z = -0.4; item.position.y = 0.11; group.add(item);
    }
    for (const child of group.children) if (child instanceof THREE.Mesh && !(child.material instanceof THREE.MeshBasicMaterial)) { child.castShadow = true; child.receiveShadow = true; }
    // A forgiving picking volume does not add gameplay collision or render debug geometry.
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.y = 0.3; group.add(proxy);
    return group;
  }
  dispose(): void { for (const texture of this.textures.values()) texture.dispose(); this.textures.clear(); }
}
