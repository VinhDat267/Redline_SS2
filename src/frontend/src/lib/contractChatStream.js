const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export function parseSseFrames(buffer) {
  const parts = buffer.split("\n\n");
  const remainingBuffer = parts.pop() ?? "";
  const events = parts
    .map((rawEvent) => parseSseEvent(rawEvent))
    .filter((event) => event !== null);

  return { events, remainingBuffer };
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) {
      event = line.slice("event: ".length);
    }
    if (line.startsWith("data: ")) {
      data += line.slice("data: ".length);
    }
  }

  return { event, data: data ? JSON.parse(data) : null };
}

export async function streamChatAttempt({
  token,
  endpoint,
  onEvent,
  signal,
  fetchImpl = fetch
}) {
  const response = await fetchImpl(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "text/event-stream",
      ...(token ? { "X-CSRF-Token": token } : {})
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`Stream request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseFrames(buffer);
    buffer = parsed.remainingBuffer;
    for (const event of parsed.events) {
      onEvent?.(event);
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseFrames(`${buffer}\n\n`);
    for (const event of parsed.events) {
      onEvent?.(event);
    }
  }
}
