import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ProjectAnalyticsPage } from "./ProjectAnalyticsPage";

// Mock recharts ResponsiveContainer to avoid resize-observer issues in jsdom
vi.mock("recharts", async () => {
  const actual = await vi.importActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    ),
  };
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const session = {
  token: "token-analytics",
  user: { id: 1, email: "test@example.com", display_name: "Tester", is_active: true },
};

function renderAnalytics(path = "/projects/1/analytics") {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProjectAnalyticsPage />} path="/projects/:projectId/analytics" />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("ProjectAnalyticsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("renders analytics dashboard with chart sections and stats", async () => {
    fetch.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/api/v1/projects/1")) {
        return Promise.resolve(
          jsonResponse({
            data: { id: 1, name: "Demo Project", description: "Test" },
          })
        );
      }

      if (url.endsWith("/api/v1/projects/1/analytics")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              total_changes: 5,
              total_compare_runs: 2,
              change_types: { added: 2, removed: 1, modified: 2 },
              review_status: { open: 2, in_review: 1, resolved: 2 },
              ai_generation: { pending: 0, generated: 3, failed: 0 },
              risk_levels: { low: 1, medium: 1, high: 1 },
              ai_accuracy_pct: 75.0,
              ai_avg_confidence: 0.82,
              compare_runs: { completed: 2 },
              per_document: [
                {
                  document_id: 10,
                  title: "SRS Document",
                  compare_runs: 2,
                  total_changes: 5,
                  resolved: 2,
                },
              ],
            },
          })
        );
      }

      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    renderAnalytics();

    expect(await screen.findByRole("heading", { name: /project analytics/i })).toBeInTheDocument();

    // Stats bar should render with expected values
    await waitFor(() => {
      expect(screen.getByText("40% resolved")).toBeInTheDocument();
    });

    // Chart section headings
    expect(screen.getByRole("heading", { name: /change types/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /review status/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /risk distribution/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ai generation/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ai insights/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /per-document overview/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /document breakdown/i })).toBeInTheDocument();

    // AI accuracy value
    const aiInsightsSection = screen.getByRole("heading", { name: /ai insights/i }).closest("section");
    expect(within(aiInsightsSection).getByText("75%")).toBeInTheDocument();

    // Document table row
    expect(screen.getByText("SRS Document")).toBeInTheDocument();
  });

  test("renders empty state for project without data", async () => {
    fetch.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/api/v1/projects/1")) {
        return Promise.resolve(
          jsonResponse({ data: { id: 1, name: "Empty Project", description: "" } })
        );
      }

      if (url.endsWith("/api/v1/projects/1/analytics")) {
        return Promise.resolve(
          jsonResponse({
            data: {
              total_changes: 0,
              total_compare_runs: 0,
              change_types: { added: 0, removed: 0, modified: 0 },
              review_status: { open: 0, in_review: 0, resolved: 0 },
              ai_generation: { pending: 0, generated: 0, failed: 0 },
              risk_levels: { low: 0, medium: 0, high: 0 },
              ai_accuracy_pct: null,
              ai_avg_confidence: null,
              compare_runs: {},
              per_document: [],
            },
          })
        );
      }

      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("0% resolved")).toBeInTheDocument();
    });

    // Empty charts show "No data yet"
    const noDataTexts = screen.getAllByText("No data yet");
    expect(noDataTexts.length).toBeGreaterThan(0);
  });
});
