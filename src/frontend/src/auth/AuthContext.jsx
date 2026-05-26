import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState } from "react";

import {
  acceptProjectInvitation,
  changeCurrentUserPassword,
  declineMyProjectInvitation,
  deleteAvatar as deleteAvatarApi,
  fetchCurrentUser,
  listMyPendingInvitations,
  loginUser,
  loginWithGoogleCredential,
  logoutUser,
  registerUser,
  updateCurrentUserProfile,
  uploadAvatar as uploadAvatarApi
} from "../lib/api";
import { ACTIVE_PROJECT_CLEAR_EVENT, ACTIVE_PROJECT_STORAGE_KEY } from "../context/ActiveProjectContext";

export const AUTH_STORAGE_KEY = "redline.week7.session";
export const AUTH_LOGOUT_EVENT_KEY = `${AUTH_STORAGE_KEY}.logout`;
const AuthContext = createContext(null);

function getSessionCsrfToken(value, { allowLegacyToken = false } = {}) {
  if (typeof value?.csrf_token === "string" && value.csrf_token.trim()) {
    return value.csrf_token;
  }

  if (allowLegacyToken && typeof value?.token === "string" && value.token.trim()) {
    return value.token;
  }

  return null;
}

function normalizeSession(value, { allowLegacyToken = false } = {}) {
  const csrfToken = getSessionCsrfToken(value, { allowLegacyToken });
  if (!csrfToken || !value?.user || typeof value.user !== "object") {
    return null;
  }

  const { token: _legacyToken, ...session } = value;
  return {
    ...session,
    csrf_token: csrfToken,
    pending_project_invitations: Array.isArray(value.pending_project_invitations)
      ? value.pending_project_invitations
      : []
  };
}

function parseStoredSessionValue(rawValue) {
  try {
    return rawValue ? normalizeSession(JSON.parse(rawValue)) : null;
  } catch {
    return null;
  }
}

function readStoredSession() {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    const rawValue = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const session = parseStoredSessionValue(rawValue);
    if (!session) {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }

    return session;
  } catch {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session) {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);

  if (!session) {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    clearStoredActiveProject();
    return;
  }

  window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function broadcastLogout() {
  window.localStorage.setItem(AUTH_LOGOUT_EVENT_KEY, String(Date.now()));
}

function clearStoredActiveProject() {
  window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
  window.dispatchEvent(new Event(ACTIVE_PROJECT_CLEAR_EVENT));
}

export function AuthProvider({ children, initialSession = null }) {
  const [initialAuthState] = useState(() => {
    const normalizedInitialSession = initialSession
      ? normalizeSession(initialSession, { allowLegacyToken: true })
      : null;
    const storedSession = initialSession ? null : readStoredSession();

    return {
      session: normalizedInitialSession,
      storedSession,
      isAuthReady: Boolean(normalizedInitialSession) || !storedSession
    };
  });
  const [session, setSession] = useState(initialAuthState.session);
  const [isAuthReady, setIsAuthReady] = useState(initialAuthState.isAuthReady);
  const [liveInvitations, setLiveInvitations] = useState(null); // null = use session data
  const sessionCsrfRef = useRef(getSessionCsrfToken(session));

  useEffect(() => {
    sessionCsrfRef.current = getSessionCsrfToken(session);
  }, [session]);

  useEffect(() => {
    const storedSession = initialAuthState.storedSession;
    const storedCsrfToken = getSessionCsrfToken(storedSession);
    if (!storedCsrfToken) {
      return undefined;
    }

    let didCancel = false;

    async function validateStoredSession() {
      try {
        const currentUser = await fetchCurrentUser(storedCsrfToken);

        if (didCancel) {
          return;
        }

        const nextSession = {
          ...storedSession,
          user: currentUser
        };

        writeStoredSession(nextSession);
        startTransition(() => {
          setSession((currentSession) => {
            const currentCsrfToken = getSessionCsrfToken(currentSession);
            if (currentCsrfToken && currentCsrfToken !== storedCsrfToken) {
              return currentSession;
            }

            return nextSession;
          });
          setIsAuthReady(true);
        });
      } catch {
        if (didCancel) {
          return;
        }

        if (!sessionCsrfRef.current || sessionCsrfRef.current === storedCsrfToken) {
          writeStoredSession(null);
          startTransition(() => {
            setSession(null);
            setIsAuthReady(true);
          });
          return;
        }

        startTransition(() => {
          setIsAuthReady(true);
        });
      }
    }

    validateStoredSession();

    return () => {
      didCancel = true;
    };
  }, [initialAuthState.storedSession]);

  useEffect(() => {
    function handleStorageEvent(event) {
      if (event.key !== AUTH_LOGOUT_EVENT_KEY && event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      if (event.key === AUTH_STORAGE_KEY && event.newValue !== null) {
        return;
      }

      writeStoredSession(null);
      startTransition(() => {
        setSession(null);
        setIsAuthReady(true);
      });
    }

    window.addEventListener("storage", handleStorageEvent);
    return () => {
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  function commitSession(nextSession) {
    const normalizedSession = normalizeSession(nextSession);
    if (!normalizedSession) {
      throw new Error("Invalid authentication session");
    }

    clearStoredActiveProject();
    writeStoredSession(normalizedSession);
    startTransition(() => {
      setSession(normalizedSession);
      setIsAuthReady(true);
    });
  }

  async function login(credentials) {
    const nextSession = await loginUser(credentials);
    commitSession(nextSession);
    return nextSession;
  }

  async function loginWithGoogle(credential) {
    const nextSession = await loginWithGoogleCredential(credential);
    commitSession(nextSession);
    return nextSession;
  }

  async function register(payload) {
    const nextSession = await registerUser(payload);
    commitSession(nextSession);
    return nextSession;
  }

  function commitUser(nextUser, csrfToken = null) {
    startTransition(() => {
      setSession((currentSession) => {
        if (!currentSession) {
          return currentSession;
        }

        const nextSession = {
          ...currentSession,
          ...(csrfToken ? { csrf_token: csrfToken } : {}),
          user: nextUser
        };

        writeStoredSession(nextSession);
        return nextSession;
      });
    });
  }

  async function updateProfile(payload) {
    const csrfToken = getSessionCsrfToken(session);
    if (!csrfToken) {
      throw new Error("Authentication required");
    }

    const nextUser = await updateCurrentUserProfile(csrfToken, payload);
    commitUser(nextUser);
    return nextUser;
  }

  async function uploadAvatar(file) {
    const csrfToken = getSessionCsrfToken(session);
    if (!csrfToken) {
      throw new Error("Authentication required");
    }

    const nextUser = await uploadAvatarApi(csrfToken, file);
    commitUser(nextUser);
    return nextUser;
  }

  async function removeAvatar() {
    const csrfToken = getSessionCsrfToken(session);
    if (!csrfToken) {
      throw new Error("Authentication required");
    }

    const nextUser = await deleteAvatarApi(csrfToken);
    commitUser(nextUser);
    return nextUser;
  }

  async function changePassword(payload) {
    const csrfToken = getSessionCsrfToken(session);
    if (!csrfToken) {
      throw new Error("Authentication required");
    }

    const result = await changeCurrentUserPassword(csrfToken, payload);
    if (result?.user) {
      commitUser(result.user, result.csrf_token);
    }
    return result;
  }

  async function acceptPendingProjectInvitation(invitationId) {
    const csrfToken = getSessionCsrfToken(session);
    if (!csrfToken) {
      return null;
    }

    const acceptancePayload = await acceptProjectInvitation(csrfToken, invitationId);
    // Update both session invitations and liveInvitations
    const updatedInvitations = acceptancePayload.pending_project_invitations ?? [];
    startTransition(() => {
      setSession((currentSession) => {
        if (!currentSession) {
          return currentSession;
        }

        const nextSession = {
          ...currentSession,
          pending_project_invitations: updatedInvitations
        };

        writeStoredSession(nextSession);
        return nextSession;
      });
      setLiveInvitations(updatedInvitations);
    });
    return acceptancePayload;
  }

  async function declinePendingProjectInvitation(invitationId) {
    const csrfToken = getSessionCsrfToken(session);
    if (!csrfToken) {
      return null;
    }

    const result = await declineMyProjectInvitation(csrfToken, invitationId);
    const updatedInvitations = result?.data?.pending_project_invitations ?? result?.pending_project_invitations ?? [];
    startTransition(() => {
      setSession((currentSession) => {
        if (!currentSession) return currentSession;
        const nextSession = {
          ...currentSession,
          pending_project_invitations: updatedInvitations
        };
        writeStoredSession(nextSession);
        return nextSession;
      });
      setLiveInvitations(updatedInvitations);
    });
    return result;
  }

  function logout() {
    const csrfToken = getSessionCsrfToken(session);
    if (csrfToken) {
      logoutUser(csrfToken).catch(() => { });
    }
    clearStoredActiveProject();
    writeStoredSession(null);
    broadcastLogout();
    startTransition(() => {
      setSession(null);
      setIsAuthReady(true);
    });
  }

  const csrfToken = getSessionCsrfToken(session);

  // Poll backend every 30s for new invitations (handles invite received after login)
  const pollInvitations = useCallback(async () => {
    if (!csrfToken) return;
    try {
      const result = await listMyPendingInvitations(csrfToken);
      const invites = result?.data ?? [];
      setLiveInvitations(Array.isArray(invites) ? invites : []);
    } catch {
      // silent – keep showing last known state
    }
  }, [csrfToken]);

  useEffect(() => {
    if (!csrfToken) return;
    pollInvitations();
    const timer = setInterval(pollInvitations, 30_000);
    return () => clearInterval(timer);
  }, [csrfToken, pollInvitations]);

  // Merge: prefer liveInvitations (poll) over session snapshot
  const pendingProjectInvitations = liveInvitations ?? (session?.pending_project_invitations ?? []);

  const value = {
    session,
    token: csrfToken,
    csrfToken,
    user: session?.user ?? null,
    isAuthReady,
    isAuthenticated: Boolean(csrfToken && session?.user),
    pendingProjectInvitations,
    login,
    loginWithGoogle,
    register,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    changePassword,
    acceptPendingProjectInvitation,
    declinePendingProjectInvitation,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
