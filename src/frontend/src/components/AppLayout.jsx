import { Outlet } from "react-router-dom";
import { AppNavbar } from "./AppNavbar";

/**
 * AppLayout — wraps authenticated pages with the shared Binance-spec navbar.
 * Used by App.jsx as a nested route layout.
 */
export function AppLayout() {
  return (
    <div className="min-h-screen bg-white">
      <AppNavbar />
      <Outlet />
    </div>
  );
}
