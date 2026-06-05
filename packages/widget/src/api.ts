import type { UIMessage, WidgetConfig } from "./types.js";

export async function fetchConfig(apiUrl: string, clientId: string): Promise<WidgetConfig> {
  const res = await fetch(`${apiUrl}/chat/config?clientId=${encodeURIComponent(clientId)}`);
  if (!res.ok) throw new Error(`config ${res.status}`);
  return res.json();
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onTool?: (name: string) => void;
  onDone?: (meta: { sessionId: string | null }) => void;
  onError?: (message: string) => void;
}

/**
 * POST a chat turn and consume the Server-Sent Events stream.
 * EventSource only supports GET, so we parse the SSE framing manually off the
 * fetch body reader.
 */
export async function streamChat(
  apiUrl: string,
  payload: {
    clientId: string;
    sessionId: string | null;
    visitorId: string;
    messages: Pick<UIMessage, "role" | "content">[];
  },
  cb: StreamCallbacks,
): Promise<void> {
  const res = await fetch(`${apiUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    cb.onError?.(`Request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      }
      const data = dataLines.join("\n");

      switch (eventName) {
        case "token":
          cb.onToken(data);
          break;
        case "tool":
          cb.onTool?.(data);
          break;
        case "done":
          try {
            cb.onDone?.(JSON.parse(data));
          } catch {
            cb.onDone?.({ sessionId: null });
          }
          break;
        case "error":
          cb.onError?.(data);
          break;
      }
    }
  }
}
