"use client";
import type React from "react";
import { AGENTS, PHASES, PHASE_INFO, type AgentId, type Phase } from "@/lib/company";

// The six-step progress bar
export function PhaseBar({ phase }: { phase: Phase }) {
  return (
    <div className="phases">
      {PHASES.map((p, i) => (
        <div key={p} className={`chip ${p === phase ? "now" : i < PHASES.indexOf(phase) ? "done" : ""}`}>
          {i + 1}. {PHASE_INFO[p].label}
        </div>
      ))}
    </div>
  );
}

// The office floor with the three desks. Shared by the live lab and the Claude replay.
export function Office({
  active,
  bubbles,
}: {
  active: AgentId | null;
  bubbles: Record<AgentId, React.ReactNode>;
}) {
  return (
    <section className="office">
      {(Object.keys(AGENTS) as AgentId[]).map((id) => {
        const a = AGENTS[id];
        return (
          <div key={id} className={`desk ${id === active ? "active" : ""}`}>
            <div className="bubble">{bubbles[id]}</div>
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
  );
}
