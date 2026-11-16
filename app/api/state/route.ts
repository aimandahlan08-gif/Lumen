import { getState } from "@/lib/notion";

export const dynamic = "force-dynamic";

// GET /api/state — what the dashboard reads every few seconds.
export async function GET() {
  try {
    const s = await getState();
    const busy = !!s.lockedUntil && new Date(s.lockedUntil).getTime() > Date.now();
    return Response.json({
      cycle: s.cycle,
      phase: s.phase,
      outputType: s.outputType,
      question: s.question,
      brief: s.brief,
      draft: s.draft,
      review: s.review,
      history: s.history,
      feed: s.feed,
      tickCount: s.tickCount,
      busy,
    });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
