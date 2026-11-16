"use client";
// Isometric pixel office for the Claude lab replay.
// Each turn plays a short "choreography": walking, handing over papers,
// stamps, confetti, and a radar scan on the whiteboard.
import { useEffect, useRef, useState } from "react";
import { AGENTS, type AgentId, type Phase } from "@/lib/company";

type P = { x: number; y: number };

// Where each agent stands (in front of their desk) and where their desk is
const HOME: Record<AgentId, P> = {
  director: { x: 180, y: 158 },
  associate: { x: 92, y: 202 },
  reviewer: { x: 268, y: 202 },
};
const DESK: Record<AgentId, P> = {
  director: { x: 180, y: 132 },
  associate: { x: 92, y: 176 },
  reviewer: { x: 268, y: 176 },
};
// A spot next to someone's desk where a visitor stops
const VISIT: Record<AgentId, P> = {
  director: { x: 150, y: 166 },
  associate: { x: 122, y: 210 },
  reviewer: { x: 238, y: 210 },
};

const LOOK: Record<AgentId, { hair: string; glasses?: boolean; long?: boolean }> = {
  director: { hair: "#2b1d14" },
  associate: { hair: "#3a2416", long: true },
  reviewer: { hair: "#1e1a1a", long: true, glasses: true },
};

// How long each phase's animation takes before the dialogue starts typing (at 1×)
export const CHOREO_MS: Record<Phase, number> = {
  PLAN: 900,
  DRAFT: 900,
  REVIEW: 3000,
  REVISE: 900,
  DECIDE: 3000,
  SCAN: 2600,
};

export type OfficeTurn = {
  key: number;
  phase: Phase;
  agent: AgentId;
  verdict?: "APPROVE" | "REVISE";
  decision?: "ACCEPT" | "SHELVE";
  scanPick?: string;
};

export function PixelOffice({
  turn,
  trophies,
  cycleNo,
  speed,
}: {
  turn: OfficeTurn | null;
  trophies: number;
  cycleNo: number;
  speed: number;
}) {
  const [pos, setPos] = useState<Record<AgentId, P>>({ ...HOME });
  const [walking, setWalking] = useState<Record<AgentId, boolean>>({ director: false, associate: false, reviewer: false });
  const [paper, setPaper] = useState<P | null>(null);
  const [stamp, setStamp] = useState<{ text: string; tone: "bad" | "good" | "gold" } | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [bulb, setBulb] = useState(false);
  const [typing, setTyping] = useState<AgentId | null>(null);
  const [radar, setRadar] = useState<"off" | "sweep" | "lock">("off");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms / speed));
    const walk = (a: AgentId, to: P, ms: number) => {
      setWalking((w) => ({ ...w, [a]: true }));
      setPos((p) => ({ ...p, [a]: to }));
      at(ms, () => setWalking((w) => ({ ...w, [a]: false })));
    };

    // reset the stage
    setPos({ ...HOME });
    setStamp(null);
    setConfetti(false);
    setBulb(false);
    setTyping(null);
    setRadar("off");
    setPaper(null);
    if (!turn) return;

    const deskTop = (a: AgentId) => ({ x: DESK[a].x, y: DESK[a].y - 10 });

    switch (turn.phase) {
      case "PLAN":
        at(150, () => setBulb(true));
        break;
      case "DRAFT":
        setTyping("associate");
        at(400, () => setPaper(deskTop("associate")));
        break;
      case "REVIEW":
        setPaper({ x: HOME.associate.x, y: HOME.associate.y - 26 });
        at(50, () => walk("associate", VISIT.reviewer, 1200));
        at(60, () => setPaper({ x: VISIT.reviewer.x, y: VISIT.reviewer.y - 26 }));
        at(1300, () => setPaper(deskTop("reviewer")));
        at(1400, () => walk("associate", HOME.associate, 1200));
        at(1900, () =>
          setStamp(turn.verdict === "APPROVE" ? { text: "APPROVED", tone: "good" } : { text: "REVISE", tone: "bad" })
        );
        break;
      case "REVISE":
        setTyping("associate");
        setPaper(deskTop("associate"));
        break;
      case "DECIDE":
        setPaper({ x: HOME.associate.x, y: HOME.associate.y - 26 });
        at(50, () => walk("associate", VISIT.director, 1200));
        at(60, () => setPaper({ x: VISIT.director.x, y: VISIT.director.y - 26 }));
        at(1300, () => setPaper(deskTop("director")));
        at(1500, () => {
          const ok = turn.decision !== "SHELVE";
          setStamp(ok ? { text: "ACCEPTED", tone: "gold" } : { text: "SHELVED", tone: "bad" });
          if (ok) setConfetti(true);
        });
        at(1700, () => walk("associate", HOME.associate, 1200));
        break;
      case "SCAN":
        at(100, () => setRadar("sweep"));
        at(2000, () => setRadar("lock"));
        break;
    }
    return () => timers.current.forEach(clearTimeout);
  }, [turn?.key, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Morning → afternoon → evening → night, one step per cycle
  const tod = ["morning", "afternoon", "evening", "night"][(Math.max(cycleNo, 1) - 1) % 4];
  const sky = { morning: "#9fd3f5", afternoon: "#7cc0ee", evening: "#f3a35f", night: "#1d2350" }[tod];
  const tint = { morning: "rgba(0,0,0,0)", afternoon: "rgba(0,0,0,0)", evening: "rgba(255,140,60,0.10)", night: "rgba(20,30,90,0.32)" }[tod];
  const active = turn?.agent ?? null;

  return (
    <div className="po-wrap">
      <svg viewBox="0 0 360 262" className="po-svg" role="img" aria-label="Pixel office with the research team">
        {/* walls */}
        <polygon points="20,168 180,88 180,14 20,94" fill="#3b3f78" />
        <polygon points="180,88 340,168 340,94 180,14" fill="#454a8a" />
        {/* floor */}
        <polygon points="180,88 340,168 180,248 20,168" fill="#c79a6b" />
        {Array.from({ length: 9 }).map((_, i) => {
          const t = (i + 1) / 10;
          return (
            <g key={i} stroke="#b0845a" strokeWidth="0.7">
              <line x1={180 - 160 * t} y1={88 + 80 * t} x2={340 - 160 * t} y2={168 + 80 * t} />
              <line x1={180 + 160 * t} y1={88 + 80 * t} x2={20 + 160 * t} y2={168 + 80 * t} />
            </g>
          );
        })}
        {/* window (right wall) shows time of day */}
        <polygon points="250,58 300,83 300,118 250,93" fill={sky} stroke="#2b2e5c" strokeWidth="3" />
        {tod === "night" && <circle cx="285" cy="88" r="5" fill="#f4f1c9" />}
        {(tod === "morning" || tod === "afternoon") && <circle cx="266" cy="76" r="5" fill="#ffe27a" />}
        {/* whiteboard (right wall) for the opportunity scan */}
        <polygon points="196,40 238,61 238,96 196,75" fill="#eef1f6" stroke="#2b2e5c" strokeWidth="2" />
        {radar !== "off" && (
          <g className={radar === "sweep" ? "po-radar sweep" : "po-radar"}>
            <circle cx="217" cy="68" r="11" fill="none" stroke="#1fa67a" strokeWidth="1" />
            <circle cx="217" cy="68" r="5" fill="none" stroke="#1fa67a" strokeWidth="1" />
            <line className="po-beam" x1="217" y1="68" x2="217" y2="57" stroke="#1fa67a" strokeWidth="2" />
            {radar === "lock" && <circle cx="223" cy="63" r="3" fill="#e0663a" className="po-blip" />}
          </g>
        )}
        {/* trophy shelf (left wall): one gold paper per accepted output */}
        <polygon points="40,118 150,63 150,67 40,122" fill="#7a4e2d" />
        {Array.from({ length: Math.min(trophies, 8) }).map((_, i) => {
          const x = 48 + i * 13, y = 114 - i * 6.5;
          return (
            <g key={i} className={i === trophies - 1 ? "po-pop" : ""}>
              <rect x={x} y={y - 9} width="8" height="10" fill="#ffd34d" stroke="#b38f1d" strokeWidth="1" />
              <rect x={x + 2} y={y - 6} width="4" height="1" fill="#b38f1d" />
            </g>
          );
        })}
        {trophies > 8 && <text x="150" y="58" fontSize="8" fill="#ffd34d" textAnchor="end">+{trophies - 8}</text>}
        {/* lab sign */}
        <text x="100" y="72" fontSize="9" fill="#ffd34d" fontFamily="'Press Start 2P', monospace" transform="rotate(-26.6 100 72)">LUMEN</text>
        {/* plant */}
        <g transform="translate(320,170)">
          <rect x="-5" y="-6" width="10" height="8" fill="#8a5a3c" />
          <circle cx="0" cy="-12" r="7" fill="#2e9d5b" />
          <circle cx="-5" cy="-16" r="4" fill="#38b46a" />
        </g>

        {/* desks */}
        {(Object.keys(DESK) as AgentId[]).map((a) => (
          <IsoDesk key={a} p={DESK[a]} accent={AGENTS[a].color} glow={active === a} />
        ))}

        {/* paper being worked on / carried */}
        {paper && (
          <g style={{ transform: `translate(${paper.x}px, ${paper.y}px)`, transition: `transform ${1.2 / speed}s linear` }}>
            <rect x="-5" y="-6" width="10" height="12" fill="#fff" stroke="#9aa" strokeWidth="0.8" />
            <rect x="-3" y="-3" width="6" height="1" fill="#99a" />
            <rect x="-3" y="0" width="6" height="1" fill="#99a" />
            <rect x="-3" y="3" width="4" height="1" fill="#99a" />
          </g>
        )}

        {/* people, back to front */}
        {(["director", "associate", "reviewer"] as AgentId[])
          .sort((a, b) => pos[a].y - pos[b].y)
          .map((a) => (
            <Sprite
              key={a}
              id={a}
              p={pos[a]}
              walking={walking[a]}
              typing={typing === a}
              active={active === a}
              bulb={a === "director" && bulb}
              speed={speed}
            />
          ))}

        {/* time-of-day light */}
        <rect x="0" y="0" width="360" height="262" fill={tint} pointerEvents="none" />
      </svg>

      {stamp && <div key={`${turn?.key}-s`} className={`po-stamp ${stamp.tone}`}>{stamp.text}</div>}
      {confetti && (
        <div className="po-confetti" key={`${turn?.key}-c`}>
          {Array.from({ length: 36 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                background: ["#ffd34d", "#7c5cff", "#1fa67a", "#e0663a", "#ff7aa8"][i % 5],
                animationDelay: `${(i % 9) * 0.07}s`,
                animationDuration: `${1.4 + (i % 5) * 0.25}s`,
              }}
            />
          ))}
        </div>
      )}
      {radar === "lock" && turn?.scanPick && (
        <div className="po-lock">🎯 Locked on: {turn.scanPick}</div>
      )}
      <div className="po-tod">{tod} · cycle {cycleNo || "–"}</div>
    </div>
  );
}

function IsoDesk({ p, accent, glow }: { p: P; accent: string; glow: boolean }) {
  // a small isometric box: top + two faces
  const w = 26, d = 13, h = 12;
  const { x, y } = p;
  return (
    <g>
      <polygon points={`${x},${y - d} ${x + w},${y} ${x},${y + d} ${x - w},${y}`} fill="#a5683f" stroke={glow ? "#ffd34d" : "none"} strokeWidth={glow ? 1.5 : 0} />
      <polygon points={`${x - w},${y} ${x},${y + d} ${x},${y + d + h} ${x - w},${y + h}`} fill="#7d4c2c" />
      <polygon points={`${x + w},${y} ${x},${y + d} ${x},${y + d + h} ${x + w},${y + h}`} fill="#6a3f24" />
      <polygon points={`${x - w},${y + h - 2} ${x},${y + d + h - 2} ${x},${y + d + h} ${x - w},${y + h}`} fill={accent} />
      {/* laptop */}
      <polygon points={`${x - 6},${y - 4} ${x + 4},${y + 1} ${x + 4},${y - 8} ${x - 6},${y - 13}`} fill="#2b2e5c" />
      <polygon points={`${x - 5},${y - 5} ${x + 3},${y - 1} ${x + 3},${y - 7} ${x - 5},${y - 11}`} fill={glow ? "#9fe6ff" : "#5b6aa8"} />
    </g>
  );
}

function Sprite({
  id, p, walking, typing, active, bulb, speed,
}: {
  id: AgentId; p: P; walking: boolean; typing: boolean; active: boolean; bulb: boolean; speed: number;
}) {
  const look = LOOK[id];
  const color = AGENTS[id].color;
  return (
    <g style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: `transform ${1.2 / speed}s linear` }}>
      <ellipse cx="0" cy="1" rx="8" ry="3" fill="rgba(0,0,0,0.25)" />
      <g className={walking ? "po-walk" : active ? (typing ? "po-type" : "po-idle") : ""}>
        {/* legs */}
        <rect className="po-legL" x="-4" y="-8" width="3" height="8" fill="#2b2e5c" />
        <rect className="po-legR" x="1" y="-8" width="3" height="8" fill="#2b2e5c" />
        {/* body */}
        <rect x="-6" y="-20" width="12" height="13" fill={color} />
        <rect className="po-arm" x="-8" y="-19" width="2" height="9" fill={color} />
        <rect className="po-arm2" x="6" y="-19" width="2" height="9" fill={color} />
        {/* head */}
        <rect x="-5" y="-30" width="10" height="10" fill="#f1c27d" />
        <rect x="-5" y="-31" width="10" height="4" fill={look.hair} />
        {look.long && <rect x="-6" y="-29" width="2" height="9" fill={look.hair} />}
        {look.long && <rect x="4" y="-29" width="2" height="9" fill={look.hair} />}
        <rect x="-3" y="-25" width="2" height="2" fill="#222" />
        <rect x="1" y="-25" width="2" height="2" fill="#222" />
        {look.glasses && <rect x="-4" y="-26" width="8" height="1" fill="#222" />}
      </g>
      {bulb && (
        <g className="po-pop" transform="translate(0,-40)">
          <circle cx="0" cy="0" r="5" fill="#ffe27a" stroke="#b38f1d" />
          <rect x="-2" y="4" width="4" height="3" fill="#888" />
        </g>
      )}
      {active && !bulb && <polygon points="-3,-38 3,-38 0,-34" fill="#ffd34d" className="po-arrow" />}
      <text y="12" textAnchor="middle" fontSize="7" fill="#fff" fontFamily="'Press Start 2P', monospace" stroke="#1b1b2f" strokeWidth="2" paintOrder="stroke">
        {AGENTS[id].name}
      </text>
    </g>
  );
}
