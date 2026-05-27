import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/**
 * Hook that connects to the SSE endpoint for real-time project events.
 *
 * Uses `withCredentials: true` so the httpOnly session cookie is sent
 * cross-origin (requires SameSite=None; Secure on the backend cookie).
 *
 * @param {number|null} projectId  - The project to subscribe to (null = disconnected)
 * @param {function}    onEvent    - Callback receiving { type, data, actor_display_name, ... }
 * @param {object}      [options]
 * @param {boolean}     [options.enabled=true]
 */
export function useProjectEvents(projectId, onEvent, { enabled = true } = {}) {
    const { token } = useAuth();
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
        if (!projectId || !enabled) return;

        let eventSource;
        let reconnectTimer;
        let retryCount = 0;
        const MAX_RETRIES = 10;

        function connect() {
            let url = `${API_BASE_URL}/api/v1/projects/${projectId}/events`;
            if (token) {
                url += `?token=${encodeURIComponent(token)}`;
            }
            eventSource = new EventSource(url, { withCredentials: true });


            eventSource.addEventListener("connected", () => {
                retryCount = 0;
                console.debug("[SSE] Connected to project", projectId);
            });

            eventSource.addEventListener("project_update", (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    onEventRef.current?.(payload);
                } catch (err) {
                    console.warn("[SSE] Failed to parse event:", err);
                }
            });

            eventSource.onerror = () => {
                eventSource.close();
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    const delay = Math.min(1000 * 2 ** retryCount, 30000);
                    console.debug(`[SSE] Reconnecting in ${delay}ms (attempt ${retryCount})`);
                    reconnectTimer = setTimeout(connect, delay);
                } else {
                    console.warn("[SSE] Max retries reached, stopping reconnection");
                }
            };
        }

        connect();

        return () => {
            clearTimeout(reconnectTimer);
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [projectId, enabled, token]);
}
