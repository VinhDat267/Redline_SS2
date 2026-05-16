import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ContractDetailPage } from "./ContractDetailPage";

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

function renderContractDetail(path = "/contracts/10") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ContractDetailPage />} path="/contracts/:contractId" />
          <Route element={<div>Contract parser route</div>} path="/contracts/:contractId/parser" />
          <Route element={<div>Legacy document parser route</div>} path="/documents/:documentId/parser" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("ContractDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders contract workspace framing and draft readiness", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 10,
              project_id: 1,
              title: "Vendor Master Services Agreement",
              contract_type: "MSA",
              description: "Primary commercial agreement.",
              created_at: "2026-03-26T08:00:00Z",
              updated_at: "2026-03-26T09:00:00Z"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 501,
                contract_id: 10,
                draft_label: "vendor-v1",
                file_name: "vendor-v1.docx",
                parse_status: "parsed",
                notes: "Initial vendor draft",
                uploaded_by_display_name: "Redline Tester",
                uploaded_at: "2026-03-26T08:00:00Z",
                active_parse_run_id: 401
              },
              {
                id: 502,
                contract_id: 10,
                draft_label: "vendor-v2",
                file_name: "vendor-v2.docx",
                parse_status: "parsed_with_warnings",
                notes: "Counterparty markup",
                uploaded_by_display_name: "Redline Tester",
                uploaded_at: "2026-03-26T09:00:00Z",
                active_parse_run_id: 402
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractDetail();

    expect(await screen.findByRole("heading", { name: /vendor master services agreement/i })).toBeInTheDocument();
    /* The kicker label "Contract Workspace" is rendered as small uppercase text, not a heading */
    expect(screen.getByText("Compare ready")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /draft history/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /version/i })).toBeInTheDocument();
    /* Quality column header — the component renders "QUALITY" as a th */
    expect(screen.getByRole("columnheader", { name: /quality/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /compare setup/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run compare/i })).toBeInTheDocument();
  });

  test("opens parser workspace through the contract facade route", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 10,
              project_id: 1,
              title: "Vendor Master Services Agreement",
              contract_type: "MSA",
              description: "Primary commercial agreement.",
              created_at: "2026-03-26T08:00:00Z",
              updated_at: "2026-03-26T09:00:00Z"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 501,
                contract_id: 10,
                draft_label: "vendor-v1",
                file_name: "vendor-v1.docx",
                parse_status: "parsed",
                notes: "Initial vendor draft",
                uploaded_by_display_name: "Redline Tester",
                uploaded_at: "2026-03-26T08:00:00Z",
                active_parse_run_id: 401
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractDetail();

    fireEvent.click(await screen.findByRole("button", { name: /open parser workspace for vendor-v1/i }));

    expect(await screen.findByText("Contract parser route")).toBeInTheDocument();
    expect(screen.queryByText("Legacy document parser route")).not.toBeInTheDocument();
  });

  test("uploads a PDF contract draft and refreshes draft inventory", async () => {
    const existingDrafts = [];
    const uploadedDraft = {
      id: 503,
      contract_id: 10,
      draft_label: "scan-v1",
      file_name: "vendor-scan.pdf",
      file_path: "uploads/document-10/vendor-scan.pdf",
      parse_status: "pending",
      notes: "Scanned counterparty draft",
      uploaded_by_display_name: "Redline Tester",
      uploaded_at: "2026-03-26T10:00:00Z",
      active_parse_run_id: null
    };
    const refreshedDrafts = [uploadedDraft];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/contracts/10") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 10,
              project_id: 1,
              title: "Vendor Master Services Agreement",
              contract_type: "MSA",
              description: "Primary commercial agreement.",
              created_at: "2026-03-26T08:00:00Z",
              updated_at: "2026-03-26T09:00:00Z"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "GET") {
        const payload = fetch.mock.calls.filter(
          ([requestUrl, requestInit = {}]) =>
            String(requestUrl).endsWith("/api/v1/contracts/10/drafts") &&
            (requestInit.method || "GET") === "GET"
        ).length > 1
          ? refreshedDrafts
          : existingDrafts;
        return Promise.resolve(jsonResponse({ data: payload }));
      }

      if (url.endsWith("/api/v1/contracts/10/drafts") && method === "POST") {
        return Promise.resolve(jsonResponse({ data: uploadedDraft }, 201));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderContractDetail();

    expect(await screen.findByRole("heading", { name: /vendor master services agreement/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upload draft/i }));

    expect(await screen.findByRole("dialog", { name: /upload contract draft/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/draft label/i), {
      target: { value: "scan-v1" }
    });
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "Scanned counterparty draft" }
    });
    const file = new File(["pdf payload"], "vendor-scan.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/docx or pdf file/i), {
      target: { files: [file] }
    });
    const uploadSubmitButton = screen.getAllByRole("button", { name: /upload draft/i })
      .find((button) => button.type === "submit");
    fireEvent.click(uploadSubmitButton);

    expect(await screen.findByText(/contract draft uploaded/i)).toBeInTheDocument();
    expect(await screen.findByText("scan-v1")).toBeInTheDocument();
    expect(screen.getByText("vendor-scan.pdf")).toBeInTheDocument();

    await waitFor(() => {
      const uploadCall = fetch.mock.calls.find(
        ([requestUrl, requestInit = {}]) =>
          String(requestUrl).endsWith("/api/v1/contracts/10/drafts") &&
          (requestInit.method || "GET") === "POST"
      );
      expect(uploadCall).toBeTruthy();
      const [, requestInit] = uploadCall;
      expect(requestInit.body).toBeInstanceOf(FormData);
      expect(requestInit.body.get("draft_label")).toBe("scan-v1");
      expect(requestInit.body.get("notes")).toBe("Scanned counterparty draft");
      expect(requestInit.body.get("file")).toBe(file);
    });
  });
});
