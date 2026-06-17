export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: Record<string, unknown> }
  | { type: "denied"; name: string; detail: string }
  | { type: "done"; outputTokens: number }
  | { type: "error"; message: string };

export interface DocEntry {
  name: string;
  description: string;
}

// The document `name` doubles as its identifier (API calls, type detection). Strip
// the file extension only for display so end users never see ".yaml" and friends.
export function displayName(name: string): string {
  return name.replace(/\.(ya?ml|csv|md|pdf|txt|json)$/i, "");
}

export interface DocListing {
  role?: string;
  documents?: DocEntry[];
  error?: string;
  detail?: string;
}

export interface DocContent {
  doc?: string;
  access?: string;
  content?: string;
  error?: string;
  detail?: string;
}

export async function fetchRoles(): Promise<{ roles: string[]; chatEnabled: boolean }> {
  const res = await fetch("/api/roles");
  if (!res.ok) throw new Error("failed to load roles");
  return res.json();
}

export async function fetchDocListing(role: string): Promise<DocListing> {
  const res = await fetch(`/api/docs?role=${encodeURIComponent(role)}`);
  if (!res.ok) throw new Error("failed to load documents");
  return res.json();
}

export async function fetchDoc(role: string, name: string): Promise<DocContent> {
  const res = await fetch(
    `/api/doc?role=${encodeURIComponent(role)}&name=${encodeURIComponent(name)}`,
  );
  if (!res.ok) throw new Error("failed to load document");
  return res.json();
}

export async function streamChat(
  role: string,
  messages: ChatMessage[],
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, messages }),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      onEvent({ type: "error", message: body.error ?? `request failed (${res.status})` });
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.replace(/^data: /, "").trim();
        if (data) onEvent(JSON.parse(data) as AgentEvent);
      }
    }
  } catch (e) {
    // A user-initiated cancel aborts the fetch; that is not an error.
    if (e instanceof DOMException && e.name === "AbortError") return;
    onEvent({ type: "error", message: "Lost the connection to the office. Try again." });
  }
}
