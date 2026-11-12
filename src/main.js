import * as THREE from 'three';
import { Assets } from './assets.js';
import { Voice } from './audio.js';
import { Interactions } from './xr/input.js';
import { SpaceFit, defaultFit, fitFromCorners } from './xr/spaceFit.js';
import { Stage, FitVisual } from './world/stage.js';
import { Environment } from './world/environment.js';
import { Director } from './lesson/director.js';
import { Panel } from './ui/panel.js';
import { Surface } from './ui/surface.js';
import { STAGE, PRACTICE, setPassenger, BUILD } from './config.js';
import { CARD } from './lesson/rules.mjs';
document.getElementById('build')?.append('Version ' + BUILD);
import { KeyboardCard } from './ui/keyboard.js';
import { loadImages } from './world/images.js';
import { Staff } from './world/staff.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

class App {
  constructor() {
    this.phase = 'idle';            // idle | scan | setup | mark | lesson
    this.mode = 'desktop';          // desktop | mr | vr
    this.xrPresenting = false;
    this.clock = new THREE.Clock();
    this.spaceFit = new SpaceFit();
    this.scanTime = 0;
    this.yaw = 0; this.pitch = 0;
    this.marks = [];
    this.fit = null;
    this.comfort = (() => { try { return localStorage.getItem('saath.comfort') === 'glide' ? 'glide' : 'fade'; } catch { return 'fade'; } })();   // 'fade' (gentle, default) or 'glide' (smooth, opt-in) for seated travel
  }

  async init() {
    if (params.get('name')) setPassenger(params.get('name')); // handy for demos and testing
    if (params.get('emulate')) { // dev only: Quest 3 emulator for desktop testing of the XR code path
      const { installEmulator } = await import('../tools/emu.js');
      installEmulator();
    }
    let r;
    try { if (params.get('nowebgl')) throw new Error('WebGL disabled for testing'); r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return this.showFatal('graphics', e); }
    r.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); this.director?.pause?.(true); this.showFatal('graphics', new Error('The graphics were interrupted')); });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;   // filmic highlights instead of flat, plasticky light
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(0.35);
    r.setClearColor(0x000000, 0);
    $('canvas-host').append(r.domElement);
    Surface.maxAnisotropy = Math.min(16, r.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.03, 80);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.assets = new Assets('./assets/');
    this.voice = new Voice();
    await this.assets.init();
    this.assets.loadPeople().then((p) => { Staff.library = p; });   // optional rigged characters (assets/people/*.glb)
    await loadImages('./assets/images/', (n, total) => { $('loading').textContent = `Loading Saath airport practice… ${Math.round((n / total) * 100)}%`; });
    this.stage = new Stage(this.scene);
    this.input = new Interactions({ renderer: r, scene: this.scene, camera: this.camera, domElement: r.domElement });
    this.input.defaultHome = this.stage.props;
    this.env = new Environment({ renderer: r, scene: this.scene, stage: this.stage, assets: this.assets });
    this.fitVisual = new FitVisual(this.scene);
    this.director = new Director(this);
    this.buildMenu();

    this.input.on('look', ({ dx, dy }) => { this.yaw -= dx * 0.0045; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0045, -1.0, 1.0); });
    this.input.on('empty', (e) => this.onEmpty(e));
    r.xr.addEventListener('sessionstart', () => this.onSessionStart());
    r.xr.addEventListener('sessionend', () => this.onSessionEnd());
    addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); });
    addEventListener('keydown', (e) => this.onKey(e));
    r.setAnimationLoop((t, frame) => this.frame(t, frame));

    // Preload the setup-independent bits quietly.
    await this.assets.preload(['terminal-floor-module', 'terminal-window-module', 'terminal-wall-module', 'terminal-column', 'terminal-seating']);
    this.assets.preload(['terminal-sign', 'booking-document']).catch(() => {});
    window.saath = this; // handy for debugging in the headset browser / desktop console
    await this.detect();
    $('loading').hidden = true;
    if (params.get('desktop') === '1' || params.get('step') !== null) this.startDesktop(Number(params.get('step') || 0));
  }

  /** A plain HTML explanation with a way out. It never depends on three.js, so it works when graphics do not. */
  showFatal(kind, e) {
    console.error(e);
    $('loading').hidden = true; $('launcher').hidden = false; $('hud').hidden = true;
    const msg = {
      graphics: 'This browser could not start 3D graphics (WebGL). Close other tabs or apps and try again. On a Meta Quest 3, open this page in the Quest Browser.',
      assets: 'Some practice files did not load. Check your connection and try again.',
    }[kind] || 'Something went wrong while starting.';
    $('err').textContent = msg + (e?.message ? ' (' + e.message + ')' : '');
    $('cap').textContent = 'Not started';
    const why = { graphics: 'Needs 3D graphics, which this browser could not start.', assets: 'Needs the practice files, which did not load.' }[kind] || 'Unavailable right now.';
    for (const id of ['btn-mr', 'btn-vr', 'btn-webcam', 'btn-desktop', 'btn-tour']) { const b = $(id); if (b) { b.disabled = true; b.classList.add('off'); b.title = why; b.onclick = () => { $('err').textContent = why + ' Use Try again.'; }; } }
    if (!$('btn-retry')) { const b = document.createElement('button'); b.id = 'btn-retry'; b.className = 'primary'; b.textContent = 'Try again'; b.onclick = () => location.reload(); $('err').after(b); }
  }

  // ------------------------------------------------------------ capability + launch
  async detect() {
    const xr = navigator.xr;
    this.caps = { xr: !!xr, ar: false, vr: false, secure: window.isSecureContext };
    if (xr) {
      try { this.caps.ar = await xr.isSessionSupported('immersive-ar'); } catch { /* */ }
      try { this.caps.vr = await xr.isSessionSupported('immersive-vr'); } catch { /* */ }
    }
    $('cap').textContent = this.caps.xr
      ? `WebXR: ${this.caps.ar ? 'mixed reality ✓' : 'mixed reality ✗'} · ${this.caps.vr ? 'VR ✓' : 'VR ✗'}${this.caps.secure ? '' : ' · needs HTTPS'}`
      : 'WebXR not available in this browser — desktop preview only';
    // The XR buttons stay clickable when the browser has no headset, and say why (a dead grey button explains nothing).
    const why = (what) => `${what} needs a headset browser. This browser reports no ${what === 'Mixed reality' ? 'immersive-ar' : 'immersive-vr'} support — on a Meta Quest 3 open this page in the Quest Browser over HTTPS (see the README). On this computer use the webcam or desktop preview below.`;
    $('btn-mr').classList.toggle('off', !this.caps.ar); $('btn-vr').classList.toggle('off', !this.caps.vr);
    $('btn-mr').onclick = () => { this.readName(); this.caps.ar ? this.startXR('mr') : ($('err').textContent = why('Mixed reality')); };
    $('btn-vr').onclick = () => { this.readName(); this.caps.vr ? this.startXR('vr') : ($('err').textContent = why('Full VR')); };
    $('btn-desktop').onclick = () => { this.readName(); this.startDesktop(0); };
    $('btn-tour').onclick = () => { this.readName(); this._tourFirst = true; this.startDesktop(0); };
    $('btn-webcam').onclick = () => { this.readName(); this.startWebcam(); };
    $('name-input').value = PRACTICE.hasName ? PRACTICE.passenger : '';
    $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  }

  readName() { setPassenger($('name-input').value); }

  // ------------------------------------------------------------ name entry inside the headset
  askName(done, { title = 'What should we call you?' } = {}) {
    const kb = this.keyboard ||= (() => { const k = new KeyboardCard(); this.stage.root.add(k.mesh); k.mesh.visible = false; return k; })();
    const dr = this.director, a = dr.headYaw, h = dr.headLocal;
    kb.open(PRACTICE.hasName ? PRACTICE.passenger : '', title);
    if (!dr.followers.has(kb.mesh)) dr.follow(kb.mesh, { yaw: 0, dist: 1.2, scale: 0.9, dy: -0.28 });
    kb.mesh.visible = true; dr._follow(kb.mesh, dr.followers.get(kb.mesh), 0, true); this.input.addInteractive(kb.mesh);
    dr.panel.mesh.visible = false; this.input.removeInteractive(dr.panel.mesh);
    const close = () => { kb.mesh.visible = false; this.input.removeInteractive(kb.mesh); dr.panel.mesh.visible = true; this.input.addInteractive(dr.panel.mesh); };
    kb.onDone = (txt) => { setPassenger(txt); this.voice.say(PRACTICE.hasName ? `Nice to meet you, ${PRACTICE.passenger}.` : ''); close(); done?.(); };
    kb.onCancel = () => { close(); done?.(); };
  }

  async startXR(kind) {
    this.voice.soft(); // unlocks audio inside the user gesture
    // Real-world occlusion (depth-sensing) is OFF by default: on some Quest browser builds it hides every depth-tested
    // 3D object while screen-space UI still shows. Opt in with ?occlusion=1.
    const optional = ['hand-tracking', 'plane-detection', 'mesh-detection', 'anchors', 'bounded-floor', 'layers'];
    const init = { requiredFeatures: ['local-floor'], optionalFeatures: optional };
    if (params.get('occlusion') === '1') { optional.push('depth-sensing'); init.depthSensing = { usagePreference: ['gpu-optimized', 'cpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] }; }
    try {
      const session = await navigator.xr.requestSession(kind === 'mr' ? 'immersive-ar' : 'immersive-vr', init);
      this.mode = kind;
      this.env.forced = kind === 'vr' ? 'immersive' : null;
      this.env.mode = 'mixed';
      this.env.setMode(kind === 'vr' ? 'immersive' : 'mixed', { instant: true });
      await this.renderer.xr.setSession(session);
      this.features = session.enabledFeatures || [];
    } catch (e) {
      console.error(e);
      $('err').textContent = 'Could not start the session: ' + (e.message || e);
    }
  }

  /** Desktop stand-in for passthrough: your webcam is the "real room" behind the virtual props. */
  async startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      const v = document.createElement('video');
      v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();
      const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
      this.env.webcamTexture = t;
      this.startDesktop(0, { webcam: true });
    } catch (e) { $('err').textContent = 'Webcam unavailable: ' + (e.message || e); }
  }

  startDesktop(step = 0, { webcam = false } = {}) {
    this.mode = 'desktop';
    this.env.forced = webcam ? null : 'immersive';
    this.env.mode = webcam ? 'immersive' : 'mixed';
    this.env.setMode(webcam ? 'mixed' : 'immersive', { instant: true });
    $('launcher').hidden = true; $('hud').hidden = false;
    this.camera.position.set(0, 1.25, 0.0);
    this.stage.headY = 1.25;
    this.camera.fov = 72; this.camera.updateProjectionMatrix();
    this.yaw = 0; this.pitch = -0.2;
    this.fit = defaultFit({ x: 0, z: 0 }, { x: 0, z: -1 }, { width: 3.0, depth: 3.2 });
    this.stage.apply(this.fit, 0);
    this.phase = 'lesson';
    if (params.get('tour') || this._tourFirst) { this._tourFirst = false; this.director.startTour(); return; }
    this.director.start(Math.max(0, Math.min(this.director.count - 1, step)));
  }

  onSessionStart() {
    this.xrPresenting = true;
    $('launcher').hidden = true; $('hud').hidden = true;
    // BUG FIX: the background was chosen before the session existed, so a light-blue colour could stay painted over
    // the passthrough room. Re-evaluate now that we are presenting (mixed mode => transparent => the real room shows).
    this.renderer.setClearColor(0x000000, 0);
    this.env.setBackground();
    const session = this.renderer.xr.getSession();
    this.blend = session?.environmentBlendMode || 'unknown';   // 'alpha-blend' / 'additive' = passthrough, 'opaque' = VR
    session?.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') this.director.pause(true); });
    if (this.mode === 'vr') {   // full VR has no room scan and needs no floor space: start in the small seated layout right away
      this.phase = 'scan'; this.director._teardown(); this.applyFit(null, null, this.headWorld(), this.gazeWorld(), { small: true }); return;
    }
    this.beginFit();
  }
  onSessionEnd() {
    this.xrPresenting = false;
    $('launcher').hidden = false;
    this.phase = 'idle'; this.anchor = null;
    this.director.setVisible(true);
    this.fitVisual.hide();
    this.env.setBackground();
    this.input.paused = false; this.director.paused = false; this.director.pres.mode = 'scene'; this.director.pres.stack.length = 0;
    this.director._teardown?.();
    this.director.index = -1;
    this.env.mode = 'mixed';
    this.env.virtual.visible = false;
    this.env.catcher.visible = true;
  }

  // ------------------------------------------------------------ space fit
  beginFit() {
    this.phase = 'scan'; this.scanTime = 0; this.spaceFit = new SpaceFit(); this.marks = [];
    this.director._teardown();
    this.director.snapshot = null;
    this.stage.apply(defaultFit(this.headWorld(), this.gazeWorld()), 0);
    this.director.setPanel({ eyebrow: 'Space setup', title: 'Looking at your room…', body: 'Look around slowly so the headset can see the floor, walls and furniture.', note: 'Keep the controllers or your hands in view', tone: 'normal', tasks: [], buttons: [{ id: 'skip', label: 'Use a default area', kind: 'secondary' }], progress: null, chips: [] });
    this.director.snapPanelToGaze();
  }

  headWorld() { return this.camera.getWorldPosition(new THREE.Vector3()); }
  gazeWorld() { const d = this.camera.getWorldDirection(new THREE.Vector3()); d.y = 0; return d.lengthSq() < 1e-4 ? new THREE.Vector3(0, 0, -1) : d.normalize(); }

  solveFit(frame) {
    const ref = this.renderer.xr.getReferenceSpace();
    const head = this.headWorld(), gaze = this.gazeWorld();
    let res = null;
    if (frame && this.spaceFit.hasData) { try { res = this.spaceFit.solve(frame, ref, head, gaze); } catch (e) { console.warn('fit failed', e); } }
    this.applyFit(res && !res.none ? res : null, res, head, gaze);
  }

  applyFit(fit, raw, head, gaze, { small = false } = {}) {
    let floorY = raw?.floorY ?? 0;
    if (Math.abs(floorY) > 0.25) floorY = 0;          // an implausible floor height must never bury the scene
    this.scanInfo = raw;
    let usedDefault = false;
    // A scan result that puts the stage more than 1.5 m from the learner is not trusted: stay with the learner.
    if (fit && Math.hypot(fit.origin.x - head.x, fit.origin.z - head.z) > 1.5) fit = null;
    if (small) fit = null;
    if (!fit) { fit = defaultFit(head, gaze, small ? { width: 1.5, depth: 1.7 } : undefined); usedDefault = true; if (raw?.grid) { fit.grid = raw.grid; fit.gridYaw = raw.gridYaw; } }
    this.fit = fit; this.floorY = floorY;
    this.stage.apply(fit, floorY);
    this.stage.headY = THREE.MathUtils.clamp(head.y - floorY, 0.9, 1.9);
    this.fitVisual.show(fit, floorY);
    this.phase = 'setup';
    const w = fit.width.toFixed(1), d = fit.depth.toFixed(1);
    const pct = Math.round(fit.scale * 100);
    const buttons = [{ id: 'start', label: usedDefault ? 'My area is clear. Start' : 'Start practice' }, { id: 'tour', label: 'Watch the journey first', kind: 'secondary' }, { id: 'small', label: 'I have little space', kind: 'secondary' }, { id: 'mark', label: 'Mark my own area', kind: 'secondary' }, { id: 'rescan', label: 'Scan again', kind: 'secondary' }];
    let title, body, note;
    if (small) {
      title = 'Small-space mode.';
      body = 'Everything stays close to you, so you can practise seated right where you are. The journey comes to you.';
      note = `${w} × ${d} m · seated`;
    } else if (usedDefault) {
      title = this.spaceFit.hasData ? 'No clear area found.' : 'Using a default area.';
      body = this.spaceFit.hasData ? 'Furniture seems to fill the space. You can mark an area yourself, or practise in a small default one.'
        : 'I could not read your room (Space Setup or permission missing). I have not checked this area: please make sure it is clear of furniture, people and pets.';
      note = `${w} × ${d} m default`;
    } else {
      title = 'Your clear space is ready.';
      body = `${w} m wide and ${d} m deep in front of you is free. Scenery is arranged to stay inside it.`;
      note = fit.quality === 'great' ? 'Roomy · full size' : `Compact · scenery at ${pct}%`;
    }
    if (this.mode === 'desktop') note = 'Desktop preview';
    else note += ` · ${this.spaceFit.planes.size} surfaces · ${['alpha-blend', 'additive'].includes(this.blend) ? 'passthrough ok' : this.blend === 'opaque' ? 'no passthrough (VR)' : 'passthrough unknown'}`;
    this.director.setPanel({ eyebrow: 'Space setup', title, body, note, tone: usedDefault ? 'warn' : 'normal', tasks: [], buttons, progress: null, chips: [] });
    this.director.snapPanelToGaze();
    this.voice.say(`${title} ${body}`);
  }

  onSetup(id) {
    if (id === 'skip' && this.phase === 'scan') return this.solveFit(null);
    if (id === 'rescan') { this.fitVisual.hide(); return this.beginFit(); }
    if (id === 'mark') return this.beginMark();
    if (id === 'cancel') { this.fitVisual.hide(); return this.beginFit(); }
    if (id === 'small') return this.applyFit(null, this.scanInfo, this.headWorld(), this.gazeWorld(), { small: true });
    if (id === 'tour') { this.fitVisual.hide(); this.makeAnchor(); this.phase = 'lesson'; return this.director.startTour(); }
    if (id === 'start') {
      if (!PRACTICE.hasName && !this._askedName) { this._askedName = true; return this.askName(() => this.onSetup('start')); }
      this.fitVisual.hide();
      this.makeAnchor();
      this.phase = 'lesson';
      this.director.start(Number(params.get('step') || 0));
    }
  }

  beginMark() {
    this.phase = 'mark'; this.marks = [];
    this.fitVisual.hide();
    this.director.setPanel({ eyebrow: 'Mark your space', title: 'Mark the front-left corner.', body: 'Point at the floor and press the trigger or pinch, at the front-left corner of the free area.', note: 'Step 1 of 2', tone: 'normal', buttons: [{ id: 'cancel', label: 'Cancel', kind: 'secondary' }], tasks: [], chips: [] });
  }

  onEmpty({ ray }) {
    if (this.phase !== 'mark') return;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.floorY || 0));
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    this.marks.push({ x: hit.x, z: hit.z });
    this.voice.beep();
    if (this.marks.length === 1) {
      this.director.panel.set({ title: 'Now the far-right corner.', body: 'Point at the floor at the opposite corner of the free area.', note: 'Step 2 of 2' });
    } else {
      const f = fitFromCorners(this.marks[0], this.marks[1], this.headWorld());
      if (f) this.applyFit(f, { floorY: this.floorY || 0 }, this.headWorld(), this.gazeWorld());
      else { this.director.panel.set({ title: 'That area is too small.', body: 'Try marking a larger area (at least 1.3 m each way).', tone: 'warn' }); this.marks = []; }
    }
  }

  async makeAnchor() {
    this.anchor = null;
    const frame = this.lastFrame; if (!frame?.createAnchor) return;
    try {
      const ref = this.renderer.xr.getReferenceSpace();
      const p = this.stage.root.position, q = this.stage.root.quaternion;
      this.anchor = await frame.createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), ref);
    } catch (e) { console.info('Anchors unavailable:', e.message); }
  }

  // ------------------------------------------------------------ settings (one bounded card, three short pages)
  buildMenu() {
    this.menu = new Panel({ width: CARD.designWidth * CARD.pxWidth / CARD.designPx, pxW: CARD.pxWidth });
    this.menu.mesh.visible = false; this.menu.mesh.userData.system = true;
    this.stage.root.add(this.menu.mesh);
    this.menu.onSelect = (id) => this.onMenu(id);
    this.menuPage = 0;
  }
  refreshMenu() {
    const forced = this.env.forced === 'immersive', d = this.director;
    const dl = { 1.5: 'near (1.5 m)', 1.9: 'medium (1.9 m)', 2.4: 'far (2.4 m)' }[d.cardDist] || d.cardDist.toFixed(1) + ' m';
    const tl = d.textK < 0.95 ? 'smaller' : d.textK > 1.6 ? 'largest' : d.textK > 1.1 ? 'larger' : 'medium';
    let title, buttons;
    if (this.menuPage === 0) {
      title = 'Settings';
      buttons = [
        ...(forced ? [] : [{ id: 'mode', label: this.env.mode === 'mixed' ? (this._modeConfirm ? 'Hide my room? Tap again' : 'Switch to full VR') : 'Switch to mixed reality', kind: 'secondary' }]),
        { id: 'voice', label: this.voice.enabled ? 'Voice: on' : 'Voice: off', kind: 'secondary' },
        { id: 'recenter', label: 'Recenter cards', kind: 'secondary' },
        { id: 'dist', label: 'Card distance: ' + dl, kind: 'secondary' },
        { id: 'text', label: 'Text size: ' + tl, kind: 'secondary' },
        { id: 'page1', label: 'More  ›', kind: 'secondary' },
        { id: 'close', label: 'Close' },
      ];
    } else if (this.menuPage === 1) {
      title = 'Your space';
      buttons = [
        { id: 'comfort', label: this.comfort === 'fade' ? 'Travel: gentle fade' : 'Travel: smooth (thumbstick)', kind: 'secondary' },
        { id: 'bring', label: 'Bring objects to me', kind: 'secondary' },
        { id: 'refit', label: 'Re-fit my space', kind: 'secondary' },
        { id: 'name', label: `Name: ${PRACTICE.hasName ? PRACTICE.passenger : 'not set'}`, kind: 'secondary' },
        { id: 'page2', label: 'More  ›', kind: 'secondary' },
        { id: 'page0', label: '‹  Back' },
      ];
    } else {
      title = 'Practice';
      buttons = [
        { id: 'tourplay', label: 'Watch the whole journey', kind: 'secondary' },
        { id: 'prevstep', label: 'Previous step', kind: 'secondary' },
        { id: 'skipstep', label: 'Skip this step', kind: 'secondary' },
        { id: 'restart', label: 'Restart practice', kind: 'secondary' },
        { id: 'forget', label: 'Forget my saved name', kind: 'secondary' },
        ...(this.xrPresenting ? [{ id: 'exit', label: 'Exit', kind: 'secondary' }] : []),
        { id: 'page1', label: '‹  Back' },
      ];
    }
    this.menu.set({ eyebrow: '', title, body: '', note: this.menuPage === 0 ? 'Practice only. Follow real staff.' : '', tone: 'normal', progress: null, chips: [], tasks: [], buttons });
  }
  openMenu() {
    const dr = this.director; if (this.phase !== 'lesson') return;
    if (!dr.pres.enter('settings')) return;
    this.menuPage = 0; this._modeConfirm = false; this.refreshMenu();
    if (!dr.followers.has(this.menu.mesh)) dr.follow(this.menu.mesh, { yaw: 0, dy: -0.14 });
    dr._applyPresentation(); dr._follow(this.menu.mesh, dr.followers.get(this.menu.mesh), 0, true);
  }
  closeMenu() {
    const dr = this.director; this._modeConfirm = false;
    if (dr.pres.mode === 'settings') dr.pres.back();
    dr._applyPresentation();
  }
  onMenu(id) {
    this.voice.soft();
    const dr = this.director;
    if (id === 'close') return this.closeMenu();
    if (id.startsWith('page')) { this.menuPage = Number(id.slice(4)); return this.refreshMenu(); }
    if (id === 'mode') {
      const to = this.env.mode === 'mixed' ? 'immersive' : 'mixed';
      if (to === 'immersive' && !this._modeConfirm) { this._modeConfirm = true; return this.refreshMenu(); }   // hiding the real room needs a second, deliberate tap
      this._modeConfirm = false; this.env.setMode(to); return this.refreshMenu();
    }
    if (id === 'voice') { this.voice.enabled = !this.voice.enabled; if (!this.voice.enabled) this.voice.stop(); return this.refreshMenu(); }
    if (id === 'comfort') { this.comfort = this.comfort === 'fade' ? 'glide' : 'fade'; try { localStorage.setItem('saath.comfort', this.comfort); } catch { /* private mode */ } return this.refreshMenu(); }
    if (id === 'dist') { const o = [1.5, 1.9, 2.4], k = o.indexOf(dr.cardDist); dr.setCardPrefs({ dist: o[(k + 1) % o.length] }); dr.snapPanelToGaze(); return this.refreshMenu(); }
    if (id === 'text') { const o = [0.85, 1, 1.4, 1.8], k = o.findIndex((v) => Math.abs(v - dr.textK) < 0.05); dr.setCardPrefs({ textK: o[(k + 1) % o.length] }); dr.snapPanelToGaze(); return this.refreshMenu(); }
    if (id === 'recenter') { this.closeMenu(); return dr.recenter(); }
    if (id === 'forget') { try { localStorage.removeItem('saath.name'); } catch { /* */ } setPassenger(''); return this.refreshMenu(); }
    if (id === 'name') { this.closeMenu(); return this.askName(() => { if (dr.index >= 0 && dr.index < dr.count) dr.goto(dr.index); }); }
    if (id === 'bring') { // rescue: put the whole scene right in front of the learner, close and small (state is kept)
      const head = this.headWorld();
      this.stage.apply(defaultFit(head, this.gazeWorld(), { width: 1.5, depth: 1.7 }), 0);
      this.floorY = 0; this.stage.headY = THREE.MathUtils.clamp(head.y, 0.9, 1.9); this.anchor = null;
      this.closeMenu(); return dr.snapPanelToGaze();
    }
    if (id === 'refit') { this.closeMenu(); dr._teardown(); if (this.mode === 'desktop') { this.startDesktop(0); return; } return this.beginFit(); }
    if (id === 'tourplay') { this.closeMenu(); return dr.startTour(); }
    if (id === 'prevstep') { this.closeMenu(); return dr.previousStep(); }
    if (id === 'skipstep') { this.closeMenu(); return dr.skipStep(); }
    if (id === 'restart') { this.closeMenu(); return dr.restart(); }
    if (id === 'exit') { this.closeMenu(); return this.exitSession(); }
  }

  exitSession() { const sess = this.renderer.xr.getSession?.(); if (sess) sess.end(); else { this.director._teardown?.(); location.reload(); } }

  /** Move the practice area to where the learner is now, without touching any lesson state (props and progress stay as they are). */
  recenterHere() {
    const head = this.headWorld(), gaze = this.gazeWorld();
    const fit = defaultFit(head, gaze, { width: this.fit?.width ?? STAGE.width, depth: this.fit?.depth ?? STAGE.depth });
    this.fit = fit; this.stage.apply(fit, this.floorY || 0); this.anchor = null;
    this.stage.headY = THREE.MathUtils.clamp(head.y - (this.floorY || 0), 0.9, 1.9);
    this.env.safe = true;
  }

  haptic(intensity = 0.5, ms = 60) { for (const p of this.input.pointers) this.input._haptic?.(p, intensity, ms); }

  onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'n') this.director.next?.();
    if (e.key === 'ArrowLeft') this.director.goto(Math.max(0, this.director.index - 1));
    if (e.key === 'm') this.onMenu('mode');
    if (e.key === 'Escape') this.director.pres.mode === 'settings' ? this.closeMenu() : this.openMenu();
  }

  // ------------------------------------------------------------ frame
  frame(t, frame) {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.lastFrame = frame || null;
    if (frame) {
      if (this.phase === 'scan') {
        this.spaceFit.observe(frame);
        this.scanTime += dt;
        const planeWait = this.spaceFit.hasData ? 2.2 : 4.5;
        const left = Math.max(0, planeWait - this.scanTime);
        if (this.scanTime > planeWait) this.solveFit(frame);
        else if (Math.floor(this.scanTime * 4) % 2 === 0) this.director.panel.set({ note: `Scanning… ${left.toFixed(0)}s · ${this.spaceFit.planes.size} surfaces seen` });
      }
      if (this.anchor) {
        const pose = frame.getPose(this.anchor.anchorSpace, this.renderer.xr.getReferenceSpace());
        if (pose) { const p = pose.transform.position, o = pose.transform.orientation; this.stage.root.position.set(p.x, p.y, p.z); this.stage.root.quaternion.set(o.x, o.y, o.z, o.w); }
      }
    } else if (this.mode === 'desktop') {
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }
    this.camera.updateMatrixWorld(true);       // head pose must be current before anything is placed relative to it (no one-frame lag)
    this.stage.root.updateMatrixWorld(true);
    this.input.update(dt);
    this.director.update(dt, t / 1000);
    for (const a of this.assets.live) a.update(dt);
    if (this.env.update(dt, this.director.headLocal, this.camera) && !this.env.safe) this.director.safetyStop('boundary');
    this.fitVisual.update(dt);
    if (this.keyboard?.mesh.visible && (this._kbT = (this._kbT || 0) + dt) > 0.5) { this._kbT = 0; this.keyboard.redraw(); } // caret blink
    this.renderer.render(this.scene, this.camera);
  }
}

const app = new App();
app.init().catch((e) => app.showFatal('assets', e));
