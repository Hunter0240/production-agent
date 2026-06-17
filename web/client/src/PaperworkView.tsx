import { load } from "js-yaml";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders a show document in its familiar production-paperwork layout.
// The raw bundle file (YAML/CSV/Markdown) stays the source of truth; this
// only formats what the server already cleared the role to see. Unknown
// types and parse failures fall back to the raw text.

function tz(value: unknown, fallback = "PT"): string {
  return typeof value === "string" && value ? value : fallback;
}

// js-yaml parses an unquoted `2026-08-22` into a Date (UTC midnight); render
// it back as the plain YYYY-MM-DD calendar date rather than a Date string.
function fmtDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? "" : String(value);
}

// A YAML list item like `- Cancellation: ...` parses as a map, not a string.
// Render any shape as readable text so a single line never crashes the view.
function termText(t: unknown): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    return Object.entries(t as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
  return String(t);
}

// Time-of-day clock for each segment: `start` (HH:MM) plus the cumulative
// MM:SS durations of the preceding segments. Mirrors get_rundown server-side.
function frontTimes(start: string, segments: { duration?: string }[]): string[] {
  const todSeconds = (v: string) => {
    const [h = 0, m = 0, s = 0] = v.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };
  const durSeconds = (v: string) => v.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
  const clock = (sec: number) => {
    const t = ((sec % 86400) + 86400) % 86400;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  };
  let cursor = start ? todSeconds(start) : 0;
  return segments.map((seg) => {
    const at = clock(cursor);
    cursor += durSeconds(seg.duration ?? "00:00");
    return at;
  });
}

// The bundle YAML shapes. js-yaml returns unknown; the dispatcher casts each
// parsed document to the matching shape after a typeof-object guard. Unquoted
// dates parse to Date (see fmtDate), so date-ish fields are YamlScalar.
type YamlScalar = string | number | boolean | Date | null;

interface ShowMeta {
  name?: string;
  format?: string;
  client?: string;
  date?: YamlScalar;
  venue?: string;
  distribution?: string;
  air_window?: { start?: string; end?: string; timezone_label?: string };
}

interface CallSheetData {
  date?: YamlScalar;
  timezone?: string;
  location?: { venue?: string; address?: string; truck_dock?: string };
  nearest_hospital?: { name?: string; address?: string; phone?: string; distance?: string };
  meals?: Record<string, YamlScalar>;
  departments?: { department: string; call?: string; note?: string }[];
  on_air?: string;
  off_air?: string;
  wrap_estimate?: string;
}

interface RundownSegment {
  item: string | number;
  title: string;
  duration?: string;
  talent?: string;
  camera_notes?: string;
}
interface RundownData {
  timezone?: string;
  start?: YamlScalar;
  segments?: RundownSegment[];
}

interface TalentContact {
  name?: string;
  agency?: string;
  email?: string;
  phone?: string;
}
interface TalentEntry {
  name: string;
  billing?: string;
  agent?: TalentContact;
  handler?: TalentContact;
  notes?: string;
}
interface TalentData {
  talent?: TalentEntry[];
}

interface GearItem {
  item: string;
  quantity: number | string;
}
type GearData = Record<string, GearItem[]>;

interface BudgetData {
  summary?: { total?: string; contingency?: string; currency?: string; as_of?: YamlScalar };
  departments?: { name: string; allocated?: string; note?: string }[];
}

interface ContractData {
  role?: string;
  holder?: string;
  department?: string;
  agreement?: Record<string, YamlScalar>;
  dates?: Record<string, YamlScalar>;
  terms?: unknown[];
  status?: string;
}

function ShowOverview({ d }: { d: ShowMeta }) {
  const air = d.air_window ?? {};
  const label = tz(air.timezone_label);
  return (
    <div className="pw">
      <div className="pw-head">
        <h3>{d.name}</h3>
        <span>{d.format}</span>
      </div>
      <dl className="pw-fields">
        <div><dt>Client</dt><dd>{d.client}</dd></div>
        <div><dt>Date</dt><dd>{fmtDate(d.date)}</dd></div>
        <div><dt>Venue</dt><dd>{d.venue}</dd></div>
        <div><dt>Air window</dt><dd>{air.start} - {air.end} {label}</dd></div>
        <div><dt>Distribution</dt><dd>{d.distribution}</dd></div>
      </dl>
    </div>
  );
}

function CallSheet({ d }: { d: CallSheetData }) {
  const label = tz(d.timezone);
  const loc = d.location ?? {};
  const hosp = d.nearest_hospital;
  const meals = d.meals ?? {};
  return (
    <div className="pw">
      <div className="pw-head">
        <h3>Call Sheet</h3>
        <span>{fmtDate(d.date)} / all times {label}</span>
      </div>

      <div className="pw-section">
        <h4>Location</h4>
        <p className="pw-line"><strong>{loc.venue}</strong></p>
        <p className="pw-line">{loc.address}</p>
        {loc.truck_dock && <p className="pw-line pw-dim">Truck dock: {loc.truck_dock}</p>}
      </div>

      {hosp && (
        <div className="pw-section pw-safety">
          <h4>Nearest Hospital</h4>
          <p className="pw-line"><strong>{hosp.name}</strong></p>
          <p className="pw-line">{hosp.address} / {hosp.phone}</p>
          {hosp.distance && <p className="pw-line pw-dim">{hosp.distance}</p>}
        </div>
      )}

      <div className="pw-section">
        <h4>Department Calls</h4>
        <table className="pw-table">
          <thead>
            <tr><th>Dept</th><th>Call ({label})</th><th>Note</th></tr>
          </thead>
          <tbody>
            {(d.departments ?? []).map((row) => (
              <tr key={row.department}>
                <td className="pw-strong">{row.department}</td>
                <td className="pw-clock">{row.call} {label}</td>
                <td className="pw-dim">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pw-grid">
        <div className="pw-section">
          <h4>Meals</h4>
          {Object.entries(meals).map(([k, v]) => (
            <p key={k} className="pw-line"><span className="pw-key">{k}</span> {String(v)}</p>
          ))}
        </div>
        <div className="pw-section">
          <h4>Show Times</h4>
          <p className="pw-line"><span className="pw-key">on air</span> {d.on_air} {label}</p>
          <p className="pw-line"><span className="pw-key">off air</span> {d.off_air} {label}</p>
          {d.wrap_estimate && (
            <p className="pw-line"><span className="pw-key">wrap est</span> {d.wrap_estimate} {label}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Rundown({ d }: { d: RundownData }) {
  const label = tz(d.timezone);
  const segments: RundownSegment[] = d.segments ?? [];
  const fronts = frontTimes(String(d.start ?? ""), segments);
  return (
    <div className="pw">
      <div className="pw-head">
        <h3>Rundown</h3>
        <span>on air {fmtDate(d.start)} {label}</span>
      </div>
      <table className="pw-table pw-rundown">
        <thead>
          <tr>
            <th>#</th>
            <th>Start ({label})</th>
            <th>Segment</th>
            <th>Dur</th>
            <th>Talent</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s, i) => (
            <tr key={s.item}>
              <td className="pw-item">{s.item}</td>
              <td className="pw-clock">{fronts[i]}</td>
              <td>
                <span className="pw-strong">{s.title}</span>
                {s.camera_notes && <span className="pw-notes">{s.camera_notes}</span>}
              </td>
              <td className="pw-clock">{s.duration}</td>
              <td className="pw-dim">{s.talent || "--"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrewTable({ rows }: { rows: Record<string, string>[] }) {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className="pw">
      <div className="pw-head"><h3>Crew Contact Sheet</h3><span>{rows.length} crew</span></div>
      <table className="pw-table">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c} className={c === "name" ? "pw-strong" : ""}>{r[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TalentCards({ d }: { d: TalentData }) {
  return (
    <div className="pw">
      <div className="pw-head"><h3>Talent Contacts</h3><span>restricted</span></div>
      {(d.talent ?? []).map((t) => (
        <div key={t.name} className="pw-card">
          <div className="pw-card-head">
            <strong>{t.name}</strong>
            <span className="pw-badge">{t.billing}</span>
          </div>
          {t.agent && (
            <p className="pw-line"><span className="pw-key">agent</span> {t.agent.name}, {t.agent.agency} / {t.agent.email} / {t.agent.phone}</p>
          )}
          {t.handler && (
            <p className="pw-line"><span className="pw-key">handler</span> {t.handler.name} / {t.handler.email} / {t.handler.phone}</p>
          )}
          {t.notes && <p className="pw-line pw-dim">{t.notes}</p>}
        </div>
      ))}
    </div>
  );
}

function GearManifest({ d }: { d: GearData }) {
  return (
    <div className="pw">
      <div className="pw-head"><h3>Gear Manifest</h3><span>by department</span></div>
      {Object.entries(d).map(([dept, items]) => (
        <div key={dept} className="pw-section">
          <h4>{dept}</h4>
          <table className="pw-table">
            <tbody>
              {items.map((g, i) => (
                <tr key={i}><td>{g.item}</td><td className="pw-clock">x{g.quantity}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Budget({ d }: { d: BudgetData }) {
  const s = d.summary ?? {};
  const depts = d.departments ?? [];
  return (
    <div className="pw">
      <div className="pw-head"><h3>Production Budget</h3><span>by department</span></div>
      <dl className="pw-fields">
        {s.total && <div><dt>Total</dt><dd>{s.total}</dd></div>}
        {s.contingency && <div><dt>Contingency</dt><dd>{s.contingency}</dd></div>}
        {s.as_of && <div><dt>As of</dt><dd>{fmtDate(s.as_of)}</dd></div>}
      </dl>
      <div className="pw-section">
        <h4>Allocations</h4>
        <table className="pw-table">
          <thead><tr><th>Department</th><th>Allocated</th><th>Note</th></tr></thead>
          <tbody>
            {depts.map((r) => (
              <tr key={r.name}>
                <td className="pw-strong">{r.name}</td>
                <td className="pw-clock">{r.allocated}</td>
                <td className="pw-dim">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Contract({ d }: { d: ContractData }) {
  const agreement = d.agreement ?? {};
  const dates = d.dates ?? {};
  const terms = d.terms ?? [];
  return (
    <div className="pw">
      <div className="pw-head"><h3>Engagement Agreement</h3><span>{d.status ?? "personal"}</span></div>
      <dl className="pw-fields">
        <div><dt>Role</dt><dd>{d.role}</dd></div>
        {d.holder && <div><dt>Holder</dt><dd>{d.holder}</dd></div>}
        {d.department && <div><dt>Department</dt><dd>{d.department}</dd></div>}
      </dl>
      <div className="pw-section">
        <h4>Terms of Engagement</h4>
        {Object.entries(agreement).map(([k, v]) => (
          <p key={k} className="pw-line"><span className="pw-key">{k.replace(/_/g, " ")}</span> {String(v)}</p>
        ))}
      </div>
      {Object.keys(dates).length > 0 && (
        <div className="pw-section">
          <h4>Dates</h4>
          {Object.entries(dates).map(([k, v]) => (
            <p key={k} className="pw-line"><span className="pw-key">{k.replace(/_/g, " ")}</span> {fmtDate(v)}</p>
          ))}
        </div>
      )}
      {terms.length > 0 && (
        <div className="pw-section">
          <h4>Conditions</h4>
          {terms.map((t, i) => (
            <p key={i} className="pw-line pw-dim">- {termText(t)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

export function PaperworkView({ name, content }: { name: string; content: string }) {
  // Content arrives empty for one render while the fetch is in flight; render
  // a placeholder rather than parsing an empty string into undefined.
  if (!content) return <pre className="doc-content">...</pre>;
  try {
    if (name.endsWith(".md")) {
      return (
        <div className="pw pw-md">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
      );
    }
    if (name === "crew.csv") {
      return <CrewTable rows={parseCsv(content)} />;
    }
    if (name.endsWith(".yaml")) {
      const d = load(content);
      if (d && typeof d === "object") {
        if (name === "show.yaml") return <ShowOverview d={d as ShowMeta} />;
        if (name === "callsheet.yaml") return <CallSheet d={d as CallSheetData} />;
        if (name === "rundown.yaml") return <Rundown d={d as RundownData} />;
        if (name === "talent-contacts.yaml") return <TalentCards d={d as TalentData} />;
        if (name === "gear-manifest.yaml") return <GearManifest d={d as GearData} />;
        if (name === "budget.yaml") return <Budget d={d as BudgetData} />;
        if (name.startsWith("contract-")) return <Contract d={d as ContractData} />;
      }
    }
  } catch {
    // fall through to raw
  }
  return <pre className="doc-content">{content || "..."}</pre>;
}
