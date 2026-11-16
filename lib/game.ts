// Game layer for the Claude lab replay: XP, levels, achievements.
// Everything is computed from data/claude-lab.json, so nothing extra needs saving.
import type { AgentId, Phase } from "./company";

export type Scores = { rigor: number; novelty: number; ethics: number; feasibility: number };
export type ReplayTurn = {
  phase: Phase;
  agent: AgentId;
  summary: string;
  text: string;
  cycle: number;
  verdict?: "APPROVE" | "REVISE";
  decision?: "ACCEPT" | "SHELVE";
  scores?: { draft: Scores; final: Scores };
};

export const STAT_KEYS: { key: keyof Scores; label: string; color: string }[] = [
  { key: "rigor", label: "Rigor", color: "#7c5cff" },
  { key: "novelty", label: "Novelty", color: "#ffd34d" },
  { key: "ethics", label: "Ethics", color: "#1fa67a" },
  { key: "feasibility", label: "Feasibility", color: "#e0663a" },
];

const total = (s?: Scores) => (s ? s.rigor + s.novelty + s.ethics + s.feasibility : 0);

export const XP_PER_LEVEL = 250;

export function xpFor(t: ReplayTurn): number {
  switch (t.phase) {
    case "PLAN": return 20;
    case "DRAFT": return 40;
    case "REVIEW": return 30;
    case "REVISE": return 50 + Math.max(0, total(t.scores?.final) - total(t.scores?.draft)) * 10;
    case "DECIDE": return t.decision === "SHELVE" ? 20 : 120;
    case "SCAN": return 30;
  }
}

export type Achievement = { id: string; icon: string; name: string; desc: string };
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_q", icon: "💡", name: "First question", desc: "The lab asked its first research question" },
  { id: "tough_love", icon: "🟥", name: "Tough love", desc: "Survived a REVISE verdict" },
  { id: "glow_up", icon: "✨", name: "Glow-up", desc: "Revision raised total score by 4+" },
  { id: "first_accept", icon: "🏆", name: "First ACCEPT", desc: "First output accepted" },
  { id: "radar", icon: "🎯", name: "Opportunity hunter", desc: "First opportunity scan" },
  { id: "safety", icon: "🛡️", name: "Safety first", desc: "Ethics raised by 2+ in one revision" },
  { id: "hat_trick", icon: "🎩", name: "Hat-trick", desc: "Three outputs accepted" },
  { id: "marathon", icon: "🏃", name: "Marathon", desc: "Five full cycles" },
];

// For each achievement: the turn index at which it unlocks (or -1)
export function unlockIndex(turns: ReplayTurn[]): Record<string, number> {
  const at: Record<string, number> = {};
  let accepts = 0, scans = 0;
  turns.forEach((t, i) => {
    const set = (id: string) => { if (at[id] === undefined) at[id] = i; };
    if (t.phase === "PLAN") set("first_q");
    if (t.phase === "REVIEW" && t.verdict === "REVISE") set("tough_love");
    if (t.phase === "REVISE" && t.scores) {
      if (total(t.scores.final) - total(t.scores.draft) >= 4) set("glow_up");
      if (t.scores.final.ethics - t.scores.draft.ethics >= 2) set("safety");
    }
    if (t.phase === "DECIDE" && t.decision !== "SHELVE") {
      accepts++;
      set("first_accept");
      if (accepts >= 3) set("hat_trick");
    }
    if (t.phase === "SCAN") {
      scans++;
      set("radar");
      if (scans >= 5) set("marathon");
    }
  });
  return at;
}
