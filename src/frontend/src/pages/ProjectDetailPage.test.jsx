import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ActiveProjectProvider } from "../context/ActiveProjectContext";
import { ProjectDetailPage } from "./ProjectDetailPage";

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

function buildProjectPayload(overrides = {}) {
  return {
    data: {
      id: 1,
      name: "Starter Workspace",
      description: "Project workspace",
      created_at: "2026-03-26T08:00:00Z",
      updated_at: "2026-03-26T08:00:00Z",
      ...overrides
    }
  };
}

function buildDocument(document) {
  return {
    created_at: "2026-03-26T08:00:00Z",
    updated_at: "2026-03-26T08:00:00Z",
    ...document
  };
}

function buildRequirement(requirement) {
  return {
    created_at: "2026-03-26T08:00:00Z",
    updated_at: "2026-03-26T08:00:00Z",
    description: null,
    source_section: null,
    source_block_key: null,
    status: "draft",
    ...requirement
  };
}

function buildTestCase(testCase) {
  return {
    created_at: "2026-03-26T08:00:00Z",
    updated_at: "2026-03-26T08:00:00Z",
    description: null,
    priority: "medium",
    status: "draft",
    ...testCase
  };
}

function buildInvitation(invitation) {
  return {
    created_at: "2026-03-26T08:00:00Z",
    updated_at: "2026-03-26T08:00:00Z",
    accepted_at: null,
    invited_by_user_id: 1,
    invited_by_display_name: "Redline Tester",
    project_name: "Starter Workspace",
    status: "pending",
    ...invitation
  };
}

function renderProjectDetail(path = "/projects/1") {
  return render(
    <AuthProvider initialSession={session}>
      <ActiveProjectProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<ProjectDetailPage />} path="/projects/:projectId" />
            <Route element={<p>Contract Route</p>} path="/contracts/:contractId" />
          </Routes>
        </MemoryRouter>
      </ActiveProjectProvider>
    </AuthProvider>
  );
}

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("creates a document from the project workspace and refreshes the inventory", async () => {
    let documents = [
      buildDocument({
        id: 10,
        project_id: 1,
        title: "Software Requirements Specification",
        document_type: "SRS",
        description: "Primary review document"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: documents }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "POST") {
        const body = JSON.parse(init.body);
        const createdDocument = buildDocument({
          id: 11,
          project_id: 1,
          title: body.title,
          document_type: body.document_type,
          description: body.description,
          updated_at: "2026-03-26T09:00:00Z"
        });
        documents = [...documents, createdDocument];
        return Promise.resolve(jsonResponse({ data: createdDocument }, 201));
      }

      if (url.endsWith("/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /contract inventory/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new contract/i }));
    fireEvent.change(screen.getByLabelText(/contract title/i), {
      target: { value: "Architecture Spec" }
    });
    fireEvent.change(screen.getByLabelText(/contract type/i), {
      target: { value: "SPEC" }
    });
    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: "Created inside project workspace" }
    });
    fireEvent.click(screen.getByRole("button", { name: /create contract/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/projects/1/contracts"),
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    expect(await screen.findByRole("link", { name: "Architecture Spec" })).toBeInTheDocument();
    expect(screen.getAllByText("Created inside project workspace").length).toBeGreaterThan(0);
  });

  test("updates a document from the project workspace and refreshes the inventory", async () => {
    let documents = [
      buildDocument({
        id: 10,
        project_id: 1,
        title: "Software Requirements Specification",
        document_type: "SRS",
        description: "Primary review document"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: documents }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10") && method === "PATCH") {
        const body = JSON.parse(init.body);
        documents = documents.map((document) =>
          document.id === 10
            ? buildDocument({
              ...document,
              ...body,
              updated_at: "2026-03-26T10:00:00Z"
            })
            : document
        );

        return Promise.resolve(jsonResponse({ data: documents[0] }));
      }

      if (url.endsWith("/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Software Requirements Specification" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /contract inventory/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/contract title/i), {
      target: { value: "Updated SRS" }
    });
    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: "Updated from project detail" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save contract/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/contracts/10"),
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });

    expect(await screen.findByRole("link", { name: "Updated SRS" })).toBeInTheDocument();
    expect(screen.getAllByText("Updated from project detail").length).toBeGreaterThan(0);
  });

  test("deletes a document after confirmation and removes it from the project inventory", async () => {
    let documents = [
      buildDocument({
        id: 10,
        project_id: 1,
        title: "Software Requirements Specification",
        document_type: "SRS",
        description: "Primary review document"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: documents }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/contracts/10") && method === "DELETE") {
        documents = [];
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => null
        });
      }

      if (url.endsWith("/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Software Requirements Specification" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(await screen.findByRole("dialog", { name: /delete contract/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete contract/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/contracts/10"),
        expect.objectContaining({
          method: "DELETE"
        })
      );
    });

    expect((await screen.findAllByText(/no contracts yet/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Software Requirements Specification")).not.toBeInTheDocument();
  });

  test("surfaces active members separately from pending invitations and supports invite revoke", async () => {
    let members = [
      {
        id: 1,
        project_id: 1,
        user_id: 1,
        role: "owner",
        joined_at: "2026-03-26T08:00:00Z",
        user_display_name: "Redline Tester",
        user_email: "reviewer@example.com"
      }
    ];
    let invitations = [];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: members }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: invitations }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "POST") {
        const body = JSON.parse(init.body);
        if (body.user_email === "existing-reviewer@example.com") {
          const createdMember = {
            id: 2,
            project_id: 1,
            user_id: 2,
            role: "member",
            joined_at: "2026-03-26T09:00:00Z",
            user_display_name: "Existing Reviewer",
            user_email: "existing-reviewer@example.com"
          };
          members = [...members, createdMember];
          return Promise.resolve(
            jsonResponse(
              {
                data: {
                  result_type: "member_added",
                  member: createdMember,
                  invitation: null,
                  message: "Project member added."
                }
              },
              201
            )
          );
        }

        const createdInvitation = buildInvitation({
          id: 91,
          project_id: 1,
          email: "future-user@example.com",
          role: "member"
        });
        invitations = [createdInvitation];
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                result_type: "invitation_created",
                member: null,
                invitation: createdInvitation,
                message: "Invitation created for a future account match."
              }
            },
            201
          )
        );
      }

      if (url.endsWith("/api/v1/projects/1/invitations/91") && method === "DELETE") {
        invitations = [];
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => null
        });
      }

      if (url.endsWith("/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /team/i }));
    expect(await screen.findByRole("heading", { name: /active members/i })).toBeInTheDocument();
    expect(screen.getByText("reviewer@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /invite.*member/i }));
    fireEvent.change(screen.getByLabelText(/member email/i), {
      target: { value: "existing-reviewer@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send.*invitation/i }));

    expect(await screen.findByText("existing-reviewer@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /invite.*member/i }));
    fireEvent.change(screen.getByLabelText(/member email/i), {
      target: { value: "future-user@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send.*invitation/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /pending invitations/i })).toBeInTheDocument();
      expect(screen.getByText("future-user@example.com")).toBeInTheDocument();
    });
    expect(screen.getByText(/invitation created for future-user@example.com/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /revoke invitation future-user@example.com/i }));

    await waitFor(() => {
      expect(screen.queryByText("future-user@example.com")).not.toBeInTheDocument();
    });
  });

  test("manages requirement inventory from the project workspace", async () => {
    let requirements = [
      buildRequirement({
        id: 700,
        document_id: 10,
        requirement_code: "REQ-LOGIN-001",
        title: "Support secure login",
        description: "Initial login requirement"
      })
    ];

    const documents = [
      buildDocument({
        id: 10,
        project_id: 1,
        title: "Software Requirements Specification",
        document_type: "SRS",
        description: "Primary review document"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: documents }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: requirements }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "POST") {
        const body = JSON.parse(init.body);
        const createdRequirement = buildRequirement({
          id: 701,
          document_id: body.document_id,
          requirement_code: body.requirement_code,
          title: body.title,
          description: body.description
        });
        requirements = [...requirements, createdRequirement];
        return Promise.resolve(jsonResponse({ data: createdRequirement }, 201));
      }

      if (url.endsWith("/api/v1/requirements/700") && method === "PATCH") {
        const body = JSON.parse(init.body);
        requirements = requirements.map((item) =>
          item.id === 700
            ? buildRequirement({
              ...item,
              ...body,
              updated_at: "2026-03-26T09:30:00Z"
            })
            : item
        );
        return Promise.resolve(jsonResponse({ data: requirements[0] }));
      }

      if (url.endsWith("/api/v1/requirements/700") && method === "DELETE") {
        requirements = requirements.filter((item) => item.id !== 700);
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => null
        });
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /obligations/i }));
    expect(await screen.findByRole("heading", { name: /obligations inventory/i })).toBeInTheDocument();
    expect(screen.getByText("REQ-LOGIN-001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new obligation/i }));
    fireEvent.change(screen.getByLabelText(/obligation code/i), {
      target: { value: "REQ-MFA-002" }
    });
    fireEvent.change(screen.getByLabelText(/obligation title/i), {
      target: { value: "Require MFA for admins" }
    });
    fireEvent.click(screen.getByRole("button", { name: /create obligation/i }));

    expect(await screen.findByText("REQ-MFA-002")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit obligation req-login-001/i }));
    fireEvent.change(screen.getByLabelText(/obligation title/i), {
      target: { value: "Support stronger login" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save obligation/i }));

    expect(await screen.findByText("Support stronger login")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search obligations/i), {
      target: { value: "mfa" }
    });

    expect(screen.getByText("REQ-MFA-002")).toBeInTheDocument();
    expect(screen.queryByText("REQ-LOGIN-001")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search obligations/i), {
      target: { value: "" }
    });

    fireEvent.click(screen.getByRole("button", { name: /delete obligation req-login-001/i }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: /delete obligation/i })).getByRole("button", {
        name: /delete obligation/i
      })
    );

    await waitFor(() => {
      expect(screen.queryByText("REQ-LOGIN-001")).not.toBeInTheDocument();
    });
  });

  test("manages test case inventory from the project workspace", async () => {
    let testCases = [
      buildTestCase({
        id: 800,
        project_id: 1,
        test_case_code: "TC-LOGIN-01",
        title: "Login succeeds with valid credentials",
        description: "Baseline login flow"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: testCases }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "POST") {
        const body = JSON.parse(init.body);
        const createdTestCase = buildTestCase({
          id: 801,
          project_id: 1,
          test_case_code: body.test_case_code,
          title: body.title,
          description: body.description,
          priority: body.priority
        });
        testCases = [...testCases, createdTestCase];
        return Promise.resolve(jsonResponse({ data: createdTestCase }, 201));
      }

      if (url.endsWith("/api/v1/test-cases/800") && method === "PATCH") {
        const body = JSON.parse(init.body);
        testCases = testCases.map((item) =>
          item.id === 800
            ? buildTestCase({
              ...item,
              ...body,
              updated_at: "2026-03-26T09:45:00Z"
            })
            : item
        );
        return Promise.resolve(jsonResponse({ data: testCases[0] }));
      }

      if (url.endsWith("/api/v1/test-cases/800") && method === "DELETE") {
        testCases = testCases.filter((item) => item.id !== 800);
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => null
        });
      }

      if (url.endsWith("/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /compliance checks/i }));
    expect(await screen.findByRole("heading", { name: /compliance checks inventory/i })).toBeInTheDocument();
    expect(screen.getByText("TC-LOGIN-01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new compliance check/i }));
    fireEvent.change(screen.getByLabelText(/compliance check code/i), {
      target: { value: "TC-MFA-02" }
    });
    fireEvent.change(screen.getByLabelText(/compliance check title/i), {
      target: { value: "MFA challenge appears for admin login" }
    });
    fireEvent.click(screen.getByRole("button", { name: /create compliance check/i }));

    expect(await screen.findByText("TC-MFA-02")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit compliance check tc-login-01/i }));
    fireEvent.change(screen.getByLabelText(/compliance check title/i), {
      target: { value: "Login succeeds with stronger validation" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save compliance check/i }));

    expect(await screen.findByText("Login succeeds with stronger validation")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search compliance checks/i), {
      target: { value: "mfa" }
    });

    expect(screen.getByText("TC-MFA-02")).toBeInTheDocument();
    expect(screen.queryByText("TC-LOGIN-01")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search compliance checks/i), {
      target: { value: "" }
    });

    fireEvent.click(screen.getByRole("button", { name: /delete compliance check tc-login-01/i }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: /delete compliance check/i })).getByRole("button", {
        name: /delete compliance check/i
      })
    );

    await waitFor(() => {
      expect(screen.queryByText("TC-LOGIN-01")).not.toBeInTheDocument();
    });
  });

  test("shows project activity events in the activity tab", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects/1") && method === "GET") {
        return Promise.resolve(jsonResponse(buildProjectPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/contracts") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/members") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/invitations") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/activity-logs") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 91,
                project_id: 1,
                user_id: 1,
                action: "compared",
                entity_type: "compare_run",
                entity_id: 44,
                description: 'Created compare run for "SRS"',
                created_at: "2026-04-19T04:00:00Z"
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectDetail();

    expect(await screen.findByRole("heading", { name: /project workspace/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /activity/i }));

    expect(await screen.findByRole("heading", { name: /activity log/i })).toBeInTheDocument();
    expect(screen.getByText('Created compare run for "SRS"')).toBeInTheDocument();
    expect(screen.getByText("compared")).toBeInTheDocument();
    expect(screen.getByText("compare_run")).toBeInTheDocument();
  });
});
