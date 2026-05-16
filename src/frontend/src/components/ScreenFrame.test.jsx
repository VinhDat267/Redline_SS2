import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { ScreenFrame } from "./ScreenFrame";
import { PlaceholderTagRow } from "./ScreenFrame";

afterEach(() => {
  cleanup();
});

test("renders delivery filters as a named list with one item per placeholder control", () => {
  render(
    <PlaceholderTagRow
      ariaLabel="Delivery filters"
      items={[
        "Seed starter workspace",
        "Create project live",
        "Open project workspace",
        "Live fetch enabled"
      ]}
    />
  );

  const list = screen.getByRole("list", { name: /delivery filters/i });
  const items = within(list).getAllByRole("listitem");

  expect(list).toHaveStyle({
    display: "flex",
    flexWrap: "nowrap",
    overflowX: "auto"
  });
  expect(items).toHaveLength(4);
  expect(items.map((item) => item.textContent)).toEqual([
    "Seed starter workspace",
    "Create project live",
    "Open project workspace",
    "Live fetch enabled"
  ]);
  items.forEach((item) => {
    expect(item).toHaveStyle({
      flex: "0 0 auto",
      whiteSpace: "nowrap"
    });
  });
});

test("renders a compact workspace shell without the legacy brief and guardrail panels", () => {
  render(
    <MemoryRouter>
      <ScreenFrame
        actions={[
          { label: "Seed Starter Workspace", kind: "button" },
          { label: "New Project", kind: "button" }
        ]}
        breadcrumbs={[{ label: "Projects" }]}
        stats={[
          { label: "Total Projects", value: "4", detail: "Live inventory" },
          { label: "Data Mode", value: "Live Database", detail: "FastAPI + SQLite" }
        ]}
        title="Projects"
      >
        <p>Workspace content</p>
      </ScreenFrame>
    </MemoryRouter>
  );

  expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
  expect(screen.getByText("Total Projects")).toBeInTheDocument();
  expect(screen.queryByText(/workspace brief/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/operational guardrails/i)).not.toBeInTheDocument();
});

test("renders legal page framing with intro copy and trust signals", () => {
  render(
    <MemoryRouter>
      <ScreenFrame
        actions={[]}
        breadcrumbs={[{ label: "Contracts" }]}
        eyebrow="Deterministic Compare"
        intro="Parser truth anchors every clause change before AI review drafts are generated."
        signals={["Compare truth locked", "AI stays advisory"]}
        title="Compare Workspace"
      >
        <p>Workspace content</p>
      </ScreenFrame>
    </MemoryRouter>
  );

  expect(screen.getByText("Deterministic Compare")).toBeInTheDocument();
  expect(screen.getByText(/parser truth anchors every clause change/i)).toBeInTheDocument();

  const signalList = screen.getByRole("list", { name: /page signals/i });
  expect(within(signalList).getAllByRole("listitem")).toHaveLength(2);
  expect(within(signalList).getByText("Compare truth locked")).toBeInTheDocument();
  expect(within(signalList).getByText("AI stays advisory")).toBeInTheDocument();
});

test("renders the Stitch-inspired shell with legal product navigation", () => {
  render(
    <MemoryRouter initialEntries={["/compare-runs/42/review"]}>
      <ScreenFrame title="Review Workspace">
        <p>Workspace content</p>
      </ScreenFrame>
    </MemoryRouter>
  );

  const sidebar = screen.getAllByRole("navigation", { name: /main navigation/i }).at(-1);
  expect(sidebar).toHaveClass("bg-[#222126]");
  expect(sidebar).not.toHaveClass("bg-app");
  expect(within(sidebar).getByText("Redline HQ")).toBeInTheDocument();
  expect(within(sidebar).getByText("Legal Workspace")).toBeInTheDocument();
  expect(within(sidebar).getByText("Projects")).toBeInTheDocument();
  expect(within(sidebar).getByText("Contracts")).toBeInTheDocument();
  expect(within(sidebar).getByText("Compare")).toBeInTheDocument();
  expect(within(sidebar).getByText("Review")).toBeInTheDocument();
  expect(within(sidebar).getByText("Contract Q&A")).toBeInTheDocument();
  expect(within(sidebar).getByText("Parser")).toBeInTheDocument();

  expect(within(sidebar).getByRole("link", { name: /projects/i })).toHaveAttribute("href", "/dashboard");
  expect(within(sidebar).getByText("Review").closest(".sidebar-nav-item")).toHaveClass("sidebar-nav-item-active");

  const productNav = screen.getByRole("navigation", { name: /product sections/i });
  expect(within(productNav).getByText("Contracts")).toBeInTheDocument();
  expect(within(productNav).getByText("Compare")).toBeInTheDocument();
  expect(within(productNav).getByText("Review")).toBeInTheDocument();
  expect(within(productNav).getByText("Q&A")).toBeInTheDocument();
  expect(within(productNav).getByText("Parser")).toBeInTheDocument();
  expect(within(productNav).getByText("Review")).toHaveClass("workspace-topbar-nav-active");
});

test("keeps primary sidebar sections clickable even without route ids", () => {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <ScreenFrame title="Projects">
        <p>Workspace content</p>
      </ScreenFrame>
    </MemoryRouter>
  );

  const sidebar = screen.getAllByRole("navigation", { name: /main navigation/i }).at(-1);
  const expectedTargets = {
    Projects: "/dashboard",
    Contracts: "/contracts",
    Parser: "/parser",
    Compare: "/compare",
    Review: "/review",
    "Contract Q&A": "/contract-q-a",
    Analytics: "/analytics"
  };

  Object.entries(expectedTargets).forEach(([label, href]) => {
    const link = within(sidebar).getByRole("link", { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
    expect(link).not.toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("href", href);
  });

  const productNav = screen.getByRole("navigation", { name: /product sections/i });
  expect(within(productNav).getByRole("link", { name: /contracts/i })).toHaveAttribute("href", "/contracts");
  expect(within(productNav).getByRole("link", { name: /compare/i })).toHaveAttribute("href", "/compare");
  expect(within(productNav).getByRole("link", { name: /review/i })).toHaveAttribute("href", "/review");
  expect(within(productNav).getByRole("link", { name: /q&a/i })).toHaveAttribute("href", "/contract-q-a");
  expect(within(productNav).getByRole("link", { name: /parser/i })).toHaveAttribute("href", "/parser");
});

test("renders the Binance-inspired global shell tokens", () => {
  render(
    <MemoryRouter initialEntries={["/projects/7"]}>
      <ScreenFrame
        actions={[{ label: "New Contract", kind: "button" }]}
        stats={[{ label: "RAG Ready", value: "97%", detail: "Grounded" }]}
        title="Contract Workspace"
      >
        <p>Workspace content</p>
      </ScreenFrame>
    </MemoryRouter>
  );

  const sidebar = screen.getAllByRole("navigation", { name: /main navigation/i }).at(-1);
  expect(sidebar).toHaveClass("bg-[#222126]");
  expect(sidebar).not.toHaveClass("bg-bg-marketing");
  expect(sidebar).not.toHaveClass("bg-app");
  expect(within(sidebar).getByText("Redline HQ")).toBeInTheDocument();

  const primaryAction = screen.getByRole("button", { name: /new contract/i });
  expect(primaryAction).toHaveClass("bg-[#F0B90B]");
  expect(primaryAction).toHaveClass("text-[#1E2026]");
});

test("renders the authenticated profile logout control with an accessible name", () => {
  const onSignOut = vi.fn();

  render(
    <AuthProvider
      initialSession={{
        token: "token-123",
        user: {
          id: 1,
          email: "reviewer@example.com",
          display_name: "Reviewer",
          has_password: true,
          google_linked: false,
          is_active: true
        },
        pending_project_invitations: []
      }}
    >
      <MemoryRouter>
        <ScreenFrame
          actions={[{ label: "Sign Out", kind: "button", onClick: onSignOut }]}
          title="Projects"
        >
          <p>Workspace content</p>
        </ScreenFrame>
      </MemoryRouter>
    </AuthProvider>
  );

  const signOutButton = screen.getByRole("button", { name: /sign out/i });
  fireEvent.click(signOutButton);

  expect(screen.getByText("Reviewer")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /account settings for reviewer/i })).toHaveAttribute("href", "/account");
  expect(onSignOut).toHaveBeenCalledTimes(1);
});
