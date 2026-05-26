import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { CompareScreenPage } from "./CompareScreenPage";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
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

function buildCompareRunPayload(overrides = {}) {
  return {
    data: {
      id: 55,
      compare_version: "v1",
      compare_status: "completed_with_warnings",
      started_at: "2026-03-26T09:05:00Z",
      completed_at: "2026-03-26T09:05:05Z",
      warning_count: 1,
      warnings: ["Table row alignment fell back for body/body-main tbl-0000."],
      document: {
        id: 10,
        project_id: 1,
        title: "Software Requirements Specification",
        document_type: "SRS",
        description: "Production SRS"
      },
      source_version: {
        id: 101,
        document_id: 10,
        version_label: "v1.0",
        parse_status: "parsed",
        active_parse_run_id: 301,
        warning_count: 0,
        parser_version: "v1"
      },
      target_version: {
        id: 102,
        document_id: 10,
        version_label: "v1.1",
        parse_status: "parsed_with_warnings",
        active_parse_run_id: 302,
        warning_count: 1,
        parser_version: "v1"
      },
      summary: {
        total_changes: 1,
        added: 0,
        removed: 0,
        modified: 1
      },
      selected_change_item_id: 900,
      has_ai_review_drafts: false,
      impact_summary_ready: false,
      active_ai_batch_job: null,
      ai_batch_summary: null,
      ...overrides
    }
  };
}

function buildQueueItem(overrides = {}) {
  return {
    id: 900,
    compare_run_id: 55,
    change_type: "modified",
    review_status: "open",
    section_title: "Requirements",
    surface_type: "body",
    surface_key: "body-main",
    container_type: "text_flow",
    container_key: "body-main",
    table_key: null,
    row_key: null,
    old_content: "The system shall support login.",
    new_content: "The system shall support secure login.",
    summary: "Modified paragraph in body",
    ai_generation_status: "not_requested",
    has_ai_review_draft: false,
    sort_key: "0000:000001:00000001",
    ...overrides
  };
}

function buildQueuePayload(items = [buildQueueItem()]) {
  return {
    data: items
  };
}

function buildQueuePagePayload(items = [buildQueueItem()], overrides = {}) {
  return {
    data: {
      items,
      total_count: items.length,
      limit: 4,
      offset: 0,
      ...overrides
    }
  };
}

function buildChangeItemDetailPayload(overrides = {}) {
  return {
    data: {
      id: 900,
      compare_run_id: 55,
      change_type: "modified",
      review_status: "open",
      assignee_user_id: null,
      assignee_display_name: null,
      section_title: "Requirements",
      surface_type: "body",
      surface_key: "body-main",
      container_type: "text_flow",
      container_key: "body-main",
      table_key: null,
      row_key: null,
      old_content: "The system shall support login.",
      new_content: "The system shall support secure login.",
      summary: "Modified paragraph in body",
      linked_requirements: [],
      impacted_tests: [],
      comments: [],
      ai_review_draft: null,
      change_context_json: "{\"block_type\":\"table_row\"}",
      structured_diff_json:
        "{\"changed_columns\":[{\"column_key\":\"title\",\"header_text\":\"Title\",\"old_value\":\"Login\",\"new_value\":\"Secure Login\"}]}",
      ...overrides
    }
  };
}

function renderCompareScreen(path = "/compare-runs/55") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<CompareScreenPage />} path="/compare-runs/:compareRunId" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("CompareScreenPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("renders compare queue and selected change from api data", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.includes("/api/v1/compare-runs/55/change-items")) {
        return Promise.resolve(jsonResponse(buildQueuePagePayload()));
      }

      if (url.endsWith("/api/v1/change-items/900")) {
        return Promise.resolve(jsonResponse(buildChangeItemDetailPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderCompareScreen();

    expect(await screen.findByRole("heading", { name: /compare workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /change queue/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ai review/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /run health/i })).toBeInTheDocument();
    /* Version labels are visible */
    expect(screen.getByText(/v1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.1/)).toBeInTheDocument();
    expect((await screen.findAllByText(/modified paragraph in body/i)).length).toBeGreaterThan(0);
    // With InlineDiff, content may be split across diff-token spans, so match flexibly
    expect(await screen.findByText((_, element) => element?.textContent === "The system shall support login.")).toBeInTheDocument();
    expect(await screen.findByText((_, element) => element?.textContent === "The system shall support secure login.")).toBeInTheDocument();
    expect(await screen.findByText(/completed with warnings/i)).toBeInTheDocument();
    expect(await screen.findByText(/title: login/i)).toBeInTheDocument();
    const queueRequest = fetch.mock.calls.find(([requestUrl]) =>
      String(requestUrl).includes("/api/v1/compare-runs/55/change-items")
    );
    expect(String(queueRequest?.[0])).toContain("limit=4");
    expect(String(queueRequest?.[0])).toContain("offset=0");
  });

  test("creates an ai batch job, polls progress, and refreshes the queue when the job completes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let aiGenerated = false;
    let pollCount = 0;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        const payload = buildCompareRunPayload({
          active_ai_batch_job: aiGenerated
            ? null
            : null,
          ai_batch_summary: aiGenerated
            ? {
              job_id: 301,
              compare_run_id: 55,
              status: "completed",
              requested_count: 1,
              processed_count: 1,
              generated_count: 1,
              failed_count: 0,
              force_regenerate: false,
              active: false,
              started_at: "2026-04-02T08:10:00Z",
              completed_at: "2026-04-02T08:10:05Z",
              error_message: null
            }
            : null
        });
        payload.data.has_ai_review_drafts = aiGenerated;
        return Promise.resolve(jsonResponse(payload));
      }

      if (url.includes("/api/v1/compare-runs/55/change-items") && method === "GET") {
        const payload = buildQueuePayload();
        if (aiGenerated) {
          payload.data[0].ai_generation_status = "generated";
          payload.data[0].has_ai_review_draft = true;
        }
        return Promise.resolve(jsonResponse(payload));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload(
              {
                ai_review_draft: aiGenerated
                  ? {
                    id: 77,
                    suggested_assignee_user_id: 1,
                    recommended_review_status: "in_review",
                    explanation: "The new wording increases authentication scope.",
                    risk_level: "medium",
                    draft_comment: "Please confirm the MFA requirement.",
                    suggested_checks: "Run authentication regression tests.",
                    confidence: 0.82,
                    generation_status: "generated",
                    provider_used: "gemini",
                    fallback_used: false,
                    error_message: null,
                    generated_at: "2026-04-02T08:10:00Z"
                  }
                  : null
              }
            )
          )
        );
      }

      if (url.endsWith("/api/v1/compare-runs/55/ai-review-drafts/generate") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              job_id: 301,
              compare_run_id: 55,
              status: "queued",
              requested_count: 1,
              processed_count: 0,
              generated_count: 0,
              failed_count: 0,
              force_regenerate: false,
              active: true,
              started_at: null,
              completed_at: null,
              error_message: null
            }
          })
        );
      }

      if (url.endsWith("/api/v1/ai-batch-jobs/301") && method === "GET") {
        pollCount += 1;
        if (pollCount === 1) {
          return Promise.resolve(
            jsonResponse({
              data: {
                job_id: 301,
                compare_run_id: 55,
                status: "running",
                requested_count: 1,
                processed_count: 0,
                generated_count: 0,
                failed_count: 0,
                force_regenerate: false,
                active: true,
                started_at: "2026-04-02T08:10:00Z",
                completed_at: null,
                error_message: null
              }
            })
          );
        }

        aiGenerated = true;
        return Promise.resolve(
          jsonResponse({
            data: {
              job_id: 301,
              compare_run_id: 55,
              status: "completed",
              requested_count: 1,
              processed_count: 1,
              generated_count: 1,
              failed_count: 0,
              force_regenerate: false,
              active: false,
              started_at: "2026-04-02T08:10:00Z",
              completed_at: "2026-04-02T08:10:05Z",
              error_message: null
            }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderCompareScreen();

    fireEvent.click(await screen.findByRole("button", { name: /generate ai/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/compare-runs/55/ai-review-drafts/generate"),
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(await screen.findByText(/ai batch job completed/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 \/ 1 processed/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/ai ready/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/^gemini$/i)).toBeInTheDocument();
  });

  test("resumes polling when the compare run already has an active ai batch job", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let aiGenerated = false;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildCompareRunPayload({
              active_ai_batch_job: aiGenerated
                ? null
                : {
                  job_id: 301,
                  compare_run_id: 55,
                  status: "running",
                  requested_count: 1,
                  processed_count: 0,
                  generated_count: 0,
                  failed_count: 0,
                  force_regenerate: false,
                  active: true,
                  started_at: "2026-04-02T08:10:00Z",
                  completed_at: null,
                  error_message: null
                },
              ai_batch_summary: aiGenerated
                ? {
                  job_id: 301,
                  compare_run_id: 55,
                  status: "completed",
                  requested_count: 1,
                  processed_count: 1,
                  generated_count: 1,
                  failed_count: 0,
                  force_regenerate: false,
                  active: false,
                  started_at: "2026-04-02T08:10:00Z",
                  completed_at: "2026-04-02T08:10:05Z",
                  error_message: null
                }
                : null,
              has_ai_review_drafts: aiGenerated
            })
          )
        );
      }

      if (url.includes("/api/v1/compare-runs/55/change-items") && method === "GET") {
        const payload = buildQueuePayload();
        if (aiGenerated) {
          payload.data[0].ai_generation_status = "generated";
          payload.data[0].has_ai_review_draft = true;
        } else {
          payload.data[0].ai_generation_status = "pending";
          payload.data[0].has_ai_review_draft = true;
        }
        return Promise.resolve(jsonResponse(payload));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload(
              {
                ai_review_draft: aiGenerated
                  ? {
                    id: 77,
                    suggested_assignee_user_id: 1,
                    recommended_review_status: "in_review",
                    explanation: "The new wording increases authentication scope.",
                    risk_level: "medium",
                    draft_comment: "Please confirm the MFA requirement.",
                    suggested_checks: "Run authentication regression tests.",
                    confidence: 0.82,
                    generation_status: "generated",
                    provider_used: "gemini",
                    fallback_used: false,
                    error_message: null,
                    generated_at: "2026-04-02T08:10:00Z"
                  }
                  : null
              }
            )
          )
        );
      }

      if (url.endsWith("/api/v1/ai-batch-jobs/301") && method === "GET") {
        aiGenerated = true;
        return Promise.resolve(
          jsonResponse({
            data: {
              job_id: 301,
              compare_run_id: 55,
              status: "completed",
              requested_count: 1,
              processed_count: 1,
              generated_count: 1,
              failed_count: 0,
              force_regenerate: false,
              active: false,
              started_at: "2026-04-02T08:10:00Z",
              completed_at: "2026-04-02T08:10:05Z",
              error_message: null
            }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderCompareScreen();

    expect(await screen.findByText(/0 \/ 1 processed/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    expect(await screen.findByText(/ai batch job completed/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/ai ready/i)).length).toBeGreaterThan(0);
  });

  test("explains when ai review is limited to a prioritized subset", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildCompareRunPayload({
              ai_batch_summary: {
                job_id: 301,
                compare_run_id: 55,
                status: "completed",
                requested_count: 2,
                processed_count: 2,
                generated_count: 2,
                failed_count: 0,
                force_regenerate: false,
                active: false,
                started_at: "2026-04-02T08:10:00Z",
                completed_at: "2026-04-02T08:10:05Z",
                error_message: null
              }
            })
          )
        );
      }

      if (url.includes("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildQueuePayload([
              buildQueueItem(),
              buildQueueItem({ id: 901, change_type: "added", summary: "Added paragraph in body" }),
              buildQueueItem({ id: 902, change_type: "removed", summary: "Removed paragraph in body" })
            ])
          )
        );
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        return Promise.resolve(jsonResponse(buildChangeItemDetailPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderCompareScreen();

    expect(
      await screen.findByText(
        /ai review is limited to 2 prioritized changes\. full compare contains 3 changes\./i
      )
    ).toBeInTheDocument();
  });

  test("logs out when polling cannot refresh the selected change because the session expired", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let changeDetailRequests = 0;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildCompareRunPayload({
              active_ai_batch_job: {
                job_id: 301,
                compare_run_id: 55,
                status: "running",
                requested_count: 2,
                processed_count: 0,
                generated_count: 0,
                failed_count: 0,
                force_regenerate: false,
                active: true,
                started_at: "2026-04-02T08:10:00Z",
                completed_at: null,
                error_message: null
              }
            })
          )
        );
      }

      if (url.includes("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildQueuePayload([
              buildQueueItem({
                ai_generation_status: "pending",
                has_ai_review_draft: true
              })
            ])
          )
        );
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        changeDetailRequests += 1;
        if (changeDetailRequests === 1) {
          return Promise.resolve(jsonResponse(buildChangeItemDetailPayload()));
        }
        return Promise.resolve(jsonResponse({ detail: "Not authenticated" }, 401));
      }

      if (url.endsWith("/api/v1/ai-batch-jobs/301") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: {
              job_id: 301,
              compare_run_id: 55,
              status: "running",
              requested_count: 2,
              processed_count: 1,
              generated_count: 1,
              failed_count: 0,
              force_regenerate: false,
              active: true,
              started_at: "2026-04-02T08:10:00Z",
              completed_at: null,
              error_message: null
            }
          })
        );
      }

      if (url.endsWith("/api/v1/auth/logout") && method === "POST") {
        return Promise.resolve(jsonResponse({ data: { ok: true } }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderCompareScreen();

    expect(await screen.findByText(/0 \/ 2 processed/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/logout"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("filters and paginates the compare queue while keeping the selected item visible", async () => {
    const queueItems = [
      buildQueueItem({
        id: 900,
        summary: "Modified paragraph in body",
        review_status: "open",
        ai_generation_status: "not_requested",
        has_ai_review_draft: false
      }),
      buildQueueItem({
        id: 901,
        change_type: "added",
        review_status: "in_review",
        section_title: "Security",
        summary: "Added admin MFA requirement",
        old_content: "",
        new_content: "The system shall enforce MFA for admin users.",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000002"
      }),
      buildQueueItem({
        id: 902,
        change_type: "removed",
        review_status: "resolved",
        section_title: "Appendix",
        summary: "Removed password reset appendix",
        old_content: "Password reset appendix",
        new_content: "",
        ai_generation_status: "failed",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000003"
      }),
      buildQueueItem({
        id: 903,
        change_type: "modified",
        review_status: "open",
        section_title: "Audit",
        summary: "Modified audit logging requirement",
        old_content: "Keep audit logs for 90 days.",
        new_content: "Keep audit logs for 180 days.",
        ai_generation_status: "pending",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000004"
      }),
      buildQueueItem({
        id: 904,
        change_type: "added",
        review_status: "open",
        section_title: "Sessions",
        summary: "Added session timeout policy",
        old_content: "",
        new_content: "Idle sessions expire after 15 minutes.",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000005"
      }),
      buildQueueItem({
        id: 905,
        change_type: "modified",
        review_status: "resolved",
        section_title: "Retention",
        summary: "Modified data retention window",
        old_content: "Retain records for 3 years.",
        new_content: "Retain records for 5 years.",
        ai_generation_status: "not_requested",
        has_ai_review_draft: false,
        sort_key: "0000:000001:00000006"
      })
    ];

    const changeDetailsById = new Map(
      queueItems.map((item) => [
        item.id,
        buildChangeItemDetailPayload({
          ...item,
          change_context_json: JSON.stringify({ block_type: "paragraph" })
        })
      ])
    );

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(
          jsonResponse(
            buildCompareRunPayload({
              summary: {
                total_changes: queueItems.length,
                added: 2,
                removed: 1,
                modified: 3
              },
              selected_change_item_id: 904
            })
          )
        );
      }

      if (url.includes("/api/v1/compare-runs/55/change-items")) {
        const requestUrl = new URL(url, "http://localhost");
        const params = requestUrl.searchParams;
        const search = String(params.get("search") ?? "").toLowerCase();
        const changeType = params.get("change_type");
        const reviewStatus = params.get("review_status");
        const aiStatus = params.get("ai_status");
        const limit = Number(params.get("limit") ?? 4);
        const offset = Number(params.get("offset") ?? 0);
        const filteredItems = queueItems.filter((item) => {
          const haystack = [
            item.section_title,
            item.surface_key,
            item.summary,
            item.old_content,
            item.new_content
          ].filter(Boolean).join(" ").toLowerCase();
          return (
            (!search || haystack.includes(search)) &&
            (!changeType || item.change_type === changeType) &&
            (!reviewStatus || item.review_status === reviewStatus) &&
            (!aiStatus || item.ai_generation_status === aiStatus)
          );
        });
        return Promise.resolve(
          jsonResponse(
            buildQueuePagePayload(
              filteredItems.slice(offset, offset + limit),
              {
                total_count: filteredItems.length,
                limit,
                offset
              }
            )
          )
        );
      }

      const changeItemMatch = url.match(/\/api\/v1\/change-items\/(\d+)$/);
      if (changeItemMatch) {
        const changeItemId = Number(changeItemMatch[1]);
        return Promise.resolve(jsonResponse(changeDetailsById.get(changeItemId)));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderCompareScreen("/compare-runs/55?page=2&change=904");

    const queueSection = (await screen.findByRole("heading", { name: /change queue/i })).closest("section");
    expect(queueSection).not.toBeNull();
    expect(within(queueSection).getByLabelText(/search queue/i)).toBeInTheDocument();
    expect(within(queueSection).getByRole("button", { name: /filter added changes/i })).toHaveTextContent("+");
    expect(within(queueSection).getByRole("button", { name: /filter modified changes/i })).toHaveTextContent("~");
    expect(within(queueSection).getByRole("button", { name: /filter removed changes/i })).toHaveTextContent("−");
    expect(within(queueSection).getByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(within(queueSection).getByRole("button", { name: /added session timeout policy/i })).toBeInTheDocument();
    expect(within(queueSection).queryByRole("button", { name: /modified paragraph in body/i })).not.toBeInTheDocument();

    fireEvent.click(within(queueSection).getByRole("button", { name: /previous page/i }));

    await waitFor(() => {
      expect(within(queueSection).getByText(/page 1 of 2/i)).toBeInTheDocument();
    });
    expect(within(queueSection).getByRole("button", { name: /modified paragraph in body/i })).toBeInTheDocument();
    expect(within(queueSection).queryByRole("button", { name: /added session timeout policy/i })).not.toBeInTheDocument();

    fireEvent.change(within(queueSection).getByLabelText(/search queue/i), {
      target: { value: "session" }
    });

    await waitFor(() => {
      expect(within(queueSection).getByText(/1 item/i)).toBeInTheDocument();
    });
    expect(within(queueSection).getByRole("button", { name: /added session timeout policy/i })).toBeInTheDocument();

    fireEvent.change(within(queueSection).getByLabelText(/search queue/i), {
      target: { value: "" }
    });
    fireEvent.change(within(queueSection).getByLabelText(/change type/i), {
      target: { value: "removed" }
    });
    fireEvent.change(within(queueSection).getByLabelText(/review status/i), {
      target: { value: "resolved" }
    });
    fireEvent.change(within(queueSection).getByLabelText(/ai status/i), {
      target: { value: "failed" }
    });

    await waitFor(() => {
      expect(within(queueSection).getByRole("button", { name: /removed password reset appendix/i })).toBeInTheDocument();
    });
    expect(within(queueSection).queryByRole("button", { name: /modified data retention window/i })).not.toBeInTheDocument();
  });
});
