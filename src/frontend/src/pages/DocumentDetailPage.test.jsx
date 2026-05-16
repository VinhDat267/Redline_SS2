import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ContractDetailPage } from "./ContractDetailPage";
import { DocumentDetailPage } from "./DocumentDetailPage";

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

function buildDocumentPayload(overrides = {}) {
  return {
    data: {
      id: 10,
      project_id: 1,
      title: "Software Requirements Specification",
      document_type: "SRS",
      description: "Primary review document",
      created_at: "2026-03-26T08:00:00Z",
      updated_at: "2026-03-26T08:00:00Z",
      ...overrides
    }
  };
}

function buildContractPayload(overrides = {}) {
  return {
    data: {
      id: 10,
      project_id: 1,
      title: "Vendor MSA",
      contract_type: "MSA",
      description: "Primary commercial agreement",
      created_at: "2026-03-26T08:00:00Z",
      updated_at: "2026-03-26T08:00:00Z",
      ...overrides
    }
  };
}

function buildVersionListPayload(versions = []) {
  return {
    data: versions
  };
}

function buildVersion(version) {
  return {
    id: 101,
    document_id: 10,
    version_label: "v1.0",
    file_name: "srs-v1.0.docx",
    file_path: "uploads/document-10/srs-v1.0.docx",
    parse_status: "parsed",
    uploaded_at: "2026-03-26T08:00:00Z",
    notes: "Baseline",
    uploaded_by_display_name: "Redline Tester",
    active_parse_run_id: 301,
    warning_count: 0,
    parser_version: "v1",
    ...version
  };
}

function buildContractDraft(version) {
  return {
    id: 501,
    contract_id: 10,
    draft_label: "vendor-v1",
    file_name: "vendor-v1.docx",
    file_path: "uploads/document-10/vendor-v1.docx",
    parse_status: "parsed",
    uploaded_at: "2026-03-26T08:00:00Z",
    notes: "Initial vendor draft",
    uploaded_by_display_name: "Redline Tester",
    active_parse_run_id: 401,
    warning_count: 0,
    parser_version: "v1",
    ...version
  };
}

function renderDocumentDetail(path = "/documents/10") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<DocumentDetailPage />} path="/documents/:documentId" />
          <Route element={<p>Parser Workspace Route</p>} path="/documents/:documentId/parser" />
          <Route element={<p>Compare Route</p>} path="/compare-runs/:compareRunId" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

function renderContractDetail(path = "/contracts/10") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ContractDetailPage />} path="/contracts/:contractId" />
          <Route element={<p>Contract Chat Route</p>} path="/contracts/:contractId/chat" />
          <Route element={<p>Parser Workspace Route</p>} path="/documents/:documentId/parser" />
          <Route element={<p>Compare Route</p>} path="/compare-runs/:compareRunId" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("DocumentDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("uploads a PDF version and refreshes the live version inventory", async () => {
    const existingVersions = [
      buildVersion({})
    ];
    const refreshedVersions = [
      ...existingVersions,
      buildVersion({
        id: 102,
        version_label: "v3.0-srs-update",
        file_name: "redline-srs-update-full.pdf",
        file_path: "uploads/document-10/redline-srs-update-full.pdf",
        parse_status: "pending",
        uploaded_at: "2026-03-26T10:00:00Z",
        notes: "Parser-ready SRS sample",
        active_parse_run_id: null,
        parser_version: null
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        const payload = fetch.mock.calls.filter(
          ([requestUrl, requestInit = {}]) =>
            String(requestUrl).endsWith("/api/v1/documents/10/versions") &&
            (requestInit.method || "GET") === "GET"
        ).length > 1
          ? buildVersionListPayload(refreshedVersions)
          : buildVersionListPayload(existingVersions);
        return Promise.resolve(jsonResponse(payload));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: refreshedVersions[1]
          }, 201)
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect(
      await screen.findByRole("heading", { name: /software requirements specification/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/compare versions/i)).toBeInTheDocument();
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^version label$/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /upload version/i }));
    expect(await screen.findByRole("dialog", { name: /upload document version/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/version label/i), {
      target: { value: "v3.0-srs-update" }
    });
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Parser-ready SRS sample" }
    });

    const file = new File(
      ["starter workspace pdf content"],
      "redline-srs-update-full.pdf",
      {
        type: "application/pdf"
      }
    );
    fireEvent.change(screen.getByLabelText(/docx or pdf file/i), {
      target: { files: [file] }
    });
    const uploadSubmitButton = screen.getAllByRole("button", { name: /upload version/i })
      .find(btn => btn.type === "submit");
    fireEvent.click(uploadSubmitButton);

    expect(await screen.findByText(/version uploaded/i)).toBeInTheDocument();
    expect(await screen.findByText("v3.0-srs-update")).toBeInTheDocument();
    expect(screen.getByText("redline-srs-update-full.pdf")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /upload document version/i })).not.toBeInTheDocument();
    });

    const uploadCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/documents/10/versions") &&
        (requestInit.method || "GET") === "POST"
    );

    expect(uploadCall).toBeTruthy();
    const [, requestInit] = uploadCall;
    expect(requestInit.credentials).toBe("include");
    expect(requestInit.headers.Authorization).toBeUndefined();
    expect(requestInit.headers["X-CSRF-Token"]).toBe("token-123");
    expect(requestInit.body).toBeInstanceOf(FormData);
    expect(requestInit.body.get("version_label")).toBe("v3.0-srs-update");
    expect(requestInit.body.get("notes")).toBe("Parser-ready SRS sample");
    expect(requestInit.body.get("file")).toBe(file);
  });

  test("opens parser workspace directly from a version row instead of relying on the page header", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(
          jsonResponse(
            buildVersionListPayload([
              buildVersion({
                id: 101,
                version_label: "v1.0",
                parse_status: "pending",
                active_parse_run_id: null,
                warning_count: 0
              })
            ])
          )
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect(
      await screen.findByRole("heading", { name: /software requirements specification/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open parser workspace$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open parser workspace for v1\.0/i }));

    expect(await screen.findByText("Parser Workspace Route")).toBeInTheDocument();
  });

  test("blocks non-DOCX-or-PDF uploads before calling the upload endpoint", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload([])));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect(
      await screen.findByRole("heading", { name: /software requirements specification/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /upload version/i }));
    fireEvent.change(screen.getByLabelText(/version label/i), {
      target: { value: "v1.0-bad-upload" }
    });
    const file = new File(["not a supported parser format"], "notes.txt", {
      type: "text/plain"
    });
    fireEvent.change(screen.getByLabelText(/docx or pdf file/i), {
      target: { files: [file] }
    });
    const uploadSubmitButton = screen.getAllByRole("button", { name: /upload version/i })
      .find(btn => btn.type === "submit");
    fireEvent.click(uploadSubmitButton);

    expect(await screen.findByText(/please choose a \.docx or \.pdf file/i)).toBeInTheDocument();

    const uploadCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/documents/10/versions") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(uploadCall).toBeUndefined();
  });

  test("creates a compare run from two parsed versions", async () => {
    const compareReadyVersions = [
      buildVersion({
        id: 101,
        version_label: "v1.0",
        parse_status: "parsed_with_warnings",
        active_parse_run_id: 301,
        warning_count: 1
      }),
      buildVersion({
        id: 102,
        version_label: "v1.1",
        file_name: "srs-v1.1.docx",
        file_path: "uploads/document-10/srs-v1.1.docx",
        parse_status: "parsed",
        uploaded_at: "2026-03-26T09:00:00Z",
        notes: "Revision",
        active_parse_run_id: 302,
        warning_count: 0
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload(compareReadyVersions)));
      }

      if (url.endsWith("/api/v1/documents/10/compare-runs") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
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
                  description: "Primary review document"
                },
                source_version: {
                  id: 101,
                  document_id: 10,
                  version_label: "v1.0",
                  parse_status: "parsed_with_warnings",
                  active_parse_run_id: 301,
                  warning_count: 1,
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
            },
            201
          )
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect(
      await screen.findByRole("heading", { name: /software requirements specification/i })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^source$/i), {
      target: { value: "101" }
    });
    fireEvent.change(screen.getByLabelText(/^target$/i), {
      target: { value: "102" }
    });
    fireEvent.click(screen.getByRole("button", { name: /launch compare/i }));

    expect(await screen.findByText("Compare Route")).toBeInTheDocument();

    const compareCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/documents/10/compare-runs") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(compareCall).toBeTruthy();
    const [, requestInit] = compareCall;
    expect(JSON.parse(requestInit.body)).toEqual({
      source_version_id: 101,
      target_version_id: 102
    });
  });

  test("keeps compare locked when versions look parsed but have no active parse run", async () => {
    const staleParsedVersions = [
      buildVersion({
        id: 101,
        version_label: "v1.0",
        parse_status: "parsed",
        active_parse_run_id: null,
        parser_version: null
      }),
      buildVersion({
        id: 102,
        version_label: "v1.1",
        file_name: "srs-v1.1.docx",
        file_path: "uploads/document-10/srs-v1.1.docx",
        parse_status: "parsed_with_warnings",
        uploaded_at: "2026-03-26T09:00:00Z",
        notes: "Stale parser state",
        active_parse_run_id: null,
        parser_version: null,
        warning_count: 1
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload(staleParsedVersions)));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect(
      await screen.findByRole("heading", { name: /software requirements specification/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/2\/2 parsed/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/2 versions ready/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /launch compare/i })).not.toBeInTheDocument();
    expect(screen.getByText(/still blocked/i)).toBeInTheDocument();

    const compareCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/documents/10/compare-runs") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(compareCall).toBeUndefined();
  });

  test("updates document metadata from the live document workspace", async () => {
    let documentPayload = buildDocumentPayload();
    const versions = [buildVersion({})];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(documentPayload));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload(versions)));
      }

      if (url.endsWith("/api/v1/documents/10") && method === "PATCH") {
        const body = JSON.parse(init.body);
        documentPayload = buildDocumentPayload({
          ...documentPayload.data,
          ...body,
          updated_at: "2026-03-26T09:30:00Z"
        });

        return Promise.resolve(jsonResponse(documentPayload));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect(
      await screen.findByRole("heading", { name: /software requirements specification/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit metadata/i }));
    expect(await screen.findByRole("dialog", { name: /document metadata/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/document title/i), {
      target: { value: "Updated Requirements Specification" }
    });
    fireEvent.change(screen.getByLabelText(/document description/i), {
      target: { value: "Updated from the document workspace" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save document/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/documents/10"),
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });

    await waitFor(() => {
      const reloadCalls = fetch.mock.calls.filter(
        ([requestUrl, requestInit = {}]) =>
          String(requestUrl).endsWith("/api/v1/documents/10") && (requestInit.method || "GET") === "GET"
      );
      expect(reloadCalls.length).toBeGreaterThan(1);
    });

    expect(await screen.findByText(/document updated/i)).toBeInTheDocument();
  });

  test("updates version metadata and refreshes the live version inventory", async () => {
    let versions = [buildVersion({})];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload(versions)));
      }

      if (url.endsWith("/api/v1/document-versions/101") && method === "PATCH") {
        const body = JSON.parse(init.body);
        versions = versions.map((version) =>
          version.id === 101
            ? buildVersion({
                ...version,
                ...body,
                uploaded_at: "2026-03-26T09:45:00Z"
              })
            : version
        );

        return Promise.resolve(jsonResponse({ data: versions[0] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect((await screen.findAllByText("v1.0")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    expect(await screen.findByRole("dialog", { name: /edit version/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/edit version label/i), {
      target: { value: "v1.1-reviewed" }
    });
    fireEvent.change(screen.getByLabelText(/edit version notes/i), {
      target: { value: "Renamed after review" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save version/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/document-versions/101"),
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });

    expect((await screen.findAllByText("v1.1-reviewed")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Renamed after review").length).toBeGreaterThan(0);
  });

  test("deletes a version and refreshes compare readiness from the live inventory", async () => {
    let versions = [
      buildVersion({
        id: 101,
        version_label: "v1.0",
        parse_status: "parsed",
        active_parse_run_id: 301
      }),
      buildVersion({
        id: 102,
        version_label: "v1.1",
        file_name: "srs-v1.1.docx",
        file_path: "uploads/document-10/srs-v1.1.docx",
        parse_status: "parsed",
        uploaded_at: "2026-03-26T09:00:00Z",
        notes: "Revision",
        active_parse_run_id: 302
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/documents/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildDocumentPayload()));
      }

      if (url.endsWith("/api/v1/documents/10/versions") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload(versions)));
      }

      if (url.endsWith("/api/v1/document-versions/101") && method === "DELETE") {
        versions = versions.filter((version) => version.id !== 101);
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => null
        });
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderDocumentDetail();

    expect((await screen.findAllByText("v1.0")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);
    expect(await screen.findByRole("dialog", { name: /delete version/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm delete version/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/document-versions/101"),
        expect.objectContaining({
          method: "DELETE"
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/1\/1 parsed/i)).toBeInTheDocument();
      expect(screen.getByText(/1\/2 versions ready/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /launch compare/i })).not.toBeInTheDocument();
    expect(screen.queryByText("v1.0")).not.toBeInTheDocument();
  });

  test("loads contract drafts from alias routes and launches a contract compare run", async () => {
    const compareReadyDrafts = [
      buildContractDraft({
        id: 501,
        draft_label: "vendor-v1",
        parse_status: "parsed",
        active_parse_run_id: 401
      }),
      buildContractDraft({
        id: 502,
        draft_label: "vendor-v2",
        file_name: "vendor-v2.docx",
        file_path: "uploads/document-10/vendor-v2.docx",
        uploaded_at: "2026-03-26T09:00:00Z",
        parse_status: "parsed_with_warnings",
        active_parse_run_id: 402,
        warning_count: 1
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(jsonResponse(buildContractPayload()));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(jsonResponse(buildVersionListPayload(compareReadyDrafts)));
      }

      if (url.endsWith("/api/v1/contracts/10/compare-runs") && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: 77,
                compare_version: "v1",
                compare_status: "completed",
                started_at: "2026-03-26T09:05:00Z",
                completed_at: "2026-03-26T09:05:05Z",
                contract: {
                  id: 10,
                  project_id: 1,
                  title: "Vendor MSA",
                  contract_type: "MSA",
                  description: "Primary commercial agreement"
                },
                source_draft: {
                  id: 501,
                  contract_id: 10,
                  draft_label: "vendor-v1",
                  parse_status: "parsed",
                  active_parse_run_id: 401,
                  warning_count: 0,
                  parser_version: "v1"
                },
                target_draft: {
                  id: 502,
                  contract_id: 10,
                  draft_label: "vendor-v2",
                  parse_status: "parsed_with_warnings",
                  active_parse_run_id: 402,
                  warning_count: 1,
                  parser_version: "v1"
                },
                summary: {
                  total_changes: 1,
                  added: 0,
                  removed: 0,
                  modified: 1
                },
                selected_clause_change_id: 901
              }
            },
            201
          )
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractDetail();

    expect(await screen.findByRole("heading", { name: /vendor msa/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /compare setup/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^source draft$/i), {
      target: { value: "501" }
    });
    fireEvent.change(screen.getByLabelText(/^target draft$/i), {
      target: { value: "502" }
    });
    fireEvent.click(screen.getByRole("button", { name: /run compare/i }));

    expect(await screen.findByText("Compare Route")).toBeInTheDocument();

    const compareCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/contracts/10/compare-runs") &&
        (requestInit.method || "GET") === "POST"
    );
    expect(compareCall).toBeTruthy();
    const [, requestInit] = compareCall;
    expect(JSON.parse(requestInit.body)).toEqual({
      source_draft_id: 501,
      target_draft_id: 502
    });
  });
});
