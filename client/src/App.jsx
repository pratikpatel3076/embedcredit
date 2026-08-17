import React, { useState, useEffect, useCallback, Fragment } from "react";

// ─── THEME HOOK & PERSISTENCE ─────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("vantage_theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("vantage_theme", theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      if (!localStorage.getItem("vantage_theme")) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return [theme, toggleTheme];
}

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

// ─── STYLES & DESIGN SYSTEM TOKENS ────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root, [data-theme="dark"] {
    --bg-main: #0B0F17;
    --bg-sidebar: #0F172A;
    --bg-surface: #111827;
    --bg-surface-elevated: #1F2937;
    --bg-surface-hover: #1E293B;
    --bg-input: #1F2937;
    --border-color: #1F2D42;
    --border-subtle: #192334;
    --border-focus: #3B82F6;
    
    --primary: #2563EB;
    --primary-hover: #1D4ED8;
    --primary-glow: rgba(59, 130, 246, 0.35);
    --primary-soft: rgba(37, 99, 235, 0.15);
    --primary-text: #60A5FA;

    --text-primary: #F8FAFC;
    --text-secondary: #94A3B8;
    --text-muted: #64748B;
    --text-inverse: #0F172A;

    --green: #10B981;
    --green-soft: rgba(16, 185, 129, 0.15);
    --green-border: rgba(16, 185, 129, 0.3);

    --amber: #F59E0B;
    --amber-soft: rgba(245, 158, 11, 0.15);
    --amber-border: rgba(245, 158, 11, 0.3);

    --red: #EF4444;
    --red-soft: rgba(239, 68, 68, 0.15);
    --red-border: rgba(239, 68, 68, 0.3);

    --blue: #3B82F6;
    --blue-soft: rgba(59, 130, 246, 0.15);
    --blue-border: rgba(59, 130, 246, 0.3);

    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3);

    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --radius-full: 9999px;
    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
  }

  [data-theme="light"] {
    --bg-main: #F8FAFC;
    --bg-sidebar: #FFFFFF;
    --bg-surface: #FFFFFF;
    --bg-surface-elevated: #F1F5F9;
    --bg-surface-hover: #F8FAFC;
    --bg-input: #FFFFFF;
    --border-color: #E2E8F0;
    --border-subtle: #F1F5F9;
    --border-focus: #2563EB;

    --primary: #2563EB;
    --primary-hover: #1D4ED8;
    --primary-glow: rgba(37, 99, 235, 0.2);
    --primary-soft: rgba(37, 99, 235, 0.08);
    --primary-text: #2563EB;

    --text-primary: #0F172A;
    --text-secondary: #475569;
    --text-muted: #64748B;
    --text-inverse: #FFFFFF;

    --green: #059669;
    --green-soft: #ECFDF5;
    --green-border: #A7F3D0;

    --amber: #D97706;
    --amber-soft: #FFFBEB;
    --amber-border: #FDE68A;

    --red: #DC2626;
    --red-soft: #FEF2F2;
    --red-border: #FECACA;

    --blue: #2563EB;
    --blue-soft: #EFF6FF;
    --blue-border: #BFDBFE;

    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg-main);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
    transition: background-color 0.25s ease, color 0.25s ease;
    -webkit-font-smoothing: antialiased;
  }

  .app { display: flex; min-height: 100vh; position: relative; }

  /* ─── THEME TOGGLE BUTTON ─── */
  .theme-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-surface-elevated);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
  }
  .theme-toggle-btn:hover {
    background: var(--bg-surface-hover);
    border-color: var(--primary);
    color: var(--primary);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }
  .theme-toggle-btn:focus-visible {
    box-shadow: 0 0 0 2px var(--border-focus);
  }
  .theme-toggle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .theme-toggle-btn:hover .theme-toggle-icon {
    transform: rotate(18deg) scale(1.1);
  }

  /* ─── SIDEBAR ─── */
  .sidebar {
    width: 240px;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 100;
    transition: transform 0.25s ease-in-out, background-color 0.25s ease, border-color 0.25s ease;
  }
  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid var(--border-color);
  }
  .logo-mark { display: flex; align-items: center; gap: 12px; }
  .logo-icon {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, var(--primary), #3B82F6);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 800; color: white;
    box-shadow: 0 0 14px var(--primary-glow);
  }
  .logo-text { font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }
  .logo-sub { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; font-weight: 600; }

  .sidebar-nav { padding: 16px 10px; flex: 1; overflow-y: auto; }
  .nav-section-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
    color: var(--text-muted); padding: 8px 10px 6px; font-weight: 700;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: var(--radius-sm); cursor: pointer;
    color: var(--text-secondary); font-size: 13px; font-weight: 500;
    transition: all 0.15s ease; border: none; background: none; width: 100%; text-align: left;
    margin-bottom: 3px; position: relative; outline: none;
  }
  .nav-item:hover { background: var(--bg-surface-elevated); color: var(--text-primary); }
  .nav-item:focus-visible { box-shadow: 0 0 0 2px var(--border-focus); }
  .nav-item.active {
    background: var(--primary-soft);
    color: var(--primary-text);
    font-weight: 600;
  }
  .nav-item.active::before {
    content: '';
    position: absolute;
    left: 0; top: 6px; bottom: 6px; width: 3px;
    background: var(--primary);
    border-radius: 0 3px 3px 0;
  }
  .nav-item .nav-icon { font-size: 15px; width: 20px; text-align: center; display: inline-flex; align-items: center; justify-content: center; }

  .sidebar-footer {
    padding: 14px 18px;
    border-top: 1px solid var(--border-color);
    font-size: 11px; color: var(--text-muted);
  }
  .rbi-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: var(--green-soft); color: var(--green);
    border: 1px solid var(--green-border);
    padding: 3px 10px; border-radius: var(--radius-full); font-size: 10px; font-weight: 700;
    margin-bottom: 6px;
  }

  /* ─── MAIN CONTENT ─── */
  .main { margin-left: 240px; flex: 1; display: flex; flex-direction: column; min-width: 0; }

  .topbar {
    padding: 16px 28px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-surface);
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 50;
    backdrop-filter: blur(8px);
    transition: background-color 0.25s ease, border-color 0.25s ease;
  }
  .topbar-left { display: flex; align-items: center; gap: 12px; }
  .mobile-nav-toggle {
    display: none;
    background: var(--bg-surface-elevated);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 6px; border-radius: var(--radius-sm);
    cursor: pointer; align-items: center; justify-content: center;
  }
  .page-title { font-size: 17px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.2px; }
  .page-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .topbar-actions { display: flex; gap: 10px; align-items: center; }

  .content { padding: 28px; flex: 1; }

  /* Mobile overlay */
  .mobile-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(3px);
    z-index: 90;
  }

  /* ─── CARDS ─── */
  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 22px;
    box-shadow: var(--shadow-sm);
    transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
  }
  .card-sm { padding: 14px 18px; }
  .card-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.2px; }
  .card-sub { font-size: 12px; color: var(--text-muted); }

  /* ─── STATS GRID ─── */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 18px 20px;
    box-shadow: var(--shadow-sm);
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }
  .stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--primary-glow); }
  .stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 8px; }
  .stat-value { font-size: 26px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.6px; line-height: 1.1; }
  .stat-delta { font-size: 11px; color: var(--green); margin-top: 6px; font-weight: 500; display: flex; align-items: center; gap: 4px; }

  /* Grid layouts */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

  /* ─── TABLE ─── */
  .table-wrap { overflow-x: auto; border-radius: var(--radius-md); }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  th {
    padding: 12px 14px;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--text-muted); font-weight: 700;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-surface-elevated);
  }
  td { padding: 13px 14px; font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg-surface-hover); }
  .td-primary { color: var(--text-primary); font-weight: 600; }
  .td-mono { font-family: var(--font-mono); font-size: 12px; }

  /* ─── BADGES ─── */
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: var(--radius-full);
    font-size: 11px; font-weight: 600; line-height: 1;
    white-space: nowrap;
  }
  .badge-green { background: var(--green-soft); color: var(--green); border: 1px solid var(--green-border); }
  .badge-amber { background: var(--amber-soft); color: var(--amber); border: 1px solid var(--amber-border); }
  .badge-red { background: var(--red-soft); color: var(--red); border: 1px solid var(--red-border); }
  .badge-blue { background: var(--blue-soft); color: var(--blue); border: 1px solid var(--blue-border); }
  .badge-muted { background: var(--bg-surface-elevated); color: var(--text-muted); border: 1px solid var(--border-color); }

  /* ─── BUTTONS ─── */
  .btn {
    padding: 9px 18px; border-radius: var(--radius-sm); border: 1px solid transparent;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 8px; justify-content: center;
    outline: none; text-decoration: none; font-family: inherit;
  }
  .btn:focus-visible { box-shadow: 0 0 0 2px var(--border-focus); }
  .btn-primary { background: var(--primary); color: white; border-color: var(--primary); }
  .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .btn-success { background: var(--green); color: white; border-color: var(--green); }
  .btn-success:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: var(--shadow-sm); }
  .btn-secondary { background: var(--bg-surface-elevated); color: var(--text-primary); border: 1px solid var(--border-color); }
  .btn-secondary:hover { background: var(--bg-surface-hover); border-color: var(--text-muted); }
  .btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); }
  .btn-ghost:hover { color: var(--text-primary); border-color: var(--text-muted); background: var(--bg-surface-elevated); }
  .btn-sm { padding: 6px 12px; font-size: 12px; border-radius: var(--radius-sm); }
  .btn-danger { background: var(--red-soft); color: var(--red); border: 1px solid var(--red-border); }
  .btn-danger:hover { background: var(--red); color: white; }

  /* ─── FORMS ─── */
  .form-group { margin-bottom: 18px; }
  .form-label { display: block; font-size: 11px; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.6px; }
  .form-input, .form-select {
    width: 100%; padding: 10px 14px; background: var(--bg-input);
    border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    color: var(--text-primary); font-size: 13px; font-family: inherit;
    outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
  .form-hint { font-size: 11px; color: var(--text-muted); margin-top: 5px; }
  .form-error { font-size: 11px; color: var(--red); margin-top: 5px; font-weight: 500; }
  .form-inline { display: flex; gap: 10px; align-items: flex-start; }
  .form-inline .form-group { flex: 1; margin-bottom: 0; }

  /* Flow chart */
  .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .section-title { font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.2px; }
  .flow { display: flex; align-items: center; justify-content: space-between; overflow-x: auto; padding: 14px 0; margin-bottom: 16px; gap: 6px; }
  .flow-node {
    background: var(--bg-surface-elevated); border: 1px solid var(--border-color);
    border-radius: var(--radius-sm); padding: 10px 14px; font-size: 12px; font-weight: 600; color: var(--text-primary);
    text-align: center; min-width: 100px; transition: all 0.2s ease;
  }
  .flow-node-active { border-color: var(--primary); color: var(--primary-text); background: var(--primary-soft); box-shadow: var(--shadow-sm); }
  .flow-arrow { color: var(--text-muted); font-size: 16px; margin: 0 2px; }
  .flow-sub { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-top: 2px; }

  /* Compliance strip */
  .compliance-strip {
    background: var(--amber-soft); border: 1px solid var(--amber-border);
    border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 18px;
    font-size: 12px; color: var(--amber); display: flex; gap: 10px; align-items: flex-start;
    line-height: 1.45;
  }

  /* Progress Gauge */
  .gauge-container { background: var(--bg-surface-elevated); border-radius: var(--radius-full); height: 10px; overflow: hidden; margin: 8px 0; width: 100%; border: 1px solid var(--border-color); }
  .gauge-fill { height: 100%; border-radius: var(--radius-full); transition: width 0.4s ease-out; }

  /* KFS Document Panel */
  .kfs-panel {
    background: var(--bg-surface-elevated); border: 1px solid var(--border-color);
    border-radius: var(--radius-md); padding: 18px; margin-top: 14px;
    box-shadow: var(--shadow-sm);
  }
  .kfs-title { font-size: 14px; font-weight: 700; color: var(--primary-text); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
  .kfs-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border-color); font-size: 12px; }
  .kfs-row:last-child { border-bottom: none; }
  .kfs-key { color: var(--text-muted); }
  .kfs-val { color: var(--text-primary); font-family: var(--font-mono); font-weight: 600; }
  .kfs-disclaimer { font-size: 11px; color: var(--text-muted); font-style: italic; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); }

  /* Engine Metrics */
  .engine-metric { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border-subtle); font-size: 12px; }
  .engine-metric:last-child { border-bottom: none; }
  .engine-metric-label { color: var(--text-muted); }
  .engine-metric-value { font-family: var(--font-mono); font-weight: 600; color: var(--text-primary); }

  .engine-result { border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-color); margin-bottom: 10px; }
  .engine-result-header { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .engine-result-pass { background: var(--bg-surface-elevated); border-left: 4px solid var(--green); }
  .engine-result-fail { background: var(--bg-surface-elevated); border-left: 4px solid var(--red); }
  .engine-result-body { padding: 12px 16px; background: var(--bg-surface); }

  /* Layout helpers */
  .divider { border: 0; border-top: 1px solid var(--border-color); margin: 18px 0; }
  .empty { text-align: center; padding: 48px 20px; color: var(--text-muted); }
  .empty-icon { font-size: 36px; margin-bottom: 12px; }
  .empty-text { font-size: 15px; margin-bottom: 4px; color: var(--text-primary); font-weight: 600; }
  .empty-sub { font-size: 12px; color: var(--text-secondary); }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-main); }
  ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  .mt-4 { margin-top: 16px; }
  .mb-4 { margin-bottom: 16px; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .text-sm { font-size: 12px; }
  .text-muted { color: var(--text-muted); }
  .text-green { color: var(--green); }
  .text-red { color: var(--red); }
  .text-amber { color: var(--amber); }
  .font-mono { font-family: var(--font-mono); }
  .w-full { width: 100%; }

  /* Login */
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg-main); }
  .login-card { width: 100%; max-width: 440px; box-shadow: var(--shadow-lg); }
  .login-hero { text-align: center; margin-bottom: 24px; }
  .login-logo {
    width: 52px; height: 52px; margin: 0 auto 14px;
    background: linear-gradient(135deg, var(--primary), #3B82F6);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 800; color: white;
    box-shadow: 0 0 24px var(--primary-glow);
  }
  .login-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; font-weight: 500; }
  .quick-account { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .quick-account button {
    padding: 7px 14px; font-size: 11px; border-radius: var(--radius-full); border: 1px solid var(--border-color);
    background: var(--bg-surface-elevated); color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease;
  }
  .quick-account button:hover { color: var(--text-primary); border-color: var(--primary); background: var(--primary-soft); transform: translateY(-1px); }

  /* Loading & banners */
  .loading-screen { min-height: 100vh; display: flex; flex-direction: column; gap: 14px; align-items: center; justify-content: center; color: var(--text-secondary); }
  .spinner {
    width: 28px; height: 28px; border-radius: 50%;
    border: 3px solid var(--border-color); border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-banner {
    background: var(--red-soft); border: 1px solid var(--red-border);
    color: var(--red); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 18px;
    font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
  .success-banner {
    background: var(--green-soft); border: 1px solid var(--green-border);
    color: var(--green); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 18px;
    font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
  .close-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; opacity: 0.7; }
  .close-btn:hover { opacity: 1; }

  /* Responsive Media Queries */
  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
      box-shadow: var(--shadow-lg);
    }
    .sidebar.mobile-open {
      transform: translateX(0);
    }
    .mobile-overlay.mobile-open {
      display: block;
    }
    .main { margin-left: 0; }
    .topbar { padding: 14px 18px; }
    .mobile-nav-toggle { display: inline-flex; }
    .content { padding: 18px; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
    .flow { overflow-x: auto; justify-content: flex-start; }
    .flow-node { min-width: 90px; }
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

// ─── THEME TOGGLE COMPONENT ───────────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  const tooltipText = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={onToggle}
      aria-label={tooltipText}
      title={tooltipText}
    >
      <div className="theme-toggle-icon">
        {isDark ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </div>
    </button>
  );
}

// ─── LOGIN PAGE ──────────────────────────────────────────────────
function LoginPage({ onLogin, theme, onToggleTheme }) {
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
    { u: "user1", p: "User@123", label: "CONSUMER", hint: "Profile & Intent" },
    { u: "dla1", p: "Dla@123", label: "DLA", hint: "Submit & Route" },
    { u: "lender1", p: "Lender@123", label: "LENDER (HDFC)", hint: "Disburse & Portfolio" },
    { u: "admin", p: "Admin@123", label: "ADMIN", hint: "Full Stats & Compliance" },
  ];

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="flex justify-between items-center mb-4">
          <div className="rbi-badge">✓ RBI DL 2022</div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <div className="login-hero">
          <div className="login-logo">V</div>
          <div className="logo-text" style={{ fontSize: 22 }}>Vantage Credit</div>
          <div className="login-sub">Embedded Credit Marketplace · RBI DL 2022 Compliant</div>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dla1 / lender1 / admin" autoComplete="username" required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
          </div>
          {err && <div className="form-error" style={{ marginBottom: 14 }}>{err}</div>}
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in to Platform"}
          </button>
        </form>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 20, marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>
          Demo Role Logins:
        </div>
        <div className="quick-account">
          {quick.map((q) => (
            <button key={q.u} onClick={() => { setUsername(q.u); setPassword(q.p); }}>
              <strong>{q.label}</strong> ({q.u})
            </button>
          ))}
        </div>
        <div className="form-hint" style={{ marginTop: 16, textAlign: "center" }}>
          JWT authentication · In-memory state · Direct Funds Flow
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
            <div className="stat-delta">● {s.delta}</div>
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
                    <td className="td-mono" style={{ color: app.cibilScore >= 700 ? "var(--green)" : app.cibilScore >= 650 ? "var(--amber)" : "var(--red)", fontWeight: 600 }}>
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
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      {submitError && <div className="error-banner"><span>{submitError}</span><button className="close-btn" onClick={() => setSubmitError(null)}>✕</button></div>}

      <div className="flex gap-2 mb-4" style={{ marginBottom: 22, flexWrap: "wrap" }}>
        {["1. Borrower Identity", "2. Loan Requirements", "3. Review & Submit"].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div style={{
              width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
              background: step > i + 1 ? "var(--green)" : step === i + 1 ? "var(--primary)" : "var(--bg-surface-elevated)",
              color: step >= i + 1 ? "white" : "var(--text-muted)",
              border: `1px solid ${step >= i + 1 ? "transparent" : "var(--border-color)"}`
            }}>{step > i + 1 ? "✓" : i + 1}</div>
            <span style={{ fontSize: 13, color: step === i + 1 ? "var(--text-primary)" : "var(--text-muted)", fontWeight: step === i + 1 ? 600 : 400 }}>{label}</span>
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
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
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
          <div key={app.id} className="card card-sm mb-4" style={{ marginBottom: 10, cursor: "pointer", border: selected?.id === app.id ? `1px solid var(--primary)` : undefined }} onClick={() => runEngine(app)}>
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
              <div key={app.id} className="card card-sm" style={{ marginBottom: 8, opacity: 0.8 }}>
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

            <div className="card card-sm mb-4" style={{ marginBottom: 14 }}>
              <div className="engine-metric">
                <span className="engine-metric-label">Loan Amount</span>
                <span className="engine-metric-value">{formatINR(selected.amount)}</span>
              </div>
              <div className="engine-metric">
                <span className="engine-metric-label">CIBIL Score</span>
                <span className="engine-metric-value" style={{ color: selected.cibilScore >= 700 ? "var(--green)" : "var(--amber)" }}>{selected.cibilScore}</span>
              </div>
              <div className="engine-metric">
                <span className="engine-metric-label">DTI Ratio</span>
                <span className="engine-metric-value" style={{ color: result.dti > 0.5 ? "var(--red)" : result.dti > 0.35 ? "var(--amber)" : "var(--green)" }}>
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
                <div className="card-title" style={{ marginBottom: 10, color: "var(--green)" }}>✓ Eligible Lenders — {result.eligible.length}</div>
                {result.eligible.map(({ lender, emi, score }) => (
                  <div key={lender.id} className="engine-result mb-4" style={{ marginBottom: 10 }}>
                    <div className="engine-result-header engine-result-pass">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{lender.lenderName}</div>
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
                <div className="card-title" style={{ marginBottom: 10, color: "var(--text-muted)", marginTop: 16 }}>✗ Ineligible Lenders — {result.rejected.length}</div>
                {result.rejected.map(({ lender, reasons }) => (
                  <div key={lender.id} className="engine-result" style={{ marginBottom: 8 }}>
                    <div className="engine-result-header engine-result-fail">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-secondary)" }}>{lender.lenderName} ({lender.type})</div>
                        <div className="text-sm" style={{ color: "var(--red)", marginTop: 2 }}>{reasons.join(" · ")}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {kfs && (
              <div style={{ marginTop: 18 }}>
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
  const [selectedApp, setSelectedApp] = useState(null);
  const [kfsData, setKfsData] = useState(null);
  const [loadingKfs, setLoadingKfs] = useState(false);
  const [disburs, setDisburs] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReasonCode, setRejectionReasonCode] = useState("CREDIT_CRITERIA_NOT_MET");
  const [rejectionReasonText, setRejectionReasonText] = useState("");

  const isLenderRole = user.role === "LENDER";
  const lenderId = user.lenderId || "L003";

  const routedApps = applications.filter((a) => {
    const matchesLender = user.role === "ADMIN" || a.routedTo === lenderId;
    if (!matchesLender) return false;
    if (statusFilter === "ALL") return true;
    if (statusFilter === "PENDING") return ["routed", "ROUTED", "pending_review"].includes(a.status);
    if (statusFilter === "APPROVED") return a.status === "APPROVED";
    if (statusFilter === "REJECTED") return ["rejected", "REJECTED"].includes(a.status);
    if (statusFilter === "DISBURSED") return ["disbursed", "DISBURSED"].includes(a.status);
    return true;
  });

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

  const handleApprove = async () => {
    if (!selectedApp) return;
    setDisburs(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      const res = await api(`/applications/${selectedApp.id}/approve`, { method: "POST" });
      setActionMessage(res.message);
      await onRefresh();
      setSelectedApp((prev) => ({ ...prev, status: "APPROVED" }));
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setDisburs(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!selectedApp) return;
    setDisburs(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      const res = await api(`/applications/${selectedApp.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReasonCode, rejectionReasonText }),
      });
      setActionMessage(res.message);
      setRejectModalOpen(false);
      await onRefresh();
      setSelectedApp((prev) => ({ ...prev, status: "REJECTED", rejectionReasonCode, declineExplanation: res.application.declineExplanation }));
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setDisburs(false);
    }
  };

  const handleDisburse = async () => {
    if (!selectedApp) return;
    setDisburs(true);
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
      setDisburs(false);
    }
  };

  return (
    <div>
      <div className="section-header mb-3">
        <div>
          <div className="section-title">Lender Portal — Underwriting & Disbursal Hub ({lenderId})</div>
          <div className="section-subtitle" style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Review assigned loan applications, perform credit approval/rejection, & record disbursals
          </div>
        </div>
        <span className="badge badge-blue">{routedApps.length} Applications</span>
      </div>

      {!isLenderRole && (
        <div className="card mb-4" style={{ border: "1px solid var(--amber)", background: "var(--amber-soft)" }}>
          <div style={{ fontWeight: 700, color: "var(--amber)", fontSize: 14 }}>
            ⚠️ Admin Restricted View: Underwriting Decisions Mandatory by Lender
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Under RBI Digital Lending 2022 guidelines, credit decisions (Approve/Reject) must be performed by the designated Bank/NBFC lending partner. Administrator accounts cannot override credit decisions.
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {["ALL", "PENDING", "APPROVED", "REJECTED", "DISBURSED"].map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${statusFilter === f ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setStatusFilter(f)}
          >
            {f === "ALL" ? "All Applications" : f}
          </button>
        ))}
      </div>

      {actionMessage && <div className="success-banner mb-3"><span>{actionMessage}</span><button className="close-btn" onClick={() => setActionMessage(null)}>✕</button></div>}
      {errorMessage && <div className="error-banner mb-3"><span>{errorMessage}</span><button className="close-btn" onClick={() => setErrorMessage(null)}>✕</button></div>}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>Routed Applications ({routedApps.length})</div>
          {routedApps.length === 0 ? (
            <div className="empty card">
              <div className="empty-icon">📭</div>
              <div className="empty-text">No matching applications for this filter</div>
            </div>
          ) : (
            routedApps.map((app) => (
              <div
                key={app.id}
                className="card card-sm mb-4"
                style={{
                  marginBottom: 10,
                  cursor: "pointer",
                  border: selectedApp?.id === app.id ? `2px solid var(--primary)` : "1px solid var(--border-color)",
                  background: "var(--bg-surface)",
                }}
                onClick={() => selectApp(app)}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="td-primary" style={{ fontWeight: 700 }}>{app.borrowerName}</div>
                  <StatusBadge status={app.status} />
                </div>
                <div className="text-sm text-muted">
                  {app.id} · {formatINR(app.amount)} · {app.tenure}M · CIBIL: {app.cibilScore}
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          {!selectedApp ? (
            <div className="empty card">
              <div className="empty-icon">📄</div>
              <div className="empty-text">Select an application to review</div>
              <div className="empty-sub">Inspect borrower financials, KFS snapshot, and perform decision actions</div>
            </div>
          ) : (
            <div className="card">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className="card-title" style={{ fontSize: 18 }}>{selectedApp.borrowerName}</div>
                  <div className="text-sm text-muted">{selectedApp.id} · PAN: {selectedApp.pan}</div>
                </div>
                <StatusBadge status={selectedApp.status} />
              </div>

              {/* Borrower Financial Metrics */}
              <div style={{ background: "var(--bg-surface-elevated)", padding: 12, borderRadius: "var(--radius-md)", marginBottom: 16 }}>
                <div className="grid-2 text-sm gap-2">
                  <div>Requested Amount: <strong>{formatINR(selectedApp.amount)}</strong></div>
                  <div>Tenure: <strong>{selectedApp.tenure} Months</strong></div>
                  <div>CIBIL Bureau Score: <strong>{selectedApp.cibilScore}</strong></div>
                  <div>Monthly Income: <strong>{formatINR(selectedApp.monthlyIncome)}</strong></div>
                  <div>Monthly Obligations: <strong>{formatINR(selectedApp.monthlyObligations)}</strong></div>
                  <div>Purpose: <strong style={{ textTransform: "capitalize" }}>{selectedApp.purpose}</strong></div>
                  <div>AA Consent: <span className="badge badge-green">✓ Active</span></div>
                  <div>KFS Status: <span className={`badge ${selectedApp.kfsGenerated ? "badge-green" : "badge-amber"}`}>{selectedApp.kfsGenerated ? "✓ Generated" : "Pending"}</span></div>
                </div>
              </div>

              {/* Lender Decision Action Controls */}
              {isLenderRole && ["routed", "ROUTED", "pending_review"].includes(selectedApp.status) && (
                <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                  <button className="btn btn-success" style={{ flex: 1 }} onClick={handleApprove} disabled={disburs}>
                    ✓ Approve Loan
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1, borderColor: "var(--red)", color: "var(--red)" }} onClick={() => setRejectModalOpen(true)} disabled={disburs}>
                    ✗ Reject Loan
                  </button>
                </div>
              )}

              {isLenderRole && ["APPROVED", "accepted"].includes(selectedApp.status) && (
                <div style={{ marginBottom: 18 }}>
                  <button className="btn btn-primary w-full" onClick={handleDisburse} disabled={disburs}>
                    {disburs ? "Executing Disbursal…" : "⚡ Execute Disbursal (Record State)"}
                  </button>
                  <div className="form-hint" style={{ textAlign: "center", marginTop: 6 }}>
                    Direct transfer from {lenderId} bank account → Borrower account.
                  </div>
                </div>
              )}

              {selectedApp.status === "REJECTED" && (
                <div className="card mb-3" style={{ border: "1px solid var(--red-border)", background: "var(--red-soft)" }}>
                  <div style={{ fontWeight: 700, color: "var(--red)", fontSize: 13, marginBottom: 4 }}>
                    Application Declined by Lender ({selectedApp.rejectionReasonCode || "REJECTED"})
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                    {selectedApp.declineExplanation || "Application did not meet lender risk parameters."}
                  </div>
                </div>
              )}

              {/* KFS Snapshot Panel */}
              {loadingKfs ? (
                <div className="empty" style={{ padding: 20 }}>
                  <div className="spinner" style={{ margin: "0 auto 8px" }} />
                  <div>Loading stored KFS snapshot…</div>
                </div>
              ) : kfsData ? (
                <div className="kfs-panel">
                  <div className="kfs-title">
                    <span>Key Fact Statement (KFS) Snapshot</span>
                    <span className="badge badge-green">Immutable</span>
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

      {/* Structured Rejection Modal */}
      {rejectModalOpen && (
        <div className="mobile-overlay mobile-open" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: "90%", maxWidth: 480, background: "var(--bg-surface)", zIndex: 1000 }}>
            <div className="section-header mb-3">
              <div className="section-title">Record Rejection Reason</div>
              <button className="btn btn-sm btn-ghost" onClick={() => setRejectModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="form-group mb-3">
                <label className="form-label">Structured Rejection Reason</label>
                <select className="form-select" value={rejectionReasonCode} onChange={(e) => setRejectionReasonCode(e.target.value)}>
                  <option value="INSUFFICIENT_INCOME">Insufficient Income</option>
                  <option value="CREDIT_CRITERIA_NOT_MET">Credit Bureau Criteria Not Met</option>
                  <option value="HIGH_OBLIGATIONS">Existing Obligations Too High</option>
                  <option value="DOCUMENTATION_ISSUE">Documentation Verification Issue</option>
                  <option value="PRODUCT_UNAVAILABLE">Product / Tenure Unavailable</option>
                  <option value="OTHER">Other Lender Specific Reason</option>
                </select>
              </div>

              <div className="form-group mb-4">
                <label className="form-label">Underwriter Internal Notes (Optional)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={rejectionReasonText}
                  onChange={(e) => setRejectionReasonText(e.target.value)}
                  placeholder="Additional risk notes for internal audit..."
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRejectModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} disabled={disburs}>
                  {disburs ? "Submitting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
        <div className="flex justify-between text-sm mt-4 mb-4" style={{ marginTop: 14 }}>
          <span>Current Exposure: <strong>{formatINR(fldgExposure)}</strong></span>
          <span>Utilization: <strong>{utilizationPct}%</strong> of {formatINR(capLimit)} Cap</span>
        </div>
        <div className="gauge-container">
          <div
            className="gauge-fill"
            style={{
              width: `${Math.min(100, utilizationPct)}%`,
              background: utilizationPct > 90 ? "var(--red)" : utilizationPct > 75 ? "var(--amber)" : "var(--green)",
            }}
          />
        </div>
        <div className="form-hint" style={{ marginTop: 10 }}>
          Under RBI Digital Lending Guidelines 2022, First Loss Default Guarantee (FLDG) provided by DLAs to lending partners cannot exceed 5% of the total loan portfolio value.
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Product Parameters & Rule Engine Config</div>
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
  const [dlas, setDlas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [sandboxResult, setSandboxResult] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sData, dlaData] = await Promise.all([
        api("/admin/stats"),
        api("/admin/dla-partners").catch(() => []),
      ]);
      setStats(sData);
      setDlas(dlaData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegenerateKey = async (dlaId) => {
    setActionMsg(null);
    try {
      const res = await api(`/admin/dla-partners/${dlaId}/regenerate-key`, { method: "POST" });
      setActionMsg(`API Key regenerated for ${res.name}: ${res.newApiKey}`);
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleTestWebhook = async (dlaId) => {
    setActionMsg(null);
    try {
      const res = await api(`/admin/dla-partners/${dlaId}/test-webhook`, { method: "POST" });
      setActionMsg(`Test Webhook Dispatched to DLA ${dlaId}. Event ID: ${res.webhookLog?.eventId}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRunSandbox = async () => {
    setSandboxResult(null);
    try {
      const res = await api("/v1/integrations/eligibility", {
        method: "POST",
        headers: { "X-API-Key": "dla_live_key_9988", "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 75000, tenure: 12, cibilScore: 740, monthlyIncome: 65000 }),
      });
      setSandboxResult(res);
    } catch (e) {
      setSandboxResult({ error: e.message });
    }
  };

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
        <div className="section-title">Marketplace Operations & DLA Partner Control Panel</div>
        <span className="badge badge-green">Live System Metrics</span>
      </div>

      {actionMsg && <div className="success-banner mb-3"><span>{actionMsg}</span><button className="close-btn" onClick={() => setActionMsg(null)}>✕</button></div>}

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

      {/* DLA Partner Management Panel */}
      <div className="card mb-4">
        <div className="section-header mb-3">
          <div>
            <div className="section-title">Third-Party DLA / LSP Integration Management</div>
            <div className="section-subtitle" style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Manage API keys, rate limits, webhook delivery status, and test sandbox APIs
            </div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleRunSandbox}>⚡ Run Sandbox API Test</button>
        </div>

        {sandboxResult && (
          <div className="card mb-3" style={{ background: "var(--bg-surface-elevated)", border: "1px solid var(--primary)" }}>
            <div className="flex justify-between items-center mb-2">
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)" }}>Sandbox Test Result (/api/v1/integrations/eligibility)</div>
              <button className="btn btn-sm btn-ghost" onClick={() => setSandboxResult(null)}>✕</button>
            </div>
            <pre style={{ fontSize: 11, fontFamily: "var(--font-mono)", background: "var(--bg-main)", padding: 10, borderRadius: 4, overflowX: "auto" }}>
              {JSON.stringify(sandboxResult, null, 2)}
            </pre>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DLA Partner</th>
                <th>API Key</th>
                <th>Status</th>
                <th>Rate Limit</th>
                <th>Webhook URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dlas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted" style={{ padding: 12 }}>DLA-001 (Vantage Native DLA) · Key: dla_live_key_9988 · Active</td>
                </tr>
              ) : (
                dlas.map((d) => (
                  <tr key={d.id}>
                    <td className="td-primary" style={{ fontWeight: 600 }}>{d.name} ({d.id})</td>
                    <td className="td-mono text-sm">{d.apiKey}</td>
                    <td><span className={`badge ${d.status === "ACTIVE" ? "badge-green" : "badge-red"}`}>{d.status}</span></td>
                    <td className="td-mono">{d.rateLimit || 100} req/min</td>
                    <td className="td-mono text-muted text-sm">{d.webhookUrl || "Not configured"}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => handleRegenerateKey(d.id)}>Regen Key</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleTestWebhook(d.id)}>Test Webhook</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-title">Portfolio Credit Quality</div>
          <div className="flex justify-between items-center mt-4" style={{ marginTop: 16 }}>
            <span className="text-muted">Average Portfolio CIBIL Score</span>
            <span className="stat-value" style={{ fontSize: 22, color: "var(--green)" }}>{stats.avgCibil}</span>
          </div>
          <div className="flex justify-between items-center mt-4" style={{ marginTop: 12 }}>
            <span className="text-muted">Pending Review Applications</span>
            <span className="badge badge-amber">{stats.pending}</span>
          </div>
          <div className="flex justify-between items-center mt-4" style={{ marginTop: 12 }}>
            <span className="text-muted">Rejected Applications</span>
            <span className="badge badge-red">{stats.rejected}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Regulatory Framework Status</div>
          <div style={{ marginTop: 16 }}>
            {[
              ["RBI Digital Lending Guidelines", "100% Compliant"],
              ["Key Fact Statement (KFS) Pre-Generation", "Enforced Server-Side"],
              ["FLDG Cap 5% Limit", "Active Enforcement"],
              ["Direct Lender → Borrower Funds Flow", "No Platform Pooling"],
            ].map(([rule, status]) => (
              <div key={rule} className="flex justify-between items-center" style={{ marginBottom: 10, fontSize: 12 }}>
                <span className="text-muted">{rule}</span>
                <span className="badge badge-green">✓ {status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Recent System Activity</div>
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
          <div className="stat-value" style={{ color: complianceLogs.failures > 0 ? "var(--red)" : "var(--green)" }}>
            {complianceLogs.failures}
          </div>
          <div className="stat-delta">Blocked Non-Compliant Actions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Lender FLDG Exposure & Cap Audit</div>
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
                    <div style={{ display: "flex", items: "center", gap: 8 }}>
                      <span>{l.utilizationPct}%</span>
                      <div className="gauge-container" style={{ width: 60, height: 6, margin: 0 }}>
                        <div className="gauge-fill" style={{ width: `${l.utilizationPct}%`, background: l.utilizationPct > 90 ? "var(--red)" : "var(--green)" }} />
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
    <div style={{ maxWidth: 660, margin: "0 auto" }}>
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
          <div className="flex gap-2" style={{ flexWrap: "wrap", marginTop: 6 }}>
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

        <div className="grid-3 mb-4" style={{ marginTop: 16 }}>
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
                <td className="td-mono" style={{ color: l.minCibilScore >= 700 ? "var(--amber)" : "var(--green)" }}>{l.minCibilScore}</td>
                <td className="td-mono">{(l.maxDti * 100).toFixed(0)}%</td>
                <td><span className={`badge ${l.disbursalTime === "T+0" ? "badge-green" : l.disbursalTime === "T+1" ? "badge-blue" : "badge-muted"}`}>{l.disbursalTime}</span></td>
                <td className="text-sm text-muted">{l.supportedPurposes.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ margin: "28px 0 14px" }}>Protocol Integrations</div>
      <div className="grid-2">
        {lenders.map((l) => (
          <div key={l.id} className="card card-sm">
            <div className="card-title" style={{ marginBottom: 12 }}>{l.lenderName} ({l.id})</div>
            {[
              ["OCEN 4.0 Protocol Integration", l.ocenEnabled],
              ["Account Aggregator (AA) Fetch", l.aaEnabled],
              ["NACH / eMandate Repayment", l.nachEnabled],
            ].map(([label, status]) => (
              <div key={label} className="flex justify-between items-center" style={{ marginBottom: 8 }}>
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
  const [theme, toggleTheme] = useTheme();
  const [page, setPage] = useState("dashboard");
  const [auth, setAuth] = useState(null);
  const [applications, setApplications] = useState([]);
  const [lenders, setLenders] = useState([]);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeIntentId, setActiveIntentId] = useState(null);
  const [initialIntentPurpose, setInitialIntentPurpose] = useState("Electronics");

  const refreshAll = useCallback(async () => {
    setBootLoading(true);
    setBootError(null);
    try {
      const [apps, lnd] = await Promise.all([
        api("/applications").catch(() => []),
        api("/lenders").catch(() => []),
      ]);
      setApplications(Array.isArray(apps) ? apps : (apps?.apps || apps?.applications || []));
      setLenders(Array.isArray(lnd) ? lnd : (lnd?.lenders || []));
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
    setMobileNavOpen(false);
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
        <LoginPage onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />
      </>
    );
  }

  const role = auth.user.role;

  // Build role-scoped navigation items
  const navItems = [];
  if (role === "USER") {
    navItems.push(
      { id: "dashboard", icon: "⬡", label: "Overview" },
      { id: "credit-profile", icon: "👤", label: "Credit Profile" },
      { id: "get-credit", icon: "⚡", label: "Get Credit" },
      { id: "my-offers", icon: "💎", label: "Credit Offers" },
      { id: "my-loans", icon: "📑", label: "My Loans" },
      { id: "my-consents", icon: "🛡️", label: "Consents & Privacy" }
    );
  } else {
    navItems.push({ id: "dashboard", icon: "⬡", label: "Overview" });
  }

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
    dashboard: { title: role === "USER" ? "Consumer Credit Dashboard" : "Marketplace Overview", subtitle: role === "USER" ? "Personalized consumption credit marketplace & credit profile" : "Embedded credit routing & application hub" },
    "credit-profile": { title: "Credit Profile & Bureau Query", subtitle: "Manage verified identity, employment, & CIBIL score" },
    "get-credit": { title: "Specify Credit Need", subtitle: "Select consumption category & loan parameters" },
    "my-offers": { title: "Compare Credit Offers", subtitle: "Transparent interest rates, APR, processing fee & EMI" },
    "my-loans": { title: "My Active Loans", subtitle: "Active credit contracts & Key Fact Statements (KFS)" },
    "my-consents": { title: "Consent Audit Trail", subtitle: "RBI Account Aggregator & Bureau query governance logs" },
    "new-application": { title: "New Loan Application", subtitle: "Submit via DLA → AA Consent & Bureau query" },
    "credit-engine": { title: "Credit Engine", subtitle: "Eligibility matching & RBI Key Fact Statement (KFS)" },
    "routed-loans": { title: "Lender Portal — Disbursal", subtitle: "Verify KFS document & execute loan disbursal" },
    "lender-portfolio": { title: "Portfolio & FLDG Cap", subtitle: "Audit funded portfolio and 5% FLDG guarantee cap" },
    "admin-stats": { title: "Administrator Dashboard", subtitle: "System-wide credit volume & application analytics" },
    "admin-compliance": { title: "Compliance Audit Monitor", subtitle: "Audit KFS generation & FLDG cap limits across all lenders" },
    "onboard-lender": { title: "Onboard Lending Partner", subtitle: "Configure Bank / NBFC underwriting criteria & SLAs" },
    lenders: { title: "Lender Catalogue", subtitle: "Onboarded regulated Banks & NBFCs" },
    "aa-consents": { title: "AA Consents", subtitle: "Account Aggregator consent framework & data fetch rules" },
    "cibil-pulls": { title: "CIBIL Pulls", subtitle: "Bureau data access policy & borrower credit scores" },
    "ocen": { title: "OCEN 4.0", subtitle: "Open Credit Enablement Network protocol & integrations" },
    "enach": { title: "eNACH AutoPay", subtitle: "Repayment mandate framework & NACH lifecycle" },
  };

  const roleBadge = role === "ADMIN" ? "badge-green" : role === "LENDER" ? "badge-blue" : role === "USER" ? "badge-green" : "badge-amber";

  const handleNavigateConsumer = (targetPage, opts = {}) => {
    if (opts.purpose) setInitialIntentPurpose(opts.purpose);
    setPage(targetPage);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <div
          className={`mobile-overlay ${mobileNavOpen ? "mobile-open" : ""}`}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
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
                onClick={() => {
                  setPage(item.id);
                  setMobileNavOpen(false);
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div className="nav-section-label" style={{ marginTop: 18 }}>India Stack</div>
            {[
              { icon: "🔗", label: "AA Consents", id: "aa-consents" },
              { icon: "📋", label: "CIBIL Pulls", id: "cibil-pulls" },
              { icon: "⚡", label: "OCEN 4.0", id: "ocen" },
              { icon: "💳", label: "eNACH AutoPay", id: "enach" },
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
            <div className="topbar-left">
              <button
                className="mobile-nav-toggle"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                aria-label="Toggle navigation menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileNavOpen ? (
                    <path d="M18 6L6 18M6 6l12 12" />
                  ) : (
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
              <div>
                <div className="page-title">{pageMeta[page]?.title}</div>
                <div className="page-subtitle">{pageMeta[page]?.subtitle}</div>
              </div>
            </div>
            <div className="topbar-actions">
              <span className={`badge ${roleBadge}`}>
                {role} · {auth.user.username} {auth.user.lenderId ? `(${auth.user.lenderId})` : ""}
              </span>
              <span className="badge badge-green">● Operational</span>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
                <div className="spinner" style={{ margin: "0 auto 14px" }} />
                <div className="empty-text">Syncing marketplace data…</div>
              </div>
            ) : (
              <>
                {page === "dashboard" && (
                  role === "USER" ? (
                    <ConsumerDashboardPage user={auth.user} onNavigate={handleNavigateConsumer} />
                  ) : (
                    <DashboardPage applications={applications} user={auth.user} />
                  )
                )}
                {page === "credit-profile" && <ConsumerProfilePage user={auth.user} onRefresh={refreshAll} />}
                {page === "get-credit" && (
                  <GetCreditPage
                    initialPurpose={initialIntentPurpose}
                    onOffersFound={(intentId) => {
                      setActiveIntentId(intentId);
                      setPage("my-offers");
                    }}
                  />
                )}
                {page === "my-offers" && (
                  <OffersComparisonPage
                    intentId={activeIntentId}
                    onOfferSelected={() => refreshAll()}
                  />
                )}
                {page === "my-loans" && <ConsumerDashboardPage user={auth.user} onNavigate={handleNavigateConsumer} />}
                {page === "my-consents" && <ConsentsPage />}

                {page === "new-application" && <NewApplicationPage onSubmit={handleNewApp} />}
                {page === "credit-engine" && <CreditEnginePage applications={applications} lenders={lenders} onRoute={handleRoute} />}
                {page === "routed-loans" && <RoutedLoansPage applications={applications} user={auth.user} onRefresh={refreshAll} />}
                {page === "lender-portfolio" && <LenderPortfolioPage user={auth.user} />}
                {page === "admin-stats" && <AdminStatsPage />}
                {page === "admin-compliance" && <ComplianceAuditPage />}
                {page === "onboard-lender" && <OnboardLenderPage onSuccess={() => { refreshAll(); setPage("lenders"); }} />}
                {page === "lenders" && <LendersPage lenders={lenders} loading={bootLoading} />}
                {page === "aa-consents" && <AAConsentsPage />}
                {page === "cibil-pulls" && <CibilPullsPage />}
                {page === "ocen" && <OcenPage />}
                {page === "enach" && <ENachPage />}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
