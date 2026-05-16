import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  FileDiff,
  PieChart,
  ShieldAlert,
  Target,
} from "lucide-react";
import {
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "../auth/AuthContext";
// Standalone layout — no ScreenFrame needed
import { ApiError, getProject, getProjectAnalytics } from "../lib/api";

const CHANGE_TYPE_COLORS = { Added: "#16a34a", Removed: "#dc2626", Modified: "#d97706" };
const REVIEW_STATUS_COLORS = { Open: "#d97706", "In Review": "#0284c7", Resolved: "#6b7280" };
const RISK_COLORS = { Low: "#16a34a", Medium: "#d97706", High: "#dc2626" };
const AI_COLORS = { Generated: "#0284c7", Pending: "#d97706", Failed: "#dc2626" };

function toChartData(obj, labelMap = {}) {
  return Object.entries(obj)
    .map(([key, value]) => ({
      name: labelMap[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value,
    }))
    .filter((item) => item.value > 0);
}

function MiniPieChart({ data, colors, title, icon: Icon }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">{title}</p>
        <p className="text-[12px] text-[#848E9C] mt-1">No data yet</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1">
        {Icon ? <Icon size={12} /> : null}
        {title}
      </p>
      <ResponsiveContainer width="100%" height={190}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={68}
            paddingAngle={3}
            dataKey="value"
            label={({ name, value }) => `${name}: ${value}`}
            style={{ fontSize: "0.65rem" }}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={colors[entry.name] || "#6b7280"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#FFFFFF",
              border: "1px solid #E6E8EA",
              borderRadius: "8px",
              fontSize: "11px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
            }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

function DocumentBarChart({ data }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[12px] text-[#848E9C]">No document data yet</p>
      </div>
    );
  }

  const chartData = data.map((doc) => ({
    name: doc.title.length > 20 ? doc.title.slice(0, 20) + "..." : doc.title,
    "Total Changes": doc.total_changes,
    Resolved: doc.resolved,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6E8EA" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#474D57" }}
          angle={-20}
          textAnchor="end"
          height={60}
        />
        <YAxis tick={{ fontSize: 11, fill: "#474D57" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "#FFFFFF",
            border: "1px solid #E6E8EA",
            borderRadius: "8px",
            fontSize: "11px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
          }}
        />
        <Legend wrapperStyle={{ fontSize: "0.7rem" }} />
        <Bar dataKey="Total Changes" fill="#F0B90B" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Resolved" fill="#848E9C" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProjectAnalyticsPage() {
  const { logout, token } = useAuth();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadAnalytics() {
      setIsLoading(true);
      setError("");

      try {
        const [projectPayload, analyticsPayload] = await Promise.all([
          getProject(token, projectId),
          getProjectAnalytics(token, projectId),
        ]);

        if (!isCurrent) return;
        setProject(projectPayload);
        setAnalytics(analyticsPayload);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          logout();
          return;
        }
        if (isCurrent) setError(loadError.message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadAnalytics();
    return () => { isCurrent = false; };
  }, [logout, projectId, token]);

  const changeTypeData = analytics ? toChartData(analytics.change_types) : [];
  const reviewStatusData = analytics
    ? toChartData(analytics.review_status, { in_review: "In Review" })
    : [];
  const riskData = analytics ? toChartData(analytics.risk_levels) : [];
  const aiData = analytics ? toChartData(analytics.ai_generation) : [];

  const totalChanges = analytics?.total_changes ?? 0;
  const totalResolved = analytics?.review_status?.resolved ?? 0;
  const resolvePct = totalChanges > 0 ? Math.round((totalResolved / totalChanges) * 100) : 0;

  const stats = [
    { label: "Total Changes", value: isLoading ? "Loading..." : String(totalChanges), icon: FileDiff },
    { label: "Review Progress", value: isLoading ? "Loading..." : `${resolvePct}% resolved`, icon: CheckCircle2 },
    { label: "Compare Runs", value: isLoading ? "Loading..." : String(analytics?.total_compare_runs ?? 0), icon: BarChart3 },
    { label: "AI Accuracy", value: isLoading ? "Loading..." : analytics?.ai_accuracy_pct != null ? `${analytics.ai_accuracy_pct}%` : "N/A", icon: Target },
  ];

  return (
    <main className="max-w-[1200px] mx-auto px-8 py-8">
      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/dashboard" className="text-[12px] font-semibold text-[#848E9C] no-underline hover:text-[#1E2026]" style={{ transition: "color 200ms" }}>Projects</Link>
            <span className="text-[12px] text-[#848E9C]">/</span>
            <Link to={`/projects/${projectId}`} className="text-[12px] font-semibold text-[#848E9C] no-underline hover:text-[#1E2026]" style={{ transition: "color 200ms" }}>{project?.name ?? "Project"}</Link>
            <span className="text-[12px] text-[#848E9C]">/</span>
            <span className="text-[12px] font-semibold text-[#1E2026]">Analytics</span>
          </div>
          <h1 className="text-[28px] font-medium text-[#1E2026]" style={{ lineHeight: "1.00" }}>Project Analytics</h1>
          <p className="text-[14px] font-medium text-[#848E9C] mt-2" style={{ lineHeight: "1.43" }}>Review progress, AI metrics, and document-level insights.</p>
        </div>
        <Link to={`/projects/${projectId}`} className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E6E8EA] text-[#1E2026] no-underline font-semibold text-[13px] shrink-0 mt-2" style={{ borderRadius: "6px", transition: "all 200ms ease" }}>
          Back to Project
        </Link>
      </div>

      {error ? (
        <div className="mb-5 p-3.5 bg-white border border-[#F6465D] text-[14px] text-[#F6465D] font-semibold" style={{ borderRadius: "8px" }}>{error}</div>
      ) : null}

      {isLoading ? (
        <p className="text-[12px] text-[#848E9C]">Loading analytics...</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div className="bg-white border border-[#E6E8EA] p-4 flex items-start justify-between" key={stat.label} style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
                <div>
                  <p className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">{stat.label}</p>
                  <p className="text-[22px] font-bold text-[#1E2026] leading-tight mt-1 tabular-nums">{stat.value}</p>
                </div>
                <stat.icon size={18} className="text-[#D0D5DD] mt-0.5" />
              </div>
            ))}
          </div>

          {/* Pie Charts */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-[#E6E8EA] p-4" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
              <h3 className="text-[13px] font-bold text-[#1E2026] mb-2">Change Types</h3>
              <MiniPieChart data={changeTypeData} colors={CHANGE_TYPE_COLORS} title="By Type" icon={FileDiff} />
            </div>
            <div className="bg-white border border-[#E6E8EA] p-4" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
              <h3 className="text-[13px] font-bold text-[#1E2026] mb-2">Review Status</h3>
              <MiniPieChart data={reviewStatusData} colors={REVIEW_STATUS_COLORS} title="By Status" icon={CheckCircle2} />
            </div>
            <div className="bg-white border border-[#E6E8EA] p-4" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
              <h3 className="text-[13px] font-bold text-[#1E2026] mb-2">Risk Distribution</h3>
              <MiniPieChart data={riskData} colors={RISK_COLORS} title="AI Risk Levels" icon={ShieldAlert} />
            </div>
            <div className="bg-white border border-[#E6E8EA] p-4" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
              <h3 className="text-[13px] font-bold text-[#1E2026] mb-2">AI Generation</h3>
              <MiniPieChart data={aiData} colors={AI_COLORS} title="Draft Status" icon={Bot} />
            </div>
          </div>

          {/* AI Insights + Bar Chart */}
          <div className="grid grid-cols-[280px_1fr] gap-4">
            <section aria-labelledby="ai-insights-heading" className="flex flex-col gap-4">
              <h3 className="sr-only" id="ai-insights-heading">AI Insights</h3>
              <div className="bg-white border border-[#E6E8EA] p-5" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Target size={14} className="text-[#F0B90B]" />
                  <span className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">Accuracy</span>
                </div>
                <p className="text-[32px] font-bold text-[#1E2026] leading-none tabular-nums">
                  {analytics?.ai_accuracy_pct != null ? `${analytics.ai_accuracy_pct}%` : "N/A"}
                </p>
                <p className="text-[11px] text-[#848E9C] mt-1.5">AI recommended status vs human decision</p>
              </div>
              <div className="bg-white border border-[#E6E8EA] p-5" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Bot size={14} className="text-[#0EA5E9]" />
                  <span className="text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider">Avg Confidence</span>
                </div>
                <p className="text-[32px] font-bold text-[#1E2026] leading-none tabular-nums">
                  {analytics?.ai_avg_confidence != null ? `${Math.round(analytics.ai_avg_confidence * 100)}%` : "N/A"}
                </p>
                <p className="text-[11px] text-[#848E9C] mt-1.5">Average AI confidence score</p>
              </div>
            </section>
            <div className="bg-white border border-[#E6E8EA] p-5" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
              <h3 className="text-[13px] font-bold text-[#1E2026] mb-3">Per-Document Overview</h3>
              <DocumentBarChart data={analytics?.per_document ?? []} />
            </div>
          </div>

          {/* Document Table */}
          {analytics?.per_document?.length > 0 ? (
            <div className="bg-white border border-[#E6E8EA] p-5" style={{ borderRadius: "12px", boxShadow: "rgba(32,32,37,0.05) 0px 3px 5px 0px" }}>
              <h3 className="text-[13px] font-bold text-[#1E2026] mb-4">Document Breakdown</h3>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="border-b border-[#E6E8EA]">
                    {["Document", "Compare Runs", "Total Changes", "Resolved", "Progress"].map((h) => (
                      <th className="text-left text-[10px] font-semibold text-[#848E9C] uppercase tracking-wider py-2.5 px-3" key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.per_document.map((doc) => {
                    const pct = doc.total_changes > 0 ? Math.round((doc.resolved / doc.total_changes) * 100) : 0;
                    return (
                      <tr className="border-b border-[#F5F5F5]" key={doc.title} style={{ transition: "background 200ms" }} onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td className="text-[12px] text-[#1E2026] py-2.5 px-3 font-medium">{doc.title}</td>
                        <td className="text-[12px] text-[#474D57] py-2.5 px-3 tabular-nums">{doc.compare_runs}</td>
                        <td className="text-[12px] text-[#474D57] py-2.5 px-3 tabular-nums">{doc.total_changes}</td>
                        <td className="text-[12px] text-[#474D57] py-2.5 px-3 tabular-nums">{doc.resolved}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[#F5F5F5] overflow-hidden" style={{ borderRadius: "999px" }}>
                              <div className="h-full bg-[#F0B90B]" style={{ width: `${pct}%`, borderRadius: "999px", transition: "width 300ms ease" }} />
                            </div>
                            <span className="text-[11px] font-semibold text-[#848E9C] tabular-nums w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
