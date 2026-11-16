"use client";
// 3D "Sims-style" office for the Claude lab replay (three.js).
// The team sits at desks, stands up, walks over to hand in papers, and
// reacts with thought bubbles. A golden marker floats over whoever is active.
// Characters: Kenney (CC0). Furniture: KayKit Furniture Bits by Kay Lousberg (CC0).
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { AGENTS, type AgentId, type Phase } from "@/lib/company";
import { buildDecor } from "./officeDecor";

export type OfficeTurn = {
  key: number;
  phase: Phase;
  agent: AgentId;
  verdict?: "APPROVE" | "REVISE";
  decision?: "ACCEPT" | "SHELVE";
  scanPick?: string;
};

// How long each phase's animation runs before the dialogue starts typing (at 1×)
export const CHOREO_MS: Record<Phase, number> = {
  PLAN: 1200,
  DRAFT: 1200,
  REVIEW: 4400,
  REVISE: 1200,
  DECIDE: 4200,
  SCAN: 3600,
};

const IDS: AgentId[] = ["director", "associate", "reviewer"];
const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);

// Layout (floor is x -5..5, z -4..4; camera looks from +x +z)
const DESK = { director: V(0, -2.0), associate: V(-2.2, 0.8), reviewer: V(2.2, 0.8) };
const SEAT = { director: V(0, -2.75), associate: V(-2.2, 0.05), reviewer: V(2.2, 0.05) };
const SIDE = (a: AgentId) => V(SEAT[a].x + 1.1, SEAT[a].z); // beside someone's chair
const AISLE = (a: AgentId) => V(DESK[a].x + 1.1, DESK[a].z + 1.0); // in front of a desk
const BOARD_SPOT = V(-2.6, -3.3);

const LOOK: Record<AgentId, { hair: number; long?: boolean; glasses?: boolean; skin: number }> = {
  director: { hair: 0x1c130d, skin: 0xd9a77e },
  associate: { hair: 0x2a1a10, long: true, skin: 0xe2b48c },
  reviewer: { hair: 0x141010, long: true, glasses: true, skin: 0xcf9e74 },
};
const ICON: Record<Phase, string> = { PLAN: "💡", DRAFT: "⌨️", REVIEW: "🔍", REVISE: "✏️", DECIDE: "⚖️", SCAN: "📡" };

type Sim = {
  id: AgentId;
  root: THREE.Group;
  hips: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  path: THREE.Vector3[];
  seated: number; // 0 standing … 1 seated
  wantSeated: boolean;
  typing: boolean;
  face: number; // target yaw
  react: { kind: "nod" | "shake" | "cheer" | null; t0: number };
  rig?: { bones: Record<string, THREE.Bone>; rest: Record<string, THREE.Quaternion>; holder: THREE.Group };
};

export default function SimOffice({
  turn, trophies, cycleNo, speed,
}: { turn: OfficeTurn | null; trophies: number; cycleNo: number; speed: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<any>(null);
  const [labels, setLabels] = useState<Record<string, { x: number; y: number; hx: number; hy: number; show: boolean }>>({});
  const [stamp, setStamp] = useState<{ text: string; tone: string } | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [lock, setLock] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // ── Build the scene once ──
  useEffect(() => {
    const el = mount.current!;
    const W = el.clientWidth, H = Math.round(W * 0.78);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1c38);
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
    camera.position.set(8.4, 7.6, 9.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.6, -0.5);
    controls.enablePan = false;
    controls.minDistance = 6; controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 2.3;
    controls.minAzimuthAngle = -0.15; controls.maxAzimuthAngle = Math.PI / 2 + 0.15;
    controls.enabled = false;
    controls.update();

    // ── Lights ──
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6b5240, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const lamps: THREE.PointLight[] = [];

    const mat = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
    };

    // ── Room ──
    const planks = document.createElement("canvas");
    planks.width = 256; planks.height = 256;
    const pg = planks.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      pg.fillStyle = ["#b07c50", "#a8744a", "#b88456", "#a06d44"][i % 4];
      pg.fillRect(0, i * 32, 256, 32);
      pg.fillStyle = "rgba(0,0,0,.18)"; pg.fillRect(0, i * 32, 256, 2);
      pg.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
    }
    const floorTex = new THREE.CanvasTexture(planks);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    box(10, 0.3, 0.3, mat(0x3a2a20), 0, -0.15, 4.15); // floor edge
    box(0.3, 0.3, 8.3, mat(0x3a2a20), 5.15, -0.15, 0);

    const wallM = mat(0x6d7bb8);
    box(10, 3, 0.15, wallM, 0, 1.5, -4.07);
    box(0.15, 3, 8, mat(0x5a68a6), -5.07, 1.5, 0);
    box(10, 0.15, 0.17, mat(0xf3efe6), 0, 0.075, -3.98); // baseboards
    box(0.17, 0.15, 8, mat(0xf3efe6), -4.98, 0.075, 0);

    // window on back wall
    const skyM = new THREE.MeshBasicMaterial({ color: 0x9fd3f5 });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.2), skyM);
    sky.position.set(2.6, 1.75, -3.98); scene.add(sky);
    const frameM = mat(0xf3efe6);
    box(2.2, 0.08, 0.1, frameM, 2.6, 2.39, -3.95); box(2.2, 0.08, 0.1, frameM, 2.6, 1.11, -3.95);
    box(0.08, 1.36, 0.1, frameM, 1.5, 1.75, -3.95); box(0.08, 1.36, 0.1, frameM, 3.7, 1.75, -3.95);
    box(0.06, 1.2, 0.08, frameM, 2.6, 1.75, -3.95);

    // whiteboard (opportunity radar) on back wall
    const wb = document.createElement("canvas"); wb.width = 256; wb.height = 160;
    const wbg = wb.getContext("2d")!;
    const wbTex = new THREE.CanvasTexture(wb); wbTex.colorSpace = THREE.SRGBColorSpace;
    const drawBoard = (mode: "idle" | "sweep" | "lock", t = 0, pick = "") => {
      wbg.fillStyle = "#f7f9fc"; wbg.fillRect(0, 0, 256, 160);
      wbg.fillStyle = "#2b2e5c"; wbg.font = "bold 16px monospace"; wbg.fillText("OPPORTUNITY RADAR", 12, 22);
      wbg.strokeStyle = "#1fa67a"; wbg.lineWidth = 2;
      [20, 38, 56].forEach((r) => { wbg.beginPath(); wbg.arc(128, 98, r, 0, Math.PI * 2); wbg.stroke(); });
      if (mode === "sweep") {
        wbg.beginPath(); wbg.moveTo(128, 98); wbg.lineTo(128 + Math.cos(t) * 56, 98 + Math.sin(t) * 56); wbg.lineWidth = 4; wbg.stroke();
      }
      if (mode === "lock") {
        wbg.fillStyle = "#e0663a"; wbg.beginPath(); wbg.arc(158, 80, 7, 0, Math.PI * 2); wbg.fill();
        wbg.fillStyle = "#2b2e5c"; wbg.font = "12px monospace"; wbg.fillText((pick || "LOCKED").slice(0, 30), 12, 150);
      }
      wbTex.needsUpdate = true;
    };
    drawBoard("idle");
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.12), new THREE.MeshStandardMaterial({ map: wbTex, roughness: 0.4 }));
    board.position.set(-2.6, 1.6, -3.98); scene.add(board);
    box(1.9, 0.06, 0.12, mat(0x9aa0b4), -2.6, 1.0, -3.93);

    // trophy shelf on left wall
    box(0.35, 0.06, 3.2, mat(0x7a4e2d), -4.8, 2.45, 0.2);
    const trophyGroup = new THREE.Group(); scene.add(trophyGroup);
    const gold = mat(0xffc93c, { metalness: 0.8, roughness: 0.25 });
    const setTrophies = (n: number) => {
      trophyGroup.clear();
      for (let i = 0; i < Math.min(n, 10); i++) {
        const g = new THREE.Group();
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.16, 16), gold);
        cup.position.y = 0.17; cup.castShadow = true;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), gold); stem.position.y = 0.06;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.14), mat(0x3a2a20)); base.position.y = 0.015;
        g.add(cup, stem, base);
        g.position.set(-4.78, 2.48, -1.2 + i * 0.3);
        trophyGroup.add(g);
      }
    };

    // decor: rug, plant, bookshelf, coffee corner
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.6), mat(0x8c3b4a));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.receiveShadow = true; scene.add(rug);
    const rug2 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), mat(0xb5566a));
    rug2.rotation.x = -Math.PI / 2; rug2.position.set(0, 0.012, 0.6); rug2.receiveShadow = true; scene.add(rug2);
    const plant = (x: number, z: number) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 16), mat(0xc96f4a)); pot.position.set(x, 0.2, z); pot.castShadow = true; scene.add(pot);
      [[0, 0.75, 0, 0.32], [0.14, 0.62, 0.1, 0.24], [-0.15, 0.6, -0.05, 0.24]].forEach(([dx, y, dz, r]) => {
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x2e9d5b, { flatShading: true })); l.position.set(x + dx, y, z + dz); l.castShadow = true; scene.add(l);
      });
    };
    plant(1.3, -3.55);
    box(1.4, 0.9, 0.6, mat(0xe9e4da), 4.2, 0.45, -3.6); // counter
    box(0.3, 0.4, 0.3, mat(0x222222), 4.0, 1.1, -3.6); // coffee machine
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), mat(0xffffff)); mug.position.set(4.5, 0.96, -3.55); scene.add(mug);

    // ── Desks, chairs, monitors ──
    const screens: Record<string, THREE.MeshStandardMaterial> = {};
    const deskTop: Record<string, THREE.Vector3> = {};
    IDS.forEach((id) => {
      const d = DESK[id], s = SEAT[id];
      const wood = mat(0xd8b48a, { roughness: 0.6 });
      box(1.7, 0.06, 0.85, wood, d.x, 0.75, d.z);
      [[-0.78, -0.36], [0.78, -0.36], [-0.78, 0.36], [0.78, 0.36]].forEach(([dx, dz]) => box(0.06, 0.72, 0.06, mat(0x444444), d.x + dx, 0.36, d.z + dz));
      box(1.6, 0.4, 0.04, mat(new THREE.Color(AGENTS[id].color).getHex()), d.x, 0.5, d.z + 0.4); // modesty panel in agent colour
      // monitor (offset to the side so we can see faces)
      const mon = new THREE.Group(); mon.position.set(d.x - 0.55, 0.78, d.z - 0.05); scene.add(mon);
      box(0.06, 0.25, 0.06, mat(0x333333), 0, 0.12, 0, mon);
      box(0.62, 0.38, 0.04, mat(0x222222), 0, 0.42, 0, mon);
      const sm = new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0x112244, emissiveIntensity: 0.6 });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), sm); scr.position.set(0, 0.42, -0.021); scr.rotation.y = Math.PI; mon.add(scr);
      mon.rotation.y = 0.45;
      screens[id] = sm;
      box(0.45, 0.02, 0.15, mat(0x333333), d.x - 0.05, 0.79, d.z - 0.2); // keyboard
      deskTop[id] = new THREE.Vector3(d.x + 0.35, 0.8, d.z + 0.1);
      // desk lamp (lights up at night)
      const lamp = new THREE.PointLight(0xffc77a, 0, 3.5, 1.6); lamp.position.set(d.x + 0.7, 1.25, d.z - 0.2); scene.add(lamp); lamps.push(lamp);
      box(0.04, 0.45, 0.04, mat(0x333333), d.x + 0.7, 1.0, d.z - 0.2);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 16, 1, true), mat(0xf0ad4e, { side: THREE.DoubleSide })); shade.position.set(d.x + 0.7, 1.25, d.z - 0.2); scene.add(shade);
      // chair (behind the desk, facing the camera)
      const ch = new THREE.Group(); ch.position.copy(s); scene.add(ch);
      box(0.5, 0.08, 0.48, mat(0x2b2e5c), 0, 0.48, 0, ch);
      box(0.5, 0.55, 0.07, mat(0x2b2e5c), 0, 0.8, -0.24, ch);
      box(0.05, 0.42, 0.05, mat(0x777777), 0, 0.22, 0, ch);
      box(0.5, 0.04, 0.06, mat(0x777777), 0, 0.03, 0, ch);
      box(0.06, 0.04, 0.5, mat(0x777777), 0, 0.03, 0, ch);
    });

    const decor = buildDecor(scene, mat, box, DESK);

    // ── People ──
    const sims: Record<AgentId, Sim> = {} as any;
    IDS.forEach((id) => {
      const L = LOOK[id];
      const skin = mat(L.skin, { roughness: 0.6 });
      const shirt = mat(new THREE.Color(AGENTS[id].color).getHex(), { roughness: 0.7 });
      const pants = mat(0x2b2e5c);
      const root = new THREE.Group();
      const hips = new THREE.Group(); hips.position.y = 0.9; root.add(hips);
      const limb = (r: number, len: number, m: THREE.Material) => {
        const g = new THREE.Group();
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
        c.position.y = -len / 2 - r * 0.5; c.castShadow = true; g.add(c); return g;
      };
      const legL = limb(0.085, 0.7, pants); legL.position.set(-0.1, 0, 0); hips.add(legL);
      const legR = limb(0.085, 0.7, pants); legR.position.set(0.1, 0, 0); hips.add(legR);
      [legL, legR].forEach((l) => { const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.24), mat(0x1b1b1b)); shoe.position.set(0, -0.86, 0.05); l.add(shoe); });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 14), shirt);
      torso.position.y = 0.32; torso.scale.set(1, 1, 0.75); torso.castShadow = true; hips.add(torso);
      const armL = limb(0.06, 0.48, shirt); armL.position.set(-0.27, 0.56, 0); hips.add(armL);
      const armR = limb(0.06, 0.48, shirt); armR.position.set(0.27, 0.56, 0); hips.add(armR);
      [armL, armR].forEach((a) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), skin); h.position.y = -0.62; a.add(h); });
      const head = new THREE.Group(); head.position.y = 0.82; hips.add(head);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), skin); skull.castShadow = true; head.add(skull);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), skin); neck.position.y = -0.18; head.add(neck);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(L.hair, { roughness: 0.9 }));
      hair.position.y = 0.02; hair.rotation.x = -0.25; head.add(hair);
      if (L.long) {
        const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.25, 4, 10), mat(L.hair, { roughness: 0.9 }));
        back.position.set(0, -0.1, -0.08); back.scale.set(1.1, 1, 0.6); head.add(back);
      }
      [-0.06, 0.06].forEach((x) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), mat(0x1b1b1b)); eye.position.set(x, 0.02, 0.155); head.add(eye);
      });
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), mat(0x7a3b2e)); smile.position.set(0, -0.06, 0.158); smile.rotation.z = Math.PI; head.add(smile);
      if (L.glasses) {
        [-0.06, 0.06].forEach((x) => { const g = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), mat(0x111111)); g.position.set(x, 0.02, 0.165); head.add(g); });
      }
      root.position.copy(SEAT[id]);
      scene.add(root);
      sims[id] = { id, root, hips, legL, legR, armL, armR, path: [], seated: 1, wantSeated: true, typing: false, face: 0, react: { kind: null, t0: 0 } };
    });

    // ── Real 3D models (loaded in the background; simple shapes show until they arrive) ──
    const loader = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath("/draco/"); loader.setDRACOLoader(draco);
    const texLoader = new THREE.TextureLoader();
    const CHAR: Record<AgentId, [string, string]> = {
      director: ["male", "aiman"], associate: ["skater-female", "hajar"], reviewer: ["skater-female", "siti"],
    };
    IDS.forEach((id) => {
      const [model, skin] = CHAR[id];
      loader.load(`/models/chars/${model}.gltf`, (g) => {
        const tex = texLoader.load(`/models/chars/${skin}.png`);
        tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
        const m = g.scene;
        m.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(m, true);
        m.scale.setScalar(1.72 / (bb.max.y - bb.min.y));
        m.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
            o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
          }
        });
        const holder = new THREE.Group(); holder.add(m); sims[id].root.add(holder);
        const bones: Record<string, THREE.Bone> = {}, rest: Record<string, THREE.Quaternion> = {};
        m.traverse((o: any) => { if (o.isBone) { bones[o.name] = o; rest[o.name] = o.quaternion.clone(); } });
        sims[id].rig = { bones, rest, holder };
        sims[id].hips.visible = false; // hide the simple-shape stand-in
      });
    });
    const qe = new THREE.Quaternion(), eu = new THREE.Euler();
    const pose = (rig: NonNullable<Sim["rig"]>, name: string, x: number, y: number, z: number) => {
      const b = rig.bones[name]; if (!b) return;
      eu.set(x, y, z); qe.setFromEuler(eu); b.quaternion.copy(rig.rest[name]).multiply(qe);
    };
    // Point a bone (e.g. an upper arm) along a direction given in the character's own space
    // (+x = character's left... in practice: x sideways, y up, z forward), whatever the rig's axes are.
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
    const _q = new THREE.Quaternion(), _pw = new THREE.Quaternion(), _bw = new THREE.Quaternion(), _rw = new THREE.Quaternion();
    const aim = (rig: NonNullable<Sim["rig"]>, root: THREE.Object3D, name: string, child: string, dir: THREE.Vector3) => {
      const b = rig.bones[name], c = rig.bones[child]; if (!b || !c || !b.parent) return;
      b.quaternion.copy(rig.rest[name]);
      b.updateMatrixWorld(true);
      b.getWorldPosition(_a); c.getWorldPosition(_b);
      _d.subVectors(_b, _a).normalize();
      root.getWorldQuaternion(_rw);
      _t.copy(dir).normalize().applyQuaternion(_rw);
      _q.setFromUnitVectors(_d, _t);
      b.parent.getWorldQuaternion(_pw);
      b.getWorldQuaternion(_bw);
      b.quaternion.copy(_pw.invert().multiply(_q.multiply(_bw)));
    };
    // KayKit furniture: fit each model to a target width and place it on the floor
    const kay = (file: string, x: number, z: number, rotY: number, width: number, y = 0) =>
      loader.load(`/models/furniture/${file}.gltf`, (g) => {
        const m = g.scene;
        const bb = new THREE.Box3().setFromObject(m);
        const size = bb.getSize(new THREE.Vector3());
        m.scale.setScalar(width / Math.max(size.x, size.z));
        m.rotation.y = rotY;
        m.position.set(x, y, z);
        m.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(m);
      });
    kay("rug_rectangle_stripes_A", -3.8, 2.55, Math.PI / 2, 2.2, 0.005);
    kay("couch_pillows", -4.55, 2.5, Math.PI / 2, 1.6);
    kay("table_low", -3.6, 2.5, Math.PI / 2, 0.85);
    kay("armchair_pillows", -3.35, 3.55, Math.PI, 0.85);
    kay("lamp_standing", -4.55, 3.7, 0, 0.45);
    kay("book_set", -3.6, 2.45, 0.3, 0.3, 0.38);
    kay("shelf_B_large_decorated", -4.7, -2.6, Math.PI / 2, 1.5);
    kay("cactus_medium_A", 3.6, -3.65, 0, 0.35);
    kay("pictureframe_medium", 4.3, -3.82, 0, 0.5, 0.92);

    // Lumen marker over the active person (an original golden pointer)
    const plumbM = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.2 });
    const plumbob = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), plumbM); cone.rotation.x = Math.PI; plumbob.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 24), plumbM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; plumbob.add(ring);
    scene.add(plumbob);

    // paper being carried / placed
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.3), mat(0xffffff, { roughness: 0.4 }));
    paper.castShadow = true; paper.visible = false; scene.add(paper);
    let paperOn: { carrier?: AgentId; at?: THREE.Vector3 } = {};

    // ── Animation state ──
    let active: AgentId | null = null;
    let events: { t: number; fn: () => void; done?: boolean }[] = [];
    let turnT = 0;
    let boardMode: "idle" | "sweep" | "lock" = "idle";
    let boardPick = "";
    let last = performance.now();
    let raf = 0;
    let frame = 0;
    const tmp = new THREE.Vector3();

    const walkTo = (id: AgentId, pts: THREE.Vector3[]) => { const s = sims[id]; s.wantSeated = false; s.path = pts.map((p) => p.clone()); };

    const setTurn = (t: OfficeTurn | null) => {
      // reset everyone to their chairs
      IDS.forEach((id) => {
        const s = sims[id];
        s.root.position.copy(SEAT[id]); s.path = []; s.wantSeated = true; s.react = { kind: null, t0: 0 }; s.seated = 1; s.typing = false; s.face = 0; s.root.rotation.y = 0;
        screens[id].emissiveIntensity = 0.6; screens[id].color.set(0x223355);
      });
      paper.visible = false; paperOn = {};
      boardMode = "idle"; drawBoard("idle");
      events = []; turnT = 0;
      active = t?.agent ?? null;
      if (!t) return;
      screens[t.agent].color.set(0x9fe6ff); screens[t.agent].emissiveIntensity = 1.4;
      const at = (ms: number, fn: () => void) => events.push({ t: ms, fn });
      switch (t.phase) {
        case "PLAN":
          break;
        case "DRAFT":
        case "REVISE":
          sims.associate.typing = true;
          at(500, () => { paper.visible = true; paperOn = { at: deskTop.associate }; });
          break;
        case "REVIEW":
        case "DECIDE": {
          const to: AgentId = t.phase === "REVIEW" ? "reviewer" : "director";
          paper.visible = true; paperOn = { carrier: "associate" };
          at(100, () => walkTo("associate", [SIDE("associate"), AISLE("associate"), AISLE(to), SIDE(to)]));
          at(3300, () => { paperOn = { at: deskTop[to] }; sims[to].face = 0; });
          if (t.phase === "REVIEW") at(3500, () => { sims.reviewer.react = { kind: t.verdict === "APPROVE" ? "nod" : "shake", t0: turnT }; });
          if (t.phase === "DECIDE") at(3400, () => {
            sims.director.react = { kind: t.decision === "SHELVE" ? "shake" : "cheer", t0: turnT };
            if (t.decision !== "SHELVE") sims.associate.react = { kind: "cheer", t0: turnT };
          });
          break;
        }
        case "SCAN":
          at(100, () => walkTo("director", [SIDE("director"), V(-1.4, -2.9), BOARD_SPOT]));
          at(1600, () => { boardMode = "sweep"; });
          at(3300, () => { boardMode = "lock"; boardPick = t.scanPick || ""; drawBoard("lock", 0, boardPick); });
          break;
      }
    };

    const setLighting = (tod: string) => {
      const L: Record<string, [number, number, number, number, number]> = {
        // sun colour, sun intensity, hemi intensity, sky colour, lamp intensity
        morning: [0xfff1dc, 2.2, 0.9, 0x9fd3f5, 0],
        afternoon: [0xffffff, 2.6, 1.0, 0x7cc0ee, 0],
        evening: [0xff9c5a, 1.5, 0.6, 0xf3a35f, 1.2],
        night: [0x6f7fd8, 0.35, 0.28, 0x14183a, 2.4],
      };
      const [sc, si, hi, skc, li] = L[tod];
      sun.color.set(sc); sun.intensity = si; hemi.intensity = hi; skyM.color.set(skc);
      lamps.forEach((l) => (l.intensity = li));
      decor.setTod(tod);
      sun.position.set(tod === "evening" ? 9 : 6, tod === "evening" ? 4 : 10, 4);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const sp = speedRef.current;
      turnT += dt * 1000 * sp;
      events.forEach((e) => { if (!e.done && turnT >= e.t) { e.done = true; e.fn(); } });
      const time = now / 1000;

      IDS.forEach((id) => {
        const s = sims[id];
        let moving = false;
        if (s.path.length) {
          const target = s.path[0];
          tmp.copy(target).sub(s.root.position); tmp.y = 0;
          const dist = tmp.length();
          const step = 3.0 * dt * sp;
          if (dist <= step) { s.root.position.copy(target); s.path.shift(); }
          else { tmp.normalize(); s.root.position.addScaledVector(tmp, step); s.face = Math.atan2(tmp.x, tmp.z); moving = true; }
          if (!s.path.length) {
            // arrived: face the person we came to see (or the board)
            if (s.root.position.distanceTo(BOARD_SPOT) < 0.05) s.face = Math.PI;
            else if (Math.abs(s.root.position.distanceTo(SEAT[id])) < 0.05) { s.face = 0; s.wantSeated = true; }
            else s.face = -Math.PI / 2;
          }
        }
        // turn smoothly
        let d = s.face - s.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        s.root.rotation.y += d * Math.min(1, dt * 10 * sp);
        // sit / stand blend
        const goal = s.wantSeated && !s.path.length ? 1 : 0;
        s.seated += (goal - s.seated) * Math.min(1, dt * 6 * sp);
        s.hips.position.y = 0.9 - 0.38 * s.seated;
        const legSit = -1.45 * s.seated;
        const swing = moving ? Math.sin(time * 11 * Math.sqrt(sp)) * 0.55 : 0;
        s.legL.rotation.x = legSit + swing; s.legR.rotation.x = legSit - swing;
        const typing = s.typing && s.seated > 0.8;
        const armBase = typing ? -1.1 : s.seated > 0.5 ? -0.5 : 0;
        const tap = typing ? Math.sin(time * 22) * 0.12 : 0;
        s.armL.rotation.x = armBase - swing * 0.8 + tap; s.armR.rotation.x = armBase + swing * 0.8 - tap;
        // breathing / idle bob
        s.hips.position.y += Math.sin(time * 2 + IDS.indexOf(id)) * 0.008;
        const r = s.rig;
        if (r) {
          const st = s.seated, k = IDS.indexOf(id);
          r.holder.position.y = -0.36 * st + Math.sin(time * 2 + k) * 0.006;
          const sw = swing * 0.9;
          pose(r, "LeftUpLeg", -1.5 * st + sw, 0, 0);
          pose(r, "RightUpLeg", -1.5 * st - sw, 0, 0);
          pose(r, "LeftLeg", 1.5 * st + (moving ? Math.max(0, -sw) * 1.2 : 0), 0, 0);
          pose(r, "RightLeg", 1.5 * st + (moving ? Math.max(0, sw) * 1.2 : 0), 0, 0);
          // reactions: nod, head shake, cheer
          const rt = (turnT - s.react.t0) / 1000;
          const live = s.react.kind && rt < 2.2;
          const cheer = live && s.react.kind === "cheer";
                    // a happy hop (standing) or bounce (seated), with arms raised
          if (cheer) r.holder.position.y += Math.abs(Math.sin(rt * 9)) * (st > 0.5 ? 0.04 : 0.14) * Math.max(0, 1 - rt / 2.2);
          const lift = cheer ? Math.min(1, rt * 4) * 2.3 : 0;
          // arms hang down (z, mirrored per side), swing / reach forward (x)
          // arms: hang down by the sides, swing a little when walking, reach forward when typing, up when cheering
          r.holder.updateMatrixWorld(true);
          const reach = typing ? 0.9 + tap : st > 0.5 ? 0.35 : 0;
          const up = lift / 2.3;
          const armDir = (side: number, swingSign: number) =>
            new THREE.Vector3(side * (0.18 + up * 0.35), -1 + up * 2.0 + reach * 0.6, sw * swingSign * 0.6 + reach);
          aim(r, s.root, "LeftArm", "LeftForeArm", armDir(1, 1));
          aim(r, s.root, "RightArm", "RightForeArm", armDir(-1, -1));

          let hx = Math.sin(time * 0.7 + k) * 0.05 + (typing ? 0.15 : 0), hy = Math.sin(time * 0.5 + k * 2) * 0.12;
          if (live && (s.react.kind === "nod" || cheer)) hx += Math.sin(rt * 12) * 0.25;
          if (live && s.react.kind === "shake") hy = Math.sin(rt * 14) * 0.45;
          pose(r, "Head", hx, hy, 0);
          pose(r, "Spine", typing ? 0.12 : 0, 0, 0);
        }
      });

      // paper follows carrier's hand
      if (paper.visible) {
        if (paperOn.carrier) {
          const s = sims[paperOn.carrier];
          paper.position.set(0.32, 0.95, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.root.rotation.y).add(s.root.position);
          paper.rotation.set(0, s.root.rotation.y, 0);
        } else if (paperOn.at) { paper.position.copy(paperOn.at); paper.rotation.set(0, 0.2, 0); }
      }

      // plumbob
      if (active) {
        plumbob.visible = true;
        const s = sims[active];
        plumbob.position.set(s.root.position.x, (s.rig ? 1.95 - 0.36 * s.seated : s.hips.position.y + 1.32) + Math.sin(time * 2.5) * 0.05, s.root.position.z);
        plumbob.rotation.y += dt * 2;
      } else plumbob.visible = false;

      if (boardMode === "sweep") drawBoard("sweep", time * 6);
      if (frame % 60 === 0) decor.tick();

      controls.update();
      renderer.render(scene, camera);

      // project head positions for HTML labels
      frame++;
      if (frame % 2 === 0) {
        const out: Record<string, { x: number; y: number; hx: number; hy: number; show: boolean }> = {};
        IDS.forEach((id) => {
          const s = sims[id];
          tmp.set(s.root.position.x, 0.05, s.root.position.z + 0.35).project(camera);
          const x = (tmp.x * 0.5 + 0.5) * 100, y = (-tmp.y * 0.5 + 0.5) * 100;
          tmp.set(s.root.position.x, s.hips.position.y + 1.05, s.root.position.z).project(camera);
          out[id] = { x, y, hx: (tmp.x * 0.5 + 0.5) * 100, hy: (-tmp.y * 0.5 + 0.5) * 100, show: tmp.z < 1 };
        });
        setLabels(out);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      const w = el.clientWidth, h = Math.round(w * 0.78);
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    api.current = { setTurn, setLighting, setTrophies, controls, renderer };
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  const tod = ["morning", "afternoon", "evening", "night"][(Math.max(cycleNo, 1) - 1) % 4];

  // ── React to turn / lighting / trophies ──
  useEffect(() => {
    api.current?.setLighting(tod);
  }, [tod]);
  useEffect(() => {
    api.current?.setTrophies(trophies);
  }, [trophies]);
  useEffect(() => {
    setStamp(null); setConfetti(false); setLock(false);
    api.current?.setTurn(turn);
    if (!turn) return;
    const ts: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => ts.push(setTimeout(fn, ms / speed));
    if (turn.phase === "REVIEW")
      at(3600, () => setStamp(turn.verdict === "APPROVE" ? { text: "APPROVED", tone: "good" } : { text: "REVISE", tone: "bad" }));
    if (turn.phase === "DECIDE")
      at(3500, () => {
        const ok = turn.decision !== "SHELVE";
        setStamp(ok ? { text: "ACCEPTED", tone: "gold" } : { text: "SHELVED", tone: "bad" });
        if (ok) setConfetti(true);
      });
    if (turn.phase === "SCAN") at(3400, () => setLock(true));
    return () => ts.forEach(clearTimeout);
  }, [turn?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (api.current) {
      api.current.controls.enabled = orbit;
      api.current.renderer.domElement.style.touchAction = orbit ? "none" : "pan-y";
    }
  }, [orbit]);

  return (
    <div className="sim-wrap">
      <div ref={mount} className="sim-canvas" />
      {/* name tags + thought bubble */}
      {IDS.map((id) => {
        const p = labels[id];
        if (!p?.show) return null;
        const isActive = turn?.agent === id;
        return (
          <div key={id}>
            {isActive && turn && (
              <div className="sim-think" style={{ left: `${p.hx}%`, top: `${p.hy}%` }}>{ICON[turn.phase]}</div>
            )}
            <div className="sim-tag" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <span style={{ borderColor: AGENTS[id].color }}>{AGENTS[id].name}</span>
            </div>
          </div>
        );
      })}
      {stamp && <div key={`${turn?.key}-s`} className={`po-stamp ${stamp.tone}`}>{stamp.text}</div>}
      {confetti && (
        <div className="po-confetti" key={`${turn?.key}-c`}>
          {Array.from({ length: 40 }).map((_, i) => (
            <i key={i} style={{
              left: `${(i * 37) % 100}%`,
              background: ["#ffd34d", "#7c5cff", "#1fa67a", "#e0663a", "#ff7aa8"][i % 5],
              animationDelay: `${(i % 9) * 0.07}s`, animationDuration: `${1.4 + (i % 5) * 0.25}s`,
            }} />
          ))}
        </div>
      )}
      {lock && turn?.scanPick && <div className="po-lock">🎯 Locked on: {turn.scanPick}</div>}
      <button className={`sim-cam ${orbit ? "on" : ""}`} onClick={() => setOrbit(!orbit)}>
        {orbit ? "✓ Drag to rotate · pinch to zoom" : "🎥 Move camera"}
      </button>
      <div className="po-tod">{tod} · cycle {cycleNo || "–"}</div>
    </div>
  );
}
