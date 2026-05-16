import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { AuthPage } from "./AuthPage";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function renderAuthPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    </AuthProvider>
  );
}

function switchToRegisterMode() {
  const toggleBtn = screen.getByRole("button", { name: /no account\? create one/i });
  fireEvent.click(toggleBtn);
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.google;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("renders readable backend validation feedback when registration fails", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: [
            {
              type: "string_too_long",
              loc: ["body", "display_name"],
              msg: "String should have at most 255 characters"
            }
          ]
        },
        422
      )
    );

    renderAuthPage();

    // Switch to register mode
    switchToRegisterMode();

    // Fill form
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new-user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "N".repeat(256) }
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "redline123" }
    });

    // Submit button is the one with type="submit"
    const submitButton = screen.getAllByRole("button", { name: /create account/i })
      .find(btn => btn.type === "submit");
    fireEvent.click(submitButton);

    expect(await screen.findByText("display_name: String should have at most 255 characters")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  test("blocks registration with a short password before calling the API", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ data: {} }, 201));

    renderAuthPage();

    // Switch to register mode
    switchToRegisterMode();

    // Fill form
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new-user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "New User" }
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" }
    });

    // Submit via the submit-type button
    const submitButton = screen.getAllByRole("button", { name: /create account/i })
      .find(btn => btn.type === "submit");
    fireEvent.click(submitButton);

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("does not render Google login when no Google client id is configured", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");

    renderAuthPage();

    expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
  });

  test("renders Google login when Google client id is configured", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-id");
    const initialize = vi.fn();
    const prompt = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize,
          prompt
        }
      }
    };

    renderAuthPage();

    expect(await screen.findByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "google-client-id",
        callback: expect.any(Function)
      })
    );
  });

  test("commits a Redline session after Google credential succeeds", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "google-client-id");
    let googleCallback = null;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            googleCallback = options.callback;
          }),
          prompt: vi.fn(() => {
            // Simulate Google returning a credential via the callback
            googleCallback({ credential: "google-id-token" });
          })
        }
      }
    };
    fetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          csrf_token: "redline-google-csrf",
          user: {
            id: 7,
            email: "google-user@example.com",
            display_name: "Google User",
            has_password: false,
            google_linked: true,
            is_active: true,
            created_at: "2026-05-06T00:00:00Z",
            updated_at: "2026-05-06T00:00:00Z"
          },
          pending_project_invitations: []
        }
      })
    );

    renderAuthPage();

    fireEvent.click(await screen.findByRole("button", { name: /continue with google/i }));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/google"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ credential: "google-id-token" })
      })
    );
    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem("redline.week7.session"))).toMatchObject({
        csrf_token: "redline-google-csrf",
        user: {
          email: "google-user@example.com",
          google_linked: true
        }
      });
    });
    expect(window.localStorage.getItem("redline.week7.session")).toBeNull();
  });

  test("does not render unsupported SSO and forgot-password actions", () => {
    renderAuthPage();

    expect(screen.queryByRole("button", { name: /continue with sso/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /forgot password/i })).not.toBeInTheDocument();
  });
});
