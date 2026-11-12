import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS } from '../config.js';
import { Tweens } from '../util.js';
import { tileTexture, cropTexture, IMG } from './images.js';

/**
 * Two ways to look at the same lesson:
 *  - 'mixed'     : passthrough room, only a floor shadow + virtual props (Quest 3 colour passthrough)
 *  - 'immersive' : a fully virtual terminal replaces the room ("VR mode"), with a safety rim:
 *                  if the learner drifts outside the cleared area it drops back to passthrough.
 * In a true immersive-vr session only 'immersive' is possible; on desktop the preview uses it too.
 */
export class Environment {
  constructor({ renderer, scene, stage, assets }) {
    this.renderer = renderer; this.scene = scene; this.stage = stage; this.assets = assets;
    this.mode = 'mixed';
    this.forced = null;          // 'immersive' when no passthrough exists
    this.tweens = new Tweens();
    this.safe = true;
    this.virtual = new THREE.Group(); this.virtual.name = 'VirtualTerminal'; this.virtual.visible = false;
    stage.root.add(this.virtual);

    // Light: one consistent warm daylight rig for both modes.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8a88c, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
    this.sun.position.set(1.6, 3.4, 1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 14 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(0, 0, -2.4);
    stage.root.add(this.hemi, this.sun, this.sun.target);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // Reflections and ambient light from the real terminal photo make metal, floor and plastic look like they belong.
    const hall = IMG['view-hall-wide'];
    if (hall) { const t = new THREE.Texture(hall); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; this.envTex = pmrem.fromEquirectangular(t).texture; }
    scene.environment = this.envTex;
    scene.environmentIntensity = hall ? 0.85 : 0.55;

    // Shadow catcher so virtual objects look grounded on the *real* floor in passthrough.
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.4 }));
    this.catcher.position.set(0, 0.002, -2.4); this.catcher.receiveShadow = true;
    stage.root.add(this.catcher);

    // Soft veil used for mode transitions.
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0x0b1f33, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    this.veil.renderOrder = 999; this.veil.visible = false; this.veil.frustumCulled = false;
    scene.add(this.veil);

    // Comfort vignette: darkens the edge of vision while the learner is "walking" (reduces motion sickness).
    this.vigTarget = 0;
    this.vig = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, uniforms: { amt: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float amt; varying vec3 vP; void main(){ float f = clamp(-vP.z,0.0,1.0); float a = (1.0-smoothstep(0.3,0.86,f))*amt; gl_FragColor = vec4(0.02,0.05,0.08,a); }',
    }));
    this.vig.renderOrder = 998; this.vig.frustumCulled = false; this.vig.visible = false;
    scene.add(this.vig);

    this.built = false;
    this.setBackground();
  }

  /** Show/hide the hall (used when the scene brings its own enclosure, e.g. the jet bridge and cabin). */
  setHall(v) { this.hallHidden = !v; this._applyScene(); }

  /**
   * Where the learner is. 'home' (no scenery), 'outdoor' (road, sky and the airport facade), 'hall-wall' (inside the terminal:
   * check-in, security) and 'hall-apron' (the gate: windows onto the aircraft). Only the gate may show aircraft outside.
   */
  setScene(kind) { this.sceneKind = kind; this._applyScene(); }
  setSafetyHide(on) { this.safetyHide = !!on; this._applyScene(); }
  _applyScene() {
    const imm = this.mode === 'immersive' && this.safe && !this.safetyHide, k = this.sceneKind || 'hall-wall';
    const hall = k === 'hall-apron' || k === 'hall-wall';
    this.virtual.visible = imm && hall && !this.hallHidden;
    if (this.apronView) this.apronView.visible = k === 'hall-apron';
    if (this.closedWall) this.closedWall.visible = k === 'hall-wall';
    this._outdoorGroup().visible = imm && k === 'outdoor';
    this.setBackground();
  }
  _outdoorGroup() {
    if (this.outdoor) return this.outdoor;
    const g = this.outdoor = new THREE.Group(); g.name = 'Outdoor'; g.visible = false;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x70767a, roughness: 1 }));
    ground.position.y = -0.02; g.add(ground);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y*1.5+0.1,0.,1.); vec3 c = mix(vec3(0.86,0.90,0.93), vec3(0.42,0.68,0.92), pow(h,0.65)); gl_FragColor = vec4(c,1.0);}' }));
    sky.renderOrder = -10; g.add(sky);
    const t = cropTexture('view-kerb', [0, 0, 1536, 1024], { mirror: true });
    if (t) {
      const tex = t.clone(); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.needsUpdate = true;
      const R = 60, H = R * 1.05;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.BackSide }));
      ring.position.y = 0.23 * H; ring.rotation.y = -1.22; ring.renderOrder = -9; g.add(ring);
    }
    this.stage.root.add(g); return g;
  }

  setBackground() {
    const virtual = this.forced === 'immersive' || this.mode === 'immersive';
    if (!virtual && this.webcamTexture && !this.renderer.xr.isPresenting) this.scene.background = this.webcamTexture; // desktop "passthrough"
    else this.scene.background = virtual || !this.renderer.xr.isPresenting ? new THREE.Color('#dfe9ee') : null;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const A = this.assets, v = this.virtual;
    // Floor: 3 x 3 grid of 4 m modules
    for (let ix = -1; ix <= 1; ix++) for (let iz = -2; iz <= 0; iz++) {
      const f = A.make('terminal-floor-module', { actions: false });
      f.position.set(ix * 4, 0, iz * 4 + 1.0);
      v.add(f);
    }
    // Window wall far ahead (z = -6.9), side walls, back wall
    const FAR = -6.9, HALF = 6.2;
    for (let i = -2; i < 2; i++) {
      const w = A.make('terminal-window-module', { actions: false });
      w.position.set(i * 3.065 + 1.5325, 0, FAR); v.add(w);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const w = A.make('terminal-wall-module', { actions: false });
      w.position.set(side * HALF, 0, FAR + 1.6 + i * 3.0); w.rotation.y = -side * Math.PI / 2; v.add(w);
    }
    for (let i = -2; i < 2; i++) {
      const w = A.make('terminal-wall-module', { actions: false });
      w.position.set(i * 3.0 + 1.5, 0, 5.0); w.rotation.y = Math.PI; v.add(w);
    }
    for (const x of [-5.4, -2.7, 2.7, 5.4]) for (const z of [-6.6, -2.2]) {
      const c = A.make('terminal-column', { actions: false }); c.position.set(x, 0, z); v.add(c);
    }
    // Ceiling with light strips
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf3f4f2, roughness: 0.95 }));
    const ctex = tileTexture('tex-ceiling');
    if (ctex) { const t = ctex.clone(); t.repeat.set(11, 11); t.needsUpdate = true; ceil.material.map = t; ceil.material.color.set(0xffffff); }
    ceil.position.set(0, 2.9, -1); v.add(ceil);
    // The real apron photo, seen through the (now clear) windows of the far wall.
    const view = cropTexture('view-tarmac-day', [620, 150, 880, 610], { mirror: true });
    if (view) { const arc = 1.7, b = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 5.4, 48, 1, true, Math.PI - arc / 2, arc), new THREE.MeshBasicMaterial({ map: view, toneMapped: false, side: THREE.BackSide })); b.position.set(0, 2.3, -0.4); v.add(b); this.apronView = b; }
    // Check-in and security are inside the terminal, away from the apron: a plain wall instead of planes outside the glass.
    const wallTex = tileTexture('tex-wall'); let wallMat = new THREE.MeshStandardMaterial({ color: 0xe9ecea, roughness: 0.9 });
    if (wallTex) { const t = wallTex.clone(); t.repeat.set(6, 1.4); t.needsUpdate = true; wallMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); }
    this.closedWall = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 3.1), wallMat); this.closedWall.position.set(0, 1.55, -6.7); v.add(this.closedWall);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false });
    for (let i = -3; i <= 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 9), lightMat); l.position.set(i * 1.8, 2.88, -1.5); v.add(l); }
    // Outside the windows: apron + sky
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7c8588, roughness: 1 }));
    apron.position.set(0, -0.02, -60); v.add(apron);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.12,0.,1.); vec3 c = mix(vec3(0.97,0.90,0.78), vec3(0.45,0.70,0.92), pow(h,0.7)); gl_FragColor = vec4(c,1.0);}',
    }));
    sky.renderOrder = -10; v.add(sky);
    // Mid-hall seating so the space reads as a terminal
    for (const [x, z, r] of [[-4.2, -4.6, Math.PI / 2], [4.2, -4.6, -Math.PI / 2]]) {
      const s = A.make('terminal-seating', { actions: false }); s.position.set(x, 0, z); s.rotation.y = r; v.add(s);
    }
    v.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }

  setMode(mode, { instant = false } = {}) {
    if (this.forced) mode = this.forced;
    if (mode === this.mode && !instant) return;
    const apply = () => {
      this.mode = mode;
      if (mode === 'immersive') this.build();
      this._applyScene();
      this.catcher.visible = mode === 'mixed';
      this.setBackground();
    };
    if (instant) { apply(); return; }
    this.veil.visible = true;
    this.tweens.add({ dur: 0.35, update: (e) => { this.veil.material.opacity = e; }, done: () => {
      apply();
      this.tweens.add({ dur: 0.45, update: (e) => { this.veil.material.opacity = 1 - e; }, done: () => { this.veil.visible = false; } });
    } });
  }

  /** Called every frame with the head position in stage-local coordinates. Returns true if state changed. */
  update(dt, headLocal, camera) {
    this.tweens.step(dt);
    const a = this.vig.material.uniforms.amt;
    a.value += (this.vigTarget - a.value) * Math.min(1, dt * 5);
    this.vig.visible = a.value > 0.01;
    if (this.vig.visible || this.veil.visible) {
      const p = camera.getWorldPosition(new THREE.Vector3());
      this.veil.position.copy(p);
      this.vig.position.copy(p); this.vig.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
    }
    if (this.mode !== 'immersive' || !this.renderer.xr.isPresenting || this.forced === 'immersive') return false;
    // Safety rim: stay inside the cleared rectangle (+0.45 m) or fall back to passthrough.
    const w = this.stage.width / 2 + 0.45, d = this.stage.depth + 0.2, back = 0.9;
    const slack = this.safe ? 0 : -0.12; // hysteresis
    const inside = Math.abs(headLocal.x) < w + slack && headLocal.z < back + slack && headLocal.z > -d - slack;
    if (inside !== this.safe) {
      this.safe = inside;
      this._applyScene();
      return true;
    }
    return false;
  }
}
