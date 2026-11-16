"use client";
import { useEffect, useMemo, useState } from "react";
import { AGENTS, COMPANY, PHASE_INFO, type AgentId, type Phase } from "@/lib/company";
import { PhaseBar } from "./Office";
import { PixelOffice, CHOREO_MS } from "./PixelOffice";
import { ACHIEVEMENTS, STAT_KEYS, XP_PER_LEVEL, unlockIndex, xpFor, type ReplayTurn, type Scores } from "@/lib/game";
import lab from "@/data/claude-lab.json";

// ── Shape of data/claude-lab.json (written by Claude after every cycle) ──
type Turn = { phase: Phase; agent: AgentId; summary: string; text: string };
type Opportunity = { name: string; demand: number; supply: number; reason: string; chosen: boolean };
type Cycle = {
  cycle: number;
  date: string;
  outputType: string;
  question: string;
  title: string;
  verdict: "APPROVE" | "REVISE";
  decision: "ACCEPT" | "SHELVE";
  summary: string;
  nextOutputType: string;
  scores?: { draft: Scores; final: Scores };
  turns: Turn[];
  opportunities: Opportunity[];
};
type Lab = { company: string; model: string; updated: string; cycles: Cycle[] };

const DATA = lab as unknown as Lab;
const SPEEDS = [1, 2, 4];

export default function ClaudeLab() {
  const turns: ReplayTurn[] = useMemo(
    () =>
      DATA.cycles.flatMap((c) =>
        c.turns.map((t) => ({ ...t, cycle: c.cycle, verdict: c.verdict, decision: c.decision, scores: c.scores }))
      ),
    []
  );
  const unlocks = useMemo(() => unlockIndex(turns), [turns]);

  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [chars, setChars] = useState(0);
  const [ready, setReady] = useState(false); // choreography finished, dialogue may type
  const [showFull, setShowFull] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cur = idx >= 0 ? turns[idx] : null;

  // 1) choreography delay, 2) typewriter
  useEffect(() => {
    setChars(0);
    setReady(false);
    if (!cur) return;
    const t = setTimeout(() => setReady(true), CHOREO_MS[cur.phase] / speed);
    return () => clearTimeout(t);
  }, [idx, speed, cur]);

  useEffect(() => {
    if (!ready || !cur) return;
    const id = setInterval(() => {
      setChars((c) => {
        if (c >= cur.summary.length) { clearInterval(id); return c; }
        return c + 2;
      });
    }, 28 / speed);
    return () => clearInterval(id);
  }, [ready, cur, speed]);

  // Achievement toast when the replay reaches the unlocking turn
  useEffect(() => {
    if (idx < 0) return;
    const got = ACHIEVEMENTS.find((a) => unlocks[a.id] === idx);
    if (!got) return;
    const t = setTimeout(() => setToast(got.id), (CHOREO_MS[turns[idx].phase] + 400) / speed);
    const t2 = setTimeout(() => setToast(null), (CHOREO_MS[turns[idx].phase] + 3800) / speed);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [idx, unlocks, turns, speed]);

  // Auto-advance
  const typed = !!cur && ready && chars >= cur.summary.length;
  useEffect(() => {
    if (!playing) return;
    if (idx >= turns.length - 1 && (typed || !cur)) { setPlaying(false); return; }
    if (cur && !typed) return;
    const t = setTimeout(() => setIdx((i) => i + 1), (cur ? 3200 : 500) / speed);
    return () => clearTimeout(t);
  }, [playing, typed, idx, cur, speed, turns.length]);

  if (!turns.length) {
    return (
      <div className="panel" style={{ marginTop: 14 }}>
        <h3 className="pixel">Claude lab</h3>
        <p className="empty">No Claude cycles yet. Ask Claude in your chat to “run a cycle”.</p>
      </div>
    );
  }

  const go = (i: number) => { setIdx(Math.max(-1, Math.min(turns.length - 1, i))); setShowFull(false); };
  const phase: Phase = cur?.phase ?? "PLAN";
  const cycle = cur ? DATA.cycles.find((c) => c.cycle === cur.cycle) : undefined;

  // XP and level up to the current turn
  const xp = turns.slice(0, idx + 1).reduce((s, t) => s + xpFor(t), 0);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const trophies = turns.slice(0, idx + 1).filter((t) => t.phase === "DECIDE" && t.decision !== "SHELVE").length;

  // Which scores to show for the current cycle
  let shown: Scores | null = null, prev: Scores | null = null;
  if (cur && cycle?.scores) {
    const order = ["PLAN", "DRAFT", "REVIEW", "REVISE", "DECIDE", "SCAN"];
    const p = order.indexOf(cur.phase);
    if (p >= 3 && ready) { shown = cycle.scores.final; prev = cycle.scores.draft; }
    else if (p >= 2 && (p > 2 || ready)) shown = cycle.scores.draft;
  }

  const finishedCycles = DATA.cycles.filter((c) => {
    const i = turns.findIndex((t) => t.cycle === c.cycle && t.phase === "SCAN");
    return i !== -1 && i <= idx;
  });
  const ach = toast ? ACHIEVEMENTS.find((a) => a.id === toast) : null;
  const agent = cur ? AGENTS[cur.agent] : null;

  return (
    <>
      <div className="sub" style={{ marginBottom: 6 }}>
        {cur
          ? <>Episode {cur.cycle}: <b>{cycle?.title}</b> · Turn {idx + 1}/{turns.length}</>
          : <>{DATA.cycles.length} cycles · {turns.length} turns · written by Claude. Press ▶ Play.</>}
      </div>

      <PixelOffice
        turn={cur ? { key: idx, phase: cur.phase, agent: cur.agent, verdict: cur.verdict, decision: cur.decision, scanPick: cycle?.nextOutputType } : null}
        trophies={trophies}
        cycleNo={cur?.cycle ?? 0}
        speed={speed}
      />

      {/* RPG-style dialogue box */}
      <div className="dlg">
        {agent ? (
          <>
            <div className="dlg-face" style={{ borderColor: agent.color }}>{agent.avatar}</div>
            <div>
              <div className="dlg-name" style={{ color: agent.color }}>{agent.name} · {PHASE_INFO[phase].label}</div>
              <div className="dlg-text">
                {ready ? cur!.summary.slice(0, chars) : <span className="thinking">…</span>}
              </div>
            </div>
            {typed && <span className="dlg-more">▼</span>}
          </>
        ) : (
          <div className="dlg-text">Welcome to {COMPANY.name}. Press ▶ Play to watch the team work.</div>
        )}
      </div>

      <div className="hud">
        <span className="lvl">LV {level}</span>
        <div className="xpbar" title={`${xp} XP`}><div style={{ width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` }} /></div>
        <span className="xptxt">{xp} XP · 🏆 {trophies}</span>
      </div>

      <div className="controls" style={{ marginBottom: 10 }}>
        <button className="btn ghost" aria-label="Previous turn" onClick={() => { setPlaying(false); go(idx - 1); }} disabled={idx < 0}>⏮</button>
        <button className={`btn ${playing ? "ghost on" : ""}`} onClick={() => {
          if (idx >= turns.length - 1) go(-1);
          setPlaying(!playing);
        }}>
          {playing ? "⏸ Pause" : idx >= turns.length - 1 ? "↺ Replay" : idx < 0 ? "▶ Play" : "▶ Resume"}
        </button>
        <button className="btn ghost" aria-label="Next turn" onClick={() => { setPlaying(false); go(idx + 1); }} disabled={idx >= turns.length - 1}>⏭</button>
        <button className="btn ghost" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>{speed}×</button>
        <button className="btn ghost" onClick={() => { setPlaying(false); go(turns.length - 1); }}>Latest ⏩</button>
      </div>

      <PhaseBar phase={phase} />

      <div className="grid">
        <div className="panel">
          <h3 className="pixel">Output stats</h3>
          {STAT_KEYS.map((s) => {
            const v = shown?.[s.key] ?? 0;
            const d = prev ? v - prev[s.key] : 0;
            return (
              <div className="stat" key={s.key}>
                <span>{s.label}</span>
                <div className="bar"><div style={{ width: `${(v / 5) * 100}%`, background: s.color }} /></div>
                <span>{shown ? `${v}/5` : "–"} {d > 0 && <span className="delta">+{d}</span>}</span>
              </div>
            );
          })}
          <p className="sub" style={{ marginTop: 8 }}>
            {shown ? (prev ? "After revision (Siti's scores)" : "First draft (Siti's scores)") : "Scored when Siti reviews the draft."}
          </p>
          <h3 className="pixel" style={{ marginTop: 14 }}>Achievements</h3>
          <div className="badges">
            {ACHIEVEMENTS.map((a) => (
              <span key={a.id} className={`badge ${unlocks[a.id] !== undefined && unlocks[a.id] <= idx ? "got" : ""}`} title={a.desc}>
                {a.icon} {a.name}
              </span>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3 className="pixel">This turn</h3>
          {cur ? (
            <>
              <div style={{ color: "var(--muted)", marginBottom: 8, fontSize: 12 }}>
                {agent!.avatar} {agent!.name} · {agent!.title} · Cycle {cur.cycle}
              </div>
              <div className="doc" style={{ maxHeight: showFull ? "none" : 360 }}>{cur.text}</div>
              {cur.text.length > 1200 && (
                <button className="tab" style={{ marginTop: 8 }} onClick={() => setShowFull(!showFull)}>
                  {showFull ? "Show less" : "Show all"}
                </button>
              )}
            </>
          ) : (
            <p className="empty">The full text of each turn appears here.</p>
          )}
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <h3 className="pixel">Timeline</h3>
          <ul className="feed">
            {turns.map((t, i) => {
              if (i > idx) return null;
              const a = AGENTS[t.agent];
              return (
                <li key={i} onClick={() => { setPlaying(false); go(i); }} style={{ cursor: "pointer", opacity: i === idx ? 1 : 0.75 }}>
                  <div className="meta">C{t.cycle} · {t.phase}{i === idx ? " · ◀ now" : ""}</div>
                  <span style={{ color: a.color }}>{a.avatar} {a.name}:</span> {t.summary}
                </li>
              );
            }).reverse()}
          </ul>
          {idx < 0 && <p className="empty">Fills in as the replay plays. Tap a line to jump back.</p>}
        </div>

        <div className="panel">
          <h3 className="pixel">Trophy shelf</h3>
          {finishedCycles.length ? (
            finishedCycles.map((c) => (
              <details key={c.cycle} className="outcard">
                <summary>
                  🏆 <b>Ep {c.cycle}:</b> {c.title}{" "}
                  <span className={`pill ${c.decision === "ACCEPT" ? "ok" : ""}`}>{c.decision}</span>
                </summary>
                <p className="meta">Format: {c.outputType}</p>
                <p>{c.summary}</p>
                <p className="meta">Radar locked on → <b>{c.nextOutputType}</b></p>
                <table className="opps">
                  <thead><tr><th>Output type</th><th>D</th><th>S</th><th>Gap</th></tr></thead>
                  <tbody>
                    {c.opportunities.map((o, i) => (
                      <tr key={i} className={o.chosen ? "chosen" : ""}>
                        <td>{o.chosen ? "★ " : ""}{o.name}</td><td>{o.demand}</td><td>{o.supply}</td><td>{o.demand - o.supply}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))
          ) : (
            <p className="empty">Accepted outputs land here at the end of each episode.</p>
          )}
        </div>
      </div>

      {ach && (
        <div className="toast" key={ach.id}>
          <span style={{ fontSize: 26 }}>{ach.icon}</span>
          <div><b>Achievement unlocked</b>{ach.name}: {ach.desc}</div>
        </div>
      )}

      <p className="sub" style={{ marginTop: 10 }}>
        Every turn in this tab was written by Claude in chat, playing each role. Full records are in Notion (filter
        Model = Claude).
      </p>
    </>
  );
}
