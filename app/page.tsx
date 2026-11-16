"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENTS, COMPANY, PHASES, PHASE_INFO, type AgentId, type Phase } from "@/lib/company";

type FeedItem = { t: string; agent: string; phase: string; cycle: number; text: string };
type State = {
  cycle: number;
  phase: Phase;
  outputType: string;
  question: string;
  draft: string;
  review: string;
  brief: string;
  history: string;
  feed: FeedItem[];
  tickCount: number;
  busy: boolean;
  error?: string;
};

const DOCS = ["question", "draft", "review", "brief", "history"] as const;

export default function Office() {
  const [s, setS] = useState<State | null>(null);
  const [key, setKey] = useState("");
  const [working, setWorking] = useState(false);
  const [auto, setAuto] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [doc, setDoc] = useState<(typeof DOCS)[number]>("question");
  const autoRef = useRef(false);

  useEffect(() => {
    try { setKey(localStorage.getItem("adminKey") || ""); } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const j = await r.json();
      if (j.error) setErr(j.error); else { setS(j); setErr(""); }
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const tick = useCallback(async () => {
    setWorking(true);
    try {
      const r = await fetch("/api/tick", { method: "POST", headers: { "x-admin-key": key } });
      const j = await r.json();
      if (j.reason === "quota") { setNote(j.message); autoRef.current = false; setAuto(false); }
      else if (!j.ok && j.reason !== "busy") { setErr(j.reason); autoRef.current = false; setAuto(false); }
      else setNote("");
    } catch (e: any) { setErr(e.message); }
    setWorking(false);
    await load();
  }, [key, load]);

  // Auto-run: keep taking turns while this page is open
  useEffect(() => {
    autoRef.current = auto;
    if (!auto) return;
    let stop = false;
    (async () => {
      while (!stop && autoRef.current) {
        await tick();
        await new Promise((res) => setTimeout(res, 15000)); // gentle pace for free-tier limits
      }
    })();
    return () => { stop = true; };
  }, [auto, tick]);

  const saveKey = (v: string) => {
    setKey(v);
    try { localStorage.setItem("adminKey", v); } catch {}
  };

  const phase = s?.phase ?? "PLAN";
  const activeAgent = PHASE_INFO[phase].agent;
  const lastBy = (a: AgentId) => [...(s?.feed ?? [])].reverse().find((f) => f.agent === a);
  const notionUrl = process.env.NEXT_PUBLIC_NOTION_URL;

  return (
    <main className="wrap">
      <div className="top">
        <div>
          <h1 className="title pixel">{COMPANY.name}</h1>
          <div className="sub">
            Cycle {s?.cycle ?? "–"} · {s?.tickCount ?? 0} turns · Output: {s?.outputType || COMPANY.startingOutputType}
            {notionUrl && <> · <a href={notionUrl} target="_blank">Open Notion HQ</a></>}
          </div>
        </div>
        <div className="controls">
          <input className="key" type="password" placeholder="admin key" value={key} onChange={(e) => saveKey(e.target.value)} />
          <button className="btn" disabled={working || !key} onClick={tick}>
            {working ? "Working…" : "▶ Next turn"}
          </button>
          <button className={`btn ghost ${auto ? "on" : ""}`} disabled={!key} onClick={() => setAuto(!auto)}>
            {auto ? "■ Stop auto-run" : "⟳ Auto-run"}
          </button>
        </div>
      </div>

      {err && <div className="err">⚠ {err}</div>}
      {note && <div className="note">{note}</div>}

      <div className="phases">
        {PHASES.map((p, i) => (
          <div key={p} className={`chip ${p === phase ? "now" : i < PHASES.indexOf(phase) ? "done" : ""}`}>
            {i + 1}. {PHASE_INFO[p].label}
          </div>
        ))}
      </div>

      <section className="office">
        {(Object.keys(AGENTS) as AgentId[]).map((id) => {
          const a = AGENTS[id];
          const last = lastBy(id);
          const isActive = id === activeAgent;
          return (
            <div key={id} className={`desk ${isActive ? "active" : ""}`}>
              <div className="bubble">
                {isActive && (working || s?.busy) ? (
                  <span className="thinking">thinking…</span>
                ) : isActive ? (
                  <span><b>Up next:</b> {PHASE_INFO[phase].label}</span>
                ) : last ? (
                  last.text
                ) : (
                  <span className="empty">waiting…</span>
                )}
              </div>
              <div className="avatar">{a.avatar}</div>
              <div className="table" style={{ borderTop: `4px solid ${a.color}` }} />
              <div className="nameplate">
                <b className="pixel" style={{ color: a.color }}>{a.name}</b>
                <span>{a.title}</span>
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid">
        <div className="panel">
          <h3 className="pixel">Activity</h3>
          {s?.feed?.length ? (
            <ul className="feed">
              {[...s.feed].reverse().map((f, i) => {
                const a = AGENTS[f.agent as AgentId];
                return (
                  <li key={i}>
                    <div className="meta">
                      {new Date(f.t).toLocaleTimeString()} · C{f.cycle} · {f.phase}
                    </div>
                    <span style={{ color: a?.color }}>{a?.avatar} {a?.name}:</span> {f.text}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">Nothing yet. Enter your admin key and press “Next turn”.</p>
          )}
        </div>

        <div className="panel">
          <h3 className="pixel">Current work</h3>
          <div className="tabs">
            {DOCS.map((d) => (
              <button key={d} className={`tab ${doc === d ? "sel" : ""}`} onClick={() => setDoc(d)}>
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div className="doc">{(s && s[doc]) || <span className="empty">Not written yet this cycle.</span>}</div>
        </div>
      </div>
    </main>
  );
}
