// The simulation engine: one call to runTick() = one step of work by one agent.
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { AGENTS, COMPANY, PHASES, PHASE_INFO, type AgentId, type Phase } from "./company";
import {
  getState,
  saveState,
  logActivity,
  saveOutput,
  saveOpportunity,
  type CompanyState,
  type FeedItem,
} from "./notion";

// Free-tier Gemini models, tried in order. If one hits its daily limit
// (or isn't available on your key), the next one is tried automatically.
const MODELS = [
  process.env.AGENT_MODEL,
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);

const LOCK_SECONDS = 150;

export class QuotaError extends Error {}

function statusOf(err: any): number | undefined {
  return err?.statusCode ?? err?.lastError?.statusCode ?? err?.cause?.statusCode;
}

async function ask(agent: AgentId, prompt: string, maxOutputTokens = 1800) {
  let lastErr: any;
  for (const model of MODELS) {
    try {
      const { text } = await generateText({
        model: google(model),
        system: AGENTS[agent].system,
        prompt,
        maxOutputTokens,
        maxRetries: 1,
      });
      if (text.trim()) return text.trim();
      lastErr = new Error(`${model} returned an empty answer`);
    } catch (err: any) {
      lastErr = err;
      const code = statusOf(err);
      const msg = String(err?.message ?? "");
      const tryNext = code === 429 || code === 404 || code === 403 || /quota|RESOURCE_EXHAUSTED|not found/i.test(msg);
      if (!tryNext) throw err;
    }
  }
  if (statusOf(lastErr) === 429 || /quota|RESOURCE_EXHAUSTED/i.test(String(lastErr?.message))) {
    throw new QuotaError("Free daily limit reached for today's Gemini models. The lab rests until tomorrow 🌙");
  }
  throw lastErr;
}

function grab(raw: string, label: string): string {
  const text = clean(raw);
  const m = text.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z_ ]{3,}:|$)`));
  return m ? m[1].trim() : "";
}

// Models sometimes bold labels (**VERDICT:**) — strip that before parsing
function clean(t: string) {
  return t.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
}

function nextPhase(p: Phase): Phase {
  return PHASES[(PHASES.indexOf(p) + 1) % PHASES.length];
}

export type TickResult =
  | { ok: true; phase: Phase; agent: AgentId; message: string; cycle: number }
  | { ok: false; reason: string; message?: string };

export async function runTick(): Promise<TickResult> {
  const s = await getState();

  // Lock so two ticks never run at the same time
  if (s.lockedUntil && new Date(s.lockedUntil).getTime() > Date.now()) {
    return { ok: false, reason: "busy" };
  }
  await saveState({ lockedUntil: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() });

  try {
    const outputType = s.outputType || COMPANY.startingOutputType;
    const phase = s.phase;
    const agent = PHASE_INFO[phase].agent;
    let update: Partial<CompanyState> = {};
    let summary = "";
    let full = "";

    if (phase === "PLAN") {
      full = await ask(
        "director",
        `Cycle ${s.cycle}. Our output format this cycle: "${outputType}".
Past cycles (most recent last):
${s.history || "(none yet — this is our first cycle)"}

Choose ONE new, specific, researchable question in our field that we have not covered before and that suits this output format.
Reply exactly in this format:
QUESTION: <one sentence>
WHY: <one or two sentences on why it matters now>
INSTRUCTIONS: <3-5 bullet instructions for the Research Associate>`,
        700
      );
      const question = grab(full, "QUESTION") || full.split("\n")[0];
      update = { question, instructions: grab(full, "INSTRUCTIONS") || full, draft: "", review: "", brief: "" };
      summary = `New question: ${question}`;
    }

    if (phase === "DRAFT") {
      full = await ask(
        "associate",
        `Output format: "${outputType}".
Research question: ${s.question}
Director's instructions:
${s.instructions}

Write the first draft (a research proposal) in markdown: title, background, research question & hypotheses, method (design, participants, measures, analysis), expected contribution, limitations. Max ~700 words.`,
        2000
      );
      update = { draft: full };
      summary = `Drafted: ${full.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "proposal"}`;
    }

    if (phase === "REVIEW") {
      full = await ask(
        "reviewer",
        `Review this draft for the question "${s.question}".

${s.draft}

Reply in this format:
VERDICT: APPROVE or REVISE
STRENGTHS: <bullets>
PROBLEMS: <numbered list, most serious first>
REQUIRED FIXES: <numbered, specific>`,
        1200
      );
      const verdict = /VERDICT:\s*APPROVE/i.test(clean(full)) ? "APPROVE" : "REVISE";
      update = { review: full };
      summary = `Verdict: ${verdict}. ${grab(full, "PROBLEMS").split("\n")[0] || ""}`;
    }

    if (phase === "REVISE") {
      full = await ask(
        "associate",
        `Output format: "${outputType}".
Original draft:
${s.draft}

Peer review:
${s.review}

Write the final revised research brief in markdown, addressing every required fix. Start with a line "CHANGES:" listing what you changed in 2-4 bullets, then the brief. Max ~800 words.`,
        2200
      );
      update = { brief: full };
      summary = `Revised brief, addressing reviewer fixes.`;
    }

    if (phase === "DECIDE") {
      full = await ask(
        "director",
        `Question: ${s.question}
Reviewer's critique:
${s.review}

Final brief:
${s.brief}

Decide whether to accept this as company output.
Reply in this format:
DECISION: ACCEPT or SHELVE
TITLE: <short title for the output>
SUMMARY: <two sentences a newcomer could understand>
LESSON: <one sentence on what the team should do better next cycle>`,
        600
      );
      const decision = /DECISION:\s*ACCEPT/i.test(clean(full)) ? "ACCEPT" : "SHELVE";
      const title = grab(full, "TITLE") || s.question;
      const verdict = /VERDICT:\s*APPROVE/i.test(clean(s.review)) ? "Approved" : "Revised";
      await saveOutput({
        title,
        cycle: s.cycle,
        type: outputType,
        verdict: decision === "ACCEPT" ? `Accepted (${verdict})` : "Shelved",
        question: s.question,
        brief: s.brief,
        review: s.review,
        decision: full,
      });
      const line = `Cycle ${s.cycle} [${outputType}] ${decision}: ${title} — ${grab(full, "SUMMARY")} Lesson: ${grab(full, "LESSON")}`;
      update = { history: trimHistory(`${s.history}\n${line}`) };
      summary = `${decision}: ${title}`;
    }

    if (phase === "SCAN") {
      full = await ask(
        "director",
        `Cycle ${s.cycle} is done. Before the next cycle, do an opportunity scan.
Our field: ${COMPANY.focus}.
Past cycles:
${s.history}

List 4 candidate OUTPUT TYPES we could produce next (e.g. a kind of report, dataset, toolkit, explainer, measurement scale, policy brief…).
For each, estimate DEMAND (how much researchers, practitioners, policymakers or the public need it, 1-5) and SUPPLY (how much of it already exists, 1-5). We want HIGH demand, LOW supply.
These are your honest estimates from what you know — say so if unsure.
Reply exactly:
OPTION: <output type> | <demand 1-5> | <supply 1-5> | <one-sentence reason>
OPTION: ...
OPTION: ...
OPTION: ...
CHOICE: <the exact output type you pick for next cycle>`,
        900
      );
      const options = [...clean(full).matchAll(/OPTION:\s*(.+?)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(.+)/gi)].map((m) => ({
        name: m[1].trim(),
        demand: Number(m[2]),
        supply: Number(m[3]),
        reason: m[4].trim(),
      }));
      let choice = grab(full, "CHOICE").split("\n")[0];
      if (!choice && options.length) {
        choice = [...options].sort((a, b) => b.demand - b.supply - (a.demand - a.supply))[0].name;
      }
      for (const o of options) {
        await saveOpportunity({ ...o, cycle: s.cycle, chosen: o.name.toLowerCase() === choice.toLowerCase() });
      }
      update = { outputType: choice || outputType, cycle: s.cycle + 1 };
      summary = `Next cycle's output: ${choice || outputType}`;
    }

    const item: FeedItem = {
      t: new Date().toISOString(),
      agent,
      phase,
      cycle: s.cycle,
      text: summary.slice(0, 300),
    };
    await logActivity({ ...item, full });
    await saveState({
      ...update,
      phase: nextPhase(phase),
      tickCount: s.tickCount + 1,
      feed: [...s.feed, item].slice(-20),
      lockedUntil: null,
    });
    return { ok: true, phase, agent, message: summary, cycle: s.cycle };
  } catch (err: any) {
    await saveState({ lockedUntil: null }).catch(() => {});
    if (err instanceof QuotaError) return { ok: false, reason: "quota", message: err.message };
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

function trimHistory(h: string) {
  // Keep the last ~12 cycles so prompts stay short (and cheap)
  return h.trim().split("\n").slice(-12).join("\n");
}
