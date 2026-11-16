// Extra detail for the 3D office: clutter, wall decor, personalised desks,
// a city view, a live wall clock and a lounge corner.
import * as THREE from "three";

type Mat = (c: number, o?: Partial<THREE.MeshStandardMaterialParameters>) => THREE.MeshStandardMaterial;
type Box = (w: number, h: number, d: number, m: THREE.Material, x?: number, y?: number, z?: number, parent?: THREE.Object3D) => THREE.Mesh;

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, canvas: c };
};

export function buildDecor(scene: THREE.Scene, mat: Mat, box: Box, desks: Record<string, THREE.Vector3>) {
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 16) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); c.castShadow = true; c.receiveShadow = true; scene.add(c); return c;
  };
  const plane = (w: number, h: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; scene.add(p); return p;
  };

  // ── Window view: city skyline that changes with time of day ──
  const view = canvasTex(256, 160, () => {});
  const drawView = (tod: string) => {
    const g = view.canvas.getContext("2d")!;
    const sky = { morning: ["#bfe3fb", "#8fcbf2"], afternoon: ["#9fd1f5", "#6db7ea"], evening: ["#ffb26b", "#e0663a"], night: ["#0b1030", "#1d2350"] }[tod]!;
    const grd = g.createLinearGradient(0, 0, 0, 160); grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]);
    g.fillStyle = grd; g.fillRect(0, 0, 256, 160);
    if (tod === "night") { g.fillStyle = "#f4f1c9"; g.beginPath(); g.arc(200, 30, 10, 0, 7); g.fill(); }
    else { g.fillStyle = tod === "evening" ? "#ffd27a" : "#fff3b0"; g.beginPath(); g.arc(60, tod === "evening" ? 95 : 35, 12, 0, 7); g.fill(); }
    // twin towers + skyline silhouette
    const bld = [[0, 70, 26], [24, 92, 20], [42, 60, 30], [70, 105, 18], [86, 40, 14], [98, 40, 14], [110, 80, 26], [134, 64, 22], [154, 110, 30], [182, 72, 20], [200, 96, 28], [226, 66, 30]];
    g.fillStyle = tod === "night" ? "#151a3f" : tod === "evening" ? "#6a3b4f" : "#5a7aa5";
    bld.forEach(([x, top, w]) => g.fillRect(x, top, w, 160 - top));
    g.fillStyle = tod === "night" ? "#ffd56b" : "rgba(255,255,255,.35)";
    bld.forEach(([x, top, w]) => {
      for (let yy = top + 6; yy < 150; yy += 9) for (let xx = x + 3; xx < x + w - 3; xx += 6)
        if ((xx * 7 + yy * 3) % 5 < (tod === "night" ? 2 : 3)) g.fillRect(xx, yy, 3, 4);
    });
    // trees in front
    g.fillStyle = tod === "night" ? "#0f2a1c" : "#2e7d4f";
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(14 + i * 30, 152, 16, 0, 7); g.fill(); }
    view.tex.needsUpdate = true;
  };
  const viewM = new THREE.MeshBasicMaterial({ map: view.tex });
  plane(2.0, 1.2, viewM, 2.6, 1.75, -3.97);
  // curtains
  const curtain = mat(0xd9c6a5, { roughness: 1 });
  box(0.35, 1.7, 0.08, curtain, 1.25, 1.65, -3.9); box(0.35, 1.7, 0.08, curtain, 3.95, 1.65, -3.9);
  cyl(0.02, 0.02, 3.2, mat(0x888888), 2.6, 2.55, -3.88).rotation.z = Math.PI / 2;

  // ── Wall clock (live time) ──
  const clock = canvasTex(128, 128, () => {});
  const drawClock = () => {
    const g = clock.canvas.getContext("2d")!; const now = new Date();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#2b2e5c"; g.stroke();
    g.fillStyle = "#2b2e5c";
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4); }
    const hand = (a: number, len: number, w: number, c: string) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len); g.stroke(); };
    hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2, 28, 5, "#2b2e5c");
    hand(now.getMinutes() / 60 * Math.PI * 2, 42, 3, "#2b2e5c");
    hand(now.getSeconds() / 60 * Math.PI * 2, 46, 1.5, "#e0663a");
    clock.tex.needsUpdate = true;
  };
  drawClock();
  const clockMesh = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), new THREE.MeshStandardMaterial({ map: clock.tex }));
  clockMesh.position.set(-0.95, 2.42, -3.98); scene.add(clockMesh);

  // ── Neon lab sign ──
  const sign = canvasTex(512, 96, (g) => {
    g.fillStyle = "rgba(0,0,0,0)"; g.fillRect(0, 0, 512, 96);
    g.font = "bold 58px sans-serif"; g.fillStyle = "#ffd34d"; g.textAlign = "center"; g.fillText("LUMEN LAB", 256, 68);
  });
  const signM = new THREE.MeshStandardMaterial({ map: sign.tex, transparent: true, emissive: 0xffc43d, emissiveMap: sign.tex, emissiveIntensity: 0.9 });
  plane(1.5, 0.29, signM, 0.5, 2.15, -3.97);

  // ── Pinboard with sticky notes and photos (back wall, left) ──
  box(1.3, 0.85, 0.05, mat(0xb58a5a, { roughness: 1 }), -0.95, 1.55, -3.97 + 0.02);
  const notes = [0xfff176, 0xff8a80, 0x80deea, 0xa5d6a7, 0xffcc80, 0xce93d8, 0xfff176];
  notes.forEach((c, i) => {
    const n = box(0.2, 0.2, 0.01, mat(c, { roughness: 1 }), -1.4 + (i % 4) * 0.3, 1.75 - Math.floor(i / 4) * 0.32, -3.92);
    n.rotation.z = ((i * 37) % 7 - 3) * 0.04;
  });
  box(0.28, 0.2, 0.01, mat(0xffffff), -0.6, 1.3, -3.92); // photo
  box(0.24, 0.16, 0.012, mat(0x5b8fd1), -0.6, 1.3, -3.915);

  // ── Framed posters on the left wall ──
  const poster = (lines: string[], bg: string, fg: string) =>
    canvasTex(160, 220, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, 160, 220);
      g.fillStyle = fg; g.font = "bold 22px sans-serif"; g.textAlign = "center";
      lines.forEach((l, i) => g.fillText(l, 80, 70 + i * 34));
      g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(12, 12, 136, 196);
    }).tex;
  [[["TRUST", "IS", "EARNED"], "#7c5cff", "#ffffff", -1.4], [["ASK", "BETTER", "QUESTIONS"], "#1fa67a", "#ffffff", 1.6]].forEach(([lines, bg, fg, z]) => {
    box(0.06, 1.0, 0.75, mat(0x2b2b2b), -4.98, 1.55, z as number);
    const p = plane(0.66, 0.9, new THREE.MeshStandardMaterial({ map: poster(lines as string[], bg as string, fg as string) }), -4.94, 1.55, z as number, Math.PI / 2);
    p.receiveShadow = true;
  });

  // ── Pendant lights ──
  const pendants: THREE.PointLight[] = [];
  [[-2.2, 0.8], [2.2, 0.8], [0, -2.0]].forEach(([x, z]) => {
    const l = new THREE.PointLight(0xffd8a0, 0, 5, 1.5); l.position.set(x, 2.6, z); scene.add(l); pendants.push(l);
  });

  // ── Lounge corner light (the KayKit sofa, table and lamp are loaded in SimOffice) ──
  const floorLamp = new THREE.PointLight(0xffc77a, 0, 4, 1.6); floorLamp.position.set(-4.55, 1.5, 3.7); scene.add(floorLamp); pendants.push(floorLamp);

  // ── Office furniture ──
  // filing cabinet + printer (left wall)
  box(0.55, 1.0, 0.6, mat(0x9aa0b4, { metalness: 0.4, roughness: 0.5 }), -4.65, 0.5, -0.9);
  [0.25, 0.55, 0.85].forEach((y) => box(0.02, 0.05, 0.25, mat(0x555555), -4.36, y, -0.9));
  box(0.5, 0.25, 0.42, mat(0xe9e9e9), -4.65, 1.13, -0.9); box(0.3, 0.02, 0.25, mat(0xffffff), -4.6, 1.27, -0.9);
  // water cooler (right)
  box(0.35, 0.9, 0.35, mat(0xeeeeee), 4.55, 0.45, 0.6);
  const jug = cyl(0.15, 0.15, 0.45, new THREE.MeshStandardMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.55, roughness: 0.1 }), 4.55, 1.13, 0.6);
  jug.castShadow = false;
  // tall plant + trash bins
  cyl(0.18, 0.14, 0.35, mat(0xe9e4da), 4.55, 0.18, 3.55);
  cyl(0.03, 0.03, 1.0, mat(0x6b4a2b), 4.55, 0.8, 3.55, 8);
  [[0, 1.4, 0, 0.35], [0.15, 1.15, 0.1, 0.28], [-0.15, 1.2, -0.1, 0.26]].forEach(([dx, y, dz, r]) => {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x3a8f55, { flatShading: true })); l.position.set(4.55 + dx, y, 3.55 + dz); l.castShadow = true; scene.add(l);
  });
  [[-1.2, 1.35], [3.2, 1.35]].forEach(([x, z]) => cyl(0.13, 0.11, 0.3, mat(0x5a5a5a, { metalness: 0.3 }), x, 0.15, z));
  // papers on the floor near Siti's desk (she's a tough reviewer)
  [[2.9, 1.5, 0.3], [3.05, 1.65, -0.5]].forEach(([x, z, r]) => { const p = box(0.22, 0.005, 0.3, mat(0xffffff), x, 0.01, z); p.rotation.y = r; });

  // ── Personalised desks ──
  const top = (id: string) => desks[id];
  // Aiman: nameplate, mini trophy, coffee
  {
    const d = top("director");
    const np = canvasTex(256, 64, (g) => { g.fillStyle = "#2b2e5c"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#ffd34d"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.fillText("DIRECTOR", 128, 44); }).tex;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), [mat(0x2b2e5c), mat(0x2b2e5c), mat(0x2b2e5c), mat(0x2b2e5c), new THREE.MeshStandardMaterial({ map: np }), mat(0x2b2e5c)]);
    plate.position.set(d.x + 0.1, 0.83, d.z + 0.33); plate.rotation.x = -0.25; scene.add(plate);
    cyl(0.05, 0.03, 0.1, mat(0xffc93c, { metalness: 0.8, roughness: 0.25 }), d.x + 0.6, 0.86, d.z - 0.25);
    cyl(0.05, 0.05, 0.11, mat(0xffffff), d.x - 0.15, 0.84, d.z + 0.2, 12);
    cyl(0.035, 0.035, 0.005, mat(0x4a2c1a), d.x - 0.15, 0.895, d.z + 0.2, 12); // coffee
  }
  // Hajar: notebook stack, cactus, sticky notes on monitor
  {
    const d = top("associate");
    [[0x7c5cff, 0], [0x1fa67a, 0.035], [0xffd34d, 0.07]].forEach(([c, y], i) => {
      const b = box(0.28, 0.035, 0.36, mat(c as number), d.x + 0.55, 0.8 + (y as number), d.z + 0.15); b.rotation.y = i * 0.15;
    });
    cyl(0.06, 0.05, 0.08, mat(0xc96f4a), d.x + 0.05, 0.82, d.z + 0.3, 12);
    cyl(0.035, 0.04, 0.12, mat(0x3a8f55), d.x + 0.05, 0.92, d.z + 0.3, 10);
    [0xfff176, 0xff8a80].forEach((c, i) => {
      const n = box(0.07, 0.07, 0.005, mat(c), d.x - 0.32 + i * 0.09, 1.08, d.z + 0.02);
      n.rotation.y = 0.45;
    });
  }
  // Siti: paper pile, red pen, "REVIEW" tray
  {
    const d = top("reviewer");
    for (let i = 0; i < 6; i++) { const p = box(0.24, 0.012, 0.32, mat(0xffffff), d.x + 0.5, 0.79 + i * 0.013, d.z + 0.15); p.rotation.y = ((i * 29) % 5 - 2) * 0.06; }
    const pen = cyl(0.008, 0.008, 0.16, mat(0xd32f2f), d.x + 0.2, 0.795, d.z + 0.3, 8); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5;
    box(0.3, 0.05, 0.36, mat(0x333333), d.x - 0.05, 0.8, d.z + 0.25);
    box(0.26, 0.01, 0.32, mat(0xfff7e0), d.x - 0.05, 0.83, d.z + 0.25);
    cyl(0.05, 0.05, 0.11, mat(0xe0663a), d.x + 0.3, 0.84, d.z - 0.25, 12); // her mug
  }

  return {
    setTod: (tod: string) => {
      drawView(tod);
      const on = tod === "evening" ? 1.4 : tod === "night" ? 2.6 : 0;
      pendants.forEach((l) => (l.intensity = on));
    },
    tick: () => drawClock(),
  };
}
