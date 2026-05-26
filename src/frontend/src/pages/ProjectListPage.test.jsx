import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ActiveProjectProvider } from "../context/ActiveProjectContext";
import { ProjectListPage } from "./ProjectListPage";

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

function buildProject(project) {
  return {
    created_at: "2026-03-26T08:00:00Z",
    updated_at: "2026-03-26T08:00:00Z",
    ...project
  };
}

function renderProjectList(path = "/") {
  return render(
    <AuthProvider initialSession={session}>
      <ActiveProjectProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<ProjectListPage />} path="/" />
            <Route element={<p>Project Route</p>} path="/projects/:projectId" />
          </Routes>
        </MemoryRouter>
      </ActiveProjectProvider>
    </AuthProvider>
  );
}

describe("ProjectListPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("creates a project and navigates to the new workspace", async () => {
    let projects = [
      buildProject({
        id: 1,
        name: "Starter Workspace",
        description: "Starter project"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: projects }));
      }

      if (url.endsWith("/api/v1/projects") && method === "POST") {
        const body = JSON.parse(init.body);
        const createdProject = buildProject({
          id: 2,
          name: body.name,
          description: body.description,
          updated_at: "2026-03-26T09:00:00Z"
        });
        projects = [...projects, createdProject];
        return Promise.resolve(jsonResponse({ data: createdProject }, 201));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectList();

    // Wait for project list to render (heading is "Project List")
    expect(await screen.findByText(/project list/i)).toBeInTheDocument();
    expect(screen.getByText(/total projects/i)).toBeInTheDocument();

    // Click "New Project" button to open drawer
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: "Updated Workspace" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Created from test flow" }
    });
    // Submit button says "Create Project"
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));

    expect(await screen.findByText("Project Route")).toBeInTheDocument();

    const createCall = fetch.mock.calls.find(
      ([requestUrl, requestInit = {}]) =>
        String(requestUrl).endsWith("/api/v1/projects") && (requestInit.method || "GET") === "POST"
    );

    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall[1].body)).toEqual({
      name: "Updated Workspace",
      description: "Created from test flow"
    });
  });

  test("updates a project from the project list and refreshes the live inventory", async () => {
    let projects = [
      buildProject({
        id: 1,
        name: "Starter Workspace",
        description: "Starter project"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: projects }));
      }

      if (url.endsWith("/api/v1/projects/1") && method === "PATCH") {
        const body = JSON.parse(init.body);
        projects = projects.map((project) =>
          project.id === 1
            ? buildProject({
              ...project,
              ...body,
              updated_at: "2026-03-26T10:00:00Z"
            })
            : project
        );

        return Promise.resolve(jsonResponse({ data: projects[0] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectList();

    expect(await screen.findByText(/project list/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Starter Workspace" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /project actions for starter workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit project starter workspace/i }));
    fireEvent.change(screen.getByLabelText(/project name/i), {
      target: { value: "Updated Workspace" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Updated from project list" }
    });
    // Submit button says "Save Project"
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/projects/1"),
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });

    expect(await screen.findByRole("link", { name: "Updated Workspace" })).toBeInTheDocument();
    expect(screen.getAllByText("Updated from project list").length).toBeGreaterThan(0);
  });

  test("deletes a project after confirmation and removes it from the list", async () => {
    let projects = [
      buildProject({
        id: 1,
        name: "Starter Workspace",
        description: "Starter project"
      })
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";

      if (url.endsWith("/api/v1/projects") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: projects }));
      }

      if (url.endsWith("/api/v1/projects/1") && method === "DELETE") {
        projects = [];
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => null
        });
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderProjectList();

    expect(await screen.findByText(/project list/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Starter Workspace" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /project actions for starter workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete project starter workspace/i }));
    // ConfirmDialog opens with title "Delete Project" and confirmLabel "Delete Project"
    expect(await screen.findByRole("dialog", { name: /delete project/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete project/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/projects/1"),
        expect.objectContaining({
          method: "DELETE"
        })
      );
    });

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Starter Workspace")).not.toBeInTheDocument();
  });

  test("shows real Total Contracts count summed from document_count across projects", async () => {
    const projects = [
      buildProject({ id: 1, name: "Project Alpha", description: "First", document_count: 3 }),
      buildProject({ id: 2, name: "Project Beta", description: "Second", document_count: 5 }),
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.endsWith("/api/v1/projects") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: projects }));
      }
      return Promise.reject(new Error(`Unhandled: ${url} ${method}`));
    });

    renderProjectList();

    expect(await screen.findByText(/total contracts/i)).toBeInTheDocument();
    // 3 + 5 = 8 contracts total
    const statCards = screen.getAllByText("8");
    expect(statCards.length).toBeGreaterThan(0);
  });

  test("shows 0 for Total Contracts when projects have no documents", async () => {
    const projects = [
      buildProject({ id: 1, name: "Empty Project", description: "No docs", document_count: 0 }),
    ];

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.endsWith("/api/v1/projects") && method === "GET") {
        return Promise.resolve(jsonResponse({ data: projects }));
      }
      return Promise.reject(new Error(`Unhandled: ${url} ${method}`));
    });

    renderProjectList();

    expect(await screen.findByText(/total contracts/i)).toBeInTheDocument();
    // Should show 0, not some stale hardcoded value
    const contractStat = screen.getByText(/total contracts/i).closest("div");
    expect(contractStat).toHaveTextContent("0");
  });
});
