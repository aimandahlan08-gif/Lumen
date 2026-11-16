import { runTick } from "@/lib/engine";

export const maxDuration = 300; // seconds (the Vercel Hobby maximum)
export const dynamic = "force-dynamic";

// POST /api/tick — the dashboard's "Next turn" button. Needs your ADMIN_KEY.
export async function POST(req: Request) {
  if (!process.env.ADMIN_KEY || req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) {
    return Response.json({ ok: false, reason: "Wrong admin key" }, { status: 401 });
  }
  const result = await runTick();
  return Response.json(result, { status: result.ok || result.reason === "busy" || result.reason === "quota" ? 200 : 500 });
}

// GET /api/tick — called once a day by Vercel Cron (see vercel.json).
// Runs as many steps as fit in ~4 minutes, usually one full cycle.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const results = [];
  while (Date.now() - started < 200_000 && results.length < 6) {
    const r = await runTick();
    results.push(r);
    if (!r.ok) break;
  }
  return Response.json({ ran: results.length, results });
}
