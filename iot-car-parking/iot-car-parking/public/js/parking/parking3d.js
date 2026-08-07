// ─── THREE.JS SCENE ──────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { NS, slotPos, isLeftSide, colors, carRotation, lerp, clamp, ease } from './constants.js';

export default class Parking3D {
  constructor(canvas, lcdRef) {
    this.canvas = canvas;
    this.slotState = Array(NS).fill(false);
    this.animating = false;
    this.carGroup = null;
    this.envTexture = null;
    this.parkedCars = {};
    this.lcdCallback = null;
    if (lcdRef) this.lcdCallback = lcdRef;

    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;

    // Scene — night
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.Fog(0x0a0a1a, 35, 75);

    // Camera — top-down with slight angle
    this.cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 60);
    this.cam.position.set(0, 22, 6);
    this.cam.lookAt(0, 0, 5.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.toneMappingExposure = 1.8;

    // OrbitControls
    this.controls = new OrbitControls(this.cam, canvas);
    this.controls.target.set(0, 0, 5.5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 45;
    this.controls.update();

    // Composer (post-processing)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.0, 0.2, 0.08);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Environment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(envScene).texture;
    this.scene.environment = this.envTexture;
    envScene.dispose();
    pmrem.dispose();

    // Lights
    this._buildLights();

    // Build scene
    this._buildGround();
    this._buildAtmosphere();
    this._buildParking();
    this._buildGates();
    this._buildDecor();
    this._buildBuildings();

    this.entryAngle = 0;
    this.exitAngle = 0;
    this.entryTarget = 0;
    this.exitTarget = 0;

    this.animate();
  }

  // ── LIGHTS (NIGHT) ──
  _buildLights() {
    const moon = new THREE.DirectionalLight(0x6688bb, 0.6);
    moon.position.set(-8, 18, 4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const d = 18;
    moon.shadow.camera.left = -d;
    moon.shadow.camera.right = d;
    moon.shadow.camera.top = d;
    moon.shadow.camera.bottom = -d;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 35;
    moon.shadow.bias = -0.0008;
    moon.shadow.radius = 12;
    this.scene.add(moon);

    this.scene.add(new THREE.AmbientLight(0x1a1a3a, 0.35));
    this.scene.add(new THREE.HemisphereLight(0x1a2a4a, 0x0a0a0a, 0.4));
  }

  // ── GROUND ──
  _buildGround() {
    const groundSize = 50;

    // Night asphalt
    const gCanvas = document.createElement('canvas');
    gCanvas.width = 512; gCanvas.height = 512;
    const gc = gCanvas.getContext('2d');
    const grad = gc.createRadialGradient(256, 256, 0, 256, 256, 256);
    grad.addColorStop(0, '#0e0e24');
    grad.addColorStop(1, '#08081a');
    gc.fillStyle = grad; gc.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 50000; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const b = 12 + Math.random() * 16;
      gc.fillStyle = `rgb(${b},${b},${b + 20})`;
      gc.fillRect(x, y, Math.random() > 0.7 ? 2 : 1, Math.random() > 0.7 ? 2 : 1);
    }
    const gTex = new THREE.CanvasTexture(gCanvas);
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping;
    gTex.repeat.set(6, 6);
    const groundMat = new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.92, metalness: 0.02 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grass
    const gsCanvas = document.createElement('canvas');
    gsCanvas.width = 256; gsCanvas.height = 256;
    const gsc = gsCanvas.getContext('2d');
    gsc.fillStyle = '#081a08'; gsc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const gv = 10 + Math.random() * 14;
      gsc.fillStyle = `rgb(${Math.floor(gv * 0.3)},${Math.floor(gv)},${Math.floor(gv * 0.2)})`;
      gsc.fillRect(x, y, 1, 1);
    }
    const gsTex = new THREE.CanvasTexture(gsCanvas);
    gsTex.wrapS = gsTex.wrapT = THREE.RepeatWrapping;
    gsTex.repeat.set(4, 6);
    const grassMat = new THREE.MeshStandardMaterial({ map: gsTex, roughness: 0.95 });
    for (const [x, z, w, h] of [[-7.5, 5.5, 4, 16], [7.5, 5.5, 4, 16]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), grassMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(x, 0.002, z);
      this.scene.add(g);
    }

    // Entry road
    const rCanvas = document.createElement('canvas');
    rCanvas.width = 256; rCanvas.height = 256;
    const rc = rCanvas.getContext('2d');
    rc.fillStyle = '#1e1e38'; rc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 15000; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const b = 22 + Math.random() * 18;
      rc.fillStyle = `rgb(${b},${b},${b + 15})`;
      rc.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const rTex = new THREE.CanvasTexture(rCanvas);
    rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
    rTex.repeat.set(2, 6);
    const roadMat = new THREE.MeshStandardMaterial({ map: rTex, roughness: 0.85, metalness: 0.1 });

    // Main road through parking
    const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 14), roadMat);
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(0, 0.003, 5.5);
    this.scene.add(mainRoad);

    const makeRoad = (w, l, x, z) => {
      const tex = roadMat.map.clone();
      tex.repeat.set(w * 0.67, l * 0.43);
      const mat = roadMat.clone();
      mat.map = tex;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.003, z);
      this.scene.add(m);
    };

    makeRoad(3.0, 9, 0, -6);
    makeRoad(6, 2.5, 0, -1.5);
    makeRoad(3.0, 9, 0, 18);
    makeRoad(6, 2.5, 0, 11.5);

    // Parking apron
    const cCanvas = document.createElement('canvas');
    cCanvas.width = 256; cCanvas.height = 256;
    const cc = cCanvas.getContext('2d');
    cc.fillStyle = '#181840'; cc.fillRect(0, 0, 256, 256);
    cc.strokeStyle = 'rgba(30,30,60,0.3)'; cc.lineWidth = 1;
    for (let x = 0; x < 256; x += 12) { cc.beginPath(); cc.moveTo(x, 0); cc.lineTo(x, 256); cc.stroke(); }
    for (let y = 0; y < 256; y += 12) { cc.beginPath(); cc.moveTo(0, y); cc.lineTo(256, y); cc.stroke(); }
    const cTex = new THREE.CanvasTexture(cCanvas);
    cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping;
    cTex.repeat.set(3, 4);
    const concMat = new THREE.MeshStandardMaterial({
      map: cTex, roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.65
    });
    const conc = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 13), concMat);
    conc.rotation.x = -Math.PI / 2;
    conc.position.set(0, 0.004, 5.5);
    this.scene.add(conc);

    // Curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.7 });
    for (const [x, z, w] of [[-4.9, 5.5, 0.12], [4.9, 5.5, 0.12], [0, -0.2, 9.5], [0, 11.2, 9.5]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.10, 0.12), curbMat);
      c.position.set(x, 0.05, z);
      c.castShadow = true;
      this.scene.add(c);
    }

    // Yellow dashes
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0xffcc33, emissive: 0xffcc33, emissiveIntensity: 0.25
    });
    for (let z = -2; z <= 13; z += 2.0) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.5), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.008, z);
      this.scene.add(dash);
    }
  }

  // ── PARKING SLOTS ──
  _buildParking() {
    this.slotMeshes = [];
    this.leds = [];

    for (let i = 0; i < NS; i++) {
      const { x, z } = slotPos(i);
      const left = isLeftSide(i);

      // Slot surface
      const slotMat = new THREE.MeshPhysicalMaterial({
        color: 0x1e1e44, roughness: 0.6, clearcoat: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide
      });
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.2), slotMat);
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(x, 0.008, z);
      this.scene.add(slot);
      this.slotMeshes.push(slot);

      // White border lines
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xaabbdd, transparent: true, opacity: 0.6 });
      for (const dz of [-1.15, 1.15]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.03), lineMat);
        l.rotation.x = -Math.PI / 2;
        l.position.set(x, 0.01, z + dz);
        this.scene.add(l);
      }
      for (const dx of [-0.95, 0.95]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 2.2), lineMat);
        l.rotation.x = -Math.PI / 2;
        l.position.set(x + dx, 0.01, z);
        this.scene.add(l);
      }

      // LED pole
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, roughness: 0.3, metalness: 0.6 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.7, 8), poleMat);
      pole.position.set(x + (left ? 1.0 : -1.0), 0.35, z);
      this.scene.add(pole);

      // LED bulb
      const ledMat = new THREE.MeshPhysicalMaterial({
        color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 2.0,
        roughness: 0.1, metalness: 0.05, clearcoat: 0.3
      });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), ledMat);
      led.position.set(x + (left ? 1.0 : -1.0), 0.72, z);
      this.scene.add(led);
      this.leds.push(led);

      // Slot number painted on surface
      const numC = document.createElement('canvas');
      numC.width = 256; numC.height = 128;
      const nctx = numC.getContext('2d');
      nctx.clearRect(0, 0, 256, 128);
      nctx.fillStyle = 'rgba(255,255,255,0.65)';
      nctx.font = 'bold 72px Arial';
      nctx.textAlign = 'center';
      nctx.textBaseline = 'middle';
      nctx.fillText(`${i + 1}`, 128, 68);
      const numTex = new THREE.CanvasTexture(numC);
      const numMat = new THREE.MeshStandardMaterial({
        map: numTex, transparent: true, depthWrite: false,
        side: THREE.DoubleSide
      });
      const numMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), numMat);
      numMesh.rotation.x = -Math.PI / 2;
      numMesh.position.set(x, 0.009, z);
      this.scene.add(numMesh);
    }
  }

  // ── GATES ──
  _buildGates() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.2, metalness: 0.7 });
    const barMat = new THREE.MeshPhysicalMaterial({
      color: 0xffbb44, roughness: 0.15, metalness: 0.5, clearcoat: 0.3
    });

    // ═══ ENTRY GATE ═══
    this.entryPivot = new THREE.Group();
    this.entryPivot.position.set(-1.5, 0, -1.5);
    this.scene.add(this.entryPivot);

    for (const px of [0, 3.0]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 10), postMat);
      p.position.set(px, 1.2, 0);
      p.castShadow = true;
      this.entryPivot.add(p);
    }

    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.05, 0.35), barMat);
    bar.geometry.translate(1.55, 0, 0);
    bar.position.set(0, 1.2, 0);
    bar.castShadow = true;
    this.entryPivot.add(bar);
    this.entryBar = bar;

    const cw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x555577, metalness: 0.8, roughness: 0.3 })
    );
    cw.position.set(0, 1.28, 0);
    this.entryPivot.add(cw);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a44, metalness: 0.5, roughness: 0.4 })
    );
    base.position.set(0, 0.06, 0);
    this.entryPivot.add(base);

    // Scanner
    const scannerMat = new THREE.MeshPhysicalMaterial({
      color: 0x0055cc, emissive: 0x0099ff, emissiveIntensity: 3.0, clearcoat: 0.5
    });
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), scannerMat);
    scanner.position.set(1.5, 1.7, 0.2);
    this.entryPivot.add(scanner);

    this._makeSign("ENTRY", 0x00ff44, this.entryPivot, 1.5, 2.0, -0.2);
    this._makeGateScreen(this.entryPivot, 1.5, 1.3, -0.25, 'entry');

    // ═══ EXIT GATE ═══
    this.exitPivot = new THREE.Group();
    this.exitPivot.position.set(-1.5, 0, 11.5);
    this.scene.add(this.exitPivot);

    for (const px of [0, 3.0]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 10), postMat);
      p.position.set(px, 1.2, 0);
      p.castShadow = true;
      this.exitPivot.add(p);
    }

    const xbar = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.05, 0.35), barMat);
    xbar.geometry.translate(1.55, 0, 0);
    xbar.position.set(0, 1.2, 0);
    this.exitPivot.add(xbar);
    this.exitBar = xbar;

    const xcw = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x555577, metalness: 0.8, roughness: 0.3 }));
    xcw.position.set(0, 1.28, 0);
    this.exitPivot.add(xcw);

    const xbase = base.clone();
    xbase.position.set(0, 0.06, 0);
    this.exitPivot.add(xbase);

    const xScanner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), scannerMat);
    xScanner.position.set(1.5, 1.7, 0.2);
    this.exitPivot.add(xScanner);

    this._makeSign("EXIT", 0xff3333, this.exitPivot, 1.5, 2.0, -0.2);
    this._makeGateScreen(this.exitPivot, 1.5, 1.3, -0.25, 'exit');
  }

  _makeGateScreen(group, x, y, z, type) {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 240;
    this._updateGateCanvas(c, type);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.68), mat);
    if (type === 'entry') {
      mesh.position.set(x, y, z);
      mesh.rotation.y = Math.PI;
    } else {
      mesh.position.set(x, y, -z);
    }
    if (type === 'entry') this.entryScreen = { canvas: c, texture: tex, mesh };
    else this.exitScreen = { canvas: c, texture: tex, mesh };
    group.add(mesh);
  }

  _updateGateCanvas(canvas, type) {
    const ctx = canvas.getContext('2d');
    const occ = this.slotState.filter(Boolean).length;
    const free = NS - occ;

    ctx.fillStyle = '#000a00';
    ctx.fillRect(0, 0, 768, 240);

    ctx.strokeStyle = type === 'entry' ? '#00ff44' : '#ff3333';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 756, 228);

    ctx.fillStyle = type === 'entry' ? '#00ff44' : '#ff5555';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(type === 'entry' ? '▶ ENTRY' : 'EXIT ▶', 384, 50);

    ctx.fillStyle = '#aaddaa';
    ctx.font = '44px monospace';
    ctx.fillText(`Full: ${occ}   Empty: ${free}`, 384, 140);
    ctx.fillStyle = '#ffcc00';
    ctx.font = '34px monospace';
    ctx.fillText(`Total: ${NS}`, 384, 200);
  }

  _makeSign(text, color, group, x, y, z) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(0, 0, 128, 48, 6); ctx.fill();
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), mat);
    group && group.add(mesh);
  }

  // ── DECOR ──
  _buildDecor() {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2a48, roughness: 0.3, metalness: 0.5 });
    for (const [x, z] of [[-6.0, -1.0], [6.0, -1.0], [-6.0, 12.0], [6.0, 12.0]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.5, 10), pillarMat);
      p.position.set(x, 1.75, z);
      p.castShadow = true;
      this.scene.add(p);
    }

    // Lamp posts
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4e, roughness: 0.4, metalness: 0.6 });
    for (const [x, z] of [[-6.0, 1.5], [6.0, 1.5], [-6.0, 9.5], [6.0, 9.5]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 8), lampMat);
      pole.position.set(x, 1.4, z);
      this.scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshPhysicalMaterial({ color: 0xffdd88, emissive: 0xffaa44, emissiveIntensity: 3.0 })
      );
      head.position.set(x, 2.9, z);
      this.scene.add(head);
      const pl = new THREE.PointLight(0xffdd99, 3.5, 18);
      pl.position.set(x, 2.8, z);
      this.scene.add(pl);
    }

    // Trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x114422, roughness: 0.8 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x0d3318, roughness: 0.8 });
    for (const [x, z] of [[-8.5, 1.5], [8.5, 1.5], [-8.5, 9.5], [8.5, 9.5]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.6, 6), trunkMat);
      trunk.position.set(x, 0.3, z);
      this.scene.add(trunk);
      const leaf = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.4, 0),
        z % 2 === 0 ? leafMat1 : leafMat2
      );
      leaf.position.set(x, 0.85, z);
      this.scene.add(leaf);
    }

    // Barriers
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x3a3a55, roughness: 0.7 });
    for (const [x, z] of [[-4.8, -0.2], [4.8, -0.2], [-4.8, 11.2], [4.8, 11.2]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), barrierMat);
      b.position.set(x, 0.125, z);
      b.castShadow = true;
      this.scene.add(b);
    }
  }

  // ── BUILDINGS ──
  _buildBuildings() {
    const makeWindowTex = (bw, bh) => {
      const cols = Math.max(1, Math.ceil(bw / 0.7));
      const rows = Math.max(1, Math.ceil(bh / 0.9));
      const c = document.createElement('canvas');
      c.width = cols * 24; c.height = rows * 24;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = 'rgba(30,35,50,0.3)'; ctx.lineWidth = 1;
      for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * 24); ctx.lineTo(c.width, r * 24); ctx.stroke(); }
      for (let c2 = 0; c2 <= cols; c2++) { ctx.beginPath(); ctx.moveTo(c2 * 24, 0); ctx.lineTo(c2 * 24, c.height); ctx.stroke(); }
      for (let r = 0; r < rows; r++) {
        for (let ci = 0; ci < cols; ci++) {
          const lit = Math.random() > 0.35;
          const wx = ci * 24 + 4, wy = r * 24 + 4, ww = 16, wh = 16;
          if (lit) {
            const b = 0.5 + Math.random() * 0.5;
            ctx.fillStyle = `rgba(${Math.floor(180 + 75 * b)},${Math.floor(160 + 95 * b)},${Math.floor(60 + 60 * b)},0.85)`;
          } else {
            ctx.fillStyle = 'rgba(15,18,30,0.7)';
          }
          ctx.fillRect(wx, wy, ww, wh);
          ctx.strokeStyle = 'rgba(40,45,60,0.4)'; ctx.lineWidth = 1;
          ctx.strokeRect(wx - 1, wy - 1, ww + 2, wh + 2);
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
      return tex;
    };

    const build = (x, z, w, d, h, color, windowFace) => {
      const g = new THREE.Group();
      const wallMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, metalness: 0.15 });
      const winTex = makeWindowTex(w, h);
      const winMat = new THREE.MeshPhysicalMaterial({
        map: winTex, roughness: 0.5, metalness: 0.1,
        emissiveMap: winTex, emissive: new THREE.Color(0xffdd88), emissiveIntensity: 0.25
      });
      const mats = [wallMat, wallMat, wallMat, wallMat, wallMat, wallMat];
      if (windowFace >= 0 && windowFace <= 5) mats[windowFace] = winMat;

      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      body.position.y = h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.6 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), roofMat);
      roof.position.y = h;
      g.add(roof);

      if (h > 4) {
        const acMat = new THREE.MeshStandardMaterial({ color: 0x3a3a55, roughness: 0.5, metalness: 0.3 });
        for (const [dx, dz] of [[0.3, 0.2], [-0.25, -0.15]]) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.35), acMat);
          ac.position.set(dx, h + 0.1, dz);
          g.add(ac);
        }
      }

      const doorMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaccff, emissive: 0x88aaff, emissiveIntensity: 0.08,
        transparent: true, opacity: 0.3
      });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2), doorMat);
      const fIdx = windowFace >= 0 ? windowFace : 4;
      const fOff = d / 2 + 0.005;
      door.position.set(0, 0.15, fIdx === 4 ? fOff : fIdx === 5 ? -fOff : 0);
      if (fIdx === 0) { door.position.x = w / 2 + 0.005; door.position.z = 0; door.rotation.y = Math.PI / 2; }
      else if (fIdx === 1) { door.position.x = -w / 2 - 0.005; door.position.z = 0; door.rotation.y = -Math.PI / 2; }
      g.add(door);

      g.position.set(x, 0, z);
      this.scene.add(g);
    };

    // Buildings
    build(-10.5, -0.5, 3.2, 3, 5.5, 0x334466, 0);
    build(-10.5, 3.2, 3.2, 3, 7.5, 0x3a3a5a, 0);
    build(-10.5, 7.0, 3.2, 3, 4.5, 0x2a3a5a, 0);
    build(-10.5, 10.3, 3.2, 3, 6.5, 0x445566, 0);
    build(-10.5, 13.5, 3.2, 3, 5, 0x3a4a6a, 0);
    build(10.5, -0.2, 3.2, 3, 6, 0x44553a, 1);
    build(10.5, 3.5, 3.2, 3, 5, 0x3a4a3a, 1);
    build(10.5, 7.2, 3.2, 3, 8, 0x3a5a4a, 1);
    build(10.5, 10.8, 3.2, 3, 5.5, 0x4a5a4a, 1);
    build(10.5, 14.0, 3.2, 3, 4.5, 0x3a3a4a, 1);
    build(-13, 5, 2.8, 2.8, 12, 0x2a2a4a, 0);
    build(13, 5.5, 2.8, 2.8, 10, 0x3a2a4a, 1);
  }

  // ── ATMOSPHERE ──
  _buildAtmosphere() {
    const particleCount = 300;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 35 + 5.5;
      sizes[i] = 0.02 + Math.random() * 0.03;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0x88aadd, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, size: 0.06, depthWrite: false
    });
    const particles = new THREE.Points(geo, mat);
    this.particles = particles;
    this.scene.add(particles);
  }

  // ─── MAKE CAR ───────────────────────────────────────────
  _makeCar(color) {
    const g = new THREE.Group();
    const env = this.envTexture;
    const envInt = 2.2;

    // Shadow disc
    const sd = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15, depthWrite: false }));
    sd.rotation.x = -Math.PI / 2;
    sd.position.y = 0.005;
    g.add(sd);

    // Paint
    const paint = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.10, metalness: 0.55,
      clearcoat: 1.0, clearcoatRoughness: 0.12,
      envMap: env, envMapIntensity: envInt
    });

    // Body
    const bodyGeo = new THREE.BoxGeometry(1.2, 0.28, 0.52, 12, 4, 8);
    this._sculptBody(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, paint);
    body.position.y = 0.18;
    body.castShadow = true;
    g.add(body);

    // Cabin
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff, roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.25, clearcoat: 0.1,
      envMap: env, envMapIntensity: 0.5,
      side: THREE.DoubleSide
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), glassMat);
    cabin.position.set(-0.04, 0.37, 0);
    g.add(cabin);

    // Hood scoop
    const scoopMat = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.15, metalness: 0.5, clearcoat: 0.3,
      envMap: env, envMapIntensity: envInt
    });
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.25), scoopMat);
    scoop.position.set(0.48, 0.34, 0);
    g.add(scoop);

    // Bumpers
    const bumperMat = new THREE.MeshPhysicalMaterial({
      color: 0x222233, roughness: 0.6, metalness: 0.1, envMap: env, envMapIntensity: 0.2
    });
    const fb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.48), bumperMat);
    fb.position.set(0.64, 0.14, 0);
    g.add(fb);
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.48), bumperMat);
    rb.position.set(-0.64, 0.14, 0);
    g.add(rb);

    // Headlights
    const hlMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffdd, emissive: 0xffeeaa, emissiveIntensity: 4.0, clearcoat: 0.5
    });
    for (const dx of [0.12, -0.12]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), hlMat);
      hl.position.set(0.62, 0.16, dx);
      g.add(hl);
    }

    // Taillights
    const tlMat = new THREE.MeshPhysicalMaterial({
      color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 3.0, clearcoat: 0.3
    });
    for (const dx of [0.12, -0.12]) {
      const tl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), tlMat);
      tl.position.set(-0.62, 0.16, dx);
      g.add(tl);
    }

    // Wheels
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const rimMat = new THREE.MeshPhysicalMaterial({
      color: 0x666688, roughness: 0.3, metalness: 0.8, envMap: env, envMapIntensity: 0.5
    });
    const whPositions = [[-0.28, 0.22], [-0.28, -0.22], [0.28, 0.22], [0.28, -0.22]];
    for (const [wx, wz] of whPositions) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.06, wz);
      g.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.042, 8), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(wx, 0.06, wz);
      g.add(rim);
    }

    // Underbody glow
    const underMat = new THREE.MeshPhysicalMaterial({
      color: 0x4466aa, emissive: 0x3366cc, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.4
    });
    const under = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.35), underMat);
    under.position.set(0, 0.04, 0);
    g.add(under);

    g.scale.set(0.85, 0.85, 0.85);
    return g;
  }

  _sculptBody(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      const hw = 0.6, hh = 0.14, hd = 0.26;
      const nx = x / hw, ny = y / hh, nz = z / hd;

      const corner = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
      if (corner > 0.82) {
        const f = 0.82 / corner;
        x *= f; y *= f; z *= f;
      }
      if (x > 0.2) y -= (x - 0.2) * 0.22;
      if (x < -0.2) y -= (Math.abs(x) - 0.2) * 0.15;
      const az = Math.abs(z);
      const ax = Math.abs(x);
      if (az > 0.15 && az < 0.255 && ax < 0.15) {
        y += 0.03 * (1 - ax / 0.15) * (1 - (az - 0.15) / 0.105);
      }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
  }

  // ─── ANIMATIONS ────────────────────────────────────────
  playEntry(slotIdx, cb, onGate) {
    if (this.animating) return;
    this.animating = true;
    this.removeCar(slotIdx);
    const car = this._makeCar(colors[slotIdx % colors.length]);
    car.position.set(0, 0.01, -7);
    car.rotation.y = 0;
    this.scene.add(car);
    this.carGroup = car;

    const { x: tx, z: tz } = slotPos(slotIdx);
    const turnDir = isLeftSide(slotIdx) ? 1 : -1;

    this._runPath(car, [{ x: 0, z: -7 }, { x: 0, z: -1.5 }], 1500, () => {
      if (onGate) onGate('scan');
      this.entryTarget = 1.4;
      setTimeout(() => {
        const path2 = [{ x: 0, z: -1.5 }, { x: 0, z: tz }, { x: tx, z: tz }];
        this._runPath(car, path2, 3000, () => {
          car.rotation.y = carRotation(slotIdx, 'parked');
          this.animating = false;
          this.parkedCars[slotIdx] = car;
          this.carGroup = null;
          if (cb) cb();
        });
        setTimeout(() => { this.entryTarget = 0; }, 1200);
      }, 1200);
    });
  }

  playExit(slotIdx, cb, onGate) {
    if (this.animating) return;
    this.animating = true;

    this.removeCar(slotIdx);

    const car = this._makeCar(colors[slotIdx % colors.length]);
    const { x: fx, z: fz } = slotPos(slotIdx);
    car.position.set(fx, 0.01, fz);
    car.rotation.y = carRotation(slotIdx, 'parked');
    this.scene.add(car);
    this.carGroup = car;

    const path1 = [{ x: fx, z: fz }, { x: 0, z: fz }, { x: 0, z: 11.5 }];
    this._runPath(car, path1, 2500, () => {
      if (onGate) onGate('scan');
      this.exitTarget = 1.4;
      setTimeout(() => {
        this._runPath(car, [{ x: 0, z: 11.5 }, { x: 0, z: 18 }], 1500, () => {
          this.scene.remove(car);
          this.animating = false;
          this.carGroup = null;
          if (cb) cb();
        });
        setTimeout(() => { this.exitTarget = 0; }, 800);
      }, 1200);
    });
  }

  _runPath(car, path, dur, onDone) {
    const start = performance.now();
    const segs = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z;
      const l = Math.sqrt(dx * dx + dz * dz);
      segs.push(l);
      total += l;
    }

    const tick = () => {
      const t = clamp((performance.now() - start) / dur, 0, 1);
      const et = ease(t);
      let dist = et * total, acc = 0;
      for (let i = 0; i < segs.length; i++) {
        if (dist <= acc + segs[i]) {
          const st = segs[i] > 0 ? (dist - acc) / segs[i] : 0;
          car.position.x = lerp(path[i].x, path[i + 1].x, st);
          car.position.z = lerp(path[i].z, path[i + 1].z, st);

          const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            car.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
          }
          break;
        }
        acc += segs[i];
      }
      car.position.y = 0.01 + Math.sin(t * Math.PI * 5) * 0.003;

      if (t >= 1) {
        const last = path[path.length - 1];
        car.position.set(last.x, 0.01, last.z);
        if (onDone) onDone();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ─── CREATE A CAR AND PLACE IT IN A SLOT ──
  placeCar(slotIdx, color) {
    if (this.parkedCars[slotIdx]) return;
    const car = this._makeCar(color);
    const { x, z } = slotPos(slotIdx);
    car.position.set(x, 0.01, z);
    car.rotation.y = carRotation(slotIdx, 'parked');
    this.scene.add(car);
    this.parkedCars[slotIdx] = car;
  }

  // ─── REMOVE A PARKED CAR ──
  removeCar(slotIdx) {
    if (!this.parkedCars[slotIdx]) return;
    this.scene.remove(this.parkedCars[slotIdx]);
    delete this.parkedCars[slotIdx];
  }

  // ─── RECONCILE CARS WITH CURRENT SERVER STATE ──
  syncCars(occupied, regs) {
    if (this.animating) return;
    for (let i = 0; i < NS; i++) {
      if (occupied[i] && regs[i]) {
        if (!this.parkedCars[i]) {
          this.placeCar(i, colors[i % colors.length]);
        }
      }
    }
    Object.keys(this.parkedCars).forEach(k => {
      const i = parseInt(k, 10);
      if (!occupied[i]) this.removeCar(i);
    });
  }

  // ─── UPDATE SLOTS ──
  setSlots(state, sel, booked) {
    this.slotState = [...state];
    const occ = state.filter(Boolean).length;
    const free = NS - occ;

    if (this.entryScreen) {
      this._updateGateCanvas(this.entryScreen.canvas, 'entry');
      this.entryScreen.texture.needsUpdate = true;
    }
    if (this.exitScreen) {
      this._updateGateCanvas(this.exitScreen.canvas, 'exit');
      this.exitScreen.texture.needsUpdate = true;
    }

    for (let i = 0; i < NS; i++) {
      const occupied = state[i];
      const isBooked = booked && booked[i];
      const led = this.leds[i];
      if (led) {
        const c = occupied ? 0xff3333 : isBooked ? 0xff8800 : 0x00ff44;
        led.material.color.setHex(c);
        led.material.emissive.setHex(c);
      }
      const mesh = this.slotMeshes[i];
      if (mesh) {
        if (occupied) {
          mesh.material.color.setHex(0x551818);
          mesh.material.opacity = 0.7;
        } else if (isBooked) {
          mesh.material.color.setHex(0x553d18);
          mesh.material.opacity = 0.55;
        } else if (sel === i) {
          mesh.material.color.setHex(0x2a1a6a);
          mesh.material.opacity = 0.8;
        } else {
          mesh.material.color.setHex(0x1e1e44);
          mesh.material.opacity = 0.35;
        }
      }
    }
  }

  // ─── LOOP ──
  animate() {
    requestAnimationFrame(() => this.animate());
    const t = Date.now() * 0.001;

    this.entryAngle += (this.entryTarget - this.entryAngle) * 0.05;
    if (this.entryBar) this.entryBar.rotation.z = this.entryAngle;
    this.exitAngle += (this.exitTarget - this.exitAngle) * 0.05;
    if (this.exitBar) this.exitBar.rotation.z = this.exitAngle;

    for (let i = 0; i < NS; i++) {
      const led = this.leds[i];
      if (led && this.slotState[i]) {
        led.material.emissiveIntensity = 0.8 + Math.sin(t * 2.5 + i * 1.2) * 0.3;
      } else if (led) {
        led.material.emissiveIntensity = 0.4 + Math.sin(t * 1.5 + i) * 0.15;
      }
    }

    if (this.particles) {
      const pos = this.particles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const i3 = i * 3;
        pos.array[i3 + 1] += Math.sin(t + i) * 0.0004;
        pos.array[i3] += Math.cos(t * 0.7 + i * 0.3) * 0.0003;
      }
      pos.needsUpdate = true;
    }

    this.controls.update();
    this.composer.render();
  }

  resize(w, h) {
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }
}
