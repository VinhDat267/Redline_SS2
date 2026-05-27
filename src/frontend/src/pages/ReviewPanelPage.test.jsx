import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ReviewPanelPage } from "./ReviewPanelPage";

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

function buildCompareRunPayload() {
  return {
    data: {
      id: 55,
      compare_version: "v1",
      compare_status: "completed",
      started_at: "2026-03-26T09:05:00Z",
      completed_at: "2026-03-26T09:05:05Z",
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
      selected_change_item_id: 900
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

function buildQueuePayload(items = [
  buildQueueItem(),
  buildQueueItem({
    id: 901,
    change_type: "added",
    review_status: "in_review",
    section_title: "Security",
    old_content: "",
    new_content: "The system shall enforce MFA for admin users.",
    summary: "Added admin MFA requirement",
    sort_key: "0000:000001:00000002"
  })
]) {
  return {
    data: items
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
      ...overrides
    }
  };
}

function buildProjectMembersPayload() {
  return {
    data: [
      {
        id: 1,
        project_id: 1,
        user_id: 1,
        role: "owner",
        joined_at: "2026-03-26T08:00:00Z",
        user_display_name: "Redline Tester",
        user_email: "reviewer@example.com"
      }
    ]
  };
}

function renderReviewPanel(path = "/compare-runs/55/review") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ReviewPanelPage />} path="/compare-runs/:compareRunId/review" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("ReviewPanelPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("shows empty ai state, saves review status, and adds a comment", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(jsonResponse(buildQueuePayload()));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        return Promise.resolve(jsonResponse(buildChangeItemDetailPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectMembersPayload()));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "PATCH") {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload({
              review_status: "resolved",
              assignee_user_id: 1,
              assignee_display_name: "Redline Tester"
            })
          )
        );
      }

      if (url.endsWith("/api/v1/change-items/900/comments") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 301,
                author_user_id: 1,
                author_display_name: "Redline Tester",
                content: "Need a security regression check before resolving this item.",
                created_at: "2026-03-26T09:07:00Z"
              }
            },
            201
          )
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderReviewPanel();

    expect(await screen.findByRole("heading", { name: /review workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /human review command/i })).toBeInTheDocument();

    /* The bottom bar section IS the "human review" section */
    const reviewActionsSection = screen.getByRole("region", { name: /human review command/i });
    expect(reviewActionsSection).not.toBeNull();

    fireEvent.change(within(reviewActionsSection).getByLabelText(/assignee/i), {
      target: { value: "1" }
    });
    fireEvent.click(within(reviewActionsSection).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/change-items/900"),
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });

    /* Open the comments drawer first */
    fireEvent.click(screen.getByRole("button", { name: /toggle comments/i }));

    fireEvent.change(screen.getByLabelText(/add comment/i), {
      target: { value: "Need a security regression check before resolving this item." }
    });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));

    expect(
      await screen.findByText("Need a security regression check before resolving this item.")
    ).toBeInTheDocument();
  });

  test("honors the query-selected change when it differs from compare run default selection", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(jsonResponse(buildQueuePayload()));
      }

      if (url.endsWith("/api/v1/change-items/901") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload({
              id: 901,
              change_type: "added",
              review_status: "in_review",
              section_title: "Security",
              new_content: "The system shall enforce MFA for admin users.",
              summary: "Added admin MFA requirement"
            })
          )
        );
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectMembersPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderReviewPanel("/compare-runs/55/review?change=901");

    expect(await screen.findByRole("heading", { name: /review workspace/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /added admin mfa requirement/i })
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/change-items/901"),
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  test("renders generated ai draft metadata and allows regenerate", async () => {
    let regenerated = false;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items") && method === "GET") {
        const payload = buildQueuePayload();
        payload.data[0].ai_generation_status = regenerated ? "failed" : "generated";
        payload.data[0].has_ai_review_draft = true;
        return Promise.resolve(jsonResponse(payload));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload({
              ai_review_draft: {
                id: 77,
                suggested_assignee_user_id: 1,
                recommended_review_status: "in_review",
                explanation: "The security requirement now expects MFA.",
                risk_level: "medium",
                draft_comment: "Confirm the MFA requirement in scope.",
                suggested_checks: "Run authentication regression tests.",
                confidence: 0.82,
                generation_status: regenerated ? "failed" : "generated",
                provider_used: regenerated ? "openai" : "gemini",
                fallback_used: regenerated,
                error_message: regenerated ? "fallback provider unavailable" : null,
                generated_at: "2026-04-02T08:10:00Z"
              }
            })
          )
        );
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectMembersPayload()));
      }

      if (url.endsWith("/api/v1/change-items/900/ai-review-draft/generate") && method === "POST") {
        regenerated = true;
        return Promise.resolve(
          jsonResponse({
            data: {
              change_item_id: 900,
              ai_review_draft: {
                id: 77,
                suggested_assignee_user_id: 1,
                recommended_review_status: "in_review",
                explanation: "The security requirement now expects MFA.",
                risk_level: "medium",
                draft_comment: "Confirm the MFA requirement in scope.",
                suggested_checks: "Run authentication regression tests.",
                confidence: 0.82,
                generation_status: "failed",
                provider_used: "openai",
                fallback_used: true,
                error_message: "fallback provider unavailable",
                generated_at: "2026-04-02T08:10:00Z"
              }
            }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderReviewPanel();

    expect(await screen.findByText(/medium/i)).toBeInTheDocument();
    expect(screen.getByText(/82%/i)).toBeInTheDocument();
    expect(screen.getByText(/gemini/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh ai|ai review/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/change-items/900/ai-review-draft/generate"),
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    expect(await screen.findByText(/openai/i)).toBeInTheDocument();
    expect(await screen.findByText(/fallback used/i)).toBeInTheDocument();
    expect(await screen.findByText(/ai error: fallback provider unavailable/i)).toBeInTheDocument();
  });

  test("sends null values when the reviewer clears assignee and summary", async () => {
    const patchBodies = [];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(jsonResponse(buildQueuePayload()));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload({
              assignee_user_id: 1,
              assignee_display_name: "Redline Tester",
              summary: "Keep this note only if clear fails."
            })
          )
        );
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectMembersPayload()));
      }

      if (url.endsWith("/api/v1/change-items/900") && method === "PATCH") {
        patchBodies.push(JSON.parse(init.body));
        return Promise.resolve(
          jsonResponse(
            buildChangeItemDetailPayload({
              assignee_user_id: null,
              assignee_display_name: null,
              summary: null
            })
          )
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderReviewPanel();

    expect(await screen.findByDisplayValue("Redline Tester")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Keep this note only if clear fails.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/assignee/i), {
      target: { value: "" }
    });
    fireEvent.change(screen.getByLabelText(/review summary/i), {
      target: { value: "   " }
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(patchBodies).toHaveLength(1);
    });

    expect(patchBodies[0]).toMatchObject({
      assignee_user_id: null,
      summary: null
    });
  });

  test("filters, paginates, and navigates the review queue without leaving the workspace", async () => {
    const queueItems = [
      buildQueueItem({
        id: 900,
        summary: "Modified paragraph in body",
        review_status: "open"
      }),
      buildQueueItem({
        id: 901,
        change_type: "added",
        review_status: "in_review",
        section_title: "Security",
        old_content: "",
        new_content: "The system shall enforce MFA for admin users.",
        summary: "Added admin MFA requirement",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000002"
      }),
      buildQueueItem({
        id: 902,
        change_type: "removed",
        review_status: "resolved",
        section_title: "Appendix",
        old_content: "Password reset appendix",
        new_content: "",
        summary: "Removed password reset appendix",
        ai_generation_status: "failed",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000003"
      }),
      buildQueueItem({
        id: 903,
        change_type: "modified",
        review_status: "open",
        section_title: "Audit",
        old_content: "Keep audit logs for 90 days.",
        new_content: "Keep audit logs for 180 days.",
        summary: "Modified audit logging requirement",
        ai_generation_status: "pending",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000004"
      }),
      buildQueueItem({
        id: 904,
        change_type: "added",
        review_status: "open",
        section_title: "Sessions",
        old_content: "",
        new_content: "Idle sessions expire after 15 minutes.",
        summary: "Added session timeout policy",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000005"
      }),
      buildQueueItem({
        id: 905,
        change_type: "modified",
        review_status: "resolved",
        section_title: "Retention",
        old_content: "Retain records for 3 years.",
        new_content: "Retain records for 5 years.",
        summary: "Modified data retention window",
        ai_generation_status: "not_requested",
        has_ai_review_draft: false,
        sort_key: "0000:000001:00000006"
      }),
      buildQueueItem({
        id: 906,
        change_type: "added",
        review_status: "open",
        section_title: "Encryption",
        old_content: "",
        new_content: "All data at rest must be encrypted with AES-256.",
        summary: "Added encryption requirement",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000007"
      }),
      buildQueueItem({
        id: 907,
        change_type: "modified",
        review_status: "in_review",
        section_title: "Backup",
        old_content: "Backups every 24 hours.",
        new_content: "Backups every 12 hours.",
        summary: "Modified backup frequency",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000008"
      }),
      buildQueueItem({
        id: 908,
        change_type: "added",
        review_status: "open",
        section_title: "Sessions 2",
        old_content: "",
        new_content: "Force logout after password change.",
        summary: "Added session timeout policy 2",
        ai_generation_status: "generated",
        has_ai_review_draft: true,
        sort_key: "0000:000001:00000009"
      })
    ];

    const changeDetailsById = new Map(
      queueItems.map((item) => [
        item.id,
        buildChangeItemDetailPayload({
          ...item,
          ai_review_draft: item.has_ai_review_draft
            ? {
              id: item.id + 1000,
              suggested_assignee_user_id: 1,
              recommended_review_status: item.review_status,
              explanation: `${item.summary} explanation`,
              risk_level: "medium",
              draft_comment: `${item.summary} comment`,
              suggested_checks: `${item.summary} checks`,
              confidence: 0.75,
              generation_status: item.ai_generation_status === "not_requested" ? "generated" : item.ai_generation_status,
              provider_used: "gemini",
              fallback_used: false,
              error_message: item.ai_generation_status === "failed" ? "draft failed" : null,
              generated_at: "2026-04-02T08:10:00Z"
            }
            : null
        })
      ])
    );

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        const payload = buildCompareRunPayload();
        payload.data.summary.total_changes = queueItems.length;
        payload.data.summary.added = 4;
        payload.data.summary.removed = 1;
        payload.data.summary.modified = 4;
        payload.data.selected_change_item_id = 908;
        return Promise.resolve(jsonResponse(payload));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(jsonResponse(buildQueuePayload(queueItems)));
      }

      const changeItemMatch = url.match(/\/api\/v1\/change-items\/(\d+)$/);
      if (changeItemMatch && method === "GET") {
        return Promise.resolve(jsonResponse(changeDetailsById.get(Number(changeItemMatch[1]))));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectMembersPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderReviewPanel("/compare-runs/55/review?change=908");

    const queueSection = (await screen.findByRole("heading", { name: /clause changes/i })).closest("section");
    expect(queueSection).not.toBeNull();
    expect(within(queueSection).getByLabelText(/search clause changes/i)).toBeInTheDocument();
    /* With 9 items and page size 8 → 2 pages; item 908 is on page 2 */
    expect(within(queueSection).getByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(within(queueSection).getByRole("button", { name: /added session timeout policy 2/i })).toBeInTheDocument();
    expect(within(queueSection).queryByRole("button", { name: /modified paragraph in body/i })).not.toBeInTheDocument();

    fireEvent.click(within(queueSection).getByRole("button", { name: /previous page/i }));

    await waitFor(() => {
      expect(within(queueSection).getByText(/page 1 of 2/i)).toBeInTheDocument();
    });
    expect(within(queueSection).getByRole("button", { name: /modified paragraph in body/i })).toBeInTheDocument();

    fireEvent.change(within(queueSection).getByLabelText(/search clause changes/i), {
      target: { value: "mfa" }
    });

    await waitFor(() => {
      expect(within(queueSection).getByRole("button", { name: /added admin mfa requirement/i })).toBeInTheDocument();
    });
    expect(within(queueSection).queryByRole("button", { name: /modified paragraph in body/i })).not.toBeInTheDocument();

    fireEvent.change(within(queueSection).getByLabelText(/search clause changes/i), {
      target: { value: "" }
    });
    /* The queue uses button-based status filters, not a select */
    fireEvent.click(within(queueSection).getByRole("button", { name: /filter resolved/i }));

    await waitFor(() => {
      expect(within(queueSection).getByRole("button", { name: /removed password reset appendix/i })).toBeInTheDocument();
    });

    fireEvent.click(within(queueSection).getByRole("button", { name: /removed password reset appendix/i }));

    expect(
      await screen.findByRole("heading", { name: /removed password reset appendix/i })
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/change-items/902"),
      expect.objectContaining({
        method: "GET"
      })
    );
  });
});
