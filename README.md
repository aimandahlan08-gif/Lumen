# 🧪 Lumen Research Lab — an AI research company simulation

Three AI agents run a small research company that studies **human-AI interaction**.
They work in cycles, store everything in **Notion**, and you watch them live on a
dashboard hosted on **Vercel**. The agents run on **Google Gemini's free API tier**,
so the whole setup costs **RM0**.

| Agent | Role | Job |
|---|---|---|
| 🧭 Dr. Nadia | Research Director (PI) | Picks questions, makes decisions, runs the opportunity scan |
| 🔬 Ravi | Research Associate | Drafts and revises the research |
| 🧐 Prof. Mei | Reviewer / Methodologist | Critiques everything, approves or sends back |

**One cycle = 6 turns:**
`PLAN → DRAFT → REVIEW → REVISE → DECIDE → SCAN`

The **SCAN** turn is the opportunity scan. The Director lists 4 possible output types,
scores each one for **demand** and **supply** (1–5), and picks the biggest gap
(high demand, low supply) as the format for the next cycle. Every score is saved in the
Notion *Opportunities* database.

> ⚠️ The demand and supply scores are the AI's own estimates from what it already knows.
> It does not check live market data. Treat them as hypotheses to verify yourself.

---

## How it works

```
Dashboard (Vercel)  ──"Next turn"──▶  /api/tick  ──▶  Gemini (one agent, one step)
       ▲                                   │
       └──── /api/state (every 5 s) ◀── Notion (state, logs, outputs, opportunities)
```

- Each **tick** is one agent doing one step. A tick finishes in well under Vercel's
  5-minute limit.
- **Auto-run**: while the dashboard is open, it takes turns automatically.
- **Daily cron**: Vercel runs one full cycle every day at 09:00 Malaysia time
  (01:00 UTC), even when the dashboard is closed.

---

## Setup (about 20 minutes, all in the browser)

### 1. Get a free Gemini API key
1. Go to https://aistudio.google.com/apikey and sign in with your Google account.
2. Click **Create API key**. Copy it.
3. **Don't turn on billing** for that project. As long as billing stays off, Google can't
   charge you. When the free daily limit runs out, the agents stop until the next day.

> Your Gemini app subscription (student plan) is separate from the API and doesn't raise
> these limits. Also, Google may use free-tier API prompts to improve its products, so
> don't put private data into the agents.

### 2. Connect Notion
Your Notion workspace already has a **"Lumen Research Lab HQ"** page with 4 databases.
You only need to give the app permission to use it:
1. Go to https://www.notion.so/profile/integrations → **New integration**.
   Name it `Lumen Lab`, pick your workspace, set the type to **Internal**, then save.
2. Copy the **Internal Integration Secret**. This is your `NOTION_TOKEN`.
3. Open the **Lumen Research Lab HQ** page in Notion → click **•••** (top right) →
   **Connections** → add **Lumen Lab**. The 4 databases inside get access too.

The database IDs are already filled in `.env.example`.

### 3. Put the code on GitHub
1. On https://github.com/new, create a repo called `ai-research-company`. Make it private.
2. Unzip this project. On the new repo page, click **uploading an existing file**, drag
   in **all the files and folders**, then click **Commit changes**.
   (Don't upload `node_modules`. It isn't included anyway.)

### 4. Deploy on Vercel
1. On https://vercel.com/new, import the `ai-research-company` repo.
2. Before you click Deploy, open **Environment Variables** and add every line from
   `.env.example`:
   - `GOOGLE_GENERATIVE_AI_API_KEY`: from step 1
   - `AGENT_MODEL`: `gemini-3.5-flash-lite` (the code also tries a few other free
     Flash models automatically if this one runs out of quota)
   - `NOTION_TOKEN`: from step 2
   - The 4 `NOTION_..._ID` values: copy them from `.env.example`
   - `ADMIN_KEY`: make up a password. You'll type it into the dashboard.
   - `CRON_SECRET`: make up a long random string
   - `NEXT_PUBLIC_NOTION_URL`: copy it from `.env.example`
3. Click **Deploy**. When it finishes, open your site.

### 5. Run your company
1. Type your `ADMIN_KEY` into the box at the top right.
2. Press **▶ Next turn** to watch one step, or **⟳ Auto-run** to let them work.
3. Open Notion to read the full logs, the finished briefs and the opportunity scores.

---

## Free-tier limits (how far you get per day)
- One cycle = **6 model calls**. On the free tier, expect roughly **a few cycles a day**.
  Google sets the exact numbers per model and changes them often. You can see your
  current limits in AI Studio → **Rate limits** (or **Usage**).
- Auto-run waits 15 seconds between turns, to stay under the per-minute limit.
- When the daily quota runs out, the dashboard shows *"Free daily limit reached… The lab
  rests until tomorrow 🌙"* and auto-run stops. Nothing breaks, and nothing gets charged.
- The daily cron (09:00 MYT) uses about one cycle of your quota.

## Make it yours (good vibe-coding exercises)

| Want to… | Edit |
|---|---|
| Rename the company, change the field, rename the agents or change their personalities | `lib/company.ts` |
| Change what each step asks for | `lib/engine.ts` (look for `if (phase === "...")`) |
| Change the look of the office | `app/page.tsx` and `app/globals.css` |
| Change the daily schedule | `vercel.json` (cron uses UTC; the Hobby plan allows once a day) |

Every edit you commit on GitHub redeploys the site automatically on Vercel.

**Ideas for later:** add a 4th agent (Science Communicator, so outputs can feed Abstractly);
give the Director web search so the opportunity scan uses real data; add a
budget or "funding" number the Director must manage.

---

## Using it as research data
Each row in **Activity Log** is one agent turn, with the full text inside the row. You
can export it from Notion as CSV (••• → Export). Some things you could study:
- how often the Reviewer says APPROVE vs REVISE
- whether the agents start agreeing more over many cycles
- how changing a role prompt in `lib/company.ts` changes behaviour

## Troubleshooting
- **"Missing environment variable…"**: add it in Vercel → Settings → Environment
  Variables, then redeploy.
- **Notion error "Could not find page/database"**: you skipped step 2.3 (Connections).
- **"Wrong admin key"**: what you typed doesn't match `ADMIN_KEY` in Vercel.
- **Stuck on "thinking…"**: a turn crashed mid-run. The lock clears itself after about
  2.5 minutes.
- **Model error / "not found"**: Google renames models over time. Open AI Studio, see
  which Flash models your key can use for free, and set `AGENT_MODEL` to one of them.
  The fallback list is at the top of `lib/engine.ts`.
