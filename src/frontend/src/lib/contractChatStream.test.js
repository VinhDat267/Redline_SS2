import { describe, expect, test, vi } from "vitest";

import { parseSseFrames, streamChatAttempt } from "./contractChatStream";

function streamResponse(chunks) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    })
  };
}

describe("parseSseFrames", () => {
  test("parses complete SSE events and keeps incomplete buffer", () => {
    const result = parseSseFrames(
      "event: status\ndata: {\"sequence\":1,\"status\":\"grounding\"}\n\n" +
      "event: delta\ndata: {\"sequence\":2,\"content\":\"Hello\"}\n\n" +
      "event: delta\ndata:"
    );

    expect(result.events).toEqual([
      { event: "status", data: { sequence: 1, status: "grounding" } },
      { event: "delta", data: { sequence: 2, content: "Hello" } }
    ]);
    expect(result.remainingBuffer).toBe("event: delta\ndata:");
  });
});

describe("streamChatAttempt", () => {
  test("streams authenticated events in order", async () => {
    const onEvent = vi.fn();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          "event: metadata\ndata: {\"attempt_id\":901,\"sequence\":1}\n\n",
          "event: delta\ndata: {\"attempt_id\":901,\"sequence\":2,\"content\":\"The cap\"}\n\n",
          "event: done\ndata: {\"attempt_id\":901,\"sequence\":3}\n\n"
        ])
      )
    );

    await streamChatAttempt({
      token: "token-123",
      endpoint: "/api/v1/contracts/10/chat/sessions/701/attempts/901/stream",
      fetchImpl: fetchMock,
      onEvent
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/contracts/10/chat/sessions/701/attempts/901/stream"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "X-CSRF-Token": "token-123",
          Accept: "text/event-stream"
        })
      })
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(onEvent.mock.calls.map(([event]) => event.event)).toEqual(["metadata", "delta", "done"]);
  });
});
