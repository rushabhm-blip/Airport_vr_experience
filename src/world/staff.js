import * as THREE from 'three';
import { cutoutTexture } from './images.js';
import { labelSurface } from '../ui/widgets.js';
import { Surface } from '../ui/surface.js';
import { COLORS } from '../config.js';
import { FONT, roundRect } from '../util.js';
import { cloneSkinned } from '../assets.js';

const HEIGHT = { checkin: 1.66, security: 1.76, gate: 1.66, crew: 1.66, guard: 1.76, driver: 1.72 };

/**
 * Airline / airport staff as life-size photo cut-outs. They turn to face the learner, breathe and sway a
 * little, and can "say" a line in a speech bubble. (Animated 3D characters can replace these later.)
 */
export class Staff {
  static library = null;   // Map kind -> { scene, clips } once assets/people/*.glb have loaded

  constructor(kind, role) {
    this.kind = kind; this.role = role;
    this.root = new THREE.Group(); this.root.name = 'Staff-' + kind;
    const lib = Staff.library?.get(kind);
    if (lib) this._buildCharacter(lib);
    const tex = lib ? null : cutoutTexture(kind === 'driver' ? 'person-driver' : 'staff-' + kind);
    const h = HEIGHT[kind] || 1.7, aspect = tex?.userData.aspect || 0.667;
    this.h = h;
    if (tex) {
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      this.body = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h).translate(0, h / 2, 0), mat);
      this.body.castShadow = true; this.root.add(this.body);
      // Selection follows the silhouette: transparent margins around the figure are not clickable.
      const base = this.body.raycast.bind(this.body); let px = null;
      const alphaAt = (uv) => {
        const im = tex.image; if (!im?.getContext) return 1;
        if (!px) px = im.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, im.width, im.height);
        const x = Math.min(im.width - 1, Math.max(0, Math.floor(uv.x * im.width))), y = Math.min(im.height - 1, Math.max(0, Math.floor((1 - uv.y) * im.height)));
        return px.data[(y * im.width + x) * 4 + 3] / 255;
      };
      this.body.raycast = (rc, hits) => { const tmp = []; base(rc, tmp); for (const h of tmp) if (h.uv && alphaAt(h.uv) > 0.4) hits.push(h); };
    }
    this.tag = labelSurface(role, { w: 0.34, px: 560 }); this.tag.mesh.position.set(0, h + 0.1, 0); this.root.add(this.tag.mesh);
    this.bubble = null; this.t = Math.random() * 6;
    this.onTap = null;
    // Point at the person and pinch / press the trigger to ask them something.
    if (this.body) {
      this.body.userData.interact = {
        hover: () => { this.body.material.emissive?.set(0x1b8a86); this.body.material.emissiveIntensity = 0.16; return true; },
        leave: () => { this.body.material.emissiveIntensity = 0; },
        select: () => { this.onTap?.(this); return true; },
      };
    }
    // soft contact shadow so the cut-out stands on the floor instead of floating
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d');
    const gr = sx.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false }));
    shadow.position.y = 0.012; this.root.add(shadow); this.shadow = shadow;
  }

  /** A rigged character: own skeleton and mixer, feet on the floor, selection by an invisible capsule (not the whole rectangle). */
  _buildCharacter({ scene, clips }) {
    const h = HEIGHT[this.kind] || 1.7, model = cloneSkinned(scene);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(h / Math.max(0.5, size.y)); model.position.y = -box.min.y * model.scale.y;
    this.root.add(model); this.character = model;
    this.mixer = new THREE.AnimationMixer(model);
    const idle = clips.find((c) => /idle|stand|breath/i.test(c.name)) || clips[0];
    if (idle) this.mixer.clipAction(idle).play();
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } if (/^(head|Head)$/.test(o.name) || /mixamorigHead$/.test(o.name)) this.headBone = o; if (o.morphTargetDictionary) { const k = Object.keys(o.morphTargetDictionary).find((n) => /blink|eyesClosed|eyeBlink/i.test(n)); if (k) (this.blinkTargets ||= []).push([o, o.morphTargetDictionary[k]]); } });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 0.4).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ visible: false }));
    this.body = hit; this.root.add(hit);
    this.bodyYaw = 0; this.blinkT = 2 + Math.random() * 3; this.blinkLeft = 0;
  }

  /** Character path of update(): subtle blinking, a body turn only when you are well off to the side, head attention within limits. */
  _updateCharacter(dt, dx, dz, pyaw) {
    this.mixer?.update(dt);
    const want = Math.atan2(dx, dz) - pyaw;
    if (this._faced === undefined) { this.bodyYaw = want; this._faced = true; }     // start by facing you, then turn only deliberately
    let diff = Math.atan2(Math.sin(want - this.bodyYaw), Math.cos(want - this.bodyYaw));
    if (Math.abs(diff) > 1.05) this.bodyYaw += diff * Math.min(1, dt * 2.2);     // an intentional body turn, not constant billboarding
    this.root.rotation.y = this.bodyYaw;
    diff = Math.atan2(Math.sin(want - this.bodyYaw), Math.cos(want - this.bodyYaw));
    if (this.headBone) this.headBone.rotation.y = THREE.MathUtils.clamp(diff, -0.6, 0.6) * 0.6;
    if (this.blinkTargets) {
      this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkLeft = 0.14; this.blinkT = 2.5 + Math.random() * 3.5; }
      const v = this.blinkLeft > 0 ? 1 : 0; this.blinkLeft = Math.max(0, this.blinkLeft - dt);
      for (const [m, i] of this.blinkTargets) m.morphTargetInfluences[i] = v;
    }
  }

  /** Reply to the learner: speech bubble now (the director also speaks it). */
  reply(text, seconds = 9) { this.say(text, seconds); }

  /** A line of dialogue above the head for a few seconds. */
  say(text, seconds = 6) {
    if (this.quiet?.()) return;     // the caption card already carries this conversation
    if (this.bubble) { this.root.remove(this.bubble.mesh); this.bubble.dispose?.(); }
    // wrapped speech bubble (up to 4 lines) with a small tail
    const W = 1000, font = 58, lh = 76;
    const probe = document.createElement('canvas').getContext('2d'); probe.font = `600 ${font}px ${FONT}`;
    const lines = []; let line = '';
    for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (probe.measureText(t).width > W - 110 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const H = lines.length * lh + 90;
    const s = new Surface({ width: 1.0, pxW: W, pxH: H });
    s.painter = (ctx) => {
      ctx.save(); ctx.shadowColor = 'rgba(10,30,50,0.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.97)'; roundRect(ctx, 20, 12, W - 40, H - 52, 40); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(W / 2 - 24, H - 42); ctx.lineTo(W / 2 + 24, H - 42); ctx.lineTo(W / 2, H - 10); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.97)'; ctx.fill();
      ctx.fillStyle = COLORS.navy; ctx.font = `600 ${font}px ${FONT}`; ctx.textBaseline = 'alphabetic';
      lines.forEach((l, i) => ctx.fillText(l, 56, 74 + i * lh));
    };
    s.enabled = false; s.mesh.userData.interact = null; s.mesh.renderOrder = 14; s.redraw();   // depth-tested: a bubble never draws through a counter
    this.bubble = s;
    s.mesh.position.set(0.55, this.h - 0.05 + s.height / 2, 0.03); this.root.add(s.mesh);   // beside the head, clear of signs hung above
    this.bubbleLeft = seconds;
  }

  update(dt, head) {
    this.t += dt;
    const w = this.root.getWorldPosition(new THREE.Vector3());
    const dx = head.x - w.x, dz = head.z - w.z;
    const pyaw = this.root.parent ? new THREE.Euler().setFromQuaternion(this.root.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
    if (this.character) this._updateCharacter(dt, dx, dz, pyaw); else this.root.rotation.y = Math.atan2(dx, dz) - pyaw;   // cut-outs face the learner; characters turn deliberately
    // personal space: nobody stands closer than 1.3 m to the learner (the scenery glides, so people can drift near)
    const dist = Math.hypot(dx, dz);
    if (dist < 1.3 && dist > 0.01 && this.root.parent) {
      const away = new THREE.Vector3(-dx / dist, 0, -dz / dist).multiplyScalar(1.3 - dist);
      const wp = this.root.getWorldPosition(new THREE.Vector3()).add(away);
      this.root.position.copy(this.root.parent.worldToLocal(wp));
    }
    if (this.bubble && (this.bubbleLeft -= dt) <= 0) { this.root.remove(this.bubble.mesh); this.bubble = null; }
  }
}
