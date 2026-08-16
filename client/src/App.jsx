import { useState, useEffect, useCallback } from "react";

// ─── DESIGN TOKENS ───────────────────────────────────────────────
const T = {
  bg: "#0B0F1A",
  surface: "#111827",
  surfaceHigh: "#1C2535",
  border: "#1E2D45",
  accent: "#2563EB",
  accentGlow: "#3B82F6",
  accentSoft: "#1E3A5F",
  green: "#10B981",
  greenSoft: "#064E3B",
  amber: "#F59E0B",
  amberSoft: "#451A03",
  red: "#EF4444",
  redSoft: "#450A0A",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#475569",
  fontDisplay: "'Inter', sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
};

// ─── API LAYER ───────────────────────────────────────────────────
let authToken = null;

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: ${T.bg};
    color: ${T.textPrimary};
    font-family: ${T.fontDisplay};
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
  }

  .app { display: flex; min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    width: 230px;
    background: ${T.surface};
    border-right: 1px solid ${T.border};
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 100;
  }
  .sidebar-logo {
    padding: 20px 16px 16px;
    border-bottom: 1px solid ${T.border};
  }
  .logo-mark { display: flex; align-items: center; gap: 10px; }
  .logo-icon {
    width: 32px; height: 32px;
    background: linear-gradient(135deg, ${T.accent}, ${T.accentGlow});
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: white;
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
  }
  .logo-text { font-size: 15px; font-weight: 700; color: ${T.textPrimary}; letter-spacing: -0.3px; }
  .logo-sub { font-size: 10px; color: ${T.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; }

  .sidebar-nav { padding: 12px 8px; flex: 1; overflow-y: auto; }
  .nav-section-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: ${T.textMuted}; padding: 10px 8px 4px; font-weight: 600;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 6px; cursor: pointer;
    color: ${T.textSecondary}; font-size: 13px; font-weight: 500;
    transition: all 0.15s; border: none; background: none; width: 100%; text-align: left;
    margin-bottom: 2px;
  }
  .nav-item:hover { background: ${T.surfaceHigh}; color: ${T.textPrimary}; }
  .nav-item.active { background: ${T.accentSoft}; color: ${T.accentGlow}; font-weight: 600; }
  .nav-item .nav-icon { font-size: 15px; width: 20px; text-align: center; }

  .sidebar-footer {
    padding: 12px 16px;
    border-top: 1px solid ${T.border};
    font-size: 11px; color: ${T.textMuted};
  }
  .rbi-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: ${T.greenSoft}; color: ${T.green};
    padding: 3px 8px; border-radius: 20px; font-size: 10px; font-weight: 600;
    margin-bottom: 4px;
  }

  /* Main */
  .main { margin-left: 230px; flex: 1; display: flex; flex-direction: column; min-width: 0; }

  .topbar {
    padding: 16px 28px;
    border-bottom: 1px solid ${T.border};
    background: ${T.surface};
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 50;
  }
  .page-title { font-size: 16px; font-weight: 600; color: ${T.textPrimary}; }
  .page-subtitle { font-size: 12px; color: ${T.textMuted}; margin-top: 1px; }
  .topbar-actions { display: flex; gap: 8px; align-items: center; }

  .content { padding: 24px 28px; flex: 1; }

  /* Cards */
  .card {
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-radius: 10px;
    padding: 20px;
  }
  .card-sm { padding: 14px 16px; }
  .card-title { font-size: 14px; font-weight: 600; color: ${T.textPrimary}; margin-bottom: 4px; }
  .card-sub { font-size: 11px; color: ${T.textMuted}; }

  /* Stats Grid */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .stat-card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 10px; padding: 16px 20px; }
  .stat-label { font-size: 11px; color: ${T.textMuted}; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; margin-bottom: 8px; }
  .stat-value { font-size: 24px; font-weight: 700; color: ${T.textPrimary}; letter-spacing: -0.5px; }
  .stat-delta { font-size: 11px; color: ${T.green}; margin-top: 4px; }

  /* Grid layouts */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }

  /* Table */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left; padding: 10px 12px;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
    color: ${T.textMuted}; font-weight: 600;
    border-bottom: 1px solid ${T.border};
  }
  td { padding: 12px 12px; font-size: 13px; color: ${T.textSecondary}; border-bottom: 1px solid ${T.border}; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: ${T.surfaceHigh}; }
  .td-primary { color: ${T.textPrimary}; font-weight: 500; }
  .td-mono { font-family: ${T.fontMono}; font-size: 12px; }

  /* Badges */
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 20px;
    font-size: 11px; font-weight: 600;
  }
  .badge-green { background: ${T.greenSoft}; color: ${T.green}; }
  .badge-amber { background: ${T.amberSoft}; color: ${T.amber}; }
  .badge-red { background: ${T.redSoft}; color: ${T.red}; }
  .badge-blue { background: ${T.accentSoft}; color: ${T.accentGlow}; }
  .badge-muted { background: ${T.surfaceHigh}; color: ${T.textMuted}; }

  /* Buttons */
  .btn {
    padding: 8px 16px; border-radius: 7px; border: none;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; justify-content: center;
  }
  .btn-primary { background: ${T.accent}; color: white; }
  .btn-primary:hover { background: ${T.accentGlow}; }
  .btn-primary:disabled { background: ${T.border}; cursor: not-allowed; }
  .btn-success { background: ${T.green}; color: white; }
  .btn-success:hover { background: #059669; }
  .btn-secondary { background: ${T.surfaceHigh}; color: ${T.textPrimary}; border: 1px solid ${T.border}; }
  .btn-secondary:hover { background: ${T.border}; }
  .btn-ghost { background: none; color: ${T.textSecondary}; border: 1px solid ${T.border}; }
  .btn-ghost:hover { color: ${T.textPrimary}; border-color: ${T.textSecondary}; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-danger { background: ${T.redSoft}; color: ${T.red}; border: 1px solid ${T.redSoft}; }

  /* Form */
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 11px; font-weight: 600; color: ${T.textSecondary}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .form-input, .form-select {
    width: 100%; padding: 9px 12px; background: ${T.surfaceHigh};
    border: 1px solid ${T.border}; border-radius: 6px;
    color: ${T.textPrimary}; font-size: 13px; font-family: inherit;
    outline: none; transition: border-color 0.15s;
  }
  .form-input:focus, .form-select:focus { border-color: ${T.accent}; }
  .form-hint { font-size: 11px; color: ${T.textMuted}; margin-top: 4px; }
  .form-error { font-size: 11px; color: ${T.red}; margin-top: 4px; }
  .form-inline { display: flex; gap: 8px; align-items: flex-start; }
  .form-inline .form-group { flex: 1; margin-bottom: 0; }

  /* Flow chart */
  .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .section-title { font-size: 15px; font-weight: 600; color: ${T.textPrimary}; }
  .flow { display: flex; align-items: center; justify-content: space-between; overflow-x: auto; padding: 12px 0; margin-bottom: 14px; }
  .flow-node {
    background: ${T.surfaceHigh}; border: 1px solid ${T.border};
    border-radius: 8px; padding: 10px 14px; font-size: 12px; font-weight: 600; color: ${T.textPrimary};
    text-align: center; min-width: 90px;
  }
  .flow-node-active { border-color: ${T.accent}; color: ${T.accentGlow}; background: ${T.accentSoft}; }
  .flow-arrow { color: ${T.textMuted}; font-size: 16px; margin: 0 4px; }
  .flow-sub { font-size: 10px; color: ${T.textMuted}; font-weight: 400; margin-top: 2px; }

  /* Compliance strip */
  .compliance-strip {
    background: ${T.amberSoft}; border: 1px solid ${T.amber};
    border-radius: 7px; padding: 10px 14px; margin-bottom: 16px;
    font-size: 12px; color: ${T.amber}; display: flex; gap: 8px; align-items: flex-start;
  }

  /* Progress Gauge */
  .gauge-container { background: ${T.surfaceHigh}; border-radius: 10px; height: 10px; overflow: hidden; margin: 8px 0; width: 100%; }
  .gauge-fill { height: 100%; border-radius: 10px; transition: width 0.3s ease; }

  /* KFS Document Panel */
  .kfs-panel {
    background: ${T.surfaceHigh}; border: 1px solid ${T.border};
    border-radius: 8px; padding: 16px; margin-top: 12px;
  }
  .kfs-title { font-size: 13px; font-weight: 700; color: ${T.accentGlow}; margin-bottom: 10px; display: flex; justify-content: space-between; }
  .kfs-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed ${T.border}; font-size: 12px; }
  .kfs-row:last-child { border-bottom: none; }
  .kfs-key { color: ${T.textMuted}; }
  .kfs-val { color: ${T.textPrimary}; font-family: ${T.fontMono}; font-weight: 500; }
  .kfs-disclaimer { font-size: 10px; color: ${T.textMuted}; font-style: italic; margin-top: 10px; padding-top: 8px; border-top: 1px solid ${T.border}; }

  /* Engine Metrics */
  .engine-metric { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid ${T.border}; font-size: 12px; }
  .engine-metric:last-child { border-bottom: none; }
  .engine-metric-label { color: ${T.textMuted}; }
  .engine-metric-value { font-family: ${T.fontMono}; font-weight: 600; color: ${T.textPrimary}; }

  .engine-result { border-radius: 8px; overflow: hidden; border: 1px solid ${T.border}; }
  .engine-result-header { padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
  .engine-result-pass { background: ${T.surfaceHigh}; border-left: 4px solid ${T.green}; }
  .engine-result-fail { background: ${T.surfaceHigh}; border-left: 4px solid ${T.red}; }
  .engine-result-body { padding: 12px 14px; background: ${T.surface}; }

  /* Layout helpers */
  .divider { border: 0; border-top: 1px solid ${T.border}; margin: 16px 0; }
  .empty { text-align: center; padding: 48px 20px; color: ${T.textMuted}; }
  .empty-icon { font-size: 32px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; margin-bottom: 4px; color: ${T.textSecondary}; }
  .empty-sub { font-size: 12px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }

  .mt-4 { margin-top: 16px; }
  .mb-4 { margin-bottom: 16px; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .text-sm { font-size: 12px; }
  .text-muted { color: ${T.textMuted}; }
  .text-green { color: ${T.green}; }
  .text-red { color: ${T.red}; }
  .text-amber { color: ${T.amber}; }
  .font-mono { font-family: ${T.fontMono}; }
  .w-full { width: 100%; }

  /* Login */
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .login-card { width: 100%; max-width: 420px; }
  .login-hero { text-align: center; margin-bottom: 20px; }
  .login-logo {
    width: 48px; height: 48px; margin: 0 auto 12px;
    background: linear-gradient(135deg, ${T.accent}, ${T.accentGlow});
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; font-weight: 700; color: white;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
  }
  .login-sub { font-size: 12px; color: ${T.textMuted}; margin-top: 2px; }
  .quick-account { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
  .quick-account button {
    padding: 6px 12px; font-size: 11px; border-radius: 20px; border: 1px solid ${T.border};
    background: ${T.surfaceHigh}; color: ${T.textSecondary}; cursor: pointer; transition: all 0.15s;
  }
  .quick-account button:hover { color: ${T.textPrimary}; border-color: ${T.accent}; background: ${T.accentSoft}; }

  /* Loading & banners */
  .loading-screen { min-height: 100vh; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; color: ${T.textSecondary}; }
  .spinner {
    width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid ${T.border}; border-top-color: ${T.accent};
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-banner {
    background: ${T.redSoft}; border: 1px solid ${T.red};
    color: ${T.red}; border-radius: 7px; padding: 10px 14px; margin-bottom: 16px;
    font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
  .success-banner {
    background: ${T.greenSoft}; border: 1px solid ${T.green};
    color: ${T.green}; border-radius: 7px; padding: 10px 14px; margin-bottom: 16px;
    font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
`;

// ─── UTILS & BADGES ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    routed: ["badge-blue", "⇒ Routed"],
    disbursed: ["badge-green", "✓ Disbursed"],
    pending_review: ["badge-amber", "◷ Pending Review"],
    rejected: ["badge-red", "✗ Rejected"],
    new: ["badge-muted", "New"],
  };
  const [cls, label] = map[status] || ["badge-muted", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function formatINR(n) {
  if (n === null || n === undefined) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN");
}

// ─── LOGIN PAGE ──────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onLogin({ username, password });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const quick = [
    { u: "dla1", p: "Dla@123", label: "DLA", hint: "Submit & Route" },
    { u: "lender1", p: "Lender@123", label: "LENDER (HDFC)", hint: "Disburse & Portfolio" },
    { u: "admin", p: "Admin@123", label: "ADMIN", hint: "Full Stats & Compliance" },
  ];

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-hero">
          <div className="login-logo">V</div>
          <div className="logo-text" style={{ fontSize: 20 }}>Vantage Credit</div>
          <div className="login-sub">Embedded Credit Marketplace · RBI DL 2022 Compliant</div>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dla1 / lender1 / admin" autoComplete="username" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          {err && <div className="form-error" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in to Platform"}
          </button>
        </form>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 16, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>
          Demo Role Logins:
        </div>
        <div className="quick-account">
          {quick.map((q) => (
            <button key={q.u} onClick={() => { setUsername(q.u); setPassword(q.p); }}>
              <strong>{q.label}</strong> ({q.u})
            </button>
          ))}
        </div>
        <div className="form-hint" style={{ marginTop: 14, textAlign: "center" }}>
          JWT authentication · In-memory state · No direct money handling
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────────
function DashboardPage({ applications, user }) {
  const total = applications.length;
  const disbursed = applications.filter((a) => a.status === "disbursed").length;
  const routed = applications.filter((a) => a.status === "routed").length;
  const totalVolume = applications
    .filter((a) => a.status === "disbursed")
    .reduce((s, a) => s + a.amount, 0);

  return (
    <>
      <div className="stats-grid">
        {[
          { label: "Total Applications", value: total, delta: "Active scope" },
          { label: "Routed Loans", value: routed, delta: "Awaiting disbursal" },
          { label: "Disbursed Loans", value: disbursed, delta: "Completed" },
          { label: "Disbursed Volume", value: formatINR(totalVolume), delta: "On-platform total" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-delta">{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="card mb-4">
        <div className="section-header">
          <div className="section-title">Marketplace Flow Architecture</div>
          <span className="badge badge-green">RBI DL Guidelines 2022 Compliant</span>
        </div>
        <div className="flow">
          {[
            { label: "Borrower", sub: "Via DLA App", active: false },
            null,
            { label: "DLA", sub: "AA Consent + KYC", active: user.role === "DLA" },
            null,
            { label: "Marketplace", sub: "Eligibility Matching", active: false },
            null,
            { label: "Credit Engine", sub: "KFS Generation", active: false },
            null,
            { label: "Lender", sub: "Bank / NBFC", active: user.role === "LENDER" },
            null,
            { label: "Disbursal", sub: "Direct Lender→Borrower", active: false },
          ].map((node, i) =>
            node === null ? (
              <div key={i} className="flow-arrow">→</div>
            ) : (
              <div key={i} className={`flow-node ${node.active ? "flow-node-active" : ""}`}>
                {node.label}
                <div className="flow-sub">{node.sub}</div>
              </div>
            )
          )}
        </div>
        <div className="compliance-strip">
          <span>🛡️</span>
          <div>
            <strong>RBI Digital Lending Guidelines Compliance:</strong> Funds flow directly from Lender → Borrower bank account. The Vantage marketplace never holds or routes money (§3.1). Key Fact Statement (KFS) is generated prior to routing. FLDG is capped at 5% of lender portfolio value.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div className="section-title">Recent Applications</div>
          <span className="badge badge-muted">Showing {applications.length} items</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>App ID</th>
                <th>Borrower</th>
                <th>Amount</th>
                <th>Purpose</th>
                <th>CIBIL</th>
                <th>Status</th>
                <th>DLA</th>
                <th>Routed To</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">No applications found in this scope.</td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app.id}>
                    <td className="td-mono td-primary">{app.id}</td>
                    <td className="td-primary">{app.borrowerName}</td>
                    <td className="td-mono">{formatINR(app.amount)}</td>
                    <td><span className="badge badge-muted">{app.purpose}</span></td>
                    <td className="td-mono" style={{ color: app.cibilScore >= 700 ? T.green : app.cibilScore >= 650 ? T.amber : T.red }}>
                      {app.cibilScore}
                    </td>
                    <td><StatusBadge status={app.status} /></td>
                    <td className="td-mono text-muted">{app.dlaId}</td>
                    <td className="td-mono text-muted">{app.routedTo || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── NEW LOAN APPLICATION PAGE ──────────────────────────────────────
function NewApplicationPage({ onSubmit }) {
  const [form, setForm] = useState({
    borrowerName: "Amit Kumar",
    pan: "ABCPA9999K",
    mobile: "9876501234",
    amount: "100000",
    purpose: "personal",
    tenure: "12",
    cibilScore: "",
    monthlyIncome: "65000",
    monthlyObligations: "12000",
    dlaId: "DLA-001",
    aaConsent: true,
  });
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1);
  const [pulling, setPulling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate1 = () => {
    const e = {};
    if (!form.borrowerName.trim()) e.borrowerName = "Required";
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.toUpperCase())) e.pan = "Invalid PAN format (e.g. ABCDE1234F)";
    if (!/^[6-9]\d{9}$/.test(form.mobile)) e.mobile = "Invalid mobile number";
    if (!form.aaConsent) e.aaConsent = "AA consent required (mandatory per RBI DL rules)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validate2 = () => {
    const e = {};
    if (!form.amount || form.amount < 5000) e.amount = "Minimum loan amount ₹5,000";
    if (!form.cibilScore || form.cibilScore < 300 || form.cibilScore > 900) e.cibilScore = "CIBIL score must be 300-900";
    if (!form.monthlyIncome || form.monthlyIncome < 10000) e.monthlyIncome = "Minimum income ₹10,000";
    if (form.monthlyObligations && Number(form.monthlyObligations) >= Number(form.monthlyIncome)) e.monthlyObligations = "Obligations cannot exceed income";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validate1()) setStep(2);
    if (step === 2 && validate2()) setStep(3);
  };

  const pullBureau = async () => {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.toUpperCase())) {
      setErrors({ ...errors, pan: "Invalid PAN format — cannot pull bureau" });
      return;
    }
    setPulling(true);
    setSubmitError(null);
    try {
      const data = await api("/bureau/pull", {
        method: "POST",
        body: JSON.stringify({ pan: form.pan.toUpperCase() }),
      });
      update("cibilScore", String(data.cibilScore));
      setErrors({});
    } catch (e) {
      setErrors({ ...errors, cibilScore: e.message });
    } finally {
      setPulling(false);
    }
  };

  const handleSubmit = async () => {
    const payload = {
      ...form,
      pan: form.pan.toUpperCase(),
      amount: Number(form.amount),
      tenure: Number(form.tenure),
      cibilScore: Number(form.cibilScore),
      monthlyIncome: Number(form.monthlyIncome),
      monthlyObligations: Number(form.monthlyObligations || 0),
      aaConsent: form.aaConsent,
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(payload);
      setStep(4);
    } catch (e) {
      if (e.data && e.data.errors) setErrors(e.data.errors);
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 4) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48, maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div className="section-title" style={{ marginBottom: 8, fontSize: 18 }}>Application Originated</div>
        <div className="text-muted" style={{ marginBottom: 24 }}>
          Application submitted with active AA consent. CIBIL score & bank statement summary attached. Go to the Credit Engine to match eligibility and route to a lender.
        </div>
        <button className="btn btn-primary" onClick={() => setStep(1)}>Originate Another Application</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 580 }}>
      {submitError && <div className="error-banner"><span>{submitError}</span><button className="close-btn" onClick={() => setSubmitError(null)}>✕</button></div>}

      <div className="flex gap-2 mb-4" style={{ marginBottom: 20 }}>
        {["1. Borrower Identity", "2. Loan Requirements", "3. Review & Submit"].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div style={{
              width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: step > i + 1 ? T.green : step === i + 1 ? T.accent : T.surfaceHigh,
              color: step >= i + 1 ? "white" : T.textMuted,
            }}>{step > i + 1 ? "✓" : i + 1}</div>
            <span style={{ fontSize: 12, color: step === i + 1 ? T.textPrimary : T.textMuted, fontWeight: step === i + 1 ? 600 : 400 }}>{label}</span>
            {i < 2 && <span className="text-muted" style={{ fontSize: 14 }}>›</span>}
          </div>
        ))}
      </div>

      <div className="card">
        {step === 1 && (
          <>
            <div className="card-title" style={{ marginBottom: 16 }}>Borrower Identity (KYC & AA Consent)</div>
            <div className="compliance-strip">
              <span>🔒</span>
              <div>Account Aggregator (AA) consent is mandatory before financial data fetching. Aadhaar is never stored — PAN is the sole identity reference.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Full Name (as per PAN)</label>
              <input className="form-input" value={form.borrowerName} onChange={e => update("borrowerName", e.target.value)} placeholder="Priya Sharma" />
              {errors.borrowerName && <div className="form-error">{errors.borrowerName}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">PAN Number</label>
              <input className="form-input font-mono" value={form.pan} onChange={e => update("pan", e.target.value.toUpperCase())} placeholder="ABCPS1234D" maxLength={10} />
              {errors.pan && <div className="form-error">{errors.pan}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <input className="form-input" value={form.mobile} onChange={e => update("mobile", e.target.value)} placeholder="9876543210" maxLength={10} />
              {errors.mobile && <div className="form-error">{errors.mobile}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Originating DLA App</label>
              <select className="form-select" value={form.dlaId} onChange={e => update("dlaId", e.target.value)}>
                <option value="DLA-001">DLA-001 (FinServe App)</option>
                <option value="DLA-002">DLA-002 (QuickCredit)</option>
                <option value="DLA-003">DLA-003 (LoanFast)</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.aaConsent} onChange={e => update("aaConsent", e.target.checked)} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 12, color: T.textSecondary }}>
                  <strong>Grant Account Aggregator Consent:</strong> Borrower explicitly authorizes retrieval of financial statements via RBI-regulated Account Aggregator network. Logged with timestamp.
                </span>
              </label>
              {errors.aaConsent && <div className="form-error">{errors.aaConsent}</div>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="card-title" style={{ marginBottom: 16 }}>Loan Requirements & Bureau Financials</div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Loan Amount (₹)</label>
                <input className="form-input" type="number" value={form.amount} onChange={e => update("amount", e.target.value)} placeholder="100000" />
                {errors.amount && <div className="form-error">{errors.amount}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Tenure (Months)</label>
                <select className="form-select" value={form.tenure} onChange={e => update("tenure", e.target.value)}>
                  {[3, 6, 9, 12, 18, 24, 36, 48, 60].map(m => <option key={m} value={m}>{m} months</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Loan Purpose</label>
              <select className="form-select" value={form.purpose} onChange={e => update("purpose", e.target.value)}>
                <option value="personal">Personal</option>
                <option value="consumer">Consumer Durable</option>
                <option value="education">Education</option>
                <option value="medical">Medical</option>
                <option value="emergency">Emergency</option>
                <option value="sme">SME / Business</option>
                <option value="working_capital">Working Capital</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CIBIL Bureau Score</label>
              <div className="form-inline">
                <div className="form-group">
                  <input className="form-input" type="number" value={form.cibilScore} onChange={e => update("cibilScore", e.target.value)} placeholder="e.g. 740" min={300} max={900} />
                  <div className="form-hint">Score between 300–900. Use "Pull CIBIL" for live mock query.</div>
                  {errors.cibilScore && <div className="form-error">{errors.cibilScore}</div>}
                </div>
                <button className="btn btn-secondary" type="button" onClick={pullBureau} disabled={pulling}>
                  {pulling ? "Pulling…" : "Pull CIBIL"}
                </button>
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Monthly Income (₹)</label>
                <input className="form-input" type="number" value={form.monthlyIncome} onChange={e => update("monthlyIncome", e.target.value)} placeholder="65000" />
                {errors.monthlyIncome && <div className="form-error">{errors.monthlyIncome}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Existing Monthly EMI (₹)</label>
                <input className="form-input" type="number" value={form.monthlyObligations} onChange={e => update("monthlyObligations", e.target.value)} placeholder="12000" />
                {errors.monthlyObligations && <div className="form-error">{errors.monthlyObligations}</div>}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="card-title" style={{ marginBottom: 16 }}>Review Application Details</div>
            {[
              ["Borrower Name", form.borrowerName],
              ["PAN", form.pan],
              ["Mobile", form.mobile],
              ["DLA Source", form.dlaId],
              ["AA Consent", form.aaConsent ? "✓ Granted" : "✗ Missing"],
              ["Loan Amount", formatINR(form.amount)],
              ["Purpose", form.purpose],
              ["Tenure", `${form.tenure} months`],
              ["CIBIL Score", form.cibilScore],
              ["Monthly Income", formatINR(form.monthlyIncome)],
              ["Existing Obligations", formatINR(form.monthlyObligations || 0)],
              ["Projected DTI", `${(((form.monthlyObligations || 0) / (form.monthlyIncome || 1)) * 100).toFixed(1)}%`],
            ].map(([k, v]) => (
              <div key={k} className="kfs-row">
                <span className="kfs-key">{k}</span>
                <span className="kfs-val" style={{ fontFamily: "inherit" }}>{v}</span>
              </div>
            ))}
          </>
        )}

        <hr className="divider" />
        <div className="flex justify-between">
          {step > 1 ? (
            <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>← Back</button>
          ) : <div />}
          {step < 3 ? (
            <button className="btn btn-primary" onClick={handleNext}>Continue →</button>
          ) : (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Application"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CREDIT ENGINE PAGE (DLA / ADMIN) ──────────────────────────────
function CreditEnginePage({ applications, lenders, onRoute }) {
  const pending = applications.filter(a => a.status === "pending_review");
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [kfs, setKfs] = useState(null);
  const [routedLender, setRoutedLender] = useState(null);
  const [engineLoading, setEngineLoading] = useState(false);
  const [routing, setRouting] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const [routeError, setRouteError] = useState(null);

  const runEngine = async (app) => {
    setSelected(app);
    setResult(null);
    setKfs(null);
    setRoutedLender(null);
    setEngineError(null);
    setRouteError(null);
    setEngineLoading(true);
    try {
      const data = await api(`/applications/${app.id}/run-engine`, { method: "POST" });
      setResult(data);
    } catch (e) {
      setEngineError(e.message);
    } finally {
      setEngineLoading(false);
    }
  };

  const handleRoute = async (app, lender) => {
    setRouting(true);
    setRouteError(null);
    try {
      const data = await api(`/applications/${app.id}/route`, {
        method: "POST",
        body: JSON.stringify({ lenderId: lender.id }),
      });
      setKfs(data.kfsData);
      setRoutedLender(lender);
      await onRoute(app.id, lender.id);
    } catch (e) {
      setRouteError(e.message);
    } finally {
      setRouting(false);
    }
  };

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div>
        <div className="section-header">
          <div className="section-title">Pending Applications</div>
          <span className="badge badge-amber">{pending.length} awaiting routing</span>
        </div>
        {pending.length === 0 && (
          <div className="empty card">
            <div className="empty-icon">✓</div>
            <div className="empty-text">No pending applications</div>
            <div className="empty-sub">All applications in scope have been processed</div>
          </div>
        )}
        {pending.map(app => (
          <div key={app.id} className="card card-sm mb-4" style={{ marginBottom: 10, cursor: "pointer", border: selected?.id === app.id ? `1px solid ${T.accent}` : undefined }} onClick={() => runEngine(app)}>
            <div className="flex justify-between items-center">
              <div>
                <div className="td-primary" style={{ fontWeight: 600, marginBottom: 4 }}>{app.borrowerName}</div>
                <div className="text-sm text-muted">{app.id} · {app.dlaId} · {formatINR(app.amount)} · {app.tenure}M</div>
              </div>
              <button className="btn btn-sm btn-primary" disabled={engineLoading && selected?.id === app.id}>
                {engineLoading && selected?.id === app.id ? "Running…" : "Run Engine →"}
              </button>
            </div>
          </div>
        ))}

        {applications.filter(a => a.status !== "pending_review").length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 24, marginBottom: 10 }}>Already Processed</div>
            {applications.filter(a => a.status !== "pending_review").map(app => (
              <div key={app.id} className="card card-sm" style={{ marginBottom: 8, opacity: 0.75 }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="td-primary" style={{ fontWeight: 600, marginBottom: 2 }}>{app.borrowerName}</div>
                    <div className="text-sm text-muted">{app.id} · {formatINR(app.amount)} · Routed to: {app.routedTo || "—"}</div>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div>
        {!selected && (
          <div className="empty card">
            <div className="empty-icon">⚡</div>
            <div className="empty-text">Select an application</div>
            <div className="empty-sub">The credit engine evaluates DTI, CIBIL, ticket size & purpose against all lenders</div>
          </div>
        )}
        {selected && engineLoading && (
          <div className="empty card">
            <div className="spinner" style={{ margin: "0 auto 12px" }} />
            <div className="empty-text">Evaluating eligibility across lenders…</div>
            <div className="empty-sub">{selected.borrowerName} ({selected.id})</div>
          </div>
        )}
        {selected && engineError && (
          <div className="empty card">
            <div className="empty-icon">⚠️</div>
            <div className="empty-text text-red">{engineError}</div>
          </div>
        )}
        {selected && result && !engineLoading && (
          <>
            <div className="section-header">
              <div className="section-title">Engine Results — {selected.borrowerName}</div>
            </div>

            {routeError && <div className="error-banner"><span>{routeError}</span><button className="close-btn" onClick={() => setRouteError(null)}>✕</button></div>}

            <div className="card card-sm mb-4" style={{ marginBottom: 12 }}>
              <div className="engine-metric">
                <span className="engine-metric-label">Loan Amount</span>
                <span className="engine-metric-value">{formatINR(selected.amount)}</span>
              </div>
              <div className="engine-metric">
                <span className="engine-metric-label">CIBIL Score</span>
                <span className="engine-metric-value" style={{ color: selected.cibilScore >= 700 ? T.green : T.amber }}>{selected.cibilScore}</span>
              </div>
              <div className="engine-metric">
                <span className="engine-metric-label">DTI Ratio</span>
                <span className="engine-metric-value" style={{ color: result.dti > 0.5 ? T.red : result.dti > 0.35 ? T.amber : T.green }}>
                  {(result.dti * 100).toFixed(1)}% {result.dti > 0.55 ? "⚠ High DTI" : ""}
                </span>
              </div>
              <div className="engine-metric">
                <span className="engine-metric-label">Eligible Lenders</span>
                <span className="engine-metric-value text-green">{result.eligible.length} / {lenders.length}</span>
              </div>
            </div>

            {result.eligible.length > 0 && (
              <>
                <div className="card-title" style={{ marginBottom: 8, color: T.green }}>✓ Eligible Lenders — {result.eligible.length}</div>
                {result.eligible.map(({ lender, emi, score }) => (
                  <div key={lender.id} className="engine-result mb-4" style={{ marginBottom: 8 }}>
                    <div className="engine-result-header engine-result-pass">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: T.textPrimary }}>{lender.lenderName}</div>
                        <div className="text-sm text-muted">{lender.type} · {lender.interestRate}% p.a. · EMI {formatINR(emi)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-green">Score {score}</span>
                        {routedLender?.id === lender.id || selected.routedTo === lender.id ? (
                          <span className="badge badge-blue">✓ Routed</span>
                        ) : (
                          <button className="btn btn-sm btn-primary" onClick={() => handleRoute(selected, lender)} disabled={routing || selected.kfsGenerated}>
                            {routing ? "Routing…" : "Route & Generate KFS →"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="engine-result-body">
                      <div className="engine-metric">
                        <span className="engine-metric-label">Processing Fee</span>
                        <span className="engine-metric-value">{lender.processingFee}% ({formatINR(Math.round(selected.amount * lender.processingFee / 100))})</span>
                      </div>
                      <div className="engine-metric">
                        <span className="engine-metric-label">Disbursal Time</span>
                        <span className="engine-metric-value">{lender.disbursalTime}</span>
                      </div>
                      <div className="engine-metric">
                        <span className="engine-metric-label">Total Payable</span>
                        <span className="engine-metric-value">{formatINR(emi * selected.tenure)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {result.rejected.length > 0 && (
              <>
                <div className="card-title" style={{ marginBottom: 8, color: T.textMuted, marginTop: 14 }}>✗ Ineligible Lenders — {result.rejected.length}</div>
                {result.rejected.map(({ lender, reasons }) => (
                  <div key={lender.id} className="engine-result" style={{ marginBottom: 6 }}>
                    <div className="engine-result-header engine-result-fail">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: T.textSecondary }}>{lender.lenderName} ({lender.type})</div>
                        <div className="text-sm" style={{ color: T.red, marginTop: 2 }}>{reasons.join(" · ")}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {kfs && (
              <div style={{ marginTop: 16 }}>
                <div className="kfs-panel">
                  <div className="kfs-title">
                    <span>⬡ Key Fact Statement (KFS) Generated</span>
                    <span className="badge badge-green">RBI Compliant</span>
                  </div>
                  {[
                    ["Lender Name", kfs.lenderName],
                    ["Lender Entity Type", kfs.lenderType],
                    ["Borrower Name", kfs.borrowerName],
                    ["Loan Principal", formatINR(kfs.loanAmount)],
                    ["Interest Rate", `${kfs.interestRate}% p.a.`],
                    ["Annual Percentage Rate (APR)", `${kfs.annualPercentageRate}% p.a.`],
                    ["Tenure", `${kfs.tenure} months`],
                    ["Monthly EMI", formatINR(kfs.emi)],
                    ["Total Repayable", formatINR(kfs.totalPayable)],
                    ["Total Interest Payable", formatINR(kfs.totalInterest)],
                    ["Processing Fee", formatINR(kfs.processingFee)],
                    ["Disbursal Timeline", kfs.disbursalTime],
                    ["Prepayment Charges", kfs.prepaymentCharges],
                    ["Overdue Penalties", kfs.penal],
                  ].map(([k, v]) => (
                    <div key={k} className="kfs-row">
                      <span className="kfs-key">{k}</span>
                      <span className="kfs-val">{v}</span>
                    </div>
                  ))}
                  <div className="kfs-disclaimer">
                    This KFS is stored in the database. Disbursal requires a valid generated KFS and status='routed'.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ROUTED LOANS & DISBURSAL PAGE (LENDER ROLE) ────────────────────
function RoutedLoansPage({ applications, user, onRefresh }) {
  // Scope apps to lender (backend also restricts GET /applications for LENDER)
  const routedApps = applications.filter((a) => a.status === "routed" || a.status === "disbursed");
  const [selectedApp, setSelectedApp] = useState(null);
  const [kfsData, setKfsData] = useState(null);
  const [loadingKfs, setLoadingKfs] = useState(false);
  const [disbursing, setDisbursing] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const selectApp = async (app) => {
    setSelectedApp(app);
    setKfsData(null);
    setLoadingKfs(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      const kfs = await api(`/applications/${app.id}/kfs`);
      setKfsData(kfs);
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setLoadingKfs(false);
    }
  };

  const handleDisburse = async () => {
    if (!selectedApp) return;
    setDisbursing(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      const res = await api(`/applications/${selectedApp.id}/disburse`, { method: "POST" });
      setActionMessage(res.message);
      await onRefresh();
      setSelectedApp((prev) => ({ ...prev, status: "disbursed" }));
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setDisbursing(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Routed Loans Portal — {user.lenderId || "Lender"}</div>
        <span className="badge badge-blue">{routedApps.length} Assigned Applications</span>
      </div>

      <div className="compliance-strip">
        <span>⚡</span>
        <div>
          <strong>Lender Execution Gate:</strong> Disbursal is blocked server-side unless application status is 'routed' AND a valid Key Fact Statement (KFS) has been generated. Disbursal records the state change — funds disburse directly to borrower.
        </div>
      </div>

      {actionMessage && <div className="success-banner"><span>{actionMessage}</span><button className="close-btn" onClick={() => setActionMessage(null)}>✕</button></div>}
      {errorMessage && <div className="error-banner"><span>{errorMessage}</span><button className="close-btn" onClick={() => setErrorMessage(null)}>✕</button></div>}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>Routed Applications</div>
          {routedApps.length === 0 ? (
            <div className="empty card">
              <div className="empty-icon">📭</div>
              <div className="empty-text">No routed applications for this lender</div>
            </div>
          ) : (
            routedApps.map((app) => (
              <div
                key={app.id}
                className="card card-sm mb-4"
                style={{
                  marginBottom: 10,
                  cursor: "pointer",
                  border: selectedApp?.id === app.id ? `1px solid ${T.accent}` : undefined,
                }}
                onClick={() => selectApp(app)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="td-primary" style={{ fontWeight: 600, marginBottom: 2 }}>{app.borrowerName}</div>
                    <div className="text-sm text-muted">{app.id} · {formatINR(app.amount)} · {app.tenure}M</div>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          {!selectedApp ? (
            <div className="empty card">
              <div className="empty-icon">📄</div>
              <div className="empty-text">Select an application</div>
              <div className="empty-sub">Inspect stored KFS and trigger disbursal callback</div>
            </div>
          ) : (
            <div className="card">
              <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                <div>
                  <div className="card-title" style={{ fontSize: 16 }}>{selectedApp.borrowerName}</div>
                  <div className="text-sm text-muted">{selectedApp.id} · PAN: {selectedApp.pan}</div>
                </div>
                <StatusBadge status={selectedApp.status} />
              </div>

              {selectedApp.status === "routed" && (
                <div style={{ marginBottom: 16 }}>
                  <button className="btn btn-success w-full" onClick={handleDisburse} disabled={disbursing}>
                    {disbursing ? "Executing Disbursal…" : "✓ Disburse Loan (Record State)"}
                  </button>
                  <div className="form-hint" style={{ textAlign: "center", marginTop: 6 }}>
                    Direct transfer from {user.lenderId} bank account → Borrower account.
                  </div>
                </div>
              )}

              {selectedApp.status === "disbursed" && (
                <div className="success-banner" style={{ marginBottom: 16 }}>
                  <span>✓ Loan disbursed on platform. Funds transferred directly to borrower.</span>
                </div>
              )}

              {loadingKfs ? (
                <div className="empty" style={{ padding: 24 }}>
                  <div className="spinner" style={{ margin: "0 auto 8px" }} />
                  <div>Loading stored KFS document…</div>
                </div>
              ) : kfsData ? (
                <div className="kfs-panel">
                  <div className="kfs-title">
                    <span>Key Fact Statement (KFS)</span>
                    <span className="badge badge-green">Verified</span>
                  </div>
                  {[
                    ["Borrower", kfsData.borrowerName],
                    ["Lender", kfsData.lenderName],
                    ["Loan Principal", formatINR(kfsData.loanAmount)],
                    ["Interest Rate", `${kfsData.interestRate}% p.a.`],
                    ["Annual % Rate (APR)", `${kfsData.annualPercentageRate}% p.a.`],
                    ["Tenure", `${kfsData.tenure} months`],
                    ["Monthly EMI", formatINR(kfsData.emi)],
                    ["Total Payable", formatINR(kfsData.totalPayable)],
                    ["Total Interest", formatINR(kfsData.totalInterest)],
                    ["Processing Fee", formatINR(kfsData.processingFee)],
                    ["Disbursal Time", kfsData.disbursalTime],
                  ].map(([k, v]) => (
                    <div key={k} className="kfs-row">
                      <span className="kfs-key">{k}</span>
                      <span className="kfs-val">{v}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LENDER PORTFOLIO & FLDG CAP PAGE (LENDER / ADMIN) ─────────────
function LenderPortfolioPage({ user }) {
  const lenderId = user.lenderId || "L003";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api(`/lenders/${lenderId}/portfolio`);
        if (mounted) setData(res);
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [lenderId]);

  if (loading) {
    return (
      <div className="empty card">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <div>Loading lender portfolio & FLDG metrics…</div>
      </div>
    );
  }

  if (error) {
    return <div className="error-banner"><span>{error}</span></div>;
  }

  const { lender, portfolioValue, disbursedValue, applicationCount, fldgExposure, capLimit, utilizationPct } = data;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Portfolio & FLDG Exposure Audit — {lender.lenderName}</div>
        <span className="badge badge-green">RBI FLDG 5% Cap Compliant</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Funded Portfolio</div>
          <div className="stat-value">{formatINR(portfolioValue)}</div>
          <div className="stat-delta">{applicationCount} Routed / Disbursed Apps</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Disbursed Capital</div>
          <div className="stat-value text-green">{formatINR(disbursedValue)}</div>
          <div className="stat-delta">Completed Funds Flow</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current FLDG Exposure</div>
          <div className="stat-value text-amber">{formatINR(fldgExposure)}</div>
          <div className="stat-delta">5% of Disbursed Capital</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Max Allowable FLDG Cap</div>
          <div className="stat-value">{formatINR(capLimit)}</div>
          <div className="stat-delta">5% of Total Portfolio</div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">FLDG Guarantee Cap Utilization Gauge (RBI 5% Limit)</div>
        <div className="flex justify-between text-sm mt-4 mb-4" style={{ marginTop: 12 }}>
          <span>Current Exposure: <strong>{formatINR(fldgExposure)}</strong></span>
          <span>Utilization: <strong>{utilizationPct}%</strong> of {formatINR(capLimit)} Cap</span>
        </div>
        <div className="gauge-container">
          <div
            className="gauge-fill"
            style={{
              width: `${Math.min(100, utilizationPct)}%`,
              background: utilizationPct > 90 ? T.red : utilizationPct > 75 ? T.amber : T.green,
            }}
          />
        </div>
        <div className="form-hint" style={{ marginTop: 8 }}>
          Under RBI Digital Lending Guidelines 2022, First Loss Default Guarantee (FLDG) provided by DLAs to lending partners cannot exceed 5% of the total loan portfolio value.
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Product Parameters & Rule Engine Config</div>
        {[
          ["Lender Entity ID", lender.id],
          ["Institution Type", lender.type],
          ["Interest Rate Range", `${lender.interestRate}% p.a.`],
          ["Ticket Size Limits", `${formatINR(lender.minAmount)} – ${formatINR(lender.maxAmount)}`],
          ["Min Bureau Cutoff", `${lender.minCibilScore} CIBIL`],
          ["Max Debt-To-Income (DTI)", `${(lender.maxDti * 100).toFixed(0)}%`],
          ["Processing Fee", `${lender.processingFee}%`],
          ["Disbursal Speed", lender.disbursalTime],
          ["OCEN 4.0 Enabled", lender.ocenEnabled ? "Yes" : "No"],
          ["Account Aggregator Enabled", lender.aaEnabled ? "Yes" : "No"],
        ].map(([k, v]) => (
          <div key={k} className="kfs-row">
            <span className="kfs-key">{k}</span>
            <span className="kfs-val" style={{ fontFamily: "inherit" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ADMIN STATS PAGE (ADMIN ROLE) ──────────────────────────────────
function AdminStatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await api("/admin/stats");
        if (mounted) setStats(data);
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="empty card">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <div>Fetching platform administrator analytics…</div>
      </div>
    );
  }

  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Marketplace Platform Analytics</div>
        <span className="badge badge-green">Live System Metrics</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Originated</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-delta">Across all DLAs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Routed Loans</div>
          <div className="stat-value text-amber">{stats.routed}</div>
          <div className="stat-delta">KFS Verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Disbursed Loans</div>
          <div className="stat-value text-green">{stats.disbursed}</div>
          <div className="stat-delta">Funds Settled</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Volume Disbursed</div>
          <div className="stat-value">{formatINR(stats.volume)}</div>
          <div className="stat-delta">Gross Volume</div>
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Portfolio Credit Quality</div>
          <div className="flex justify-between items-center mt-4" style={{ marginTop: 14 }}>
            <span className="text-muted">Average Portfolio CIBIL Score</span>
            <span className="stat-value" style={{ fontSize: 20, color: T.green }}>{stats.avgCibil}</span>
          </div>
          <div className="flex justify-between items-center mt-4" style={{ marginTop: 10 }}>
            <span className="text-muted">Pending Review Applications</span>
            <span className="badge badge-amber">{stats.pending}</span>
          </div>
          <div className="flex justify-between items-center mt-4" style={{ marginTop: 10 }}>
            <span className="text-muted">Rejected Applications</span>
            <span className="badge badge-red">{stats.rejected}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Regulatory Framework Status</div>
          <div style={{ marginTop: 14 }}>
            {[
              ["RBI Digital Lending Guidelines", "100% Compliant"],
              ["Key Fact Statement (KFS) Pre-Generation", "Enforced Server-Side"],
              ["FLDG Cap 5% Limit", "Active Enforcement"],
              ["Direct Lender → Borrower Funds Flow", "No Platform Pooling"],
            ].map(([rule, status]) => (
              <div key={rule} className="flex justify-between items-center" style={{ marginBottom: 8, fontSize: 12 }}>
                <span className="text-muted">{rule}</span>
                <span className="badge badge-green">✓ {status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Recent System Activity</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>App ID</th>
                <th>Borrower</th>
                <th>Amount</th>
                <th>CIBIL</th>
                <th>Status</th>
                <th>DLA</th>
                <th>Routed To</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((app) => (
                <tr key={app.id}>
                  <td className="td-mono td-primary">{app.id}</td>
                  <td className="td-primary">{app.borrowerName}</td>
                  <td className="td-mono">{formatINR(app.amount)}</td>
                  <td className="td-mono">{app.cibilScore}</td>
                  <td><StatusBadge status={app.status} /></td>
                  <td className="td-mono text-muted">{app.dlaId}</td>
                  <td className="td-mono text-muted">{app.routedTo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN COMPLIANCE AUDIT PAGE (ADMIN ROLE) ──────────────────────
function ComplianceAuditPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api("/admin/compliance");
        if (mounted) setData(res);
      } catch (e) {
        if (mounted) setError(e.message);
      } finale: {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="empty card">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <div>Auditing regulatory compliance logs & FLDG caps…</div>
      </div>
    );
  }

  if (error) return <div className="error-banner"><span>{error}</span></div>;

  const { capLimit, lenders, kfsComplianceRate, kfsCompliant, kfsTotal, complianceLogs } = data;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">RBI Compliance & FLDG Audit Monitor</div>
        <span className="badge badge-green">RBI DL Guidelines 2022</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">KFS Generation Rate</div>
          <div className="stat-value text-green">{kfsComplianceRate}%</div>
          <div className="stat-delta">{kfsCompliant} / {kfsTotal} Routed Apps</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Platform FLDG Cap</div>
          <div className="stat-value">{(capLimit * 100).toFixed(0)}%</div>
          <div className="stat-delta">Portfolio Exposure Limit</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Compliance Checks</div>
          <div className="stat-value">{complianceLogs.total}</div>
          <div className="stat-delta">Audit Log Entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Compliance Blockers</div>
          <div className="stat-value" style={{ color: complianceLogs.failures > 0 ? T.red : T.green }}>
            {complianceLogs.failures}
          </div>
          <div className="stat-delta">Blocked Non-Compliant Actions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Lender FLDG Exposure & Cap Audit</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lender ID</th>
                <th>Lender Name</th>
                <th>Portfolio Value</th>
                <th>Disbursed Value</th>
                <th>FLDG Exposure (5%)</th>
                <th>Cap Limit</th>
                <th>Utilization</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lenders.map((l) => (
                <tr key={l.lenderId}>
                  <td className="td-mono td-primary">{l.lenderId}</td>
                  <td className="td-primary">{l.lenderName}</td>
                  <td className="td-mono">{formatINR(l.portfolioValue)}</td>
                  <td className="td-mono">{formatINR(l.disbursedValue)}</td>
                  <td className="td-mono text-amber">{formatINR(l.fldgExposure)}</td>
                  <td className="td-mono">{formatINR(l.capLimit)}</td>
                  <td className="td-mono">
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{l.utilizationPct}%</span>
                      <div className="gauge-container" style={{ width: 60, height: 6, margin: 0 }}>
                        <div className="gauge-fill" style={{ width: `${l.utilizationPct}%`, background: l.utilizationPct > 90 ? T.red : T.green }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${l.status === "compliant" ? "badge-green" : "badge-red"}`}>
                      {l.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN ONBOARD LENDER PAGE (ADMIN ROLE) ─────────────────────────
function OnboardLenderPage({ onSuccess }) {
  const [form, setForm] = useState({
    lenderName: "",
    type: "NBFC",
    minAmount: 10000,
    maxAmount: 500000,
    interestRate: 15.0,
    minCibilScore: 650,
    maxDti: 0.5,
    processingFee: 1.5,
    disbursalTime: "T+1",
    tenureMonths: [3, 6, 12, 18, 24],
    supportedPurposes: ["personal", "consumer", "education"],
    ocenEnabled: true,
    aaEnabled: true,
    nachEnabled: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api("/lenders", {
        method: "POST",
        body: JSON.stringify(form),
      });
      onSuccess();
    } catch (ex) {
      setError(ex.message);
    } finally {
      setSubmitting(false);
    }
  };

  const togglePurpose = (p) => {
    const current = [...form.supportedPurposes];
    const idx = current.indexOf(p);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(p);
    update("supportedPurposes", current);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="section-header">
        <div className="section-title">Onboard New Lending Partner</div>
        <span className="badge badge-green">ADMIN Portal</span>
      </div>

      {error && <div className="error-banner"><span>{error}</span></div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Lender / Institution Name</label>
          <input className="form-input" value={form.lenderName} onChange={(e) => update("lenderName", e.target.value)} placeholder="e.g. Tata Capital / Axis Bank" required />
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Institution Type</label>
            <select className="form-select" value={form.type} onChange={(e) => update("type", e.target.value)}>
              <option value="Bank">Bank</option>
              <option value="NBFC">NBFC</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Interest Rate (% p.a.)</label>
            <input className="form-input" type="number" step="0.25" value={form.interestRate} onChange={(e) => update("interestRate", Number(e.target.value))} required />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Minimum Amount (₹)</label>
            <input className="form-input" type="number" value={form.minAmount} onChange={(e) => update("minAmount", Number(e.target.value))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Maximum Amount (₹)</label>
            <input className="form-input" type="number" value={form.maxAmount} onChange={(e) => update("maxAmount", Number(e.target.value))} required />
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Minimum CIBIL Score</label>
            <input className="form-input" type="number" value={form.minCibilScore} onChange={(e) => update("minCibilScore", Number(e.target.value))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Maximum Debt-To-Income (DTI)</label>
            <input className="form-input" type="number" step="0.05" min="0.1" max="0.9" value={form.maxDti} onChange={(e) => update("maxDti", Number(e.target.value))} required />
            <div className="form-hint">e.g. 0.50 = 50% max DTI limit</div>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Processing Fee (%)</label>
            <input className="form-input" type="number" step="0.1" value={form.processingFee} onChange={(e) => update("processingFee", Number(e.target.value))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Disbursal SLA</label>
            <select className="form-select" value={form.disbursalTime} onChange={(e) => update("disbursalTime", e.target.value)}>
              <option value="T+0">T+0 (Instant)</option>
              <option value="T+1">T+1 (1 Day)</option>
              <option value="T+2">T+2 (2 Days)</option>
              <option value="T+3">T+3 (3 Days)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Supported Loan Purposes</label>
          <div className="flex gap-2" style={{ flexWrap: "wrap", marginTop: 4 }}>
            {["personal", "consumer", "education", "medical", "emergency", "sme", "working_capital"].map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${form.supportedPurposes.includes(p) ? "btn-primary" : "btn-ghost"}`}
                onClick={() => togglePurpose(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-3 mb-4">
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={form.ocenEnabled} onChange={(e) => update("ocenEnabled", e.target.checked)} />
            <span className="text-sm">OCEN 4.0 Protocol</span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={form.aaEnabled} onChange={(e) => update("aaEnabled", e.target.checked)} />
            <span className="text-sm">Account Aggregator</span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={form.nachEnabled} onChange={(e) => update("nachEnabled", e.target.checked)} />
            <span className="text-sm">eNACH AutoPay</span>
          </label>
        </div>

        <button className="btn btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? "Onboarding Partner…" : "Onboard Lender Product"}
        </button>
      </form>
    </div>
  );
}

// ─── LENDERS CATALOGUE PAGE ───────────────────────────────────────
function LendersPage({ lenders, loading }) {
  if (loading) {
    return (
      <div className="empty card">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <div className="empty-text">Loading lender product catalogue…</div>
      </div>
    );
  }
  return (
    <>
      <div className="section-header">
        <div className="section-title">Onboarded Lender Catalogue</div>
        <span className="badge badge-muted">{lenders.length} Active Partners</span>
      </div>
      <div className="compliance-strip">
        <span>ℹ️</span>
        <div>
          All listed lenders are RBI-regulated Banks or NBFCs. FLDG arrangements are enforced at ≤5% of portfolio. Disbursal funds flow directly from lender → borrower account.
        </div>
      </div>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Lender ID</th>
              <th>Lender Name</th>
              <th>Type</th>
              <th>Rate (p.a.)</th>
              <th>Ticket Size</th>
              <th>Min CIBIL</th>
              <th>Max DTI</th>
              <th>Disbursal</th>
              <th>Purposes</th>
            </tr>
          </thead>
          <tbody>
            {lenders.map((l) => (
              <tr key={l.id}>
                <td className="td-mono td-primary">{l.id}</td>
                <td className="td-primary" style={{ fontWeight: 600 }}>{l.lenderName}</td>
                <td><span className={`badge ${l.type === "Bank" ? "badge-green" : "badge-blue"}`}>{l.type}</span></td>
                <td className="td-mono text-green">{l.interestRate}%</td>
                <td className="td-mono text-sm">{formatINR(l.minAmount)} – {formatINR(l.maxAmount)}</td>
                <td className="td-mono" style={{ color: l.minCibilScore >= 700 ? T.amber : T.green }}>{l.minCibilScore}</td>
                <td className="td-mono">{(l.maxDti * 100).toFixed(0)}%</td>
                <td><span className={`badge ${l.disbursalTime === "T+0" ? "badge-green" : l.disbursalTime === "T+1" ? "badge-blue" : "badge-muted"}`}>{l.disbursalTime}</span></td>
                <td className="text-sm text-muted">{l.supportedPurposes.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ margin: "24px 0 12px" }}>Protocol Integrations</div>
      <div className="grid-2">
        {lenders.map((l) => (
          <div key={l.id} className="card card-sm">
            <div className="card-title" style={{ marginBottom: 10 }}>{l.lenderName} ({l.id})</div>
            {[
              ["OCEN 4.0 Protocol Integration", l.ocenEnabled],
              ["Account Aggregator (AA) Fetch", l.aaEnabled],
              ["NACH / eMandate Repayment", l.nachEnabled],
            ].map(([label, status]) => (
              <div key={label} className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                <span className="text-sm text-muted">{label}</span>
                <span className={`badge ${status ? "badge-green" : "badge-amber"}`}>{status ? "✓ Integrated" : "⏳ Pending"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── APP SHELL ─────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [auth, setAuth] = useState(null);
  const [applications, setApplications] = useState([]);
  const [lenders, setLenders] = useState([]);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState(null);

  const refreshAll = useCallback(async () => {
    setBootLoading(true);
    setBootError(null);
    try {
      const [apps, lnd] = await Promise.all([
        api("/applications"),
        api("/lenders"),
      ]);
      setApplications(apps);
      setLenders(lnd);
    } catch (e) {
      setBootError(e.message);
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth) refreshAll();
  }, [auth, refreshAll]);

  const handleLogin = async ({ username, password }) => {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    authToken = data.token;
    setAuth(data);
    setPage("dashboard");
  };

  const handleLogout = () => {
    authToken = null;
    setAuth(null);
    setApplications([]);
    setLenders([]);
    setPage("dashboard");
  };

  const handleNewApp = async (payload) => {
    await api("/applications", { method: "POST", body: JSON.stringify(payload) });
    await refreshAll();
  };

  const handleRoute = async () => {
    await refreshAll();
  };

  if (!auth) {
    return (
      <>
        <style>{styles}</style>
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  const role = auth.user.role;

  // Build role-scoped navigation items
  const navItems = [
    { id: "dashboard", icon: "⬡", label: "Overview" },
  ];

  if (role === "DLA" || role === "ADMIN") {
    navItems.push(
      { id: "new-application", icon: "＋", label: "New Application" },
      { id: "credit-engine", icon: "⚡", label: "Credit Engine" }
    );
  }

  if (role === "LENDER") {
    navItems.push(
      { id: "routed-loans", icon: "📑", label: "Routed Loans & Disbursal" },
      { id: "lender-portfolio", icon: "📊", label: "Portfolio & FLDG" }
    );
  }

  if (role === "ADMIN") {
    navItems.push(
      { id: "admin-stats", icon: "📈", label: "Marketplace Stats" },
      { id: "admin-compliance", icon: "🛡️", label: "Compliance Audit" },
      { id: "onboard-lender", icon: "🏛️", label: "Onboard Lender" }
    );
  }

  navItems.push({ id: "lenders", icon: "🏦", label: "Lender Catalogue" });

  const pageMeta = {
    dashboard: { title: "Marketplace Overview", subtitle: "Embedded credit routing & application hub" },
    "new-application": { title: "New Loan Application", subtitle: "Submit via DLA → AA Consent & Bureau query" },
    "credit-engine": { title: "Credit Engine", subtitle: "Eligibility matching & RBI Key Fact Statement (KFS)" },
    "routed-loans": { title: "Lender Portal — Disbursal", subtitle: "Verify KFS document & execute loan disbursal" },
    "lender-portfolio": { title: "Portfolio & FLDG Cap", subtitle: "Audit funded portfolio and 5% FLDG guarantee cap" },
    "admin-stats": { title: "Administrator Dashboard", subtitle: "System-wide credit volume & application analytics" },
    "admin-compliance": { title: "Compliance Audit Monitor", subtitle: "Audit KFS generation & FLDG cap limits across all lenders" },
    "onboard-lender": { title: "Onboard Lending Partner", subtitle: "Configure Bank / NBFC underwriting criteria & SLAs" },
    lenders: { title: "Lender Catalogue", subtitle: "Onboarded regulated Banks & NBFCs" },
  };

  const roleBadge = role === "ADMIN" ? "badge-green" : role === "LENDER" ? "badge-blue" : "badge-amber";

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">
              <div className="logo-icon">V</div>
              <div>
                <div className="logo-text">Vantage Credit</div>
                <div className="logo-sub">Embedded Lending</div>
              </div>
            </div>
          </div>
          <nav className="sidebar-nav">
            <div className="nav-section-label">{role} Scope</div>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => setPage(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div className="nav-section-label" style={{ marginTop: 14 }}>India Stack</div>
            {[
              { icon: "🔗", label: "AA Consents" },
              { icon: "📋", label: "CIBIL Pulls" },
              { icon: "⚡", label: "OCEN 4.0" },
              { icon: "💳", label: "eNACH AutoPay" },
            ].map((item) => (
              <button key={item.label} className="nav-item" onClick={() => {}}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="rbi-badge">✓ RBI DL 2022</div>
            <div>FLDG Cap 5% · Direct Funds</div>
            <div style={{ marginTop: 4 }}>MERN Stack · Node/React</div>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <div className="page-title">{pageMeta[page]?.title}</div>
              <div className="page-subtitle">{pageMeta[page]?.subtitle}</div>
            </div>
            <div className="topbar-actions">
              <span className={`badge ${roleBadge}`}>
                {role} · {auth.user.username} {auth.user.lenderId ? `(${auth.user.lenderId})` : ""}
              </span>
              <span className="badge badge-green">● Operational</span>
              <button className="btn btn-sm btn-ghost" onClick={handleLogout}>Logout</button>
            </div>
          </div>

          <div className="content">
            {bootError && (
              <div className="error-banner">
                <span>{bootError}</span>
                <button className="btn btn-sm btn-secondary" onClick={refreshAll}>Retry</button>
              </div>
            )}
            {bootLoading ? (
              <div className="empty card">
                <div className="spinner" style={{ margin: "0 auto 12px" }} />
                <div className="empty-text">Syncing marketplace data…</div>
              </div>
            ) : (
              <>
                {page === "dashboard" && <DashboardPage applications={applications} user={auth.user} />}
                {page === "new-application" && <NewApplicationPage onSubmit={handleNewApp} />}
                {page === "credit-engine" && <CreditEnginePage applications={applications} lenders={lenders} onRoute={handleRoute} />}
                {page === "routed-loans" && <RoutedLoansPage applications={applications} user={auth.user} onRefresh={refreshAll} />}
                {page === "lender-portfolio" && <LenderPortfolioPage user={auth.user} />}
                {page === "admin-stats" && <AdminStatsPage />}
                {page === "admin-compliance" && <ComplianceAuditPage />}
                {page === "onboard-lender" && <OnboardLenderPage onSuccess={() => { refreshAll(); setPage("lenders"); }} />}
                {page === "lenders" && <LendersPage lenders={lenders} loading={bootLoading} />}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
