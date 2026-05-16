import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const ACTIVE_PROJECT_STORAGE_KEY = "redline_active_project";
export const ACTIVE_PROJECT_CLEAR_EVENT = "redline:active-project-clear";

const ActiveProjectContext = createContext(null);

/**
 * Stores { id: number, name: string } for the currently-active project.
 * Persisted to localStorage so it survives page refreshes.
 */
export function ActiveProjectProvider({ children }) {
    const [activeProject, setActiveProjectState] = useState(() => {
        try {
            const raw = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        function handleClearActiveProject() {
            localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
            setActiveProjectState(null);
        }

        window.addEventListener(ACTIVE_PROJECT_CLEAR_EVENT, handleClearActiveProject);
        return () => {
            window.removeEventListener(ACTIVE_PROJECT_CLEAR_EVENT, handleClearActiveProject);
        };
    }, []);

    const setActiveProject = useCallback((project) => {
        if (!project) {
            localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
            setActiveProjectState(null);
            return;
        }
        const slim = { id: project.id, name: project.name };
        localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, JSON.stringify(slim));
        setActiveProjectState(slim);
    }, []);

    const clearActiveProject = useCallback(() => {
        localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
        setActiveProjectState(null);
    }, []);

    return (
        <ActiveProjectContext.Provider value={{ activeProject, setActiveProject, clearActiveProject }}>
            {children}
        </ActiveProjectContext.Provider>
    );
}

export function useActiveProject() {
    const ctx = useContext(ActiveProjectContext);
    if (!ctx) throw new Error("useActiveProject must be used inside <ActiveProjectProvider>");
    return ctx;
}
