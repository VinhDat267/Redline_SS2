import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ContractChatPage } from "./ContractChatPage";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

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

function cancellableStreamResponse(chunks, signal) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }

        signal?.addEventListener("abort", () => {
          const abortError = new Error("Aborted");
          abortError.name = "AbortError";
          controller.error(abortError);
        });
      }
    })
  };
}

const session = {
  token: "token-123",
  user: {
    id: 1,
    email: "reviewer@example.com",
    display_name: "Redline Tester",
    is_active: true
  }
};

function buildContractPayload(overrides = {}) {
  return {
    data: {
      id: 10,
      project_id: 1,
      title: "Vendor NDA",
      contract_type: "NDA",
      description: "Vendor confidentiality agreement",
      created_at: "2026-03-26T08:00:00Z",
      updated_at: "2026-03-26T08:00:00Z",
      ...overrides
    }
  };
}

function buildContractDraft(overrides = {}) {
  return {
    id: 501,
    contract_id: 10,
    draft_label: "vendor-v1",
    file_name: "vendor-v1.docx",
    file_path: "uploads/document-10/vendor-v1.docx",
    parse_status: "parsed",
    parsed_snapshot: null,
    uploaded_at: "2026-03-26T08:00:00Z",
    notes: "Initial vendor draft",
    uploaded_by_display_name: "Redline Tester",
    active_parse_run_id: 401,
    warning_count: 0,
    parser_version: "v1",
    ...overrides
  };
}

function buildContractCompareRun(overrides = {}) {
  return {
    id: 77,
    compare_version: "v1",
    compare_status: "completed",
    started_at: "2026-03-26T09:00:00Z",
    completed_at: "2026-03-26T09:00:01Z",
    warning_count: 0,
    warnings: [],
    contract: buildContractPayload().data,
    source_draft: buildContractDraft({ id: 501, draft_label: "vendor-v1" }),
    target_draft: buildContractDraft({ id: 502, draft_label: "vendor-v2" }),
    summary: { total: 1, added: 0, removed: 0, modified: 1 },
    selected_clause_change_id: 990,
    has_ai_clause_risk_analyses: false,
    ...overrides
  };
}

function renderContractChat(path = "/contracts/10/chat") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ContractChatPage />} path="/contracts/:contractId/chat" />
          <Route element={<p>Contract Workspace Route</p>} path="/contracts/:contractId" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("ContractChatPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("creates a contract chat session and renders grounded answer citations", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [buildContractDraft()] }));
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 701,
                contract_id: 10,
                draft_id: 501,
                title: "Vendor NDA Q&A",
                created_by_user_id: 1,
                created_at: "2026-03-26T09:00:00Z",
                updated_at: "2026-03-26T09:00:00Z"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                session_id: 701,
                user_message: {
                  id: 801,
                  role: "user",
                  content: "What is the liability cap?",
                  citations: [],
                  provider_used: "local-rag",
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                attempt: {
                  id: 901,
                  session_id: 701,
                  draft_id: 501,
                  user_message_id: 801,
                  supersedes_attempt_id: null,
                  status: "starting",
                  provider_used: null,
                  client_request_id: "req-test",
                  error_code: null,
                  error_detail: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                stream_endpoint: "/api/v1/contracts/10/chat/sessions/701/attempts/901/stream",
                cancel_endpoint: "/api/v1/contracts/10/chat/sessions/701/attempts/901/cancel"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/stream") && method === "POST") {
        return Promise.resolve(
          streamResponse([
            "event: metadata\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":1}\n\n",
            "event: status\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":2,\"status\":\"grounding\"}\n\n",
            "event: delta\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":3,\"content\":\"The liability cap\"}\n\n",
            "event: delta\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":4,\"content\":\" is limited to $1,000,000.\"}\n\n",
            "event: citations\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":5,\"citations\":[{\"block_id\":9901,\"block_key\":\"blk-0001\",\"section_title\":\"Limitation of Liability\",\"surface_type\":\"body\",\"surface_key\":\"body-main\",\"content\":\"The liability cap is limited to $1,000,000.\"}]}\n\n",
            "event: done\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":6,\"assistant_message\":{\"id\":802,\"role\":\"assistant\",\"content\":\"The liability cap is limited to $1,000,000.\",\"citations\":[{\"block_id\":9901,\"block_key\":\"blk-0001\",\"section_title\":\"Limitation of Liability\",\"surface_type\":\"body\",\"surface_key\":\"body-main\",\"content\":\"The liability cap is limited to $1,000,000.\"}],\"provider_used\":\"local-rag\",\"created_at\":\"2026-03-26T09:00:06Z\",\"updated_at\":\"2026-03-26T09:00:06Z\"}}\n\n"
          ])
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractChat();

    expect(await screen.findByRole("heading", { name: /contract chat/i })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /chat sessions/i })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: /contract conversation/i })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /source evidence/i })).toBeInTheDocument();
    expect(screen.getByText(/ready for grounded q&a/i)).toBeInTheDocument();
    expect(screen.getByText(/test session memory/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /source evidence/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/back to contract/i)).toHaveAttribute("href", "/contracts/10");
    expect(screen.getByRole("option", { name: "vendor-v1" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ask about this contract/i), {
      target: { value: "What is the liability cap?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/limited to \$1,000,000/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/limitation of liability/i).length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      const sessionCall = fetch.mock.calls.find(
        ([requestUrl, requestInit = {}]) =>
          String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions") &&
          (requestInit.method || "GET") === "POST"
      );
      expect(sessionCall).toBeTruthy();
    });

    const attemptCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions/701/attempts") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(attemptCall).toBeTruthy();
    const [, requestInit] = attemptCall;
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody).toEqual({
      query: "What is the liability cap?",
      draft_id: 501,
      client_request_id: expect.any(String)
    });

    const streamCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/stream") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(streamCall).toBeTruthy();
  });

  test("creates compare-scoped chat sessions for questions across two drafts", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              buildContractDraft({ id: 501, draft_label: "vendor-v1" }),
              buildContractDraft({ id: 502, draft_label: "vendor-v2" })
            ]
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [buildContractCompareRun()] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 771,
                contract_id: 10,
                draft_id: 502,
                compare_run_id: 77,
                scope_type: "compare_run",
                title: "vendor-v1 -> vendor-v2 Q&A",
                created_by_user_id: 1,
                created_at: "2026-03-26T09:00:00Z",
                updated_at: "2026-03-26T09:00:00Z"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/771/attempts") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                session_id: 771,
                user_message: {
                  id: 881,
                  role: "user",
                  content: "What changed in the liability cap?",
                  citations: [],
                  provider_used: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                attempt: {
                  id: 981,
                  session_id: 771,
                  draft_id: 502,
                  user_message_id: 881,
                  supersedes_attempt_id: null,
                  status: "starting",
                  provider_used: null,
                  client_request_id: "req-compare",
                  error_code: null,
                  error_detail: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                stream_endpoint: "/api/v1/contracts/10/chat/sessions/771/attempts/981/stream",
                cancel_endpoint: "/api/v1/contracts/10/chat/sessions/771/attempts/981/cancel"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/771/attempts/981/stream") && method === "POST") {
        return Promise.resolve(
          streamResponse([
            "event: metadata\ndata: {\"attempt_id\":981,\"session_id\":771,\"sequence\":1}\n\n",
            "event: delta\ndata: {\"attempt_id\":981,\"session_id\":771,\"sequence\":2,\"content\":\"The liability cap changed from $100,000 to $250,000.\"}\n\n",
            "event: citations\ndata: {\"attempt_id\":981,\"session_id\":771,\"sequence\":3,\"citations\":[{\"block_id\":9901,\"block_key\":\"src-1\",\"section_title\":\"Liability\",\"surface_type\":\"body\",\"surface_key\":\"body-main\",\"content\":\"The liability cap is $100,000.\",\"source_label\":\"source\",\"compare_run_id\":77,\"change_item_id\":990},{\"block_id\":9902,\"block_key\":\"tgt-1\",\"section_title\":\"Liability\",\"surface_type\":\"body\",\"surface_key\":\"body-main\",\"content\":\"The liability cap is $250,000.\",\"source_label\":\"target\",\"compare_run_id\":77,\"change_item_id\":990}]}\n\n",
            "event: done\ndata: {\"attempt_id\":981,\"session_id\":771,\"sequence\":4,\"assistant_message\":{\"id\":882,\"role\":\"assistant\",\"content\":\"The liability cap changed from $100,000 to $250,000.\",\"citations\":[{\"block_id\":9901,\"block_key\":\"src-1\",\"section_title\":\"Liability\",\"surface_type\":\"body\",\"surface_key\":\"body-main\",\"content\":\"The liability cap is $100,000.\",\"source_label\":\"source\",\"compare_run_id\":77,\"change_item_id\":990},{\"block_id\":9902,\"block_key\":\"tgt-1\",\"section_title\":\"Liability\",\"surface_type\":\"body\",\"surface_key\":\"body-main\",\"content\":\"The liability cap is $250,000.\",\"source_label\":\"target\",\"compare_run_id\":77,\"change_item_id\":990}],\"provider_used\":\"local-compare\",\"created_at\":\"2026-03-26T09:00:06Z\",\"updated_at\":\"2026-03-26T09:00:06Z\"}}\n\n"
          ])
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractChat();

    fireEvent.click(await screen.findByRole("button", { name: /compared drafts/i }));
    expect(screen.getByRole("combobox", { name: /compare run/i })).toHaveValue("77");

    fireEvent.change(screen.getByLabelText(/ask about this contract/i), {
      target: { value: "What changed in the liability cap?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/changed from \$100,000 to \$250,000/i)).toBeInTheDocument();
    expect(screen.getAllByText(/source/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/target/i).length).toBeGreaterThan(0);

    const sessionCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(JSON.parse(sessionCall[1].body)).toEqual({
      draft_id: 502,
      compare_run_id: 77,
      title: "vendor-v1 -> vendor-v2 Q&A"
    });

    const attemptCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions/771/attempts") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(JSON.parse(attemptCall[1].body)).toMatchObject({
      query: "What changed in the liability cap?",
      draft_id: 502
    });
  });

  test("stops an active stream and retries in the same answer bubble", async () => {
    let attemptCreateCount = 0;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [buildContractDraft()] }));
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 701,
                contract_id: 10,
                draft_id: 501,
                title: "Vendor NDA Q&A",
                created_by_user_id: 1,
                created_at: "2026-03-26T09:00:00Z",
                updated_at: "2026-03-26T09:00:00Z"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts") && method === "POST") {
        attemptCreateCount += 1;
        const isRetry = attemptCreateCount === 2;
        const attemptId = isRetry ? 902 : 901;
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                session_id: 701,
                user_message: {
                  id: isRetry ? 803 : 801,
                  role: "user",
                  content: "What is the liability cap?",
                  citations: [],
                  provider_used: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                attempt: {
                  id: attemptId,
                  session_id: 701,
                  draft_id: 501,
                  user_message_id: isRetry ? 803 : 801,
                  supersedes_attempt_id: isRetry ? 901 : null,
                  status: "starting",
                  provider_used: null,
                  client_request_id: isRetry ? "req-retry" : "req-stop",
                  error_code: null,
                  error_detail: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                stream_endpoint: `/api/v1/contracts/10/chat/sessions/701/attempts/${attemptId}/stream`,
                cancel_endpoint: `/api/v1/contracts/10/chat/sessions/701/attempts/${attemptId}/cancel`
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/stream") && method === "POST") {
        return Promise.resolve(
          cancellableStreamResponse(
            [
              "event: metadata\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":1}\n\n",
              "event: status\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":2,\"status\":\"answering\"}\n\n",
              "event: delta\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":3,\"content\":\"The liability cap\"}\n\n"
            ],
            init.signal
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/cancel") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 901,
              session_id: 701,
              draft_id: 501,
              user_message_id: 801,
              supersedes_attempt_id: null,
              status: "cancelling",
              provider_used: null,
              client_request_id: "req-stop",
              error_code: null,
              error_detail: null,
              created_at: "2026-03-26T09:00:05Z",
              updated_at: "2026-03-26T09:00:06Z"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/902/stream") && method === "POST") {
        return Promise.resolve(
          streamResponse([
            "event: metadata\ndata: {\"attempt_id\":902,\"session_id\":701,\"sequence\":1}\n\n",
            "event: delta\ndata: {\"attempt_id\":902,\"session_id\":701,\"sequence\":2,\"content\":\"The liability cap is capped at monthly fees.\"}\n\n",
            "event: done\ndata: {\"attempt_id\":902,\"session_id\":701,\"sequence\":3,\"assistant_message\":{\"id\":804,\"role\":\"assistant\",\"content\":\"The liability cap is capped at monthly fees.\",\"citations\":[],\"provider_used\":\"local-rag\",\"created_at\":\"2026-03-26T09:00:07Z\",\"updated_at\":\"2026-03-26T09:00:07Z\"}}\n\n"
          ])
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractChat();

    fireEvent.change(await screen.findByLabelText(/ask about this contract/i), {
      target: { value: "What is the liability cap?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("The liability cap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new session/i })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /parsed draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /vendor nda q&a/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() => {
      const cancelCall = fetch.mock.calls.find(
        ([requestUrl, requestInit = {}]) =>
          String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/cancel") &&
          (requestInit.method || "GET") === "POST"
      );
      expect(cancelCall).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("bubble-stopped-badge").length).toBeGreaterThan(0);
    });
    expect((await screen.findAllByRole("button", { name: /retry answer/i })).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /retry answer/i })[0]);

    expect(await screen.findByText("The liability cap is capped at monthly fees.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("bubble-stopped-badge")).toHaveLength(0);

    const retryAttemptCall = fetch.mock.calls.filter(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/contracts/10/chat/sessions/701/attempts") &&
        (requestInit.method || "GET") === "POST"
    )[1];
    expect(JSON.parse(retryAttemptCall[1].body)).toEqual({
      query: "What is the liability cap?",
      draft_id: 501,
      client_request_id: expect.any(String),
      supersedes_attempt_id: 901
    });
  });

  test("restores a stopped partial answer from local storage after reload", async () => {
    let sessionCreated = false;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [buildContractDraft()] }));
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: sessionCreated
              ? [
                {
                  id: 701,
                  contract_id: 10,
                  draft_id: 501,
                  title: "Vendor NDA Q&A",
                  created_by_user_id: 1,
                  created_at: "2026-03-26T09:00:00Z",
                  updated_at: "2026-03-26T09:00:00Z"
                }
              ]
              : []
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "POST") {
        sessionCreated = true;
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 701,
                contract_id: 10,
                draft_id: 501,
                title: "Vendor NDA Q&A",
                created_by_user_id: 1,
                created_at: "2026-03-26T09:00:00Z",
                updated_at: "2026-03-26T09:00:00Z"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/messages") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 801,
                role: "user",
                content: "What is the liability cap?",
                citations: [],
                provider_used: null,
                created_at: "2026-03-26T09:00:05Z",
                updated_at: "2026-03-26T09:00:05Z"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                session_id: 701,
                user_message: {
                  id: 801,
                  role: "user",
                  content: "What is the liability cap?",
                  citations: [],
                  provider_used: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                attempt: {
                  id: 901,
                  session_id: 701,
                  draft_id: 501,
                  user_message_id: 801,
                  supersedes_attempt_id: null,
                  status: "starting",
                  provider_used: null,
                  client_request_id: "req-stop",
                  error_code: null,
                  error_detail: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                stream_endpoint: "/api/v1/contracts/10/chat/sessions/701/attempts/901/stream",
                cancel_endpoint: "/api/v1/contracts/10/chat/sessions/701/attempts/901/cancel"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/stream") && method === "POST") {
        return Promise.resolve(
          cancellableStreamResponse(
            [
              "event: metadata\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":1}\n\n",
              "event: delta\ndata: {\"attempt_id\":901,\"session_id\":701,\"sequence\":2,\"content\":\"The liability cap\"}\n\n"
            ],
            init.signal
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/attempts/901/cancel") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 901,
              session_id: 701,
              draft_id: 501,
              user_message_id: 801,
              supersedes_attempt_id: null,
              status: "cancelled",
              provider_used: null,
              client_request_id: "req-stop",
              error_code: null,
              error_detail: null,
              created_at: "2026-03-26T09:00:05Z",
              updated_at: "2026-03-26T09:00:06Z"
            }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    const firstRender = renderContractChat();

    fireEvent.change(await screen.findByLabelText(/ask about this contract/i), {
      target: { value: "What is the liability cap?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("The liability cap")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect((await screen.findAllByTestId("bubble-stopped-badge")).length).toBeGreaterThan(0);

    firstRender.unmount();
    renderContractChat();

    expect(await screen.findByText("The liability cap")).toBeInTheDocument();
    expect(screen.getAllByTestId("bubble-stopped-badge").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /retry answer/i })).toBeInTheDocument();
  });

  test("uses JSON chat fallback when streaming is disabled by env", async () => {
    vi.stubEnv("VITE_CONTRACT_CHAT_STREAMING_ENABLED", "false");

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [buildContractDraft()] }));
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 701,
                contract_id: 10,
                draft_id: 501,
                title: "Vendor NDA Q&A",
                created_by_user_id: 1,
                created_at: "2026-03-26T09:00:00Z",
                updated_at: "2026-03-26T09:00:00Z"
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/701/messages") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                session_id: 701,
                user_message: {
                  id: 801,
                  role: "user",
                  content: "What is the liability cap?",
                  citations: [],
                  provider_used: null,
                  created_at: "2026-03-26T09:00:05Z",
                  updated_at: "2026-03-26T09:00:05Z"
                },
                assistant_message: {
                  id: 802,
                  role: "assistant",
                  content: "The liability cap is limited to $1,000,000.",
                  citations: [
                    {
                      block_id: 9901,
                      block_key: "blk-0001",
                      section_title: "Limitation of Liability",
                      surface_type: "body",
                      surface_key: "body-main",
                      content: "The liability cap is limited to $1,000,000."
                    }
                  ],
                  provider_used: "local-rag",
                  created_at: "2026-03-26T09:00:06Z",
                  updated_at: "2026-03-26T09:00:06Z"
                }
              }
            },
            201
          )
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractChat();

    fireEvent.change(await screen.findByLabelText(/ask about this contract/i), {
      target: { value: "What is the liability cap?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect((await screen.findAllByText("The liability cap is limited to $1,000,000.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Limitation of Liability").length).toBeGreaterThan(0);

    const attemptCalls = fetch.mock.calls.filter(
      ([requestUrl]) => String(requestUrl).includes("/attempts")
    );
    expect(attemptCalls).toHaveLength(0);
  });

  test("shows session status badges and citation evidence panel", async () => {
    window.localStorage.setItem(
      "redline.contractChat.partial.10.702",
      JSON.stringify({
        id: "attempt-901",
        attempt_id: 901,
        session_id: 702,
        draft_id: 501,
        source_query: "What is the liability cap?",
        role: "assistant",
        content: "The liability cap",
        citations: [],
        provider_used: null,
        created_at: "2026-03-26T10:00:05Z",
        updated_at: "2026-03-26T10:00:06Z",
        streaming: false,
        stopped: true,
        failed: false,
        status: "cancelled",
        status_label: "Stopped"
      })
    );

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [buildContractDraft()] }));
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 701,
                contract_id: 10,
                draft_id: 501,
                title: "Stopped Review",
                created_by_user_id: 1,
                created_at: "2026-03-26T09:00:00Z",
                updated_at: "2026-03-26T09:00:00Z"
              },
              {
                id: 702,
                contract_id: 10,
                draft_id: 501,
                title: "Completed Review",
                created_by_user_id: 1,
                created_at: "2026-03-26T10:00:00Z",
                updated_at: "2026-03-26T10:00:00Z"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/chat/sessions/702/messages") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 810,
                role: "user",
                content: "What is the liability cap?",
                citations: [],
                provider_used: null,
                created_at: "2026-03-26T10:00:05Z",
                updated_at: "2026-03-26T10:00:05Z"
              },
              {
                id: 811,
                role: "assistant",
                content: "The liability cap is limited to $1,000,000.",
                citations: [
                  {
                    block_id: 9901,
                    block_key: "blk-0001",
                    section_title: "Limitation of Liability",
                    surface_type: "body",
                    surface_key: "body-main",
                    content: "The liability cap is limited to $1,000,000."
                  }
                ],
                provider_used: "local-rag",
                created_at: "2026-03-26T10:00:06Z",
                updated_at: "2026-03-26T10:00:06Z"
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractChat();

    expect(await screen.findByText("Completed Review")).toBeInTheDocument();
    expect(screen.getByText("Stopped Review")).toBeInTheDocument();
    expect(screen.getAllByText("Stopped").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);

    expect(screen.getByRole("heading", { name: /source evidence/i })).toBeInTheDocument();
    expect(screen.getAllByText("Limitation of Liability").length).toBeGreaterThan(0);
    expect(screen.getAllByText("body-main").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /inspect citation limitation of liability/i })).toBeInTheDocument();
  });
});
