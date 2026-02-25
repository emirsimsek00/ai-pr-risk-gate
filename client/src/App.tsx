import { type ReactNode, useEffect, useMemo, useState } from "react";
import Aurora from "@/components/Aurora";

type AnalyzeResponse = {
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  findings: string[];
  recommendations: string[];
  policy?: { allowed: boolean; reason?: string };
};

type RecentRow = {
  id: number;
  repo: string;
  pr_number: number;
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  created_at: string;
};

type TrendRow = { day: string; avgScore: number; count: number };
type SeverityRow = { severity: string; count: number };
type FindingRow = { finding: string; count: number };

function getStoredKey(name: string) {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(name) ?? "";
}

function shell(children: ReactNode) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070611] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <Aurora colorStops={["#e60fbf", "#6a59a1", "#5227FF"]} amplitude={1} blend={0.5} />
      </div>
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">{children}</div>
    </div>
  );
}

function Header({ dashboard, onSwitch }: { dashboard: boolean; onSwitch: (next: "analyzer" | "dashboard") => void }) {
  return (
    <header className="mb-8 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-violet-200/80">AI Security Platform</p>
        <h1 className="mt-2 bg-gradient-to-r from-fuchsia-200 via-violet-100 to-indigo-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">AI PR Risk Gate</h1>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onSwitch("analyzer")} className={`rounded-full border px-4 py-2 text-sm backdrop-blur ${!dashboard ? "border-violet-300/60 bg-violet-500/40" : "border-white/20 bg-white/10 hover:bg-white/20"}`}>Analyzer</button>
        <button onClick={() => onSwitch("dashboard")} className={`rounded-full border px-4 py-2 text-sm backdrop-blur ${dashboard ? "border-violet-300/60 bg-violet-500/40" : "border-white/20 bg-white/10 hover:bg-white/20"}`}>Dashboard</button>
        <a href="/openapi.yaml" className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm backdrop-blur hover:bg-white/20">API Spec</a>
      </div>
    </header>
  );
}

function AnalyzerView() {
  const [repo, setRepo] = useState("ai-pr-risk-gate");
  const [prNumber, setPrNumber] = useState(1);
  const [filename, setFilename] = useState("src/auth/jwt.ts");
  const [patch, setPatch] = useState("+ const token = sign(payload, secret)");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [writeKey, setWriteKey] = useState(getStoredKey("riskgate_write_key"));

  const severityClass = useMemo(() => {
    if (!result) return "";
    if (result.severity === "low") return "text-emerald-300";
    if (result.severity === "medium") return "text-amber-300";
    return "text-rose-300";
  }, [result]);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const headers: HeadersInit = {
        "content-type": "application/json",
        ...(writeKey.trim() ? { "x-api-key": writeKey.trim() } : {})
      };

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({ repo, prNumber, files: [{ filename, patch }] })
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Request failed");
      setResult(data);
    } catch {
      setError("Network error while analyzing this PR");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <main className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
        <h2 className="mb-4 text-xl font-medium">Run a Risk Analysis</h2>
        <div className="space-y-3">
          <label className="block text-sm text-violet-100/90">Repo<input value={repo} onChange={(e) => setRepo(e.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" /></label>
          <label className="block text-sm text-violet-100/90">PR Number<input type="number" value={prNumber} onChange={(e) => setPrNumber(Number(e.target.value || 1))} className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" /></label>
          <label className="block text-sm text-violet-100/90">Filename<input value={filename} onChange={(e) => setFilename(e.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" /></label>
          <label className="block text-sm text-violet-100/90">Patch Snippet<textarea value={patch} onChange={(e) => setPatch(e.target.value)} className="mt-1 h-28 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" /></label>
          <label className="block text-sm text-violet-100/90">Write API Key (optional)
            <input
              value={writeKey}
              onChange={(e) => {
                setWriteKey(e.target.value);
                if (typeof window !== "undefined") {
                  if (e.target.value.trim()) window.sessionStorage.setItem("riskgate_write_key", e.target.value.trim());
                  else window.sessionStorage.removeItem("riskgate_write_key");
                }
              }}
              placeholder="needed when API auth is enabled"
              className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2"
            />
          </label>
          <button onClick={analyze} disabled={loading} className="w-full rounded-lg bg-violet-500 px-4 py-2 font-medium hover:bg-violet-400 disabled:opacity-60">{loading ? "Analyzing..." : "Analyze Risk"}</button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
        <h2 className="mb-4 text-xl font-medium">Decision Panel</h2>
        {!result && !error && <p className="text-violet-100/80">Run an analysis to see findings and recommendations.</p>}
        {error && <p className="rounded-lg border border-rose-300/40 bg-rose-500/20 p-3 text-rose-100">{error}</p>}
        {result && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <p className="text-sm text-violet-100/70">Risk Score</p>
              <p className="text-4xl font-semibold">{result.score}<span className="text-lg text-violet-200/80"> / 100</span></p>
              <p className={`mt-1 text-sm font-semibold uppercase tracking-wide ${severityClass}`}>{result.severity}</p>
              {result.policy && <p className="mt-2 text-xs text-violet-100/70">Policy: {result.policy.allowed ? "ALLOW" : `BLOCK (${result.policy.reason ?? "rule"})`}</p>}
            </div>
            <div><h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-violet-100/80">Findings</h3><ul className="list-disc space-y-1 pl-5 text-sm text-violet-50/90">{result.findings.map((f) => <li key={f}>{f}</li>)}</ul></div>
            <div><h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-violet-100/80">Recommendations</h3><ul className="list-disc space-y-1 pl-5 text-sm text-violet-50/90">{result.recommendations.map((r) => <li key={r}>{r}</li>)}</ul></div>
          </div>
        )}
      </section>
    </main>
    <div className="mt-6">
      <GuideView />
    </div>
    </>
  );
}

function GuideView() {
  return (
    <section className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <h2 className="mb-3 text-2xl font-semibold">How to Use This Product</h2>
      <ol className="list-decimal space-y-2 pl-6 text-sm text-violet-50/95">
        <li>Start in <strong>Analyzer</strong>. Enter a repo, PR number, filename, and patch snippet, then click <strong>Analyze Risk</strong>.</li>
        <li>Read the <strong>Risk Score</strong>, severity, findings, and recommendations. If policy blocks the PR, address the listed findings first.</li>
        <li>Open <strong>Dashboard</strong> to monitor trends over time: average risk, high/critical counts, recurring findings, and recent assessments.</li>
        <li>Use the dashboard filters (repo + date range) to review one repository or your broader team activity.</li>
        <li>For CI integration, call <code>POST /api/analyze</code> from your workflow; use dashboard metrics to tune your risk policy thresholds.</li>
      </ol>
      <p className="mt-3 text-xs text-violet-200/80">Tip: if your API is protected with API keys, make sure your frontend/session includes a read key for dashboard endpoints and a write key for analyze endpoints.</p>
    </section>
  );
}

function DashboardView() {
  const [repo, setRepo] = useState("");
  const [days, setDays] = useState("30");
  const [readKey, setReadKey] = useState(getStoredKey("riskgate_read_key"));
  const [rows, setRows] = useState<RecentRow[]>([]);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [severity, setSeverity] = useState<SeverityRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const q = new URLSearchParams({ days });
    const headers: HeadersInit = readKey.trim() ? { "x-api-key": readKey.trim() } : {};
    if (repo.trim()) q.set("repo", repo.trim());

    try {
      const [recentRes, trendsRes, sevRes, findRes] = await Promise.all([
        fetch(`/api/recent?limit=20${repo.trim() ? `&repo=${encodeURIComponent(repo.trim())}` : ""}`, { headers }),
        fetch(`/api/trends?${q.toString()}`, { headers }),
        fetch(`/api/severity?${q.toString()}`, { headers }),
        fetch(`/api/findings?${q.toString()}`, { headers })
      ]);

      if (!recentRes.ok || !trendsRes.ok || !sevRes.ok || !findRes.ok) {
        setError("Dashboard data could not be loaded. If API keys are enabled, include a read key.");
      }

      const [recentJson, trendsJson, sevJson, findJson] = await Promise.all([
        recentRes.json(),
        trendsRes.json(),
        sevRes.json(),
        findRes.json()
      ]);

      setRows(recentJson.rows ?? []);
      setTrends(trendsJson.trends ?? []);
      setSeverity(sevJson.rows ?? []);
      setFindings(findJson.rows ?? []);
    } catch {
      setError("Dashboard data could not be loaded due to a network error.");
    }
  }

  useEffect(() => { load(); }, []);

  const avg = rows.length ? (rows.reduce((a, r) => a + r.score, 0) / rows.length).toFixed(1) : "0.0";
  const highCount = rows.filter((r) => r.severity === "high" || r.severity === "critical").length;
  const latest = rows[0]?.severity?.toUpperCase() ?? "N/A";

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.3)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
        <h2 className="mb-3 text-2xl font-semibold">Dashboard</h2>
        {error && <p className="mb-3 rounded-lg border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-sm text-amber-100">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="repo filter" className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm" />
          <select value={days} onChange={(e) => setDays(e.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm">
            <option value="7">7d</option><option value="30">30d</option><option value="90">90d</option>
          </select>
          <input
            value={readKey}
            onChange={(e) => setReadKey(e.target.value)}
            placeholder="read API key (optional)"
            className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                if (readKey.trim()) window.sessionStorage.setItem("riskgate_read_key", readKey.trim());
                else window.sessionStorage.removeItem("riskgate_read_key");
              }
              load();
            }}
            className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium hover:bg-violet-400"
          >
            Apply
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Assessments", String(rows.length)],
          ["Average Risk", avg],
          ["Latest Severity", latest],
          ["High/Critical", String(highCount)]
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.3)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
            <p className="text-xs uppercase tracking-wider text-violet-100/70">{k}</p>
            <p className="mt-2 text-3xl font-semibold">{v}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
          <h3 className="mb-3 text-lg font-medium">Risk Trend</h3>
          <div className="flex h-48 items-end gap-2 border-t border-white/10 pt-3">
            {trends.length === 0 && <p className="text-sm text-violet-100/70">No trend data yet.</p>}
            {trends.map((t) => {
              const max = Math.max(...trends.map((x) => Number(x.avgScore) || 0), 1);
              const h = Math.max(8, Math.round(((Number(t.avgScore) || 0) / max) * 170));
              return <div key={t.day} className="group flex-1 rounded-t bg-gradient-to-t from-violet-700 to-fuchsia-400 transition-all duration-300 hover:from-fuchsia-500 hover:to-violet-300" style={{ height: `${h}px` }} title={`${t.day}: ${t.avgScore}`} />;
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
          <h3 className="mb-3 text-lg font-medium">Severity Distribution</h3>
          <ul className="space-y-2 text-sm">
            {severity.map((s) => <li key={s.severity} className="flex justify-between border-b border-white/10 pb-2"><span className="uppercase">{s.severity}</span><span>{s.count}</span></li>)}
            {severity.length === 0 && <li className="text-violet-100/70">No data.</li>}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
          <h3 className="mb-3 text-lg font-medium">Recent Assessments</h3>
          <div className="space-y-2 text-sm">
            {rows.map((r) => <div key={r.id} className="grid grid-cols-5 gap-2 border-b border-white/10 pb-2"><span className="col-span-2">{new Date(r.created_at).toLocaleString()}</span><span>{r.repo}</span><span>#{r.pr_number}</span><span>{r.score}</span></div>)}
            {rows.length === 0 && <p className="text-violet-100/70">No data.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-black/40">
          <h3 className="mb-3 text-lg font-medium">Top Findings</h3>
          <ul className="space-y-2 text-sm">
            {findings.map((f) => <li key={f.finding} className="flex justify-between border-b border-white/10 pb-2"><span>{f.finding}</span><span>{f.count}</span></li>)}
            {findings.length === 0 && <li className="text-violet-100/70">No data.</li>}
          </ul>
        </div>
      </section>
      <GuideView />
    </main>
  );
}

export default function App() {
  const initialDashboard = window.location.pathname.startsWith("/dashboard") || new URLSearchParams(window.location.search).get("view") === "dashboard";
  const [dashboard, setDashboard] = useState(initialDashboard);

  function onSwitch(next: "analyzer" | "dashboard") {
    const isDash = next === "dashboard";
    setDashboard(isDash);
    const nextPath = isDash ? "/dashboard" : "/";
    window.history.pushState({}, "", nextPath);
  }

  return shell(
    <>
      <Header dashboard={dashboard} onSwitch={onSwitch} />
      {dashboard ? <DashboardView /> : <AnalyzerView />}
    </>
  );
}
