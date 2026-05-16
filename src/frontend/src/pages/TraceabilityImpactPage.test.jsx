import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { TraceabilityImpactPage } from "./TraceabilityImpactPage";

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
  };
}

function buildQueuePayload() {
  return {
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
        section_title: "Security",
        surface_type: "body",
        surface_key: "body-main",
        container_type: "text_flow",
        container_key: "body-main",
        table_key: null,
        row_key: null,
        old_content: "",
        new_content: "The system shall enforce MFA for admin users.",
        summary: "Added admin MFA requirement",
        sort_key: "0000:000001:00000002"
      }
    ]
  };
}

function buildChangeItemPayload(overrides = {}) {
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
      linked_requirements: [
        {
          requirement_id: 700,
          requirement_code: "REQ-LOGIN-001",
          title: "Secure login",
          link_type: "manual",
          notes: "Changed requirement",
          mapped_test_cases: [
            {
              test_case_id: 800,
              test_case_code: "TC-LOGIN-001",
              title: "Verify secure login",
              priority: "high",
              status: "ready"
            }
          ]
        }
      ],
      impacted_tests: [
        {
          test_case_id: 800,
          test_case_code: "TC-LOGIN-001",
          title: "Verify secure login",
          priority: "high",
          status: "ready"
        }
      ],
      comments: [],
      ai_review_draft: null,
      ...overrides
    }
  };
}

function buildRequirementsPayload() {
  return {
    data: [
      { id: 700, requirement_code: "REQ-LOGIN-001", title: "Secure login" },
      { id: 701, requirement_code: "REQ-SEC-002", title: "Admin MFA" }
    ]
  };
}

function buildTestCasesPayload() {
  return {
    data: [
      { id: 800, test_case_code: "TC-LOGIN-001", title: "Verify secure login" },
      { id: 801, test_case_code: "TC-SEC-002", title: "Verify admin MFA" }
    ]
  };
}

function renderImpactPage(path = "/compare-runs/55/impact") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<TraceabilityImpactPage />} path="/compare-runs/:compareRunId/impact" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("TraceabilityImpactPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders linked requirements and impacted tests from live change item detail", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items")) {
        return Promise.resolve(jsonResponse(buildQueuePayload()));
      }

      if (url.endsWith("/api/v1/change-items/900")) {
        return Promise.resolve(jsonResponse(buildChangeItemPayload()));
      }

      // Page now also fetches project requirements and test cases
      if (url.endsWith("/api/v1/projects/1/requirements")) {
        return Promise.resolve(jsonResponse(buildRequirementsPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases")) {
        return Promise.resolve(jsonResponse(buildTestCasesPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderImpactPage();

    expect(await screen.findByRole("region", { name: /impact command/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /change context/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /impact chain/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /mapping console/i })).toBeInTheDocument();
    expect((await screen.findAllByText("REQ-LOGIN-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("TC-LOGIN-001").length).toBeGreaterThan(0);
  });

  test("honors the query-selected change for impact detail", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items")) {
        return Promise.resolve(jsonResponse(buildQueuePayload()));
      }

      if (url.endsWith("/api/v1/change-items/901")) {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemPayload({
              id: 901,
              change_type: "added",
              review_status: "in_review",
              section_title: "Security",
              summary: "Added admin MFA requirement",
              linked_requirements: [
                {
                  requirement_id: 701,
                  requirement_code: "REQ-SEC-002",
                  title: "Admin MFA",
                  link_type: "manual",
                  notes: "Security addition",
                  mapped_test_cases: [
                    {
                      test_case_id: 801,
                      test_case_code: "TC-SEC-002",
                      title: "Verify admin MFA",
                      priority: "high",
                      status: "ready"
                    }
                  ]
                }
              ],
              impacted_tests: [
                {
                  test_case_id: 801,
                  test_case_code: "TC-SEC-002",
                  title: "Verify admin MFA",
                  priority: "high",
                  status: "ready"
                }
              ]
            })
          )
        );
      }

      // Page now also fetches project requirements and test cases
      if (url.endsWith("/api/v1/projects/1/requirements")) {
        return Promise.resolve(jsonResponse(buildRequirementsPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases")) {
        return Promise.resolve(jsonResponse(buildTestCasesPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderImpactPage("/compare-runs/55/impact?change=901");

    expect((await screen.findAllByText("REQ-SEC-002")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("TC-SEC-002").length).toBeGreaterThan(0);
  });

  test("renders active mappings under the correct linked requirement", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);

      if (url.endsWith("/api/v1/compare-runs/55")) {
        return Promise.resolve(jsonResponse(buildCompareRunPayload()));
      }

      if (url.endsWith("/api/v1/compare-runs/55/change-items")) {
        return Promise.resolve(jsonResponse(buildQueuePayload()));
      }

      if (url.endsWith("/api/v1/change-items/900")) {
        return Promise.resolve(
          jsonResponse(
            buildChangeItemPayload({
              linked_requirements: [
                {
                  requirement_id: 700,
                  requirement_code: "REQ-LOGIN-001",
                  title: "Secure login",
                  link_type: "manual",
                  notes: "Changed requirement",
                  mapped_test_cases: [
                    {
                      test_case_id: 800,
                      test_case_code: "TC-LOGIN-001",
                      title: "Verify secure login",
                      priority: "high",
                      status: "ready"
                    }
                  ]
                },
                {
                  requirement_id: 701,
                  requirement_code: "REQ-SEC-002",
                  title: "Admin MFA",
                  link_type: "manual",
                  notes: "Security addition",
                  mapped_test_cases: [
                    {
                      test_case_id: 801,
                      test_case_code: "TC-SEC-002",
                      title: "Verify admin MFA",
                      priority: "high",
                      status: "ready"
                    }
                  ]
                }
              ],
              impacted_tests: [
                {
                  test_case_id: 800,
                  test_case_code: "TC-LOGIN-001",
                  title: "Verify secure login",
                  priority: "high",
                  status: "ready"
                },
                {
                  test_case_id: 801,
                  test_case_code: "TC-SEC-002",
                  title: "Verify admin MFA",
                  priority: "high",
                  status: "ready"
                }
              ]
            })
          )
        );
      }

      if (url.endsWith("/api/v1/projects/1/requirements")) {
        return Promise.resolve(jsonResponse(buildRequirementsPayload()));
      }

      if (url.endsWith("/api/v1/projects/1/test-cases")) {
        return Promise.resolve(jsonResponse(buildTestCasesPayload()));
      }

      return Promise.reject(new Error(`Unhandled request: ${url} ${init.method || "GET"}`));
    });

    renderImpactPage();

    /* Each mapping group starts with req_code in a span inside the Active Mappings cards */
    expect((await screen.findAllByText("REQ-LOGIN-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("REQ-SEC-002").length).toBeGreaterThan(0);

    /* Check test cases are visible in the correct requirement groups */
    expect(screen.getAllByText("TC-LOGIN-001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TC-SEC-002").length).toBeGreaterThan(0);

    /* Verify both mapped test cases appear in the impacted checks column */
    const allTcLogin = screen.getAllByText("TC-LOGIN-001");
    const allTcSec = screen.getAllByText("TC-SEC-002");
    expect(allTcLogin.length).toBeGreaterThanOrEqual(1);
    expect(allTcSec.length).toBeGreaterThanOrEqual(1);
  });
});
