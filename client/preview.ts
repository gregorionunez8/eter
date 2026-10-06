import * as THREE from 'three';
import type { Character } from '../shared/model';
import type { ClassId } from '../shared/content';
import { ActorFactory, type ActorRig } from './actors';
import { MaterialLibrary } from './materials';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** A separate small renderer previews the exact in-world rig without connecting a game session. */
export class CharacterPreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  private renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  private materials = new MaterialLibrary();
  private factory = new ActorFactory(this.materials);
  private actor?: ActorRig;
  private raf = 0;
  private observer: ResizeObserver;
  private previous = 0;
  private environment?: THREE.WebGLRenderTarget;
  constructor(private host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const gl = this.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    if (!extension || !/swiftshader|software|llvmpipe/i.test(String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)))) {
      const generator = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
      this.environment = generator.fromScene(room, 0.04); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.65; room.dispose(); generator.dispose();
    } else { this.renderer.setPixelRatio(0.65); this.materials.bumpEnabled = false; }
    this.renderer.setClearColor(0, 0); host.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xd6eafa, 0x6a6952, 1.2));
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(-3, 5, 4); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x75c8d9, 1.5); rim.position.set(3, 3, -4); this.scene.add(rim);
    this.camera.position.set(3, 2.1, 5.6); this.camera.lookAt(0, 1.12, 0);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.83, 0.13, 48), this.materials.get('stone', 0x828e87)); plinth.position.y = -0.08; this.scene.add(plinth);
    this.observer = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; this.renderer.setSize(w, h); this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix(); });
    this.observer.observe(host); this.frame(0);
  }
  show(classId: ClassId, character?: Character): void {
    if (this.actor) { this.actor.group.removeFromParent(); this.actor.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose(); } }); }
    this.actor = this.factory.character('preview', classId); this.actor.group.rotation.y = -0.18;
    if (character) this.factory.equip(this.actor, Object.fromEntries(Object.entries(character.equipment).map(([slot, item]) => [slot, item.definitionId])));
    this.scene.add(this.actor.group);
  }
  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (now - this.previous < 33) return;
    if (this.actor) this.factory.animate(this.actor, now, Math.min(0.05, (now - this.previous) / 1000));
    this.previous = now; this.renderer.render(this.scene, this.camera);
  };
  destroy(): void { cancelAnimationFrame(this.raf); this.observer.disconnect(); this.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose(); if (!Array.isArray(o.material) && !o.material.userData.shared) o.material.dispose(); } }); this.environment?.dispose(); this.materials.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); }
}
