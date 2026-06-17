import { useEffect, useRef, useState } from "react";
import { streamChat, displayName, type AgentEvent, type ChatMessage } from "./api";

type Lane = {
  role: string;
  text: string;
  tools: { text: string; detail: string }[];
  denied: string | null;
  error: string | null;
  done: boolean;
};

type Line =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; text: string; detail?: string }
  | { kind: "denied"; text: string }
  | { kind: "notice"; text: string; tone?: "info" | "error" }
  | { kind: "compare"; id: number; question: string; lanes: Lane[] };

const SUGGESTIONS = [
  "What time is camera call?",
  "What lens is on the jib?",
  "Get me the talent contact sheet.",
  "Which segment has the pyro?",
];

// Turn a raw tool call into a terse on-register status line. The raw
// name + args stay available on hover (power users value the transparency).
function humanizeTool(name: string, input: Record<string, unknown>): string {
  const arg = (k: string) => {
    const v = input[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };
  switch (name) {
    case "search_docs": {
      const q = arg("query");
      return q ? `searching the paperwork for "${q}"` : "searching the paperwork";
    }
    case "get_document": {
      const doc = arg("doc_name");
      return doc ? `pulling ${displayName(doc)}` : "pulling a document";
    }
    case "get_call_time": {
      const who = arg("department_or_name");
      return who ? `checking the call time for ${who}` : "checking call time";
    }
    case "get_rundown": {
      const seg = arg("segment");
      return seg ? `pulling the rundown (${seg})` : "pulling the rundown";
    }
    case "list_crew": {
      const dept = arg("department");
      return dept ? `checking the crew list (${dept})` : "checking the crew list";
    }
    case "list_documents":
      return "listing readable documents";
    default:
      return name.replace(/_/g, " ");
  }
}

function toolLine(name: string, input: Record<string, unknown>) {
  return { text: humanizeTool(name, input), detail: `${name}(${JSON.stringify(input)})` };
}

// Copy an answer so a crew member can paste it into a text or radio note.
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="line-copy"
      aria-label={done ? "Answer copied" : "Copy answer"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable (insecure context); leave the answer on screen
        }
      }}
    >
      {done ? "COPIED" : "COPY"}
    </button>
  );
}

export function Chat({
  role,
  vsRole,
  enabled,
  busy,
  setBusy,
}: {
  role: string;
  vsRole: string;
  enabled: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const initialRole = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // The comparison is on whenever a distinct compare-to role is pinned.
  const compare = !!vsRole && vsRole !== role;

  useEffect(() => {
    if (initialRole.current) {
      initialRole.current = false;
      return;
    }
    // The pinned role or the comparison changed. Start a fresh backend context
    // so answers are not seeded by the prior scope, and drop a boundary marker
    // into the transcript so the seam between differently-scoped answers stays
    // legible -- the seams are the demo. The copy tracks the actual mode: a
    // single scope, or a two-role comparison.
    setHistory([]);
    const comparing = !!vsRole && vsRole !== role;
    const marker = comparing
      ? `NOW COMPARING ${role.toUpperCase()} vs ${vsRole.toUpperCase()}`
      : `NOW SCOPED TO ${role.toUpperCase()}`;
    setLines((l) => (l.length === 0 ? l : [...l, { kind: "notice", text: marker }]));
  }, [role, vsRole]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  function submit(text: string) {
    if (compare) void sendCompare(text);
    else void send(text);
  }

  // Cancel a streaming answer: abort the request(s), then finalize the
  // transcript -- drop a blank assistant bubble that never received text, and
  // settle any still-streaming compare lanes so nothing spins forever.
  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setLines((l) =>
      l
        .filter((x, i) => !(i === l.length - 1 && x.kind === "assistant" && !x.text))
        .map((line) =>
          line.kind === "compare"
            ? { ...line, lanes: line.lanes.map((ln) => (ln.done ? ln : { ...ln, done: true })) }
            : line,
        ),
    );
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const sent: ChatMessage[] = [...history, { role: "user", content: question }];
    setLines((l) => [...l, { kind: "user", text: question }, { kind: "assistant", text: "" }]);

    let answer = "";
    await streamChat(role, sent, (event) => {
      if (event.type === "text") {
        answer += event.text;
        setLines((l) => {
          const next = [...l];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].kind === "assistant") {
              next[i] = { kind: "assistant", text: answer };
              break;
            }
          }
          return next;
        });
      } else if (event.type === "tool") {
        // Any text before a tool call is the model narrating its steps, not the
        // answer. Drop it and keep only the reply that follows the last tool.
        answer = "";
        const { text: label, detail } = toolLine(event.name, event.input);
        setLines((l) => {
          const next = [...l];
          next.pop();
          return [...next, { kind: "tool", text: label, detail }, { kind: "assistant", text: "" }];
        });
      } else if (event.type === "denied") {
        setLines((l) => {
          const next = [...l];
          const last = next.pop()!;
          return [...next, { kind: "denied", text: event.detail }, last];
        });
      } else if (event.type === "error") {
        setLines((l) => [
          ...l.filter((x) => !(x.kind === "assistant" && x.text === "")),
          { kind: "notice", text: event.message, tone: "error" },
        ]);
      }
    }, controller.signal);

    abortRef.current = null;
    if (answer) setHistory([...sent, { role: "assistant", content: answer }]);
    setBusy(false);
  }

  // Compare mode fans the same question out to two roles as two independent
  // scoped requests -- faithful to the one-role-per-call trust model -- and
  // streams each into its own lane so the access boundary is visible live.
  async function sendCompare(text: string) {
    const question = text.trim();
    if (!question || busy || !vsRole || vsRole === role) return;
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const id = nextId.current++;
    const makeLane = (r: string): Lane => ({
      role: r,
      text: "",
      tools: [],
      denied: null,
      error: null,
      done: false,
    });
    setLines((l) => [
      ...l,
      { kind: "compare", id, question, lanes: [makeLane(role), makeLane(vsRole)] },
    ]);

    const onLane = (idx: number) => (event: AgentEvent) =>
      setLines((l) =>
        l.map((line) => {
          if (line.kind !== "compare" || line.id !== id) return line;
          const lanes = line.lanes.slice();
          const lane = { ...lanes[idx] };
          if (event.type === "text") lane.text += event.text;
          else if (event.type === "tool") {
            // Drop pre-tool narration; keep only the answer after the last tool.
            lane.text = "";
            lane.tools = [...lane.tools, toolLine(event.name, event.input)];
          }
          else if (event.type === "denied") lane.denied = event.detail;
          else if (event.type === "error") {
            lane.error = event.message;
            lane.done = true;
          } else if (event.type === "done") lane.done = true;
          lanes[idx] = lane;
          return { ...line, lanes };
        }),
      );

    const msg: ChatMessage[] = [{ role: "user", content: question }];
    await Promise.all([
      streamChat(role, msg, onLane(0), controller.signal),
      streamChat(vsRole, msg, onLane(1), controller.signal),
    ]);
    abortRef.current = null;
    setBusy(false);
  }

  const subhead = compare
    ? `${role.toUpperCase()} vs ${vsRole.toUpperCase()}`
    : `ANSWERS SCOPED TO ${role.toUpperCase()}`;

  return (
    <section className="panel comms">
      <div className="panel-head">
        <div className="panel-head-id">
          <h2 className="panel-title">QUERY THE OFFICE</h2>
          <span className="panel-sub">{subhead}</span>
        </div>
      </div>
      <div className="comms-log" ref={logRef} aria-live="polite" aria-busy={busy}>
        {lines.length === 0 && (
          <div className="comms-empty">
            <p className="comms-empty-head">CHANNEL OPEN</p>
            <p>
              {compare
                ? `Ask a question and watch ${role.toUpperCase()} and ${vsRole.toUpperCase()} answer it side by side, each scoped to what they are cleared to see.`
                : "Ask anything a crew member would normally radio to the production office."}
            </p>
            {compare ? (
              <p className="comms-empty-note">
                Each question runs once per role, so a comparison spends two requests against the
                demo's limits.
              </p>
            ) : (
              <p className="comms-empty-note">
                Answers are scoped to your role. What you are not cleared for comes back stamped
                SCOPED OUT -- a permission boundary, not an error.
              </p>
            )}
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)} disabled={!enabled || busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((line, i) => {
          if (line.kind === "compare") {
            return (
              <div key={i} className="compare">
                <div className="compare-q">
                  <span className="line-tag">COMPARE</span>
                  <p>{line.question}</p>
                </div>
                <div className="compare-lanes">
                  {line.lanes.map((lane, j) => (
                    <LaneView key={lane.role + j} lane={lane} primary={j === 0} />
                  ))}
                </div>
              </div>
            );
          }
          if (line.kind === "tool") {
            return (
              <div key={i} className="line-tool">
                <span title={line.detail}>&raquo; {line.text}</span>
              </div>
            );
          }
          if (line.kind === "denied") {
            return (
              <div key={i} className="line-denied">
                <span className="stamp-mini">SCOPED OUT</span>
                <span>{line.text}</span>
              </div>
            );
          }
          if (line.kind === "notice") {
            return (
              <div key={i} className={`line-notice${line.tone === "error" ? " line-notice-error" : ""}`}>
                {line.text}
              </div>
            );
          }
          return (
            <div key={i} className={`line-${line.kind}`}>
              <span className="line-tag">{line.kind === "user" ? role.toUpperCase() : "PA"}</span>
              <div className="line-content">
                <p>{line.text || (busy && line.kind === "assistant" ? "…" : "")}</p>
                {line.kind === "assistant" && line.text && <CopyButton text={line.text} />}
              </div>
            </div>
          );
        })}
      </div>
      {lines.length > 0 && enabled && (
        <div className="quickask" aria-label="Quick questions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="quickask-chip"
              onClick={() => submit(s)}
              disabled={busy}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="comms-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            !enabled
              ? "Live chat is dark. Browse the paperwork at left."
              : compare
                ? `Ask ${role} and ${vsRole}...`
                : `Ask as ${role}...`
          }
          disabled={!enabled}
          maxLength={2000}
        />
        {busy ? (
          <button type="button" className="comms-stop" onClick={stop}>
            STOP
          </button>
        ) : (
          <button type="submit" disabled={!enabled || !input.trim()}>
            SEND
          </button>
        )}
      </form>
    </section>
  );
}

function LaneView({ lane, primary }: { lane: Lane; primary: boolean }) {
  return (
    <div className={`lane ${primary ? "lane-primary" : "lane-vs"}`}>
      <div className="lane-head">
        <span className="lane-role">{lane.role.toUpperCase()}</span>
        {lane.denied && <span className="stamp-mini">SCOPED OUT</span>}
      </div>
      <div className="lane-body">
        {lane.tools.map((t, k) => (
          <div key={k} className="lane-tool">
            <span title={t.detail}>&raquo; {t.text}</span>
          </div>
        ))}
        {lane.error ? (
          <p className="lane-error">{lane.error}</p>
        ) : (
          <>
            <p className="lane-text">{lane.text || lane.denied || (!lane.done ? "…" : "")}</p>
            {lane.text && <CopyButton text={lane.text} />}
          </>
        )}
      </div>
    </div>
  );
}
