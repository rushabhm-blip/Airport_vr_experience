import * as THREE from 'three';
import { Debounce } from '../lesson/rules.mjs';

/**
 * A flat canvas-textured quad that can be pointed at, hovered and selected.
 * Subclasses/callers provide paint(ctx, surface). Hot spots are canvas-pixel rects.
 */
export class Surface {
  /**
   * pxW/pxH are *logical* pixels (all painters and hot-spots use them). The backing canvas is
   * `scale` times larger so text stays crisp in the headset (Quest 3 resolves ~25 px/degree).
   */
  constructor({ width = 0.6, height = 0.4, pxW = 1024, pxH = null, transparent = true, scale = Surface.defaultScale } = {}) {
    this.scale = scale;
    this.width = width;
    this.pxW = pxW;
    this.pxH = pxH ?? Math.round(pxW * (height / width));
    this.height = (this.pxH / this.pxW) * width;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(this.pxW * scale);
    this.canvas.height = Math.round(this.pxH * scale);
    this.ctx = this.canvas.getContext('2d');
    this.texture = this._makeTexture();
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height), this.material);
    this.mesh.userData.surface = this;
    this.mesh.userData.interact = this; // picked up by the input system
    this.hot = [];            // [{id, x, y, w, h, disabled}]
    this.hoverId = null;
    this.pressedId = null;
    this.onSelect = null;     // (id, surface) => void
    this.enabled = true;
    this._deb = new Debounce(260);   // ray + poke + repeated events for one physical press become one action
    this.painter = null;
  }

  setPixelHeight(h) {
    if (h === this.pxH) return;
    this.pxH = h;
    this.height = (h / this.pxW) * this.width;
    this.canvas.height = Math.round(h * this.scale);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.texture.dispose();
    this.texture = this._makeTexture();
    this.material.map = this.texture;
    this.material.needsUpdate = true;
  }

  _makeTexture() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Surface.maxAnisotropy;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  }

  redraw() {
    if (!this.painter) return;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.clearRect(0, 0, this.pxW, this.pxH);
    this.painter(this.ctx, this);
    this.texture.needsUpdate = true;
  }

  idAt(uv) {
    const x = uv.x * this.pxW, y = (1 - uv.y) * this.pxH;
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const h = this.hot[i];
      if (!h.disabled && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return null;
  }

  // --- interaction protocol used by input.js ---
  hover(uv) {
    if (!this.enabled) return false;
    const id = this.idAt(uv);
    if (id !== this.hoverId) { this.hoverId = id; this.redraw(); }
    return id !== null;
  }
  leave() {
    if (this.hoverId !== null) { this.hoverId = null; this.redraw(); }
  }
  select(uv) {
    if (!this.enabled) return false;
    const id = this.idAt(uv);
    if (id === null) return false;
    if (!this._deb.allow(id)) return true;     // consumed, but not repeated
    this.pressedId = id;
    this.redraw();
    setTimeout(() => { this.pressedId = null; this.redraw(); }, 140);
    this.onSelect?.(id, this);
    return true;
  }
  static defaultScale = 2;
  static maxAnisotropy = 8; // set from the renderer at start-up

  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
