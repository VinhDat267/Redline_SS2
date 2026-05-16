import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthContext";

const AUTH_STORAGE_KEY = "redline.week7.session";
const AUTH_LOGOUT_EVENT_KEY = `${AUTH_STORAGE_KEY}.logout`;
const ACTIVE_PROJECT_STORAGE_KEY = "redline_active_project";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

const storedSession = {
  csrf_token: "stale-csrf-token",
  user: {
    id: 1,
    email: "reviewer@example.com",
    display_name: "Reviewer",
    is_active: true
  },
  pending_project_invitations: []
};

function AuthProbe() {
  const { isAuthenticated, isAuthReady, logout, user } = useAuth();

  return (
    <div>
      <output data-testid="auth-state">
        {isAuthReady ? "ready" : "checking"}:{isAuthenticated ? "signed-in" : "signed-out"}
      </output>
      <output data-testid="user-email">{user?.email ?? "none"}</output>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

function AuthMutationProbe() {
  const { changePassword, loginWithGoogle, updateProfile, uploadAvatar, removeAvatar, user } = useAuth();

  return (
    <div>
      <output data-testid="display-name">{user?.display_name ?? "none"}</output>
      <output data-testid="avatar-url">{user?.avatar_url ?? "none"}</output>
      <button type="button" onClick={() => loginWithGoogle("google-id-token")}>
        Login with Google
      </button>
      <button type="button" onClick={() => updateProfile({ display_name: "Updated Reviewer" })}>
        Update Profile
      </button>
      <button
        type="button"
        onClick={() => changePassword({ current_password: "redline123", new_password: "newpass123" })}
      >
        Change Password
      </button>
      <button
        type="button"
        onClick={() => {
          const file = new File(["fake"], "avatar.png", { type: "image/png" });
          uploadAvatar(file);
        }}
      >
        Upload Avatar
      </button>
      <button type="button" onClick={() => removeAvatar()}>
        Remove Avatar
      </button>
    </div>
  );
}

describe("AuthProvider session security", () => {
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

  test("validates a stored session with the backend before trusting it", async () => {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession));
    fetch.mockResolvedValueOnce(jsonResponse({ detail: "Invalid token" }, 401));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-state")).toHaveTextContent("checking:signed-out");

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:signed-out");
    });

    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me"),
      expect.objectContaining({
        credentials: "include"
      })
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test("refreshes user details when a stored session is accepted", async () => {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession));
    fetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: 1,
          email: "fresh@example.com",
          display_name: "Fresh Reviewer",
          is_active: true
        }
      })
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:signed-in");
    });

    expect(screen.getByTestId("user-email")).toHaveTextContent("fresh@example.com");
    expect(JSON.parse(window.sessionStorage.getItem(AUTH_STORAGE_KEY))).toMatchObject({
      csrf_token: "stale-csrf-token",
      user: {
        email: "fresh@example.com"
      }
    });
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  test("logout clears session storage and synchronizes across tabs without storing auth token in local storage", async () => {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession));
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, JSON.stringify({ id: 42, name: "Stale Project" }));

    render(
      <AuthProvider initialSession={storedSession}>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:signed-in");

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("ready:signed-out");
    });
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(AUTH_LOGOUT_EVENT_KEY)).toBeTruthy();

    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedSession));
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, JSON.stringify({ id: 43, name: "Cross Tab Stale" }));

    render(
      <AuthProvider initialSession={storedSession}>
        <AuthProbe />
      </AuthProvider>
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUTH_LOGOUT_EVENT_KEY,
          oldValue: null,
          newValue: "2026-05-09T00:00:00.000Z"
        })
      );
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("auth-state").at(-1)).toHaveTextContent("ready:signed-out");
    });
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
  });

  test("commits Google sessions and refreshes stored user profile details", async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            csrf_token: "google-csrf-token",
            user: {
              id: 5,
              email: "google@example.com",
              display_name: "Google Reviewer",
              has_password: false,
              google_linked: true,
              is_active: true
            },
            pending_project_invitations: []
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 5,
            email: "google@example.com",
            display_name: "Updated Reviewer",
            has_password: false,
            google_linked: true,
            is_active: true
          }
        })
      );

    render(
      <AuthProvider>
        <AuthMutationProbe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /login with google/i }));

    await waitFor(() => {
      expect(screen.getByTestId("display-name")).toHaveTextContent("Google Reviewer");
    });
    expect(JSON.parse(window.sessionStorage.getItem(AUTH_STORAGE_KEY))).toMatchObject({
      csrf_token: "google-csrf-token",
      user: {
        email: "google@example.com"
      }
    });
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /update profile/i }));

    await waitFor(() => {
      expect(screen.getByTestId("display-name")).toHaveTextContent("Updated Reviewer");
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/v1/auth/google"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ credential: "google-id-token" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/v1/auth/me"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "X-CSRF-Token": "google-csrf-token"
        }),
        credentials: "include",
        body: JSON.stringify({ display_name: "Updated Reviewer" })
      })
    );
    expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  test("uploadAvatar sends multipart POST and updates user avatar_url in session", async () => {
    const sessionWithCsrf = {
      csrf_token: "upload-csrf-token",
      user: {
        id: 10,
        email: "uploader@example.com",
        display_name: "Uploader",
        is_active: true,
        avatar_url: null
      },
      pending_project_invitations: []
    };

    fetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: 10,
          email: "uploader@example.com",
          display_name: "Uploader",
          is_active: true,
          avatar_url: "/uploads/avatars/user-10/abc.webp"
        }
      })
    );

    render(
      <AuthProvider initialSession={sessionWithCsrf}>
        <AuthMutationProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("avatar-url")).toHaveTextContent("none");

    fireEvent.click(screen.getByRole("button", { name: /upload avatar/i }));

    await waitFor(() => {
      expect(screen.getByTestId("avatar-url")).toHaveTextContent("/uploads/avatars/user-10/abc.webp");
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me/avatar"),
      expect.objectContaining({
        method: "POST",
        credentials: "include"
      })
    );

    // Verify FormData was sent (not JSON)
    const callBody = fetch.mock.calls[0][1].body;
    expect(callBody).toBeInstanceOf(FormData);

    // Verify session storage updated
    const stored = JSON.parse(window.sessionStorage.getItem(AUTH_STORAGE_KEY));
    expect(stored.user.avatar_url).toBe("/uploads/avatars/user-10/abc.webp");
  });

  test("removeAvatar sends DELETE and clears avatar_url in session", async () => {
    const sessionWithAvatar = {
      csrf_token: "remove-csrf-token",
      user: {
        id: 11,
        email: "remover@example.com",
        display_name: "Remover",
        is_active: true,
        avatar_url: "/uploads/avatars/user-11/old.webp"
      },
      pending_project_invitations: []
    };

    fetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: 11,
          email: "remover@example.com",
          display_name: "Remover",
          is_active: true,
          avatar_url: null
        }
      })
    );

    render(
      <AuthProvider initialSession={sessionWithAvatar}>
        <AuthMutationProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("avatar-url")).toHaveTextContent("/uploads/avatars/user-11/old.webp");

    fireEvent.click(screen.getByRole("button", { name: /remove avatar/i }));

    await waitFor(() => {
      expect(screen.getByTestId("avatar-url")).toHaveTextContent("none");
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/me/avatar"),
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: expect.objectContaining({
          "X-CSRF-Token": "remove-csrf-token"
        })
      })
    );

    // No auth token in localStorage
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();

    // Session storage updated
    const stored = JSON.parse(window.sessionStorage.getItem(AUTH_STORAGE_KEY));
    expect(stored.user.avatar_url).toBeNull();
  });
});
