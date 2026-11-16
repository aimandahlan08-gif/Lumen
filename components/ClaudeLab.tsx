"use client";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { AGENTS, COMPANY, PHASE_INFO, type AgentId, type Phase } from "@/lib/company";
import { Office, PhaseBar } from "./Office";
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
  turns: Turn[];
  opportunities: Opportunity[];
};
type Lab = { company: string; model: string; updated: string; cycles: Cycle[] };

const DATA = lab as unknown as Lab;
const SPEEDS = [1, 2, 4];

export default function ClaudeLab() {
  // Every turn of every cycle, in order
  const turns = useMemo(
    () => DATA.cycles.flatMap((c) => c.turns.map((t) => ({ ...t, cycle: c.cycle }))),
    []
  );
  const [idx, setIdx] = useState(-1); // -1 = before the first turn
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [chars, setChars] = useState(0);
  const [showFull, setShowFull] = useState(false);

  const cur = idx >= 0 ? turns[idx] : null;

  // Typewriter effect for the active speech bubble
  useEffect(() => {
    setChars(0);
    if (!cur) return;
    const id = setInterval(() => {
      setChars((c) => {
        if (c >= cur.summary.length) { clearInterval(id); return c; }
        return c + 2;
      });
    }, 30 / speed);
    return () => clearInterval(id);
  }, [idx, speed, cur]);

  // Auto-advance while playing: wait for typing to finish, hold, then next turn
  useEffect(() => {
    if (!playing) return;
    if (idx >= turns.length - 1) { setPlaying(false); return; }
    const typingDone = !cur || chars >= cur.summary.length;
    if (!typingDone) return;
    const t = setTimeout(() => setIdx((i) => i + 1), (cur ? 3500 : 600) / speed);
    return () => clearTimeout(t);
  }, [playing, chars, idx, cur, speed, turns.length]);

  if (!turns.length) {
    return (
      <div className="panel" style={{ marginTop: 14 }}>
        <h3 className="pixel">Claude lab</h3>
        <p className="empty">
          No Claude cycles yet. Ask Claude in your chat to “run a cycle”. When it finishes, the cycle
          appears here as a replay a minute later.
        </p>
      </div>
    );
  }

  const go = (i: number) => { setIdx(Math.max(-1, Math.min(turns.length - 1, i))); setShowFull(false); };
  const phase: Phase = cur?.phase ?? "PLAN";

  // What each agent last said, up to the current point in the replay
  const lastBy = (a: AgentId) => {
    for (let i = idx; i >= 0; i--) if (turns[i].agent === a) return turns[i];
    return null;
  };
  const bubbles = Object.fromEntries(
    (Object.keys(AGENTS) as AgentId[]).map((id) => {
      if (cur && cur.agent === id) {
        const typing = chars < cur.summary.length;
        return [id, <span key="t">{cur.summary.slice(0, chars)}{typing && <span className="caret">▍</span>}</span>];
      }
      const last = lastBy(id);
      return [id, last ? last.summary : <span className="empty">waiting…</span>];
    })
  ) as Record<AgentId, React.ReactNode>;

  const finishedCycles = DATA.cycles.filter((c) => {
    const lastTurnIdx = turns.findIndex((t) => t.cycle === c.cycle && t.phase === "SCAN");
    return lastTurnIdx !== -1 && lastTurnIdx <= idx;
  });

  return (
    <>
      <div className="sub" style={{ margin: "6px 0 10px" }}>
        <b>🎬 Replay · written by Claude</b> · {DATA.cycles.length} cycles · {turns.length} turns · updated{" "}
        {new Date(DATA.updated).toLocaleString()}
        <br />
        {cur
          ? <>Cycle {cur.cycle} · Turn {idx + 1}/{turns.length} · {PHASE_INFO[cur.phase].label}</>
          : <>Press ▶ Play to watch the company work.</>}
      </div>

      <div className="controls" style={{ marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => go(idx - 1)} disabled={idx < 0}>⏮</button>
        <button className={`btn ${playing ? "ghost on" : ""}`} onClick={() => {
          if (idx >= turns.length - 1) go(-1);
          setPlaying(!playing);
        }}>
          {playing ? "⏸ Pause" : idx >= turns.length - 1 ? "↺ Replay" : "▶ Play"}
        </button>
        <button className="btn ghost" onClick={() => go(idx + 1)} disabled={idx >= turns.length - 1}>⏭</button>
        <button className="btn ghost" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
          {speed}×
        </button>
        <button className="btn ghost" onClick={() => { setPlaying(false); go(turns.length - 1); }}>Latest ⏩</button>
      </div>

      <PhaseBar phase={phase} />
      <Office active={cur?.agent ?? null} bubbles={bubbles} />

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
          {idx < 0 && <p className="empty">The timeline fills in as the replay plays.</p>}
        </div>

        <div className="panel">
          <h3 className="pixel">This turn</h3>
          {cur ? (
            <>
              <div className="meta" style={{ color: "var(--muted)", marginBottom: 8, fontSize: 12 }}>
                {AGENTS[cur.agent].avatar} {AGENTS[cur.agent].name} · {AGENTS[cur.agent].title} · Cycle {cur.cycle}
              </div>
              <div className="doc" style={{ maxHeight: showFull ? "none" : 420 }}>{cur.text}</div>
              {cur.text.length > 1500 && (
                <button className="tab" style={{ marginTop: 8 }} onClick={() => setShowFull(!showFull)}>
                  {showFull ? "Show less" : "Show all"}
                </button>
              )}
            </>
          ) : (
            <p className="empty">Full text of each turn appears here.</p>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3 className="pixel">Finished outputs</h3>
        {finishedCycles.length ? (
          finishedCycles.map((c) => (
            <details key={c.cycle} className="outcard">
              <summary>
                <b>Cycle {c.cycle}:</b> {c.title}{" "}
                <span className={`pill ${c.decision === "ACCEPT" ? "ok" : ""}`}>{c.decision}</span>
              </summary>
              <p className="meta">Format: {c.outputType}</p>
              <p>{c.summary}</p>
              <p className="meta">Opportunity scan → next format: <b>{c.nextOutputType}</b></p>
              <table className="opps">
                <thead><tr><th>Output type</th><th>Demand</th><th>Supply</th><th>Gap</th></tr></thead>
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
          <p className="empty">Outputs appear here once the replay reaches the end of a cycle.</p>
        )}
      </div>
      <p className="sub" style={{ marginTop: 10 }}>
        Turns in this tab were written by Claude in chat, playing each role of {COMPANY.name}. Full records are in
        Notion (filter Model = Claude).
      </p>
    </>
  );
}
