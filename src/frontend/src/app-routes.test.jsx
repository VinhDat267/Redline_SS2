import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "./auth/AuthContext";
import { ActiveProjectProvider } from "./context/ActiveProjectContext";
import { AppRoutes, buildAuthReturnPath } from "./App";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function renderRoutes(path, initialSession = null) {
  return render(
    <AuthProvider initialSession={initialSession}>
      <ActiveProjectProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ActiveProjectProvider>
    </AuthProvider>
  );
}

describe("Redline authenticated routes", () => {
  const session = {
    token: "token-123",
    user: {
      id: 1,
      email: "reviewer@example.com",
      display_name: "Redline Tester",
      has_password: true,
      google_linked: false,
      is_active: true
    },
    pending_project_invitations: []
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("redirects protected routes to login when there is no session", async () => {
    renderRoutes("/dashboard");

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  test("preserves query string and hash when building protected-route return path", () => {
    expect(
      buildAuthReturnPath({
        pathname: "/compare-runs/55/review",
        search: "?change=904",
        hash: "#evidence"
      })
    ).toBe("/compare-runs/55/review?change=904#evidence");
  });

  test("renders the auth page directly on /login", async () => {
    renderRoutes("/login");

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no account\? create one/i })).toBeInTheDocument();
  });

  test("loads the live project list for an authenticated session", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 1,
            name: "Redline Review Workspace",
            description: "Live integration workspace.",
            created_at: "2026-03-26T08:00:00Z",
            updated_at: "2026-03-26T08:00:00Z"
          }
        ]
      })
    );

    renderRoutes("/dashboard", session);

    expect(await screen.findByRole("link", { name: "Redline Review Workspace" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/projects"),
      expect.objectContaining({
        credentials: "include"
      })
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test("renders account settings for an authenticated session", async () => {
    renderRoutes("/account", session);

    expect(await screen.findByRole("heading", { name: /redline tester/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue("Redline Tester");
  });

  test("loads project detail contracts and members from live APIs", async () => {
    fetch.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/api/v1/projects/1")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 1,
              name: "Redline Review Workspace",
              description: "Live integration workspace.",
              created_at: "2026-03-26T08:00:00Z",
              updated_at: "2026-03-26T08:00:00Z"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/projects/1/contracts")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 10,
                project_id: 1,
                title: "Vendor Master Services Agreement",
                contract_type: "MSA",
                description: "Primary commercial agreement.",
                created_at: "2026-03-26T08:00:00Z",
                updated_at: "2026-03-26T08:00:00Z"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/v1/projects/1/members")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 5,
                project_id: 1,
                user_id: 1,
                role: "owner",
                user_display_name: "Redline Tester"
              }
            ]
          })
        );
      }

      if (url.endsWith("/api/v1/projects/1/invitations")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/requirements")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.endsWith("/api/v1/projects/1/activity-logs")) {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      return Promise.reject(new Error(`Unhandled request: ${url}`));
    });

    renderRoutes("/projects/1", session);

    expect(await screen.findByText("Vendor Master Services Agreement")).toBeInTheDocument();
    // Member count appears in stats bar (team names are behind Team tab)
    expect(screen.getByText(/1 active \/ 0 pending/i)).toBeInTheDocument();
  });

  test("loads document versions from the live backend", async () => {
    fetch.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/api/v1/documents/10")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              id: 10,
              project_id: 1,
              title: "Software Requirements Specification",
              document_type: "SRS",
              description: "Primary review document.",
              created_at: "2026-03-26T08:00:00Z",
              updated_at: "2026-03-26T08:00:00Z"
            }
          })
        );
      }

      if (url.endsWith("/api/v1/documents/10/versions")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 101,
                document_id: 10,
                version_label: "v1.1",
                file_name: "srs-v1.1.docx",
                parse_status: "parsed",
                notes: "Seeded source version",
                uploaded_by_display_name: "Redline Tester",
                uploaded_at: "2026-03-26T08:00:00Z"
              },
              {
                id: 102,
                document_id: 10,
                version_label: "v2.0",
                file_name: "srs-v2.0.docx",
                parse_status: "parsed",
                notes: "Seeded target version",
                uploaded_by_display_name: "Redline Tester",
                uploaded_at: "2026-03-26T09:00:00Z"
              }
            ]
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url}`));
    });

    renderRoutes("/documents/10", session);

    await waitFor(() => {
      expect(screen.getByText("srs-v1.1.docx")).toBeInTheDocument();
      expect(screen.getByText("srs-v2.0.docx")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  test("loads the parser workspace route for an authenticated session", async () => {
    fetch.mockImplementation((input) => {
      const url = String(input);

      if (url.includes("/api/v1/documents/10/parser-workspace")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              document: {
                id: 10,
                project_id: 1,
                title: "Software Requirements Specification",
                description: "Primary review document."
              },
              versions: [
                {
                  id: 101,
                  document_id: 10,
                  version_label: "v1.0",
                  file_name: "srs-v1.0.docx",
                  file_path: "uploads/document-10/srs-v1.0.docx",
                  parse_status: "parsed",
                  active_parse_run_id: 301,
                  parsed_snapshot: JSON.stringify({
                    parser_version: "v1",
                    counts_by_surface_type: { body: 1 },
                    warnings: [],
                    warning_count: 0
                  }),
                  uploaded_at: "2026-03-26T08:00:00Z",
                  notes: "Ready for parser review",
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
                parse_status: "parsed",
                active_parse_run_id: 301,
                parsed_snapshot: JSON.stringify({
                  parser_version: "v1",
                  counts_by_surface_type: { body: 1 },
                  warnings: [],
                  warning_count: 0
                }),
                uploaded_at: "2026-03-26T08:00:00Z",
                notes: "Ready for parser review",
                uploaded_by_display_name: "Redline Tester",
                warning_count: 0,
                parser_version: "v1"
              },
              parse_run: {
                id: 301,
                document_version_id: 101,
                parser_version: "v1",
                status: "parsed",
                started_at: "2026-03-26T08:00:00Z",
                completed_at: "2026-03-26T08:02:00Z",
                warning_count: 0,
                error_message: null
              },
              summary: {
                total_surfaces: 1,
                total_blocks: 2,
                table_count: 0,
                row_count: 0,
                warning_count: 0
              },
              surface_groups: {
                body: [
                  {
                    id: 401,
                    surface_key: "body-main",
                    surface_type: "body",
                    label: "Body",
                    item_count: 2
                  }
                ],
                headers: [],
                footers: [],
                footnotes: [],
                endnotes: []
              },
              compare_readiness: {
                is_ready: false,
                status: "ready",
                message: "Version is parsed and ready for compare setup."
              }
            }
          })
        );
      }

      if (url.endsWith("/api/v1/document-versions/101/parser-surfaces/401")) {
        return Promise.resolve(
          jsonResponse({
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
                  section_title: "Overview",
                  surface_order_index: 0,
                  raw_content: "Overview",
                  normalized_content: "Overview"
                },
                {
                  kind: "block",
                  block_id: 1002,
                  block_type: "paragraph",
                  section_title: "Overview",
                  surface_order_index: 1,
                  raw_content: "Parser body preview.",
                  normalized_content: "Parser body preview."
                }
              ],
              tables: []
            }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url}`));
    });

    renderRoutes("/documents/10/parser", session);

    expect(await screen.findByText("Software Requirements Specification")).toBeInTheDocument();
    expect(await screen.findByText("Parser body preview.")).toBeInTheDocument();
  });

  test("surfaces pending invitations on the project list and refreshes projects after acceptance", async () => {
    const invitedSession = {
      ...session,
      user: {
        ...session.user,
        email: "invitee@example.com"
      },
      pending_project_invitations: [
        {
          id: 91,
          project_id: 1,
          email: "invitee@example.com",
          role: "reviewer",
          status: "pending",
          invited_by_user_id: 7,
          invited_by_display_name: "Project Owner",
          project_name: "Invited Project",
          created_at: "2026-04-09T09:00:00Z",
          updated_at: "2026-04-09T09:00:00Z",
          accepted_at: null
        }
      ]
    };
    let accepted = false;

    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url.endsWith("/api/v1/projects") && method === "GET") {
        return Promise.resolve(
          jsonResponse({
            data: accepted
              ? [
                {
                  id: 1,
                  name: "Invited Project",
                  description: "Invitation acceptance flow",
                  created_at: "2026-04-09T09:00:00Z",
                  updated_at: "2026-04-09T09:00:00Z"
                }
              ]
              : []
          })
        );
      }

      if (url.endsWith("/api/v1/auth/project-invitations/91/accept") && method === "POST") {
        accepted = true;
        return Promise.resolve(
          jsonResponse({
            data: {
              member: {
                id: 11,
                project_id: 1,
                user_id: 1,
                role: "reviewer",
                joined_at: "2026-04-09T09:05:00Z",
                user_display_name: "Invitee",
                user_email: "invitee@example.com"
              },
              pending_project_invitations: []
            }
          })
        );
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${method}`));
    });

    renderRoutes("/dashboard", invitedSession);

    expect(await screen.findByRole("heading", { name: /pending invitations/i })).toBeInTheDocument();
    expect(screen.getByText("Invited Project")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /accept invitation for invited project/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/project-invitations/91/accept"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({
            "X-CSRF-Token": "token-123"
          })
        })
      );
    });

    expect(await screen.findByRole("link", { name: "Invited Project" })).toBeInTheDocument();
  });
});
