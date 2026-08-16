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
// JWT is held in a module-level variable (memory only, never localStorage).
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
    width: 220px;
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
  .logo-mark {
    display: flex; align-items: center; gap: 8px;
  }
  .logo-icon {
    width: 28px; height: 28px;
    background: ${T.accent};
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: white;
  }
  .logo-text { font-size: 15px; font-weight: 700; color: ${T.textPrimary}; letter-spacing: -0.3px; }
  .logo-sub { font-size: 10px; color: ${T.textMuted}; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }

  .sidebar-nav { padding: 12px 8px; flex: 1; }
  .nav-section-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: ${T.textMuted}; padding: 8px 8px 4px; font-weight: 600;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 6px; cursor: pointer;
    color: ${T.textSecondary}; font-size: 13px; font-weight: 500;
    transition: all 0.15s; border: none; background: none; width: 100%; text-align: left;
    margin-bottom: 2px;
  }
  .nav-item:hover { background: ${T.surfaceHigh}; color: ${T.textPrimary}; }
  .nav-item.active { background: ${T.accentSoft}; color: ${T.accentGlow}; }
  .nav-item .nav-icon { font-size: 15px; width: 18px; text-align: center; }

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
  .main { margin-left: 220px; flex: 1; display: flex; flex-direction: column; }

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
  .card-title { font-size: 13px; font-weight: 600; color: ${T.textPrimary}; margin-bottom: 4px; }
  .card-sub { font-size: 11px; color: ${T.textMuted}; }

  /* Stats Grid */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
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
    text-align: left; padding: 8px 12px;
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
    transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px;
  }
  .btn-primary { background: ${T.accent}; color: white; }
  .btn-primary:hover { background: ${T.accentGlow}; }
  .btn-primary:disabled { background: ${T.border}; cursor: not-allowed; }
  .btn-secondary { background: ${T.surfaceHigh}; color: ${T.textPrimary}; border: 1px solid ${T.border}; }
  .btn-secondary:hover { background: ${T.border}; }
  .btn-ghost { background: none; color: ${T.textSecondary}; border: 1px solid ${T.border}; }
  .btn-ghost:hover { color: ${T.textPrimary}; border-color: ${T.textSecondary}; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-danger { background: ${T.redSoft}; color: ${T.red}; border: 1px solid ${T.redSoft}; }

  /* Form */
  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: ${T.textSecondary}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .form-input, .form-select {
    width: 100%; padding: 9px 12px;
    background: ${T.surfaceHigh}; border: 1px solid ${T.border};
    border-radius: 7px; color: ${T.textPrimary}; font-size: 13px;
    outline: none; transition: border-color 0.15s; font-family: inherit;
  }
  .form-input:focus, .form-select:focus { border-color: ${T.accent}; }
  .form-select option { background: ${T.surface}; }
  .form-hint { font-size: 11px; color: ${T.textMuted}; margin-top: 4px; }
  .form-error { font-size: 11px; color: ${T.red}; margin-top: 4px; }
  .form-inline { display: flex; gap: 8px; align-items: flex-start; }
  .form-inline .form-group { flex: 1; }

  /* Divider */
  .divider { border: none; border-top: 1px solid ${T.border}; margin: 16px 0; }

  /* Section header */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .section-title { font-size: 14px; font-weight: 700; color: ${T.textPrimary}; }

  /* Credit engine output */
  .engine-result {
    border: 1px solid ${T.border}; border-radius: 8px; overflow: hidden; margin-bottom: 10px;
  }
  .engine-result-header {
    padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;
    cursor: pointer;
  }
  .engine-result-pass { background: ${T.greenSoft}; border-left: 3px solid ${T.green}; }
  .engine-result-fail { background: ${T.surfaceHigh}; border-left: 3px solid ${T.textMuted}; }
  .engine-result-body { padding: 12px 14px; background: ${T.surface}; }
  .engine-metric { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid ${T.border}; }
  .engine-metric:last-child { border-bottom: none; }
  .engine-metric-label { color: ${T.textMuted}; }
  .engine-metric-value { color: ${T.textPrimary}; font-weight: 500; font-family: ${T.fontMono}; font-size: 12px; }

  /* KFS panel */
  .kfs-panel {
    background: ${T.surfaceHigh}; border: 1px solid ${T.border}; border-radius: 8px;
    padding: 16px; font-size: 12px;
  }
  .kfs-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${T.amber}; margin-bottom: 12px; }
  .kfs-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid ${T.border}; }
  .kfs-row:last-child { border-bottom: none; }
  .kfs-key { color: ${T.textMuted}; }
  .kfs-val { color: ${T.textPrimary}; font-weight: 600; font-family: ${T.fontMono}; font-size: 12px; }
  .kfs-disclaimer { font-size: 10px; color: ${T.textMuted}; margin-top: 10px; line-height: 1.4; }

  /* Flow diagram */
  .flow { display: flex; align-items: center; gap: 0; margin: 16px 0; flex-wrap: wrap; }
  .flow-node {
    background: ${T.surfaceHigh}; border: 1px solid ${T.border};
    border-radius: 8px; padding: 10px 14px; font-size: 12px; font-weight: 600; color: ${T.textPrimary};
    text-align: center; min-width: 90px;
  }
  .flow-node-active { border-color: ${T.accent}; color: ${T.accentGlow}; background: ${T.accentSoft}; }
  .flow-arrow { color: ${T.textMuted}; font-size: 16px; margin: 0 4px; }
  .flow-sub { font-size: 10px; color: ${T.textMuted}; font-weight: 400; margin-top: 2px; }

  /* Modal overlay */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center; z-index: 200;
    padding: 24px;
  }
  .modal {
    background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 12px;
    width: 100%; max-width: 620px; max-height: 85vh; overflow-y: auto;
  }
  .modal-header {
    padding: 18px 20px; border-bottom: 1px solid ${T.border};
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; background: ${T.surface}; z-index: 10;
  }
  .modal-title { font-size: 15px; font-weight: 700; }
  .modal-body { padding: 20px; }
  .modal-footer { padding: 14px 20px; border-top: 1px solid ${T.border}; display: flex; justify-content: flex-end; gap: 8px; }
  .close-btn { background: none; border: none; color: ${T.textMuted}; cursor: pointer; font-size: 18px; line-height: 1; }
  .close-btn:hover { color: ${T.textPrimary}; }

  /* Compliance strip */
  .compliance-strip {
    background: ${T.amberSoft}; border: 1px solid ${T.amber};
    border-radius: 7px; padding: 10px 14px; margin-bottom: 16px;
    font-size: 12px; color: ${T.amber}; display: flex; gap: 8px; align-items: flex-start;
  }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid ${T.border}; margin-bottom: 20px; }
  .tab {
    padding: 10px 16px; font-size: 13px; font-weight: 500; cursor: pointer;
    color: ${T.textMuted}; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none;
    transition: all 0.15s;
  }
  .tab:hover { color: ${T.textPrimary}; }
  .tab.active { color: ${T.accentGlow}; border-bottom-color: ${T.accent}; }

  /* Empty state */
  .empty { text-align: center; padding: 48px 20px; color: ${T.textMuted}; }
  .empty-icon { font-size: 32px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; margin-bottom: 4px; color: ${T.textSecondary}; }
  .empty-sub { font-size: 12px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }

  /* Tooltip */
  .tooltip { position: relative; }
  .tooltip-text {
    display: none; position: absolute; bottom: calc(100% + 6px); left: 50%;
    transform: translateX(-50%); background: ${T.surfaceHigh}; border: 1px solid ${T.border};
    border-radius: 5px; padding: 5px 8px; font-size: 11px; color: ${T.textPrimary};
    white-space: nowrap; z-index: 300;
  }
  .tooltip:hover .tooltip-text { display: block; }

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
    width: 44px; height: 44px; margin: 0 auto 10px;
    background: ${T.accent}; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 700; color: white;
  }
  .login-sub { font-size: 12px; color: ${T.textMuted}; }
  .quick-account {
    display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;
  }
  .quick-account button {
    padding: 4px 10px; font-size: 11px; border-radius: 20px; border: 1px solid ${T.border};
    background: ${T.surfaceHigh}; color: ${T.textSecondary}; cursor: pointer;
  }
  .quick-account button:hover { color: ${T.textPrimary}; border-color: ${T.accent}; }

  /* Loading */
  .loading-screen {
    min-height: 100vh; display: flex; flex-direction: column; gap: 12px;
    align-items: center; justify-content: center; color: ${T.textSecondary};
  }
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
`;

// ─── COMPONENTS ───────────────────────────────────────────────────

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
    { u: "dla1", p: "Dla@123", label: "DLA", hint: "dla1" },
    { u: "lender1", p: "Lender@123", label: "LENDER", hint: "lender1" },
    { u: "admin", p: "Admin@123", label: "ADMIN", hint: "admin" },
  ];

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-hero">
          <div className="login-logo">V</div>
          <div className="logo-text" style={{ fontSize: 18 }}>Vantage Credit</div>
          <div className="login-sub">Embedded Credit Marketplace · RBII DL 2022 Compliant</div>
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
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="quick-account">
          {quick.map((q) => (
            <button key={q.u} onClick={() => { setUsername(q.u); setPassword(q.p); }}>
              {q.label}: {q.u}
            </button>
          ))}
        </div>
        <div className="form-hint" style={{ marginTop: 12 }}>
          Demo accounts are seeded on the server. JWT is held in memory only.
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────────
function DashboardPage({ applications }) {
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
          { label: "Total Applications", value: total, delta: "From live API" },
          { label: "Routed", value: routed, delta: "Awaiting disbursal" },
          { label: "Disbursed", value: disbursed, delta: "Completed" },
          { label: "Volume Disbursed", value: formatINR(totalVolume), delta: "This month" },
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
          <div className="section-title">Marketplace Flow</div>
          <span className="badge badge-green">RBI DL Guidelines 2022 Compliant</span>
        </div>
        <div className="flow">
          {[
            { label: "Borrower", sub: "Via DLA app", active: false },
            null,
            { label: "DLA", sub: "Submits application", active: false },
            null,
            { label: "Marketplace", sub: "Routes to lender", active: true },
            null,
            { label: "Credit Engine", sub: "Eligibility + KFS", active: false },
            null,
            { label: "Lender", sub: "Bank / NBFC", active: false },
            null,
            { label: "Disbursal", sub: "Direct to borrower", active: false },
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
          <span>⚠️</span>
          <div>
            <strong>Compliance note:</strong> Funds flow directly Lender → Borrower. This platform never touches money (RBI DL Guidelines §3.1). FLDG exposure capped at 5% of portfolio. KFS is generated before every route and enforced server-side before disbursal.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <div className="section-title">Recent Applications</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Application ID</th>
                <th>Borrower</th>
                <th>Amount</th>
                <th>Purpose</th>
                <th>CIBIL</th>
                <th>Status</th>
                <th>DLA</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── LOAN APPLICATION PAGE ─────────────────────────────────────────
function NewApplicationPage({ onSubmit }) {
  const [form, setForm] = useState({
    borrowerName: "",
    pan: "",
    mobile: "",
    amount: "",
    purpose: "personal",
    tenure: "12",
    cibilScore: "",
    monthlyIncome: "",
    monthlyObligations: "",
    dlaId: "DLA-001",
    aaConsent: false,
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
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.toUpperCase())) e.pan = "Invalid PAN format";
    if (!/^[6-9]\d{9}$/.test(form.mobile)) e.mobile = "Invalid mobile number";
    if (!form.aaConsent) e.aaConsent = "AA consent required to fetch financial data";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validate2 = () => {
    const e = {};
    if (!form.amount || form.amount < 5000) e.amount = "Minimum loan amount ₹5,000";
    if (!form.cibilScore || form.cibilScore < 300 || form.cibilScore > 900) e.cibilScore = "CIBIL score 300-900";
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
      setErrors({ ...errors, pan: "Invalid PAN — cannot pull bureau" });
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
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div className="section-title" style={{ marginBottom: 8 }}>Application Submitted</div>
        <div className="text-muted" style={{ marginBottom: 24 }}>The credit engine will route this application to eligible lenders. Go to Credit Engine to run it.</div>
        <button className="btn btn-primary" onClick={() => setStep(1)}>Submit Another</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {submitError && <div className="error-banner"><span>{submitError}</span><button className="close-btn" onClick={() => setSubmitError(null)}>✕</button></div>}

      <div className="flex gap-2 mb-4" style={{ marginBottom: 20 }}>
        {["Borrower KYC", "Loan Details", "Review"].map((label, i) => (
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
            <div className="card-title" style={{ marginBottom: 16 }}>Borrower Identity (KYC)</div>
            <div className="compliance-strip">
              <span>🔒</span>
              <div>AA (Account Aggregator) consent required before financial data can be fetched. The server logs consent with a timestamp and pulls a mock bank statement on submission.</div>
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
              <label className="form-label">Source DLA</label>
              <select className="form-select" value={form.dlaId} onChange={e => update("dlaId", e.target.value)}>
                <option value="DLA-001">DLA-001 (FinServe App)</option>
                <option value="DLA-002">DLA-002 (QuickCredit)</option>
                <option value="DLA-003">DLA-003 (LoanFast)</option>
              </select>
              <div className="form-hint">The Digital Lending App that originated this application</div>
            </div>
            <div className="form-group">
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.aaConsent} onChange={e => update("aaConsent", e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ fontSize: 12, color: T.textSecondary }}>
                  <strong>Account Aggregator Consent:</strong> Borrower authorizes retrieval of financial data (bank statements, income) via AA framework (RBI regulated). Consent logged with timestamp.
                </span>
              </label>
              {errors.aaConsent && <div className="form-error">{errors.aaConsent}</div>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="card-title" style={{ marginBottom: 16 }}>Loan Requirements & Financials</div>
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
              <label className="form-label">CIBIL Score</label>
              <div className="form-inline">
                <div className="form-group">
                  <input className="form-input" type="number" value={form.cibilScore} onChange={e => update("cibilScore", e.target.value)} placeholder="720" min={300} max={900} />
                  <div className="form-hint">300–900. Pull from the mock bureau API — don't self-report.</div>
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
                <input className="form-input" type="number" value={form.monthlyIncome} onChange={e => update("monthlyIncome", e.target.value)} placeholder="60000" />
                {errors.monthlyIncome && <div className="form-error">{errors.monthlyIncome}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Existing EMI Obligations (₹)</label>
                <input className="form-input" type="number" value={form.monthlyObligations} onChange={e => update("monthlyObligations", e.target.value)} placeholder="10000" />
                {errors.monthlyObligations && <div className="form-error">{errors.monthlyObligations}</div>}
                <div className="form-hint">Total existing monthly loan repayments</div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="card-title" style={{ marginBottom: 16 }}>Review Before Submission</div>
            {[
              ["Borrower", form.borrowerName],
              ["PAN", form.pan],
              ["Mobile", form.mobile],
              ["DLA", form.dlaId],
              ["AA Consent", form.aaConsent ? "✓ Granted" : "✗ Not granted"],
              ["Loan Amount", formatINR(form.amount)],
              ["Purpose", form.purpose],
              ["Tenure", `${form.tenure} months`],
              ["CIBIL Score", form.cibilScore],
              ["Monthly Income", formatINR(form.monthlyIncome)],
              ["Monthly Obligations", formatINR(form.monthlyObligations || 0)],
              ["DTI Ratio", `${(((form.monthlyObligations || 0) / form.monthlyIncome) * 100).toFixed(1)}%`],
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

// ─── CREDIT ENGINE PAGE ────────────────────────────────────────────
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
            <div className="empty-sub">All applications have been routed</div>
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
            <div className="section-title" style={{ marginTop: 20, marginBottom: 10 }}>Already Processed</div>
            {applications.filter(a => a.status !== "pending_review").map(app => (
              <div key={app.id} className="card card-sm" style={{ marginBottom: 8, opacity: 0.7 }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="td-primary" style={{ fontWeight: 600, marginBottom: 4 }}>{app.borrowerName}</div>
                    <div className="text-sm text-muted">{app.id} · {formatINR(app.amount)}</div>
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
            <div className="empty-sub">The credit engine will match it against all lender products</div>
          </div>
        )}
        {selected && engineLoading && (
          <div className="empty card">
            <div className="spinner" style={{ margin: "0 auto 12px" }} />
            <div className="empty-text">Running credit engine…</div>
            <div className="empty-sub">{selected.borrowerName} · {selected.id}</div>
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

            <div className="card card-sm mb-4" style={{ marginBottom: 10 }}>
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
                  {(result.dti * 100).toFixed(1)}% {result.dti > 0.5 ? "⚠ High" : ""}
                </span>
              </div>
              <div className="engine-metric">
                <span className="engine-metric-label">Eligible Lenders</span>
                <span className="engine-metric-value text-green">{result.eligible.length} / {lenders.length}</span>
              </div>
            </div>

            {result.eligible.length > 0 && (
              <>
                <div className="card-title" style={{ marginBottom: 8, color: T.green }}>✓ Eligible — {result.eligible.length} lenders</div>
                {result.eligible.map(({ lender, emi, score }) => (
                  <div key={lender.id} className="engine-result mb-4" style={{ marginBottom: 8 }}>
                    <div className="engine-result-header engine-result-pass">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: T.textPrimary }}>{lender.lenderName}</div>
                        <div className="text-sm text-muted">{lender.type} · {lender.interestRate}% p.a. · EMI {formatINR(emi)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-green">Score {score}</span>
                        {routedLender?.id === lender.id ? (
                          <span className="badge badge-blue">✓ Routed</span>
                        ) : (
                          <button className="btn btn-sm btn-primary" onClick={() => handleRoute(selected, lender)} disabled={routing}>
                            {routing ? "Routing…" : "Route →"}
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
                <div className="card-title" style={{ marginBottom: 8, color: T.textMuted, marginTop: 12 }}>✗ Ineligible — {result.rejected.length} lenders</div>
                {result.rejected.map(({ lender, reasons }) => (
                  <div key={lender.id} className="engine-result" style={{ marginBottom: 6 }}>
                    <div className="engine-result-header engine-result-fail">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: T.textSecondary }}>{lender.lenderName}</div>
                        <div className="text-sm" style={{ color: T.red }}>{reasons.join(" · ")}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {kfs && (
              <div style={{ marginTop: 16 }}>
                <div className="kfs-panel">
                  <div className="kfs-title">⬡ Key Fact Statement (KFS) — RBI Mandatory</div>
                  {[
                    ["Lender", kfs.lenderName],
                    ["Lender Type", kfs.lenderType],
                    ["Borrower", kfs.borrowerName],
                    ["Loan Amount", formatINR(kfs.loanAmount)],
                    ["Interest Rate", `${kfs.interestRate}% p.a.`],
                    ["Annual % Rate (APR)", `${kfs.annualPercentageRate}% p.a.`],
                    ["Tenure", `${kfs.tenure} months`],
                    ["Monthly EMI", formatINR(kfs.emi)],
                    ["Total Payable", formatINR(kfs.totalPayable)],
                    ["Total Interest", formatINR(kfs.totalInterest)],
                    ["Processing Fee", formatINR(kfs.processingFee)],
                    ["Disbursal Timeline", kfs.disbursalTime],
                    ["Prepayment Charges", kfs.prepaymentCharges],
                    ["Penal Interest", kfs.penal],
                  ].map(([k, v]) => (
                    <div key={k} className="kfs-row">
                      <span className="kfs-key">{k}</span>
                      <span className="kfs-val">{v}</span>
                    </div>
                  ))}
                  <div className="kfs-disclaimer">
                    This KFS is generated in compliance with RBI Digital Lending Guidelines (Sept 2022). Borrower must acknowledge this document before loan execution. This does not constitute a loan sanction letter.
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

// ─── LENDERS PAGE ─────────────────────────────────────────────────
function LendersPage({ lenders, loading }) {
  if (loading) {
    return (
      <div className="empty card">
        <div className="spinner" style={{ margin: "0 auto 12px" }} />
        <div className="empty-text">Loading lender catalogue…</div>
      </div>
    );
  }
  return (
    <>
      <div className="section-header">
        <div className="section-title">Lender Product Catalogue</div>
        <span className="badge badge-muted">{lenders.length} lenders onboarded</span>
      </div>
      <div className="compliance-strip">
        <span>ℹ️</span>
        <div>All lenders are regulated Banks or NBFCs registered with RBI. FLDG arrangements are capped at 5% per lender portfolio. Funds always disburse directly from lender to borrower — never through this platform.</div>
      </div>
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Lender</th>
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
            {lenders.map(l => (
              <tr key={l.id}>
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

      <div className="section-title" style={{ margin: "24px 0 12px" }}>OCEN 4.0 Integration Status</div>
      <div className="grid-2">
        {lenders.map(l => (
          <div key={l.id} className="card card-sm">
            <div className="card-title" style={{ marginBottom: 10 }}>{l.lenderName}</div>
            {[
              ["OCEN 4.0 Protocol", l.ocenEnabled],
              ["Account Aggregator (AA)", l.aaEnabled],
              ["NACH / eMandate", l.nachEnabled],
            ].map(([label, status]) => (
              <div key={label} className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                <span className="text-sm text-muted">{label}</span>
                <span className={`badge ${status ? "badge-green" : "badge-amber"}`}>{status ? "✓ Live" : "⏳ Pending"}</span>
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
    authToken = data.token; // in-memory only
    setAuth(data);
    setPage("dashboard");
    await refreshAll();
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

  const handleRoute = async (appId, lenderId) => {
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

  const navItems = [
    { id: "dashboard", icon: "⬡", label: "Dashboard" },
    { id: "new-application", icon: "＋", label: "New Application" },
    { id: "credit-engine", icon: "⚡", label: "Credit Engine" },
    { id: "lenders", icon: "🏦", label: "Lenders" },
  ];

  const pageMeta = {
    dashboard: { title: "Marketplace Overview", subtitle: "Embedded credit routing dashboard" },
    "new-application": { title: "New Loan Application", subtitle: "Submit via DLA → route to lender" },
    "credit-engine": { title: "Credit Engine", subtitle: "Eligibility matching & KFS generation" },
    lenders: { title: "Lender Catalogue", subtitle: "Onboarded Banks & NBFCs with product rules" },
  };

  const roleBadge =
    auth.user.role === "ADMIN" ? "badge-green" : auth.user.role === "LENDER" ? "badge-blue" : "badge-amber";

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
            <div className="nav-section-label">Marketplace</div>
            {navItems.map(item => (
              <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div className="nav-section-label" style={{ marginTop: 12 }}>India Stack</div>
            {[
              { icon: "🔗", label: "AA Consents" },
              { icon: "📋", label: "CIBIL Pulls" },
              { icon: "✅", label: "eKYC Status" },
              { icon: "💳", label: "UPI AutoPay" },
            ].map(item => (
              <button key={item.label} className="nav-item" onClick={() => {}}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="rbi-badge">✓ RBI DL 2022</div>
            <div>OCEN 4.0 · FLDG Cap 5%</div>
            <div style={{ marginTop: 4 }}>v1.0 · MERN</div>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <div className="page-title">{pageMeta[page]?.title}</div>
              <div className="page-subtitle">{pageMeta[page]?.subtitle}</div>
            </div>
            <div className="topbar-actions">
              <span className={`badge ${roleBadge}`}>{auth.user.role} · {auth.user.username}</span>
              <span className="badge badge-green">● System Operational</span>
              <span className="badge badge-muted">{applications.length} Applications</span>
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
                <div className="empty-text">Loading marketplace data…</div>
              </div>
            ) : (
              <>
                {page === "dashboard" && <DashboardPage applications={applications} />}
                {page === "new-application" && <NewApplicationPage onSubmit={handleNewApp} />}
                {page === "credit-engine" && <CreditEnginePage applications={applications} lenders={lenders} onRoute={handleRoute} />}
                {page === "lenders" && <LendersPage lenders={lenders} loading={bootLoading} />}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
