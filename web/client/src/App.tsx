import { useEffect, useState } from "react";
import { fetchRoles } from "./api";
import { Chat } from "./Chat";
import { DocBrowser } from "./DocBrowser";

export function App() {
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string>("camera operator");
  // "" means no comparison (single answer). Any other role turns the chat into a
  // side-by-side compare between `role` and `compareRole`.
  const [compareRole, setCompareRole] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A role can never compare against itself; drop the comparison if the pinned
  // role is changed to match it.
  useEffect(() => {
    if (compareRole === role) setCompareRole("");
  }, [role, compareRole]);

  function load() {
    setLoadError(null);
    fetchRoles()
      .then(({ roles, chatEnabled }) => {
        setRoles(roles);
        setChatEnabled(chatEnabled);
        if (!roles.includes("camera operator") && roles.length > 0) setRole(roles[0]);
      })
      .catch(() => setLoadError("backend unreachable"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="frame">
      <header className="masthead">
        <div className="masthead-id">
          <span className="wordmark">
            PRODUCTION AGENT <em>PA</em>
          </span>
          <span className="show-slug">HARBOR LIGHTS BENEFIT CONCERT / LIVE 2HR</span>
        </div>
        <div className="masthead-controls">
          <label className="role-pin">
            <span className="role-pin-label">ASKING AS</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
              {(roles.length ? roles : [role]).map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="role-pin">
            <span className="role-pin-label">COMPARE TO</span>
            <select
              value={compareRole}
              onChange={(e) => setCompareRole(e.target.value)}
              disabled={busy || !chatEnabled}
            >
              <option value="">NONE</option>
              {roles
                .filter((r) => r !== role)
                .map((r) => (
                  <option key={r} value={r}>
                    {r.toUpperCase()}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </header>

      {loadError ? (
        <div className="dead-air">
          <p>{loadError.toUpperCase()}</p>
          <button className="dead-air-retry" onClick={load}>
            RETRY
          </button>
        </div>
      ) : (
        <main className="stage">
          <DocBrowser role={role} />
          <Chat
            role={role}
            vsRole={compareRole}
            enabled={chatEnabled}
            busy={busy}
            setBusy={setBusy}
          />
        </main>
      )}

      <footer className="legal">
        <span>
          PERMISSION-AWARE RETRIEVAL DEMO. EVERY ANSWER IS FILTERED THROUGH THE SELECTED ROLE,
          SERVER-SIDE.
        </span>
        <a href="https://github.com/Hunter0240/production-agent" target="_blank" rel="noreferrer">
          SOURCE: GITHUB/HUNTER0240/PRODUCTION-AGENT
        </a>
      </footer>
    </div>
  );
}
