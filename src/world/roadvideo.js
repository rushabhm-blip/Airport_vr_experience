import * as THREE from 'three';
import { photoTexture } from './images.js';

const vurl = (n) => new URL(`../../assets/video/${n}.mp4`, import.meta.url).href;

/**
 * What you see outside the cab window: a road video behind the windscreen, and scrolling roadside photographs behind the side windows.
 * Everything sits in front of the learner (stage "props" space, origin = the learner's seat) and is thrown away when the step ends.
 */
export class RoadVideo {
  constructor(parent, eyeY = 1.3) {
    this.group = new THREE.Group(); this.group.name = 'RoadOutside'; parent.add(this.group);
    this.vids = {}; this.current = null; this.speed = 0; this.scroll = [];
    const W = 7.6, H = W * 9 / 16;
    this.mat = new THREE.MeshBasicMaterial({ color: 0x9fb0bd, toneMapped: false, depthWrite: false });      // sky-grey until the first frame is ready
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.mat);
    screen.position.set(0, eyeY + 0.12, -5); screen.renderOrder = -2; this.group.add(screen);
    // side windows: a roadside photograph on each side that slides past while the car moves
    for (const [name, sx] of [['side-left', -1], ['side-right', 1]]) {
      const base = photoTexture(name); if (!base) continue;
      const t = base.clone(); t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
      const w = 9, h = w / 3, m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, depthWrite: false }));
      m.position.set(sx * 3.6, eyeY - 0.05, -0.8); m.rotation.y = -sx * Math.PI / 2; m.renderOrder = -2; this.group.add(m);
      this.scroll.push({ t, dir: sx < 0 ? 1 : -1 });       // content moves backwards along the car
    }
  }

  _load(name, loop) {
    const el = document.createElement('video');
    el.muted = true; el.loop = loop; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.src = vurl(name);
    const t = new THREE.VideoTexture(el); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return { el, t };
  }

  /** Start loading a clip without showing it yet. */
  preload(name, loop = false) { this.vids[name] ??= this._load(name, loop); return this.vids[name]; }

  /** Show a clip from the start. */
  play(name, loop = false, rate = 1) {
    this.current?.el.pause();
    const v = this.current = this.preload(name, loop);
    this.mat.map = v.t; this.mat.color.set(0xffffff); this.mat.needsUpdate = true;
    v.el.playbackRate = rate;
    try { v.el.currentTime = 0; } catch { /* not ready yet: it starts at 0 anyway */ }
    v.el.play().catch(() => {});
    this.speed = 0.3;
  }

  /** Hold the picture still (the cab has stopped). */
  stop() { this.current?.el.pause(); this.speed = 0; }

  update(dt) { for (const s of this.scroll) s.t.offset.x += s.dir * this.speed * dt * 0.12; }

  dispose() {
    for (const v of Object.values(this.vids)) { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); v.t.dispose(); }
    this.vids = {}; this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
