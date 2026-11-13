import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { COLORS } from '../config.js';
import { Tweens } from '../util.js';
import { tileTexture, cropTexture, photoTexture, panoTexture, IMG } from './images.js';
import { buildHall3D } from './hall3d.js';
import { buildGate3D } from './gate3d.js';

/**
 * Two ways to look at the same lesson:
 *  - 'mixed'     : passthrough room, only a floor shadow + virtual props (Quest 3 colour passthrough)
 *  - 'immersive' : a fully virtual terminal replaces the room ("VR mode"), with a safety rim:
 *                  if the learner drifts outside the cleared area it drops back to passthrough.
 * In a true immersive-vr session only 'immersive' is possible; on desktop the preview uses it too.
 */
/**
 * A 360-degree photograph sphere whose lower half is laid flat on the floor (a "ground-projected" panorama). H is the eye height:
 * the floor of the photograph then lies exactly at floor level under the viewer, instead of hanging in the air below them.
 */
function groundSphere(R, H) {
  const g = new THREE.SphereGeometry(1, 160, 360), p = g.attributes.position;      // many rows, so the floor meets the horizon smoothly
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = y < -1e-4 ? Math.min(R, H / -y) : R;
    p.setXYZ(i, x * t, y * t, z * t);
  }
  p.needsUpdate = true; g.computeBoundingSphere(); return g;
}

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
    this._homeSphere().visible = imm && k === 'home';       // the learner's living room (only where there is no real room: laptop preview and full VR)
    this._apply360(imm && hall && !this.hallHidden, k);
    this.setBackground();
  }
  /** The 3D gate lounge, built the first time it is needed. */
  _gate3D() {
    if (this.gate3d) return this.gate3d;
    let env = null; const pano = panoTexture('gate-360');
    if (pano) { try { const t = pano.clone(); t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true; const pm = new THREE.PMREMGenerator(this.renderer); env = pm.fromEquirectangular(t).texture; pm.dispose(); } catch { env = null; } }
    const h = this.gate3d = buildGate3D({ envMap: env, floorTex: tileTexture('airport-floor-tile'), density: this.renderer.xr.isPresenting ? 0.55 : 0.9 });
    h.visible = false; this.virtual.add(h); return h;       // inside the walking group: it moves past you as you walk
  }
  /** The 3D departures hall, built the first time it is needed. Its reflections come from the hall panorama. */
  _hall3D() {
    if (this.hall3d) return this.hall3d;
    let env = null; const pano = panoTexture('hall-360');
    if (pano) { try { const t = pano.clone(); t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true; const pm = new THREE.PMREMGenerator(this.renderer); env = pm.fromEquirectangular(t).texture; pm.dispose(); } catch { env = null; } }
    const h = this.hall3d = buildHall3D({ envMap: env, floorTex: tileTexture('airport-floor-tile'), ceilTex: tileTexture('tex-ceiling'), density: this.renderer.xr.isPresenting ? 0.55 : 0.9 });
    h.visible = false; this.virtual.add(h); return h;
  }
  /**
   * Inside the terminal the learner is surrounded by a 360-degree photograph (the departures hall, or the gate lounge with the
   * aircraft outside). The box-shaped 3D hall is hidden, except a ceiling panel over the work area so the hung boards still hang from something.
   */
  _apply360(want, k) {
    const key = k === 'hall-apron' ? 'gate-360' : 'hall-360';
    this.s360 ??= {};
    for (const name of ['hall-360', 'gate-360']) {
      if (!this.s360[name]) {
        const t = panoTexture(name); if (!t) continue;
        const m = new THREE.Mesh(groundSphere(30, this.stage.headY), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.BackSide, depthWrite: false }));
        m.userData.R = 30; m.userData.H = this.stage.headY;
        m.name = 'Sphere360 ' + name; m.scale.x = -1; m.rotation.y = -1.57; m.position.y = this.stage.headY; m.renderOrder = -11; m.visible = false;
        this.stage.root.add(m); this.s360[name] = m;
      }
    }
    const on = want && !!this.s360[key];
    const hallMode = on && k === 'hall-wall';                       // the departures hall is real 3D geometry, not a photograph
    const gateMode = on && k === 'hall-apron';                       // the gate lounge is real 3D too
    if (hallMode || this.hall3d) { const h = hallMode ? this._hall3D() : this.hall3d; if (h) h.visible = hallMode; }
    if (gateMode || this.gate3d) { const h = gateMode ? this._gate3D() : this.gate3d; if (h) h.visible = gateMode; }
    for (const [name, m] of Object.entries(this.s360)) m.visible = on && name === key && !hallMode && !gateMode;
    this.use360 = on;
    if (this.virtual.children.length) {
      this.hallActive = hallMode || gateMode; this.hallCeilY = hallMode ? 12.6 : gateMode ? (this.gate3d?.userData.dims.ceil ?? 7.4) : 0;
      const keep = (hallMode || gateMode) ? new Set() : new Set([this.ceilMesh, ...(this.lightMeshes || [])]);      // the real vaulted roof replaces the low ceiling panel
      for (const c of this.virtual.children) if (c !== this.hall3d && c !== this.gate3d) c.visible = on ? keep.has(c) : c === this.apronView ? k === 'hall-apron' : c === this.closedWall ? k === 'hall-wall' : true;
      if (this.ceilMesh) this.ceilMesh.scale.set(on ? 0.7 : 1, 1, on ? 0.7 : 1);
    }
  }
  /** A 360-degree photograph of a living room, for the steps at home when there is no passthrough room to show. */
  _homeSphere() {
    if (this.homeSphere) return this.homeSphere;
    const t = panoTexture('home-living-room');
    const m = this.homeSphere = new THREE.Mesh(groundSphere(25, this.stage.headY), new THREE.MeshBasicMaterial({ map: t || null, color: t ? 0xffffff : 0xdfe9ee, toneMapped: false, side: THREE.BackSide, depthWrite: false }));
    m.userData.R = 25; m.userData.H = this.stage.headY;
    m.name = 'HomeSphere'; m.scale.x = -1; m.renderOrder = -11; m.visible = false;      // x = -1 undoes the mirror you get from inside a sphere
    m.position.y = this.stage.headY; m.rotation.y = -1.57; this.stage.root.add(m); return m;      // turned so the first view is the sofa
  }
  _outdoorGroup() {
    if (this.outdoor) return this.outdoor;
    const g = this.outdoor = new THREE.Group(); g.name = 'Outdoor'; g.visible = false;
    const speckle = (base, dots, repeat, lines = null) => {   // a small repeating ground texture, drawn here so there is nothing to download
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      x.fillStyle = base; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) { const v = Math.random(); x.fillStyle = dots[(v * dots.length) | 0]; x.globalAlpha = 0.25 + Math.random() * 0.45; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5); }
      x.globalAlpha = 1; if (lines) { x.strokeStyle = lines; x.lineWidth = 2; x.strokeRect(1, 1, 254, 254); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    };
    this.roadTex = speckle('#575b5f', ['#3f4347', '#6c7075', '#4b4f53'], 70);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 1 }));
    ground.position.y = -0.02; ground.name = 'Ground'; g.add(ground);
    // the forecourt in front of the terminal: lighter paving, with a kerb where the road ends (z = -1.2)
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(160, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: speckle('#b4b4ae', ['#a2a29c', '#c6c6c0'], 60, 'rgba(90,90,85,0.35)'), roughness: 0.95 }));
    pave.position.set(0, 0.01, -41.2); pave.name = 'Pave'; g.add(pave);
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(160, 0.14, 0.22), new THREE.MeshStandardMaterial({ color: 0xcfcfc8, roughness: 0.9 }));
    kerb.position.set(0, 0.06, -1.2); kerb.name = 'Kerb'; g.add(kerb);
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

  /**
   * Which street the outdoor scene shows: 'airport' (the terminal forecourt photo ring) or 'home' (the street outside the traveller's
   * home: three photographs, one in front and one on each side, on a curved backdrop at about 14 m).
   */
  setOutdoorTheme(theme) {
    const g = this._outdoorGroup(), home = theme === 'home';
    if (!this.kerbRing) this.kerbRing = g.children.find((o) => o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 60);
    // one 360-degree photograph per theme; each is drawn after the sky and turned so that the first view faces the main subject
    this.streets ??= {};
    for (const name of ['home-street-360', 'airport-kerb-360']) {
      if (this.streets[name]) continue;
      const t = panoTexture(name); if (!t) continue;
      const m = new THREE.Mesh(groundSphere(40, this.stage.headY), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.BackSide, depthWrite: false }));
      m.userData.R = 40; m.userData.H = this.stage.headY;
      m.name = 'Street ' + name; m.scale.x = -1; m.rotation.y = -1.57; m.position.y = this.stage.headY; m.renderOrder = -8; m.visible = false; g.add(m); this.streets[name] = m;
    }
    const key = home ? 'home-street-360' : 'airport-kerb-360', sphere = this.streets[key] || null;
    for (const [name, m] of Object.entries(this.streets)) m.visible = m === sphere;
    this.streetSphere = this.streets['home-street-360'];
    this.theme360 = !!sphere;                                         // true: a photograph supplies the road, the pavement and the building
    // without a photograph the old drawn ground (and the flat kerb photo ring) is used; with one, the photograph supplies all of it
    if (this.kerbRing) this.kerbRing.visible = !sphere && !home;
    for (const n of ['Ground', 'Pave', 'Kerb']) { const o = g.getObjectByName(n); if (o) o.visible = !sphere && !home; }
    if (this.homeRing) this.homeRing.visible = false;
    if (home && !sphere) this._legacyHomeRing(g);
  }
  _legacyHomeRing(g) {
    if (!this.homeRing) {
      const R = 14, arc = 2 * Math.PI / 3, H = 2 * R * Math.sin(arc / 2) / 3.0, grp = this.homeRing = new THREE.Group(); grp.name = 'HomeStreet';
      [['home-street', 0], ['side-left', 1], ['side-right', -1]].forEach(([name, k]) => {
        const t = photoTexture(name); if (!t) return;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true, Math.PI - arc / 2 + k * arc, arc), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.BackSide }));
        seg.position.y = H * (0.69 - 0.5); seg.renderOrder = -8; grp.add(seg);
      });
      g.add(grp);
    }
    this.homeRing.visible = true;
    const gr = g.getObjectByName('Ground'); if (gr) gr.visible = true;
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
    ceil.position.set(0, 2.9, -1); v.add(ceil); this.ceilMesh = ceil; this.lightMeshes = [];
    // The real apron photo, seen through the (now clear) windows of the far wall.
    const view = cropTexture('view-tarmac-day', [620, 150, 880, 610], { mirror: true });
    if (view) { const arc = 1.7, b = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 5.4, 48, 1, true, Math.PI - arc / 2, arc), new THREE.MeshBasicMaterial({ map: view, toneMapped: false, side: THREE.BackSide })); b.position.set(0, 2.3, -0.4); v.add(b); this.apronView = b; }
    // Check-in and security are inside the terminal, away from the apron: a plain wall instead of planes outside the glass.
    const wallTex = tileTexture('tex-wall'); let wallMat = new THREE.MeshStandardMaterial({ color: 0xe9ecea, roughness: 0.9 });
    if (wallTex) { const t = wallTex.clone(); t.repeat.set(6, 1.4); t.needsUpdate = true; wallMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); }
    this.closedWall = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 3.1), wallMat); this.closedWall.position.set(0, 1.55, -6.7); v.add(this.closedWall);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false });
    for (let i = -3; i <= 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 9), lightMat); l.position.set(i * 1.8, 2.88, -1.5); v.add(l); this.lightMeshes.push(l); }
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
  /** Keep every panorama's floor on the real floor: rebuild when the viewer's eye height changes (a headset reports it after the session starts). */
  syncEye() {
    const h = this.stage.headY, spheres = [this.homeSphere, ...Object.values(this.streets || {}), ...Object.values(this.s360 || {})];
    for (const m of spheres) {
      if (!m || Math.abs((m.userData.H ?? h) - h) < 0.04) continue;
      m.geometry.dispose(); m.geometry = groundSphere(m.userData.R, h); m.userData.H = h; m.position.y = h;
    }
  }

  update(dt, headLocal, camera) {
    this.tweens.step(dt);
    for (const h of [this.hall3d, this.gate3d]) if (h?.visible) h.userData.update?.(dt, camera);       // the crowds in the 3D hall and gate lounge
    if (this.driveSpeed && this.roadTex) this.roadTex.offset.y += this.driveSpeed * dt;     // the road streams past while the cab drives
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
