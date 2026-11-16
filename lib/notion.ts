// Notion is the company's "database". This file is the only place
// that talks to Notion.
import { Client } from "@notionhq/client";
import type { Phase } from "./company";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// IDs of the "Lumen Research Lab HQ" databases in Notion (not secret — useless without NOTION_TOKEN).
// An environment variable with the same name overrides each one.
const DEFAULT_IDS: Record<string, string> = {
  NOTION_STATE_PAGE_ID: "41adfe99f77e81f5b47ffdded401c23b",
  NOTION_LOG_DB_ID: "41adfe99f77e81a2bbb3fc147f0e77e8",
  NOTION_OUTPUTS_DB_ID: "41adfe99f77e81549570ff16e4defa00",
  NOTION_OPPORTUNITIES_DB_ID: "41adfe99f77e81a69dd7d95afc346748",
};

const STATE_PAGE = () => need("NOTION_STATE_PAGE_ID");
const LOG_DB = () => need("NOTION_LOG_DB_ID");
const OUTPUTS_DB = () => need("NOTION_OUTPUTS_DB_ID");
const OPPS_DB = () => need("NOTION_OPPORTUNITIES_DB_ID");

function need(name: string): string {
  const v = process.env[name] || DEFAULT_IDS[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export type FeedItem = {
  t: string; // ISO time
  agent: string;
  phase: string;
  cycle: number;
  text: string;
};

export type CompanyState = {
  cycle: number;
  phase: Phase;
  outputType: string;
  question: string;
  instructions: string;
  draft: string;
  review: string;
  brief: string;
  history: string;
  feed: FeedItem[];
  tickCount: number;
  lockedUntil: string | null;
};

// ── Text helpers ────────────────────────────────────────────
// Notion text blocks hold max 2000 characters each, so long text is split.
const MAX = 40000;
function toRichText(text: string) {
  const t = (text || "").slice(0, MAX);
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < t.length; i += 1900) {
    chunks.push({ type: "text", text: { content: t.slice(i, i + 1900) } });
  }
  return chunks;
}

function readText(prop: any): string {
  if (!prop) return "";
  const arr = prop.rich_text ?? prop.title ?? [];
  return arr.map((r: any) => r.plain_text ?? r.text?.content ?? "").join("");
}

function paragraphs(text: string) {
  // Turn plain/markdown text into Notion paragraph blocks (simple + safe).
  return (text || "")
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .slice(0, 90)
    .map((p) => ({
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: { rich_text: toRichText(p.trim()) },
    }));
}

// ── State ───────────────────────────────────────────────────
export async function getState(): Promise<CompanyState> {
  const page: any = await notion.pages.retrieve({ page_id: STATE_PAGE() });
  const p = page.properties;
  let feed: FeedItem[] = [];
  try {
    feed = JSON.parse(readText(p["Feed"]) || "[]");
  } catch {
    feed = [];
  }
  return {
    cycle: p["Cycle"]?.number ?? 1,
    phase: (p["Phase"]?.select?.name as Phase) ?? "PLAN",
    outputType: readText(p["Output Type"]),
    question: readText(p["Question"]),
    instructions: readText(p["Instructions"]),
    draft: readText(p["Draft"]),
    review: readText(p["Review"]),
    brief: readText(p["Brief"]),
    history: readText(p["History"]),
    feed,
    tickCount: p["Tick Count"]?.number ?? 0,
    lockedUntil: p["Locked Until"]?.date?.start ?? null,
  };
}

export async function saveState(s: Partial<CompanyState>) {
  const props: Record<string, any> = {};
  if (s.cycle !== undefined) props["Cycle"] = { number: s.cycle };
  if (s.phase !== undefined) props["Phase"] = { select: { name: s.phase } };
  if (s.tickCount !== undefined) props["Tick Count"] = { number: s.tickCount };
  const textFields: [keyof CompanyState, string][] = [
    ["outputType", "Output Type"],
    ["question", "Question"],
    ["instructions", "Instructions"],
    ["draft", "Draft"],
    ["review", "Review"],
    ["brief", "Brief"],
    ["history", "History"],
  ];
  for (const [key, name] of textFields) {
    if (s[key] !== undefined) props[name] = { rich_text: toRichText(String(s[key])) };
  }
  if (s.feed !== undefined) props["Feed"] = { rich_text: toRichText(JSON.stringify(s.feed)) };
  if (s.lockedUntil !== undefined)
    props["Locked Until"] = { date: s.lockedUntil ? { start: s.lockedUntil } : null };
  await notion.pages.update({ page_id: STATE_PAGE(), properties: props });
}

// ── Records ─────────────────────────────────────────────────
export async function logActivity(item: FeedItem & { full: string }) {
  await notion.pages.create({
    parent: { database_id: LOG_DB() },
    properties: {
      Summary: { title: toRichText(item.text.slice(0, 200)) },
      Agent: { select: { name: item.agent } },
      Phase: { select: { name: item.phase } },
      Cycle: { number: item.cycle },
      Model: { select: { name: "Gemini" } },
    },
    children: paragraphs(item.full),
  });
}

export async function saveOutput(o: {
  title: string;
  cycle: number;
  type: string;
  verdict: string;
  question: string;
  brief: string;
  review: string;
  decision: string;
}) {
  await notion.pages.create({
    parent: { database_id: OUTPUTS_DB() },
    properties: {
      Title: { title: toRichText(o.title.slice(0, 200)) },
      Cycle: { number: o.cycle },
      Type: { rich_text: toRichText(o.type) },
      Verdict: { select: { name: o.verdict } },
      Question: { rich_text: toRichText(o.question) },
      Model: { select: { name: "Gemini" } },
    },
    children: [
      heading("Director's decision"),
      ...paragraphs(o.decision),
      heading("Final brief"),
      ...paragraphs(o.brief),
      heading("Peer review"),
      ...paragraphs(o.review),
    ].slice(0, 100),
  });
}

export async function saveOpportunity(o: {
  name: string;
  cycle: number;
  demand: number;
  supply: number;
  reason: string;
  chosen: boolean;
}) {
  await notion.pages.create({
    parent: { database_id: OPPS_DB() },
    properties: {
      Output: { title: toRichText(o.name.slice(0, 200)) },
      Cycle: { number: o.cycle },
      Demand: { number: o.demand },
      Supply: { number: o.supply },
      Gap: { number: o.demand - o.supply },
      Chosen: { checkbox: o.chosen },
      Reason: { rich_text: toRichText(o.reason) },
      Model: { select: { name: "Gemini" } },
    },
  });
}

function heading(text: string) {
  return {
    object: "block" as const,
    type: "heading_2" as const,
    heading_2: { rich_text: toRichText(text) },
  };
}
