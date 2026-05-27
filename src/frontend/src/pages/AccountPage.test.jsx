import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { AccountPage } from "./AccountPage";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function renderAccountPage(session) {
  return render(
    <AuthProvider initialSession={session}>
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>
    </AuthProvider>
  );
}

const localSession = {
  csrf_token: "local-csrf-token",
  user: {
    id: 1,
    email: "reviewer@example.com",
    display_name: "Local Reviewer",
    has_password: true,
    google_linked: false,
    is_active: true,
    created_at: "2026-05-06T00:00:00Z",
    updated_at: "2026-05-06T00:00:00Z"
  },
  pending_project_invitations: []
};

const googleOnlySession = {
  csrf_token: "google-csrf-token",
  user: {
    id: 2,
    email: "google@example.com",
    display_name: "Google Reviewer",
    has_password: false,
    google_linked: true,
    is_active: true,
    created_at: "2026-05-06T00:00:00Z",
    updated_at: "2026-05-06T00:00:00Z"
  },
  pending_project_invitations: []
};

describe("AccountPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("shows profile and password controls for local password accounts", () => {
    renderAccountPage(localSession);

    expect(screen.getByRole("heading", { name: /local reviewer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue("Local Reviewer");
    expect(screen.getByText("reviewer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });

  test("hides password change controls for Google-only accounts", () => {
    renderAccountPage(googleOnlySession);

    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText(/password sign-in is not enabled/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  test("saves display name and updates the authenticated session", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/api/v1/auth/me") && method === "PATCH") {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...localSession.user,
              display_name: "Updated Reviewer",
              updated_at: "2026-05-06T01:00:00Z"
            }
          })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderAccountPage(localSession);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Updated Reviewer" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "X-CSRF-Token": "local-csrf-token"
        }),
        credentials: "include",
        body: JSON.stringify({ display_name: "Updated Reviewer" })
      })
    );
    expect(fetch.mock.calls.find(c => String(c[0]).endsWith("/api/v1/auth/me"))[1].headers.Authorization).toBeUndefined();

    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem("redline.week7.session"))).toMatchObject({
        user: {
          display_name: "Updated Reviewer"
        }
      });
    });
    expect(window.localStorage.getItem("redline.week7.session")).toBeNull();
  });

  /* ─── Avatar Upload Tests ─── */

  test("logs out when profile save finds an expired session", async () => {
    window.sessionStorage.setItem("redline.week7.session", JSON.stringify(localSession));
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/api/v1/auth/me") && method === "PATCH") {
        return Promise.resolve(
          jsonResponse({ detail: "Your session has expired. Please sign in again." }, 401)
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderAccountPage(localSession);

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "Expired Reviewer" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(window.sessionStorage.getItem("redline.week7.session")).toBeNull();
    });
  });

  test("renders file input for avatar upload", () => {
    renderAccountPage(localSession);
    const input = screen.getByLabelText(/upload avatar/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/gif");
  });

  test("exposes a keyboard-accessible avatar change button", () => {
    renderAccountPage(localSession);

    const button = screen.getByRole("button", { name: /change avatar/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
  });

  test("shows initial letter when no avatar_url exists", () => {
    renderAccountPage(localSession);
    // No <img> with avatar alt text should exist
    expect(screen.queryByAltText(/avatar/i)).not.toBeInTheDocument();
    // But the initial letter "L" should be visible (from "Local Reviewer")
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  test("shows avatar image when avatar_url exists", () => {
    const sessionWithAvatar = {
      ...localSession,
      user: {
        ...localSession.user,
        avatar_url: "/uploads/avatars/user-1/test.webp"
      }
    };
    renderAccountPage(sessionWithAvatar);
    const img = screen.getByAltText(/local reviewer avatar/i);
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    expect(img.src).toContain("/uploads/avatars/user-1/test.webp");
  });

  test("shows remove button when avatar exists", () => {
    const sessionWithAvatar = {
      ...localSession,
      user: {
        ...localSession.user,
        avatar_url: "/uploads/avatars/user-1/test.webp"
      }
    };
    renderAccountPage(sessionWithAvatar);
    expect(screen.getByRole("button", { name: /remove avatar/i })).toBeInTheDocument();
  });

  test("hides remove button when no avatar exists", () => {
    renderAccountPage(localSession);
    expect(screen.queryByRole("button", { name: /remove avatar/i })).not.toBeInTheDocument();
  });

  test("uploads avatar and shows success message", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/api/v1/auth/me/avatar") && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...localSession.user,
              avatar_url: "/uploads/avatars/user-1/new.webp",
              updated_at: "2026-05-06T02:00:00Z"
            }
          })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderAccountPage(localSession);

    const file = new File(["fake-image"], "photo.png", { type: "image/png" });
    const input = screen.getByLabelText(/upload avatar/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/avatar updated/i)).toBeInTheDocument();

    // Verify the API was called with form data
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me/avatar"),
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    );
  });

  test("removes avatar and shows success message", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/api/v1/auth/me/avatar") && method === "DELETE") {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...localSession.user,
              avatar_url: null,
              updated_at: "2026-05-06T03:00:00Z"
            }
          })
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const sessionWithAvatar = {
      ...localSession,
      user: {
        ...localSession.user,
        avatar_url: "/uploads/avatars/user-1/test.webp"
      }
    };
    renderAccountPage(sessionWithAvatar);

    fireEvent.click(screen.getByRole("button", { name: /remove avatar/i }));

    expect(await screen.findByText(/avatar removed/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me/avatar"),
      expect.objectContaining({
        method: "DELETE",
        credentials: "include"
      })
    );
  });

  test("shows error for oversized avatar file", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderAccountPage(localSession);

    // Create a file that exceeds 5MB
    const bigContent = new ArrayBuffer(6 * 1024 * 1024);
    const file = new File([bigContent], "huge.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });

    const input = screen.getByLabelText(/upload avatar/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/5 mb/i)).toBeInTheDocument();
    // No avatar upload call should have been made
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me/avatar"),
      expect.any(Object)
    );
  });

  test("shows error for unsupported avatar file type", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderAccountPage(localSession);

    const file = new File(["fake"], "doc.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/upload avatar/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/jpeg.*png.*webp.*gif/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me/avatar"),
      expect.any(Object)
    );
  });

  test("shows error message when avatar upload fails", async () => {
    fetch.mockImplementation((input, init = {}) => {
      const url = String(input);
      const method = init.method || "GET";
      if (url.includes("/invitations") || url.includes("/my-invitations")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/api/v1/auth/me/avatar") && method === "POST") {
        return Promise.resolve(
          jsonResponse({ detail: "Upload failed" }, 500)
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    renderAccountPage(localSession);

    const file = new File(["fake-image"], "photo.png", { type: "image/png" });
    const input = screen.getByLabelText(/upload avatar/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
  });
});
