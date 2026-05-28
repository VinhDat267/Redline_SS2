import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { SummaryExportPage } from "./SummaryExportPage";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function docxResponse() {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => name.toLowerCase() === "content-disposition"
        ? 'attachment; filename="redline-report.docx"'
        : ""
    },
    blob: async () => new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
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

function renderSummaryPage(path = "/compare-runs/55/summary") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<SummaryExportPage />} path="/compare-runs/:compareRunId/summary" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("SummaryExportPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders summary workspace with queue and focus grouped in one operator region", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(
          jsonResponse({
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
          })
        );
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
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
                sort_key: "0000:000001:00000001"
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderSummaryPage();

    expect(await screen.findByRole("heading", { name: /summary \/ export/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /summary command/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /change focus/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /key change queue/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /executive summary/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /focus change/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /export console/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /readiness gate/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/summary draft not available yet/i)).toBeInTheDocument();
    /* The modified count (1) and label ("Modified") are in separate divs */
    expect(screen.getAllByText("Modified").length).toBeGreaterThan(0);
  });

  test("renders responsive summary metric groups without the fixed seven-column layout", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(
          jsonResponse({
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
                total_changes: 4,
                added: 2,
                removed: 1,
                modified: 1
              },
              selected_change_item_id: 900
            }
          })
        );
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
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
                sort_key: "0000:000001:00000001"
              },
              {
                id: 901,
                compare_run_id: 55,
                change_type: "added",
                review_status: "in_review",
                section_title: "Requirements",
                surface_type: "body",
                surface_key: "body-main",
                container_type: "text_flow",
                container_key: "body-main",
                table_key: null,
                row_key: null,
                old_content: "",
                new_content: "The system shall support MFA.",
                summary: "Added paragraph in body",
                sort_key: "0000:000002:00000001"
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderSummaryPage();

    expect(await screen.findByTestId("summary-stats-grid")).toHaveClass("se-stats-grid");
    expect(screen.getByTestId("summary-change-stats")).toHaveClass("se-change-stat-group");
    expect(screen.getByTestId("summary-review-stats")).toHaveClass("se-review-stat-group");
    expect(screen.getByTestId("summary-stats-grid")).not.toHaveStyle({ gridTemplateColumns: "repeat(7,1fr)" });
  });

  test("exports DOCX summary through a POST body instead of a query string", async () => {
    const createObjectURL = vi.fn(() => "blob:redline-summary");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/compare-runs/55") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
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
                parse_status: "parsed",
                active_parse_run_id: 302,
                warning_count: 0,
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
          })
        );
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 900,
                compare_run_id: 55,
                change_type: "modified",
                review_status: "resolved",
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
                sort_key: "0000:000001:00000001"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/v1/compare-runs/55/ai-summary-drafts/generate") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              summary_text: "A long executive summary that belongs in the request body."
            }
          })
        );
      }

      if (url.endsWith("/api/v1/compare-runs/55/export/docx") && method === "POST") {
        return Promise.resolve(docxResponse());
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderSummaryPage();

    fireEvent.click((await screen.findAllByRole("button", { name: /generate summary/i }))[0]);
    expect(await screen.findByDisplayValue(/long executive summary/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /export docx/i })[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/compare-runs\/55\/export\/docx$/),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            summary_text: "A long executive summary that belongs in the request body."
          })
        })
      );
    });
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:redline-summary");
  });
});
