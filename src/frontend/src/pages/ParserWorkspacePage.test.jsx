import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ParserWorkspacePage } from "./ParserWorkspacePage";

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

function renderParserWorkspace(path = "/documents/10/parser") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ParserWorkspacePage />} path="/documents/:documentId/parser" />
          <Route element={<ParserWorkspacePage />} path="/contracts/:contractId/parser" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function buildParsedWorkspacePayload() {
  const parsedSnapshot = JSON.stringify({
    parser_version: "v1",
    counts_by_surface_type: {
      body: 1,
      header: 1
    },
    warnings: ["Normalized PAGE field in header-section-1-default"],
    warning_count: 1
  });

  return {
    data: {
      document: {
        id: 10,
        project_id: 1,
        title: "Software Requirements Specification",
        document_type: "SRS",
        description: "Primary review document."
      },
      versions: [
        {
          id: 101,
          document_id: 10,
          version_label: "v1.0",
          file_name: "srs-v1.0.docx",
          file_path: "uploads/document-10/srs-v1.0.docx",
          parse_status: "parsed_with_warnings",
          active_parse_run_id: 301,
          parsed_snapshot: parsedSnapshot,
          uploaded_at: "2026-03-26T08:00:00Z",
          notes: "Ready for parser review",
          uploaded_by_display_name: "Redline Tester",
          warning_count: 1,
          parser_version: "v1"
        },
        {
          id: 102,
          document_id: 10,
          version_label: "v1.1",
          file_name: "srs-v1.1.docx",
          file_path: "uploads/document-10/srs-v1.1.docx",
          parse_status: "parsed",
          active_parse_run_id: 302,
          parsed_snapshot: parsedSnapshot,
          uploaded_at: "2026-03-26T09:00:00Z",
          notes: "Ready for compare",
          uploaded_by_display_name: "Redline Tester",
          warning_count: 0,
          parser_version: "v1"
        }
      ],
      selected_version: {
        id: 101,
        document_id: 10,
        version_label: "v1.0",
        file_name: "srs-v1.0.docx",
        file_path: "uploads/document-10/srs-v1.0.docx",
        parse_status: "parsed_with_warnings",
        active_parse_run_id: 301,
        parsed_snapshot: parsedSnapshot,
        uploaded_at: "2026-03-26T08:00:00Z",
        notes: "Ready for parser review",
        uploaded_by_display_name: "Redline Tester",
        warning_count: 1,
        parser_version: "v1"
      },
      parse_run: {
        id: 301,
        document_version_id: 101,
        parser_version: "v1",
        status: "parsed_with_warnings",
        started_at: "2026-03-26T08:00:00Z",
        completed_at: "2026-03-26T08:02:00Z",
        warning_count: 1,
        error_message: null
      },
      summary: {
        total_surfaces: 2,
        total_blocks: 5,
        table_count: 1,
        row_count: 2,
        warning_count: 1
      },
      surface_groups: {
        body: [
          {
            id: 401,
            surface_key: "body-main",
            surface_type: "body",
            label: "Body",
            item_count: 4
          }
        ],
        headers: [
          {
            id: 402,
            surface_key: "header-section-1-default",
            surface_type: "header",
            label: "Header / section-1",
            item_count: 1
          }
        ],
        footers: [],
        footnotes: [],
        endnotes: []
      },
      compare_readiness: {
        is_ready: true,
        status: "ready",
        message: "Version is parsed and ready for compare setup."
      }
    }
  };
}

function buildParsedWorkspacePayloadForVersion(versionId) {
  const payload = buildParsedWorkspacePayload();

  if (versionId === 102) {
    payload.data.selected_version = payload.data.versions[1];
    payload.data.parse_run = {
      id: 302,
      document_version_id: 102,
      parser_version: "v1",
      status: "parsed",
      started_at: "2026-03-26T09:00:00Z",
      completed_at: "2026-03-26T09:02:00Z",
      warning_count: 0,
      error_message: null
    };
  }

  return payload;
}

function buildBodySurfacePayload() {
  return {
    data: {
      surface: {
        id: 401,
        surface_key: "body-main",
        surface_type: "body",
        label: "Body",
        logical_order_index: 0
      },
      items: [
        {
          kind: "block",
          block_id: 1001,
          block_type: "heading",
          section_title: "Requirements",
          surface_order_index: 0,
          raw_content: "Requirements",
          normalized_content: "Requirements"
        },
        {
          kind: "block",
          block_id: 1002,
          block_type: "paragraph",
          section_title: "Requirements",
          surface_order_index: 1,
          raw_content: "Body paragraph for parser workspace.",
          normalized_content: "Body paragraph for parser workspace."
        },
        {
          kind: "table",
          table_id: 501,
          table_key: "tbl-0000",
          surface_order_index: 2,
          row_count: 2
        }
      ],
      tables: [
        {
          id: 501,
          table_key: "tbl-0000",
          header_strategy: "explicit_first_row",
          section_title: "Requirements",
          columns: [
            {
              column_key: "requirement_id",
              column_index: 0,
              header_text: "Requirement ID"
            },
            {
              column_key: "title",
              column_index: 1,
              header_text: "Title"
            }
          ],
          rows: [
            {
              row_key: "tbl-0000-row-0000",
              row_index: 0,
              is_header_row: true,
              cells: [
                {
                  column_key: "requirement_id",
                  column_index: 0,
                  raw_value: "Requirement ID",
                  normalized_value: "Requirement ID",
                  merge_origin_key: null,
                  row_span: 1,
                  col_span: 1
                },
                {
                  column_key: "title",
                  column_index: 1,
                  raw_value: "Title",
                  normalized_value: "Title",
                  merge_origin_key: null,
                  row_span: 1,
                  col_span: 1
                }
              ]
            },
            {
              row_key: "tbl-0000-row-0001",
              row_index: 1,
              is_header_row: false,
              cells: [
                {
                  column_key: "requirement_id",
                  column_index: 0,
                  raw_value: "REQ-001",
                  normalized_value: "REQ-001",
                  merge_origin_key: null,
                  row_span: 1,
                  col_span: 1
                },
                {
                  column_key: "title",
                  column_index: 1,
                  raw_value: "Login",
                  normalized_value: "Login",
                  merge_origin_key: null,
                  row_span: 1,
                  col_span: 1
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function buildHeaderSurfacePayload() {
  return {
    data: {
      surface: {
        id: 402,
        surface_key: "header-section-1-default",
        surface_type: "header",
        label: "Header / section-1",
        logical_order_index: 1
      },
      items: [
        {
          kind: "block",
          block_id: 1101,
          block_type: "paragraph",
          section_title: null,
          surface_order_index: 0,
          raw_content: "Release Notes",
          normalized_content: "Release Notes"
        }
      ],
      tables: []
    }
  };
}

function buildEmptyCandidatePayload() {
  return {
    data: {
      summary: {
        total: 0,
        pending: 0,
        accepted: 0,
        rejected: 0
      },
      provider_used: null,
      fallback_used: false,
      error_message: null,
      candidates: []
    }
  };
}

describe("ParserWorkspacePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders parsed preview, warnings, and header surface switching", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.includes("/api/v1/documents/10/parser-workspace")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/402")) {
        return Promise.resolve(jsonResponse(buildHeaderSurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/requirement-candidates")) {
        return Promise.resolve(jsonResponse(buildEmptyCandidatePayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderParserWorkspace();

    expect(await screen.findByRole("heading", { name: /parser workspace/i })).toBeInTheDocument();
    expect(await screen.findByText("Body paragraph for parser workspace.")).toBeInTheDocument();
    expect(screen.getAllByText("Requirement ID").length).toBeGreaterThan(0);
    expect(screen.getByText(/normalized page field in header-section-1-default/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /headers1/i }));

    expect(await screen.findByText("Release Notes")).toBeInTheDocument();
  });

  test("parses a pending version directly from the workspace", async () => {
    const pendingWorkspace = {
      data: {
        document: {
          id: 10,
          project_id: 1,
          title: "Software Requirements Specification",
          description: "Primary review document."
        },
        versions: [
          {
            id: 201,
            document_id: 10,
            version_label: "v2.0",
            file_name: "srs-v2.0.docx",
            file_path: "uploads/document-10/srs-v2.0.docx",
            parse_status: "pending",
            active_parse_run_id: null,
            parsed_snapshot: null,
            uploaded_at: "2026-03-26T10:00:00Z",
            notes: "Waiting for parse",
            uploaded_by_display_name: "Redline Tester",
            warning_count: 0,
            parser_version: null
          }
        ],
        selected_version: {
          id: 201,
          document_id: 10,
          version_label: "v2.0",
          file_name: "srs-v2.0.docx",
          file_path: "uploads/document-10/srs-v2.0.docx",
          parse_status: "pending",
          active_parse_run_id: null,
          parsed_snapshot: null,
          uploaded_at: "2026-03-26T10:00:00Z",
          notes: "Waiting for parse",
          uploaded_by_display_name: "Redline Tester",
          warning_count: 0,
          parser_version: null
        },
        parse_run: null,
        summary: {
          total_surfaces: 0,
          total_blocks: 0,
          table_count: 0,
          row_count: 0,
          warning_count: 0
        },
        surface_groups: {
          body: [],
          headers: [],
          footers: [],
          footnotes: [],
          endnotes: []
        },
        compare_readiness: {
          is_ready: false,
          status: "not_ready",
          message: "Version must be parsed before compare setup."
        }
      }
    };

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.includes("/api/v1/documents/10/parser-workspace?version_id=201")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayload()));
      }

      if (url.includes("/api/v1/documents/10/parser-workspace")) {
        return Promise.resolve(jsonResponse(pendingWorkspace));
      }

      if (url.endsWith("/api/v1/document-versions/201/parse") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 201,
              document_id: 10,
              version_label: "v2.0",
              file_name: "srs-v2.0.docx",
              file_path: "uploads/document-10/srs-v2.0.docx",
              parse_status: "parsed",
              active_parse_run_id: 301,
              parsed_snapshot: "{}",
              uploaded_at: "2026-03-26T10:00:00Z",
              notes: "Waiting for parse",
              uploaded_by_display_name: "Redline Tester",
              warning_count: 0,
              parser_version: "v1"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/requirement-candidates")) {
        return Promise.resolve(jsonResponse(buildEmptyCandidatePayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderParserWorkspace();

    expect(await screen.findByText(/not parsed yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /parse v2\.0/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /parse v2\.0/i }));

    expect(await screen.findByText("Body paragraph for parser workspace.")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/document-versions/201/parse"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "X-CSRF-Token": "token-123"
          })
        })
      );
    });
  });

  test("routes compare readiness back to document compare setup instead of a hardcoded compare run", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.includes("/api/v1/documents/10/parser-workspace")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/requirement-candidates")) {
        return Promise.resolve(jsonResponse(buildEmptyCandidatePayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderParserWorkspace();

    expect(await screen.findByRole("heading", { name: /parser workspace/i })).toBeInTheDocument();

    const compareLink = await screen.findByRole("link", { name: /go to compare setup/i });
    expect(compareLink.getAttribute("href")).toBe("/documents/98FqgR");
  });

  test("keeps contract facade links when opened from a contract parser route", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.includes("/api/v1/documents/10/parser-workspace?version_id=102")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayloadForVersion(102)));
      }

      if (url.endsWith("/api/v1/document-versions/102/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/102/requirement-candidates")) {
        return Promise.resolve(jsonResponse(buildEmptyCandidatePayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderParserWorkspace("/contracts/10/parser?version=102");

    expect(await screen.findByRole("heading", { name: /parser workspace/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/documents/10/parser-workspace?version_id=102"),
        expect.objectContaining({ credentials: "include" })
      );
    });

    expect(screen.getByLabelText(/back to contract/i).getAttribute("href")).toBe("/contracts/98FqgR");
    expect(screen.getByRole("link", { name: /go to compare setup/i }).getAttribute("href")).toBe("/contracts/98FqgR");
  });

  test("honors the version query parameter when opening parser workspace from a version-specific entry point", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.includes("/api/v1/documents/10/parser-workspace?version_id=102")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayloadForVersion(102)));
      }

      if (url.endsWith("/api/v1/document-versions/102/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/102/requirement-candidates")) {
        return Promise.resolve(jsonResponse(buildEmptyCandidatePayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderParserWorkspace("/documents/10/parser?version=102");

    expect(await screen.findByRole("heading", { name: /parser workspace/i })).toBeInTheDocument();
    expect((await screen.findAllByText("v1.1")).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/documents/10/parser-workspace?version_id=102"),
        expect.objectContaining({
          credentials: "include"
        })
      );
    });
    const parserWorkspaceCall = fetch.mock.calls.find(([url]) =>
      String(url).includes("/api/v1/documents/10/parser-workspace?version_id=102")
    );
    expect(parserWorkspaceCall?.[1]?.headers.Authorization).toBeUndefined();
  });

  test("generates, accepts, and rejects AI requirement candidates", async () => {
    let candidates = [];
    const buildCandidatePayload = () => ({
      data: {
        summary: {
          total: candidates.length,
          pending: candidates.filter((candidate) => candidate.status === "pending").length,
          accepted: candidates.filter((candidate) => candidate.status === "accepted").length,
          rejected: candidates.filter((candidate) => candidate.status === "rejected").length
        },
        provider_used: candidates.length ? "fake" : null,
        fallback_used: false,
        error_message: null,
        candidates
      }
    });

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.includes("/api/v1/documents/10/parser-workspace")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/requirement-candidates") && method === "GET") {
        return Promise.resolve(jsonResponse(buildCandidatePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/requirement-candidates/generate") && method === "POST") {
        candidates = [
          {
            id: 900,
            document_version_id: 101,
            parse_run_id: 301,
            document_block_id: 1002,
            accepted_requirement_id: null,
            requirement_code: "REQ-AUTH-001",
            title: "Administrator MFA",
            description: "The system shall require MFA for administrator login.",
            source_section: "Requirements",
            source_block_key: "body-main-block-0001",
            confidence: 0.91,
            status: "pending",
            provider_used: "fake",
            fallback_used: false,
            error_message: null,
            generated_at: "2026-04-16T08:00:00Z",
            decided_at: null,
            rejection_reason: null
          },
          {
            id: 901,
            document_version_id: 101,
            parse_run_id: 301,
            document_block_id: 1003,
            accepted_requirement_id: null,
            requirement_code: "REQ-AUDIT-002",
            title: "Audit retention",
            description: "The system shall retain audit logs for 365 days.",
            source_section: "Requirements",
            source_block_key: "body-main-block-0002",
            confidence: 0.84,
            status: "pending",
            provider_used: "fake",
            fallback_used: false,
            error_message: null,
            generated_at: "2026-04-16T08:00:00Z",
            decided_at: null,
            rejection_reason: null
          }
        ];
        return Promise.resolve(jsonResponse(buildCandidatePayload()));
      }

      if (url.endsWith("/api/v1/requirement-candidates/900/accept") && method === "POST") {
        candidates = candidates.map((candidate) =>
          candidate.id === 900
            ? { ...candidate, status: "accepted", accepted_requirement_id: 700, decided_at: "2026-04-16T08:02:00Z" }
            : candidate
        );
        return Promise.resolve(jsonResponse({ data: candidates[0] }));
      }

      if (url.endsWith("/api/v1/requirement-candidates/901/reject") && method === "POST") {
        candidates = candidates.map((candidate) =>
          candidate.id === 901
            ? { ...candidate, status: "rejected", rejection_reason: "Rejected from parser workspace", decided_at: "2026-04-16T08:03:00Z" }
            : candidate
        );
        return Promise.resolve(jsonResponse({ data: candidates[1] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderParserWorkspace();

    expect(await screen.findByRole("heading", { name: /ai obligation extraction/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /extract obligations with ai/i }));

    expect(await screen.findByText("REQ-AUTH-001")).toBeInTheDocument();
    expect(screen.getByText("REQ-AUDIT-002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm req-auth-001/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/accepted 1/i)).toBeInTheDocument();
    });

    // Reject with dialog
    fireEvent.click(screen.getByRole("button", { name: /reject req-audit-002/i }));

    // Rejection dialog should appear
    const dialog = await screen.findByRole("dialog", { name: /rejection reason/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/reject req-audit-002/i)).toBeInTheDocument();

    // Enter reason and confirm
    fireEvent.change(screen.getByPlaceholderText(/why is this being rejected/i), {
      target: { value: "Not a real requirement" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/rejected 1/i)).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/requirement-candidates/900/accept"),
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/requirement-candidates/901/reject"),
      expect.objectContaining({ method: "POST" })
    );

    // Verify reason was sent in the body
    const rejectCall = fetch.mock.calls.find(
      ([url, opts]) => String(url).includes("/901/reject") && opts?.method === "POST"
    );
    expect(rejectCall).toBeTruthy();
    const rejectBody = JSON.parse(rejectCall[1].body);
    expect(rejectBody.reason).toBe("Not a real requirement");
  });

  test("shows error when AI generation fails", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.includes("/api/v1/documents/10/parser-workspace")) {
        return Promise.resolve(jsonResponse(buildParsedWorkspacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/401")) {
        return Promise.resolve(jsonResponse(buildBodySurfacePayload()));
      }

      if (url.endsWith("/api/v1/document-versions/101/requirement-candidates") && method === "GET") {
        return Promise.resolve(jsonResponse({
          data: {
            summary: { total: 0, pending: 0, accepted: 0, rejected: 0 },
            provider_used: null,
            fallback_used: false,
            error_message: null,
            candidates: []
          }
        }));
      }

      if (url.endsWith("/requirement-candidates/generate") && method === "POST") {
        return Promise.resolve(jsonResponse(
          { detail: "AI provider unavailable" },
          503
        ));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderParserWorkspace();

    await screen.findByRole("heading", { name: /ai obligation extraction/i });

    fireEvent.click(screen.getByRole("button", { name: /extract obligations with ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/ai provider unavailable/i)).toBeInTheDocument();
    });
  });
});
