# Production Agent (PA)

**Live demo:** https://pagent-demo-dcazdmv5xa-uw.a.run.app -- pick a role in the masthead and watch the same question return a different answer, or a denial, depending on who is asking.

An AI agent for the live-broadcast production office: a leaner production office, from the production manager on down. The Production Agent (PA) is an MCP (Model Context Protocol) server that gives an AI assistant permission-aware access to a show's paperwork: the rundown, callsheet, tech specs, gear manifests, crew lists, and venue notes that every live broadcast runs on. Production Agent is the working title; every show has its own culture, so each production will be able to give their PA its own name.

Connect it to Claude Desktop and ask, as any crew member, the questions that normally land on the production office: "what's camera call?", "what lens is on the jib?", "which segment has the pyro?", "who's the A2 and what department are they in?". Every answer is filtered through the requesting crew member's role, so a utility never sees the talent contact sheet and a producer does.

## Why this project

I have spent 15 years as a camera operator on live broadcasts. On every show, the paperwork lives in the production office. The production manager owns it; shows big enough to staff a production coordinator put the day-to-day in their hands, and on smaller shows the PM carries it all. Either way the whole crew queries that office all day: the rundown, the callsheet, the contact sheet, the tech specs. That is retrieval with access control, and it is the most automatable function in running a show, which is why the Production Agent starts there. The longer aim is a leaner production office, from the manager on down.

The interesting constraint is that a show's paperwork is not uniformly public. Talent contacts stay with the producer line. Crew phone numbers do not go to day-players. A real production office enforces this socially; the Production Agent enforces it structurally, in a server-side permission layer. Pin the server to a role with `--role` and the model cannot talk its way around it (see Trust model below).

## Roadmap

1. **Production docs MCP server + web app** (done): permission-aware retrieval and structured lookup over a show bundle, plus a TypeScript MCP-host web app (React front end, Node agent backend) driving the same server, with the sample show's paperwork browsable in-app and a live demo. See Web app below.
2. **Paperwork generation + uploads**: draft rundowns, callsheets, and crew notices from show inputs; upload your own show docs to work against (demo uploads are session-scoped and ephemeral).
3. **Distro**: role-based document distribution via email and calendar.
4. **Crew channels**: query the production office by SMS, Slack, or email; the sender's roster identity pins their role.
5. **Comms listener**: PL-channel speech-to-text feeding the show log, with confirm-gated doc updates.
6. **Management page**: production managers and producers assign roles, ingest documents, and set permissions by tier, department, or individual.
7. **Evals**: retrieval and permission evals over the fixture bundle.

## Architecture

```
Claude Desktop (MCP client, brings the model)
        |  stdio
        v
pagent MCP server (FastMCP)
        |
   six role-gated tools
        |
+-------+----------------------------+
| permissions.py  role -> access tier|
| bundle.py       show bundle loader |
| retrieval.py    chunking + TF-IDF  |
| tools.py        tool logic         |
| server.py       MCP wiring + CLI   |
+------------------------------------+
        |
shows/<bundle>/  YAML, markdown, CSV paperwork
```

There are no LLM API calls in the server. The MCP client brings the model; the server does retrieval and structured lookup only. Retrieval is a small, transparent TF-IDF ranker over document chunks (markdown split by heading, YAML split by top-level key), with document and section provenance on every result.

### Permission model

Roles group into three tiers, deny-by-default for anything unrecognized:

| Tier | Example roles | Sees |
| ---- | ------------- | ---- |
| Producer line | EP, producer, director, production manager, production coordinator | Everything: talent contacts, the full crew contact sheet, the budget, and every contract |
| Department heads | TD, EIC, A1, V1, stage manager | Common docs plus head-level docs like the budget |
| General crew | Camera operator, utility, A2, comms tech | Common docs only (rundown, callsheet, tech specs, venue, gear manifest, crew list) |
| Unknown role | anything else | Nothing |

Each document in a show bundle declares its access in the bundle's `show.yaml` manifest, with one of four tags: `common`, `heads`, `production`, or `personal`. A `personal` document (an individual agreement) names an owning `role` and is readable only by that role plus the producer line, who administer agreements -- so a camera operator sees their own contract but not the A1's, and the producer sees all of them. Contact information is gated separately: `list_crew` returns full contacts to the producer line and name/role/department to everyone else.

### Trust model

In demo mode (no `--role` flag) the role is a per-query assertion: every tool takes a `role` argument supplied by the caller, so you can explore both sides of the permission boundary from one conversation. The permission checks are real; the identity is whatever the caller claims.

In pinned mode (`pagent --role <role>`) the role is bound in server config, outside the conversation. The per-call `role` argument is ignored and every check runs against the pinned role, so the model cannot escalate it. This mirrors how permission-aware retrieval binds to authenticated identity in real deployments.

### Tools

| Tool | What it does |
| ---- | ------------ |
| `search_docs(query, role)` | Keyword search over the documents the role can read, with provenance |
| `get_document(doc_name, role)` | Full document, or a structured permission-denied message |
| `get_call_time(department_or_name, role)` | Call time by department, or by crew member via their department |
| `get_rundown(role, segment=None)` | One segment by item number or title, or the full summary |
| `list_crew(role, department=None)` | Crew list with contact gating by tier |
| `list_documents(role)` | What this role can see, with one-line descriptions |

## Installation

Requires Python 3.11+.

```bash
git clone https://github.com/Hunter0240/production-agent.git
cd production-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Run the server directly (it speaks MCP over stdio, so this is mainly for checking it starts):

```bash
pagent --show shows/sample-show
```

## Claude Desktop configuration

Add the Production Agent to `claude_desktop_config.json` (on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`), using absolute paths to the venv and the repo:

```json
{
  "mcpServers": {
    "pagent": {
      "command": "/absolute/path/to/pagent/.venv/bin/pagent",
      "args": ["--show", "/absolute/path/to/pagent/shows/sample-show"]
    }
  }
}
```

Restart Claude Desktop, then try:

> As a camera operator, what is my call time and what lens is on camera 5?

> As a utility, get me the talent contact sheet. (You will get a structured denial.)

> As the producer, who handles Mara Velasco?

For a single-role install, the recommended setup is to pin the role in the server args. The per-query role is then ignored and the model cannot escalate it (see Trust model above):

```json
{
  "mcpServers": {
    "pagent": {
      "command": "/absolute/path/to/pagent/.venv/bin/pagent",
      "args": ["--show", "/absolute/path/to/pagent/shows/sample-show", "--role", "camera operator"]
    }
  }
}
```

## Web app

`web/` is a TypeScript workspace: a React + Vite client and a Node agent service (Express). The Node backend runs the agent loop on the Anthropic TypeScript SDK and connects to this repo's Python MCP server as an MCP client over stdio -- one MCP server, many hosts. The UI is a two-panel production office: browse the show's paperwork (filtered live through the selected role) and query the PA over a streaming chat channel.

The trust model carries over per session: the role you pick in the masthead is injected into every tool call server-side, and the `role` parameter is stripped from the tool schemas the model sees, so the model can neither choose nor escalate a role.

### Run locally

```bash
cd web
npm install
npm run build
OPENROUTER_API_KEY=sk-or-... \
PAGENT_MCP_COMMAND=$(pwd)/../.venv/bin/pagent \
PAGENT_SHOW=$(pwd)/../shows/sample-show \
npm start
```

Then open http://localhost:8080. `npm test` runs the server's vitest suite.

The agent loop runs on the Anthropic TypeScript SDK. Set `OPENROUTER_API_KEY` to route through OpenRouter's Anthropic-compatible endpoint (model defaults to `anthropic/claude-opus-4.8`); set `ANTHROPIC_API_KEY` instead to call the Anthropic API directly (model defaults to `claude-opus-4-8`). `PAGENT_MODEL` overrides the model in either mode.

### Demo guardrails

The public demo is spend-capped by design: per-session message limits, a daily request and output-token budget, and a `CHAT_ENABLED=false` kill switch that darkens the chat while leaving the doc viewer up. Limits are environment-configurable; see `web/server/src/config.ts`.

### Deploy (Cloud Run)

The Dockerfile builds one container with the Node service, the built client, and the Python MCP server.

```bash
gcloud run deploy pagent-demo \
  --source . \
  --region us-west1 \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-secrets OPENROUTER_API_KEY=pagent-openrouter-key:latest
```

`--max-instances 1` is load-bearing: the demo guardrails keep their counters in memory, so a second instance would double the effective daily budget.

## Sample show

The bundled show at `shows/sample-show/` is the Harbor Lights Benefit Concert, a fictional 2-hour charity concert broadcast: a 12-segment rundown, a 16-person crew across six departments, a six-camera plan, the supporting callsheet, gear, talent, and venue paperwork, a department budget, and a per-role contract for each crew role. The broadcast details are written to be authentic; every person, company, email, and phone number is fictional.

To serve your own show, copy the bundle directory structure, list each document with an access tier and description under `documents:` in `show.yaml`, and point the server at it with `--show`.

## License

MIT. Copyright 2026 Cory Hunter.
