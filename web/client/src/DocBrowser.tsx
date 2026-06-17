import { useEffect, useState } from "react";
import { fetchDoc, fetchDocListing, displayName, type DocEntry } from "./api";
import { PaperworkView } from "./PaperworkView";

export function DocBrowser({ role }: { role: string }) {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [denied, setDenied] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("LOADING MANIFEST...");

  useEffect(() => {
    setSelected(null);
    setContent("");
    setDenied(null);
    setNotice("LOADING MANIFEST...");
    fetchDocListing(role)
      .then((listing) => {
        const documents = listing.documents ?? [];
        setDocs(documents);
        setNotice(documents.length ? "" : "NO DOCUMENTS VISIBLE TO THIS ROLE");
      })
      .catch(() => setNotice("MANIFEST UNAVAILABLE"));
  }, [role]);

  async function open(name: string) {
    setSelected(name);
    setContent("");
    setDenied(null);
    try {
      const doc = await fetchDoc(role, name);
      if (doc.content !== undefined) setContent(doc.content);
      else setDenied(doc.detail ?? "ACCESS DENIED FOR THIS ROLE");
    } catch {
      setDenied("DOCUMENT UNAVAILABLE");
    }
  }

  return (
    <section className="panel docs">
      <div className="panel-rail">
        <h2 className="panel-title">SHOW PAPERWORK</h2>
        <span className="panel-sub">CLEARED FOR {role.toUpperCase()}</span>
        {notice && <p className="rail-notice">{notice}</p>}
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.name}>
              <button
                className={selected === d.name ? "doc-item active" : "doc-item"}
                onClick={() => open(d.name)}
              >
                <span className="doc-name">{displayName(d.name)}</span>
                <span className="doc-desc">{d.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-body doc-view">
        {selected === null ? (
          <div className="doc-empty">
            <p>SELECT A DOCUMENT</p>
            <p className="doc-empty-sub">
              The list at left is already filtered to what a {role} is cleared to read. Switch
              roles in the masthead to watch it change.
            </p>
          </div>
        ) : denied ? (
          <div className="doc-denied">
            <span className="denied-stamp">ACCESS DENIED</span>
            <p>{denied}</p>
          </div>
        ) : (
          <PaperworkView name={selected} content={content} />
        )}
      </div>
    </section>
  );
}
