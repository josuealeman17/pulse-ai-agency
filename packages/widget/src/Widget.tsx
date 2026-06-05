import { useEffect, useRef, useState } from "react";
import type { UIMessage, WidgetConfig, WidgetSettings } from "./types.js";
import { fetchConfig, streamChat } from "./api.js";

function getVisitorId(clientId: string): string {
  const key = `pulse_vid_${clientId}`;
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `v_${Math.random().toString(36).slice(2)}`;
  }
}

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
  </svg>
);

export function Widget({ settings }: { settings: WidgetSettings }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolNote, setToolNote] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const visitorId = useRef(getVisitorId(settings.clientId)).current;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load client config once.
  useEffect(() => {
    fetchConfig(settings.apiUrl, settings.clientId)
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [settings.apiUrl, settings.clientId]);

  // Seed greeting on first open.
  useEffect(() => {
    if (open && config && messages.length === 0) {
      setMessages([{ role: "assistant", content: config.greeting }]);
    }
  }, [open, config, messages.length]);

  // Autoscroll on new content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, toolNote]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const history: UIMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setBusy(true);
    setToolNote(null);

    await streamChat(
      settings.apiUrl,
      {
        clientId: settings.clientId,
        sessionId: sessionIdRef.current,
        visitorId,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
      {
        onToken: (chunk) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + chunk };
            }
            return next;
          });
        },
        onTool: (name) => {
          const labels: Record<string, string> = {
            get_available_slots: "Checking availability…",
            book_appointment: "Booking your appointment…",
            transfer_to_human: "Connecting you with our team…",
          };
          setToolNote(labels[name] ?? "Working on it…");
        },
        onDone: (meta) => {
          if (meta.sessionId) sessionIdRef.current = meta.sessionId;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") next[next.length - 1] = { ...last, streaming: false };
            return next;
          });
          setToolNote(null);
          setBusy(false);
        },
        onError: (msg) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && !last.content) {
              next[next.length - 1] = { ...last, content: `⚠️ ${msg}`, streaming: false };
            }
            return next;
          });
          setToolNote(null);
          setBusy(false);
        },
      },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const businessName = config?.businessName ?? "Chat";
  const initial = businessName.charAt(0).toUpperCase();

  return (
    <div className={`root ${settings.position}`}>
      {open && (
        <div className="panel" role="dialog" aria-label={`Chat with ${businessName}`}>
          <div className="header">
            {config?.logoUrl ? (
              <img className="logo" src={config.logoUrl} alt="" />
            ) : (
              <div className="logo-fallback">{initial}</div>
            )}
            <div>
              <div className="title">{businessName}</div>
              <div className="subtitle">Typically replies instantly</div>
            </div>
            <button className="close" onClick={() => setOpen(false)} aria-label="Close chat">
              <CloseIcon />
            </button>
          </div>

          <div className="messages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content || (m.streaming ? (
                  <span className="typing"><span /><span /><span /></span>
                ) : null)}
              </div>
            ))}
            {toolNote && <div className="tool-note">{toolNote}</div>}
          </div>

          <div className="composer">
            <textarea
              rows={1}
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!config}
            />
            <button className="send" onClick={send} disabled={busy || !input.trim() || !config} aria-label="Send">
              <SendIcon />
            </button>
          </div>

          <div className="badge">
            ⚡ Powered by <a href="https://pulse.ai" target="_blank" rel="noreferrer">Pulse</a>
          </div>
        </div>
      )}

      <button className="bubble" onClick={() => setOpen((o) => !o)} aria-label="Open chat">
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}
