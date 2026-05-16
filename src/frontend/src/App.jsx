import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { AuthPage } from "./pages/AuthPage";
import { AccountPage } from "./pages/AccountPage";
import { CompareScreenPage } from "./pages/CompareScreenPage";
import { ContractChatPage } from "./pages/ContractChatPage";
import { ContractDetailPage } from "./pages/ContractDetailPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { LandingPage } from "./pages/LandingPage";
import { ParserWorkspacePage } from "./pages/ParserWorkspacePage";
import { ProjectAnalyticsPage } from "./pages/ProjectAnalyticsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectListPage } from "./pages/ProjectListPage";
import { ReviewPanelPage } from "./pages/ReviewPanelPage";
import { SummaryExportPage } from "./pages/SummaryExportPage";
import { TraceabilityImpactPage } from "./pages/TraceabilityImpactPage";
import { WorkspaceGatewayPage } from "./pages/WorkspaceGatewayPage";
import "./pages/landing.css";

export function buildAuthReturnPath(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: buildAuthReturnPath(location) }} to="/login" />;
  }

  return children;
}

function LandingOrDashboard() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate replace to="/dashboard" />;
  }

  return <LandingPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes — no navbar */}
      <Route path="/login" element={<AuthPage />} />
      <Route path="/" element={<LandingOrDashboard />} />

      {/* Authenticated routes — shared AppLayout with navbar */}
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<ProjectListPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/contracts" element={<WorkspaceGatewayPage section="contracts" />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/analytics" element={<ProjectAnalyticsPage />} />
        <Route path="/contracts/:contractId" element={<ContractDetailPage />} />
        <Route path="/contracts/:contractId/parser" element={<ParserWorkspacePage />} />
        <Route path="/contracts/:contractId/chat" element={<ContractChatPage />} />
        <Route path="/documents/:documentId/parser" element={<ParserWorkspacePage />} />
        <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="/parser" element={<WorkspaceGatewayPage section="parser" />} />
        <Route path="/compare" element={<WorkspaceGatewayPage section="compare" />} />
        <Route path="/review" element={<WorkspaceGatewayPage section="review" />} />
        <Route path="/contract-q-a" element={<WorkspaceGatewayPage section="qa" />} />
        <Route path="/analytics" element={<WorkspaceGatewayPage section="analytics" />} />
        <Route path="/compare-runs/:compareRunId" element={<CompareScreenPage />} />
        <Route path="/compare-runs/:compareRunId/review" element={<ReviewPanelPage />} />
        <Route path="/compare-runs/:compareRunId/impact" element={<TraceabilityImpactPage />} />
        <Route path="/compare-runs/:compareRunId/summary" element={<SummaryExportPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
