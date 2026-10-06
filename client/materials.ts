import * as THREE from 'three';

export type Surface = 'stone' | 'street' | 'wood' | 'roof' | 'grass' | 'dirt' | 'cloth' | 'leather' | 'metal' | 'rock' | 'foliage' | 'skin' | 'fur';
const artworkCells: Partial<Record<Surface, [number, number]>> = { street: [0, 0], stone: [1, 0], wood: [2, 0], roof: [0, 1], grass: [1, 1], dirt: [2, 1] };
let artwork: Promise<HTMLImageElement | undefined> | undefined;
function materialArtwork(): Promise<HTMLImageElement | undefined> {
  return artwork ??= new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(undefined); image.src = '/art/material-atlas.jpg'; });
}

/** Original 256px maps; generated material artwork adds weathering to six surfaces. */
export class MaterialLibrary {
  bumpEnabled = true;
  private disposed = false;
  private textures = new Map<Surface, THREE.CanvasTexture>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  terrain(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d')!, image = ctx.createImageData(1024, 1024);
    const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
      const wx = x / 1024 * 160 - 80, wz = y / 1024 * 160 - 80;
      const variation = Math.sin(wx * 0.37 + Math.sin(wz * 0.19) * 2) * Math.cos(wz * 0.29) * 0.45;
      const forest = smooth(25, 34, -wx + variation * 3) * smooth(-5, 4, wz);
      const stone = smooth(29, 41, wx + variation * 4), ruins = smooth(29, 40, -wz + variation * 3);
      let r = 116, g = 134, b = 82;
      r += forest * -37; g += forest * -35; b += forest * -16;
      r += stone * 32; g += stone * -2; b += stone * 23;
      r += ruins * -9; g += ruins * -9; b += ruins * 23;
      const trackWidth = 2.55 + Math.sin(wz * 1.31 + wx * 0.4) * 0.22;
      const track = 1 - smooth(trackWidth, trackWidth + 0.9, Math.min(Math.abs(wx), Math.abs(wz)));
      r += (168 - r) * track; g += (151 - g) * track; b += (117 - b) * track;
      const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, noise = (grain - Math.floor(grain) - 0.5) * 13 + variation * 8;
      const i = (y * 1024 + x) * 4; image.data[i] = r + noise; image.data[i + 1] = g + noise; image.data[i + 2] = b + noise; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    void materialArtwork().then(atlas => {
      if (!atlas || this.disposed) return;
      const detail = document.createElement('canvas'); detail.width = detail.height = 64;
      const detailContext = detail.getContext('2d')!;
      detailContext.drawImage(atlas, atlas.width / 3, atlas.height / 2, atlas.width / 3, atlas.height / 2, 0, 0, 64, 64);
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.38;
      ctx.fillStyle = ctx.createPattern(detail, 'repeat')!; ctx.fillRect(0, 0, 1024, 1024);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; map.needsUpdate = true;
    });
    const bump = this.texture('grass').clone(); bump.repeat.set(32, 32); bump.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({ map, bumpMap: this.bumpEnabled ? bump : null, bumpScale: 0.04, roughness: 0.94 }); material.userData.shared = true;
    this.materials.set('world-terrain', material); if (!this.bumpEnabled) bump.dispose(); return material;
  }
  texture(surface: Surface): THREE.CanvasTexture {
    const existing = this.textures.get(surface); if (existing) return existing;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    let seed = [...surface].reduce((n, c) => n * 31 + c.charCodeAt(0), 91) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = '#b4b2a7'; ctx.fillRect(0, 0, 256, 256);
    if (surface === 'skin') { ctx.fillStyle = '#e5d6c9'; ctx.fillRect(0, 0, 256, 256); }
    if (['stone', 'street', 'roof'].includes(surface)) {
      const rows = surface === 'street' ? 8 : 5, h = 256 / rows;
      ctx.fillStyle = '#55534e'; ctx.fillRect(0, 0, 256, 256);
      for (let row = 0; row < rows; row++) for (let col = -1; col < 6; col++) {
        const w = surface === 'street' ? 42.67 : 64, x = col * w + (row % 2) * w / 2;
        const v = 145 + random() * 65;
        ctx.fillStyle = `rgb(${v},${v * 0.97},${v * 0.89})`;
        ctx.beginPath(); ctx.roundRect(x + 1.5, row * h + 1.5, w - 3, h - 3, surface === 'street' ? 5 : 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,235,.22)'; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(x + 3, (row + 1) * h - 5, w - 5, 2);
      }
    }
    if (surface === 'wood') {
      ctx.fillStyle = '#b09d7f'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 120; i++) {
        const x = random() * 256; ctx.strokeStyle = `rgba(45,30,14,${0.07 + random() * 0.22})`;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 8, 80, x - 9, 160, x + 3, 256); ctx.stroke();
      }
      for (let x = 0; x < 256; x += 64) { ctx.fillStyle = '#4b4033'; ctx.fillRect(x, 0, 2, 256); }
    }
    if (surface === 'dirt' || surface === 'grass' || surface === 'rock') {
      for (let i = 0; i < 85; i++) {
        const x = random() * 256, y = random() * 256, radius = 5 + random() * 25;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, surface === 'dirt' ? 'rgba(75,63,45,.18)' : 'rgba(43,63,31,.14)'); gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      if (surface === 'dirt' || surface === 'rock') for (let i = 0; i < 110; i++) {
        const x = random() * 256, y = random() * 256, radius = 0.7 + random() * 2.4;
        ctx.fillStyle = 'rgba(64,57,45,.28)'; ctx.beginPath(); ctx.ellipse(x, y, radius * 1.4, radius, random() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(243,240,216,.19)'; ctx.fillRect(x - radius, y - radius, radius, 1);
      }
      if (surface === 'rock') for (let i = 0; i < 9; i++) {
        const x = random() * 256; ctx.strokeStyle = 'rgba(54,62,57,.27)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 13, 70); ctx.lineTo(x - 10, 110); ctx.lineTo(x + 20, 185); ctx.lineTo(x + 9, 256); ctx.stroke();
      }
    }
    if (surface === 'cloth' || surface === 'leather') {
      for (let i = 0; i < 256; i += 2) { ctx.fillStyle = i % 4 ? '#a9a69d' : '#c4c1b8'; ctx.fillRect(i, 0, 1, 256); ctx.fillRect(0, i, 256, 1); }
    }
    if (surface === 'fur') {
      ctx.fillStyle = '#babcb4'; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4200; i++) {
        const x = random() * 256, y = random() * 256;
        ctx.strokeStyle = random() > 0.5 ? 'rgba(43,48,43,.25)' : 'rgba(230,232,219,.32)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1 + random() * 2, y + 3 + random() * 5); ctx.stroke();
      }
    }
    if (surface === 'foliage') {
      ctx.clearRect(0, 0, 256, 256);
      for (let i = 0; i < 950; i++) {
        const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 110;
        const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
        const brightness = 76 + random() * 125;
        const gradient = ctx.createLinearGradient(x - 5, y - 7, x + 5, y + 7);
        gradient.addColorStop(0, `rgb(${brightness * 0.89},${brightness},${brightness * 0.57})`);
        gradient.addColorStop(1, `rgb(${brightness * 0.42},${brightness * 0.57},${brightness * 0.3})`);
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(x, y, 3 + random() * 5, 7 + random() * 4, a, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(224,236,160,.15)'; ctx.beginPath(); ctx.moveTo(x - 3, y - 4); ctx.lineTo(x + 3, y + 4); ctx.stroke();
      }
    }
    for (let i = 0; i < (surface === 'foliage' ? 0 : 12000); i++) {
      const x = random() * 256, y = random() * 256;
      ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,237,.08)' : surface === 'skin' ? 'rgba(60,36,27,.025)' : 'rgba(12,19,9,.09)';
      ctx.fillRect(x, y, surface === 'grass' ? 1 : 2, surface === 'grass' ? 4 : 1);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
    const cell = artworkCells[surface];
    if (cell) void materialArtwork().then(atlas => {
      if (!atlas || this.disposed) return;
      ctx.drawImage(atlas, cell[0] * atlas.width / 3, cell[1] * atlas.height / 2, atlas.width / 3, atlas.height / 2, 0, 0, 256, 256);
      texture.needsUpdate = true;
      // Repeated maps share this canvas but need their own upload version bump.
      for (const material of this.materials.values()) for (const map of [material.map, material.bumpMap]) if (map?.image === canvas) map.needsUpdate = true;
    });
    this.textures.set(surface, texture); return texture;
  }
  get(surface: Surface, color: number, repeat = 1, repeatZ = repeat): THREE.MeshStandardMaterial {
    const key = `${surface}-${color}-${repeat}-${repeatZ}`; const existing = this.materials.get(key); if (existing) return existing;
    const map = this.texture(surface).clone(); map.repeat.set(repeat, repeatZ); map.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({ color, map, bumpMap: !this.bumpEnabled || surface === 'foliage' ? null : map, bumpScale: surface === 'metal' ? 0.008 : surface === 'street' ? 0.09 : 0.035, roughness: surface === 'metal' && this.bumpEnabled ? 0.55 : 0.88, metalness: surface === 'metal' && this.bumpEnabled ? 0.7 : 0, alphaTest: surface === 'foliage' ? 0.45 : 0, side: surface === 'foliage' ? THREE.DoubleSide : THREE.FrontSide });
    material.userData.shared = true; this.materials.set(key, material); return material;
  }
  dispose(): void {
    this.disposed = true;
    for (const material of this.materials.values()) { material.map?.dispose(); if (material.bumpMap !== material.map) material.bumpMap?.dispose(); material.dispose(); }
    for (const texture of this.textures.values()) texture.dispose();
    this.materials.clear(); this.textures.clear();
  }
}
