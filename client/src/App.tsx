import { useMemo, useState } from "react";
import Aurora from "@/components/Aurora";

type AnalyzeResponse = {
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  findings: string[];
  recommendations: string[];
};

export default function App() {
  const [repo, setRepo] = useState("ai-pr-risk-gate");
  const [prNumber, setPrNumber] = useState(1);
  const [filename, setFilename] = useState("src/auth/jwt.ts");
  const [patch, setPatch] = useState("+ const token = sign(payload, secret)");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

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
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo,
          prNumber,
          files: [{ filename, patch }]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }

      setResult(data);
    } catch {
      setError("Network error while analyzing this PR");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070611] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <Aurora colorStops={["#e60fbf", "#6a59a1", "#5227FF"]} amplitude={1} blend={0.5} />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-violet-200/80">AI Security Platform</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">AI PR Risk Gate</h1>
          </div>
          <a href="/openapi.yaml" className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm backdrop-blur hover:bg-white/20">
            API Spec
          </a>
        </header>

        <main className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl">
            <h2 className="mb-4 text-xl font-medium">Run a Risk Analysis</h2>

            <div className="space-y-3">
              <label className="block text-sm text-violet-100/90">
                Repo
                <input value={repo} onChange={(e) => setRepo(e.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
              </label>

              <label className="block text-sm text-violet-100/90">
                PR Number
                <input type="number" value={prNumber} onChange={(e) => setPrNumber(Number(e.target.value || 1))} className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
              </label>

              <label className="block text-sm text-violet-100/90">
                Filename
                <input value={filename} onChange={(e) => setFilename(e.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
              </label>

              <label className="block text-sm text-violet-100/90">
                Patch Snippet
                <textarea value={patch} onChange={(e) => setPatch(e.target.value)} className="mt-1 h-28 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2" />
              </label>

              <button onClick={analyze} disabled={loading} className="w-full rounded-lg bg-violet-500 px-4 py-2 font-medium hover:bg-violet-400 disabled:opacity-60">
                {loading ? "Analyzing..." : "Analyze Risk"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/15 bg-black/35 p-6 backdrop-blur-xl">
            <h2 className="mb-4 text-xl font-medium">Decision Panel</h2>

            {!result && !error && <p className="text-violet-100/80">Run an analysis to see findings and recommendations.</p>}
            {error && <p className="rounded-lg border border-rose-300/40 bg-rose-500/20 p-3 text-rose-100">{error}</p>}

            {result && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                  <p className="text-sm text-violet-100/70">Risk Score</p>
                  <p className="text-4xl font-semibold">{result.score}<span className="text-lg text-violet-200/80"> / 100</span></p>
                  <p className={`mt-1 text-sm font-semibold uppercase tracking-wide ${severityClass}`}>{result.severity}</p>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-violet-100/80">Findings</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-violet-50/90">
                    {result.findings.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-violet-100/80">Recommendations</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-violet-50/90">
                    {result.recommendations.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
