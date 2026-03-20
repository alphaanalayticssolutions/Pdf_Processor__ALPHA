'use client';
import { useState, useEffect } from 'react';
import QCBadge from "@/components/QCBadge";
import { useDownloadsStore, base64ToBlob, FILE_SIZE_LIMITS } from '@/stores/downloadsStore';
import DownloadsDashboard, { DownloadsBell, DownloadsToast } from '@/components/DownloadsDashboard';

const VALID_USERS = [
  { email: 'akshitapal80@alphaanalyticssol.com', password: 'Alpha@2024' },
  { email: 'krishna@alphaanalyticssol.com',      password: 'Alpha@2024' },
  { email: 'ashutosh@alphaanalyticssol.com',     password: 'Alpha@2024' },
  { email: 'info@alphaanalyticssol.com',         password: 'Alpha@2024' },
  { email: 'careers@alphaanalyticssol.com',      password: 'Alpha@2024' },
  { email: 'neelima@alphaanalyticssol.com',      password: 'Alpha@2024' },
];
const COMPANY_DOMAIN = '@alphaanalyticssol.com';

// ── File size guard (prevents Vercel timeout before job even starts) ───────────
function checkSizeLimit(toolName, files) {
  const limit = FILE_SIZE_LIMITS[toolName];
  if (!limit) return null;
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    const totalMB = (total / (1024 * 1024)).toFixed(1);
    return `Total ${totalMB} MB exceeds ${limitMB} MB limit. Select fewer files at once.`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// SHARED STYLES
// ─────────────────────────────────────────────────────────────
const S = {
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '36px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#1a3c6e',
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: '20px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: '600',
  },
  sectionTitle: { color: '#1a3c6e', fontSize: '22px', margin: '0' },
  subText: { color: '#6b7280', fontSize: '13px', marginBottom: '24px', lineHeight: '1.6' },
  primaryBtn: (disabled) => ({
    width: '100%', padding: '14px',
    background: disabled ? '#d1d5db' : '#0f2444',
    color: disabled ? '#9ca3af' : 'white',
    border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700',
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
  }),
  successBtn: {
    width: '100%', padding: '14px', background: '#166534', color: 'white',
    border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
  },
  errorBox: {
    background: '#fff0f0', border: '1px solid #fecaca', borderRadius: '10px',
    padding: '12px 14px', marginBottom: '16px', color: '#dc2626', fontSize: '13px',
  },
  successBox: {
    background: '#f0fff4', border: '2px solid #4ade80', borderRadius: '12px', padding: '24px',
  },
  inputBase: {
    width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: '8px',
    fontSize: '14px', boxSizing: 'border-box', color: '#111827', outline: 'none', transition: 'border-color 0.15s',
  },
  label: {
    display: 'block', fontWeight: '600', color: '#374151', fontSize: '12px',
    letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '8px',
  },
};

// ─────────────────────────────────────────────────────────────
// UPLOAD DROP ZONE
// ─────────────────────────────────────────────────────────────
function UploadZone({ icon, title, subtitle, color = '#1a3c6e', accept, multiple, folder, onChange }) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '10px', padding: '24px 16px',
        background: hover ? `${color}08` : '#f8fafc',
        border: `2px dashed ${hover ? color : '#cbd5e1'}`,
        borderRadius: '12px', cursor: 'pointer', textAlign: 'center',
        transition: 'all 0.2s', minHeight: '110px',
      }}
    >
      <span style={{ fontSize: '28px', lineHeight: 1 }}>{icon}</span>
      <div>
        <div style={{ color, fontWeight: '700', fontSize: '13px' }}>{title}</div>
        {subtitle && <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '3px' }}>{subtitle}</div>}
      </div>
      <input type="file" multiple={multiple} accept={accept}
        {...(folder ? { webkitdirectory: 'true' } : {})}
        onChange={onChange} style={{ display: 'none' }} />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// FILE LIST
// ─────────────────────────────────────────────────────────────
function FileList({ files, selected, onToggle, iconFn }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
      {files.map((f, i) => {
        const isSelected = selected[f.name];
        const icon = iconFn ? iconFn(f.name) : '📄';
        return (
          <div key={f.name} onClick={() => onToggle(f.name)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: isSelected ? '#eff6ff' : i % 2 === 0 ? 'white' : '#fafafa', borderBottom: i < files.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer', minWidth: 0 }}>
            <div style={{ width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0, border: `2px solid ${isSelected ? '#1a3c6e' : '#d1d5db'}`, background: isSelected ? '#1a3c6e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isSelected && <span style={{ color: 'white', fontSize: '10px', fontWeight: '800' }}>✓</span>}
            </div>
            <span style={{ fontSize: '13px', color: isSelected ? '#1e40af' : '#4b5563', fontWeight: isSelected ? '600' : '400', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {icon} {f.name}
            </span>
            <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0, marginLeft: '4px' }}>{(f.size / 1024).toFixed(0)} KB</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FILE SELECTION PANEL
// ─────────────────────────────────────────────────────────────
function FileSelectionPanel({ files, selected, onToggle, onToggleAll, onClear, label, iconFn }) {
  const selectedFiles = files.filter(f => selected[f.name]);
  const allChecked = files.length > 0 && files.every(f => selected[f.name]);
  const someChecked = files.some(f => selected[f.name]);
  if (files.length === 0) return null;
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: '600', color: '#1a3c6e', fontSize: '13px' }}>
          {label || 'Files'} — <span style={{ color: '#6b7280' }}>{selectedFiles.length} of {files.length} selected</span>
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onToggleAll} style={{ background: 'none', border: '1px solid #1a3c6e', color: '#1a3c6e', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
            {allChecked ? 'Deselect All' : 'Select All'}
          </button>
          <button onClick={onClear} style={{ background: 'none', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>Clear</button>
        </div>
      </div>
      <FileList files={files} selected={selected} onToggle={onToggle} iconFn={iconFn} />
      {!someChecked && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>⚠️ Please select at least one file.</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOOL HEADER
// ─────────────────────────────────────────────────────────────
function ToolHeader({ step, icon, title, desc, badge }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={{ background: '#f0f4ff', color: '#1e40af', borderRadius: '8px', padding: '3px 10px', fontSize: '11px', fontWeight: '800', letterSpacing: '0.5px' }}>STEP {step}</span>
        <h2 style={S.sectionTitle}>{icon} {title}</h2>
        {badge && <span style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '700' }}>🤖 AI-Powered</span>}
      </div>
      <p style={S.subText}>{desc}</p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// STAT TILES
// ─────────────────────────────────────────────────────────────
function StatTiles({ stats }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: '10px', marginBottom: '16px' }}>
      {stats.map((s, i) => (
        <div key={i} style={{ background: s.bg || '#f8fafc', border: `1px solid ${s.border || '#e5e7eb'}`, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '26px', fontWeight: '800', color: s.color || '#1a3c6e' }}>{s.value}</div>
          <div style={{ color: s.labelColor || '#6b7280', fontSize: '11px', fontWeight: '600', marginTop: '3px' }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QUEUED BANNER — shows inside tool when job is in queue
// ─────────────────────────────────────────────────────────────
function QueuedBanner({ toolName, onOpenDownloads }) {
  const queue = useDownloadsStore(s => s.queue);
  const job   = queue.find(j => j.toolName === toolName && (j.status === 'waiting' || j.status === 'processing'));
  if (!job) return null;
  return (
    <div style={{ background: job.status === 'processing' ? 'linear-gradient(135deg,#1e1b4b,#312e81)' : '#fffbeb', border: `1px solid ${job.status === 'processing' ? 'transparent' : '#fde68a'}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
      <span style={{ fontSize: '22px', animation: 'qs-spin 1s linear infinite', display: 'inline-block' }}>
        {job.status === 'processing' ? '⟳' : '🕐'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: job.status === 'processing' ? 'white' : '#92400e' }}>
          {job.status === 'processing' ? '⏳ Processing in background…' : '🕐 Queued — waiting for previous job to finish'}
        </div>
        <div style={{ fontSize: '11px', color: job.status === 'processing' ? '#a5b4fc' : '#b45309', marginTop: '3px' }}>
          You can navigate away — your file will appear in Downloads Hub when ready.
        </div>
      </div>
      <button onClick={onOpenDownloads}
        style={{ padding: '7px 14px', background: job.status === 'processing' ? 'rgba(255,255,255,0.15)' : '#fef3c7', border: `1px solid ${job.status === 'processing' ? 'rgba(255,255,255,0.2)' : '#fde68a'}`, borderRadius: '8px', color: job.status === 'processing' ? 'white' : '#92400e', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>
        📥 View Hub
      </button>
      <style>{`@keyframes qs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN PAGE
// ─────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = () => {
    setError('');
    if (!email || !password) { setError('Please enter email and password.'); return; }
    if (!email.endsWith(COMPANY_DOMAIN)) { setError('Access restricted to Alpha Analytics Solutions employees only.'); return; }
    setLoading(true);
    setTimeout(() => {
      const user = VALID_USERS.find(u => u.email === email.toLowerCase().trim() && u.password === password);
      if (user) { onLogin(user.email); } else { setError('Invalid credentials. Please contact your administrator.'); }
      setLoading(false);
    }, 800);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0c1a30 0%, #0f2444 50%, #162d56 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ width: '64px', height: '64px', background: 'rgba(255,255,255,0.1)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 16px', border: '1px solid rgba(255,255,255,0.15)' }}>⚖️</div>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '30px', padding: '5px 18px', marginBottom: '12px' }}>
            <span style={{ color: '#94a3b8', fontSize: '10px', letterSpacing: '3px', fontWeight: '700' }}>LEGAL DOCUMENT PLATFORM</span>
          </div>
          <h1 style={{ color: '#f1f5f9', fontSize: '26px', fontWeight: '800', margin: '0 0 6px' }}>Alpha Analytics Solutions</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0' }}>Sign in with your company account</p>
        </div>
        <div style={{ background: 'white', borderRadius: '20px', padding: '36px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={S.label}>Company Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown} placeholder="yourname@alphaanalyticssol.com" style={S.inputBase} onFocus={e => e.target.style.borderColor = '#1a3c6e'} onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={S.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown} placeholder="Enter your password" style={{ ...S.inputBase, paddingRight: '46px' }} onFocus={e => e.target.style.borderColor = '#1a3c6e'} onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
              <button onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px', padding: 0 }}>{showPass ? '🙈' : '👁️'}</button>
            </div>
          </div>
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#dc2626', fontSize: '13px' }}>🔒 {error}</div>}
          <button onClick={handleLogin} disabled={loading} style={S.primaryBtn(loading)}>{loading ? '⏳ Signing in…' : '🔐 Sign In'}</button>
          <div style={{ marginTop: '20px', padding: '12px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: '11px', margin: '0', lineHeight: '1.6' }}>🔒 Access restricted to <strong style={{ color: '#475569' }}>@alphaanalyticssol.com</strong> accounts only.</p>
          </div>
        </div>
        <p style={{ textAlign: 'center', color: '#334155', fontSize: '11px', marginTop: '20px', letterSpacing: '1px' }}>© 2025 ALPHA ANALYTICS SOLUTIONS • CONFIDENTIAL</p>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP NAV BAR
// ─────────────────────────────────────────────────────────────
function StepNavBar({ tools, onSelect }) {
  const activeTools = tools.filter(t => t.active);
  const row1 = activeTools.slice(0, 5);
  const row2 = activeTools.slice(5);

  const StepChip = ({ t, isLast }) => {
    const [hover, setHover] = useState(false);
    return (
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <button onClick={() => onSelect(t.id)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '8px', background: hover ? '#1a3c6e' : '#f0f4ff', border: `1px solid ${hover ? '#1a3c6e' : '#dce6ff'}`, cursor: 'pointer', transition: 'all 0.15s', width: '100%', minWidth: 0 }}>
          <span style={{ background: hover ? 'rgba(255,255,255,0.2)' : '#1a3c6e', color: 'white', borderRadius: '6px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', flexShrink: 0 }}>{t.step}</span>
          <span style={{ color: hover ? 'white' : '#1a3c6e', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
        </button>
        {!isLast && <span style={{ color: '#c8d0dc', fontSize: '14px', flexShrink: 0, margin: '0 4px' }}>→</span>}
      </div>
    );
  };

  return (
    <div style={{ background: 'white', borderBottom: '1px solid #e8ecf0', padding: '10px 20px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {row1.map((t, i) => <StepChip key={t.id} t={t} isLast={i === row1.length - 1} />)}
        </div>
        {row2.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {row2.map((t, i) => <StepChip key={t.id} t={t} isLast={i === row2.length - 1} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HOME / DASHBOARD
// ─────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTool, setActiveTool] = useState(null);
  const [loggedIn, setLoggedIn]     = useState(false);
  const [userEmail, setUserEmail]   = useState('');
  const store = useDownloadsStore();

  // Init downloads store on login
  useEffect(() => {
    if (loggedIn) {
      store.init();
      store.requestNotificationPermission();
    }
  }, [loggedIn]);

  const handleLogin  = (email) => { setLoggedIn(true); setUserEmail(email); };
  const handleLogout = () => { setLoggedIn(false); setUserEmail(''); setActiveTool(null); };

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;

  const tools = [
    { id: 'duplicate',            step: 1,  icon: '📊', title: 'Duplicate Report',        desc: 'Scan folder → Find duplicates via SHA-256',           color: '#3b82f6', active: true  },
    { id: 'splitter',             step: 2,  icon: '✂️', title: 'PDF Splitter',             desc: 'Split statements — manually or AI-powered',           color: '#8b5cf6', active: true  },
    { id: 'categorise',           step: 3,  icon: '📂', title: 'Categorisation',           desc: 'AI sorts documents into 20 legal folders',            color: '#f59e0b', active: true  },
    { id: 'stamping',             step: 4,  icon: '📄', title: 'Bates Stamping',           desc: 'AI detects corner → stamps every page',               color: '#ef4444', active: true  },
    { id: 'extraction',           step: 5,  icon: '🔍', title: 'Extraction',               desc: 'Extract invoices, bank statements → Excel',           color: '#10b981', active: true  },
    { id: 'tracker',              step: 6,  icon: '📋', title: 'Statement Tracker',        desc: 'Unified month-wise tracker from extractions',         color: '#06b6d4', active: true  },
    { id: 'desc-categoriser',     step: 7,  icon: '🏷️', title: 'Desc. Categoriser',       desc: 'AI categorises transaction descriptions',             color: '#f97316', active: true  },
    { id: 'transaction-analysis', step: 8,  icon: '📈', title: 'Transaction Analysis',     desc: 'Account × Month pivot table + heatmap',               color: '#6366f1', active: true  },
    { id: 'qc-bank',              step: 9,  icon: '🔬', title: 'QC Bank Extraction',       desc: 'Validate Excel extraction against source PDFs',       color: '#14b8a6', active: true  },
    { id: 'indexing',             step: 10, icon: '📁', title: 'Indexing',                 desc: 'Coming soon',                                         color: '#9ca3af', active: false },
  ];

  return (
    <main style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ background: 'linear-gradient(135deg, #0c1a30 0%, #0f2444 60%, #162d56 100%)', padding: '44px 20px 36px', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '16px', right: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#64748b', fontSize: '12px' }}>{userEmail}</span>
          {/* ── Downloads Bell ── */}
          <DownloadsBell />
          <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
            Sign Out
          </button>
        </div>
        <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.08)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px' }}>⚖️</div>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '30px', padding: '5px 20px', marginBottom: '14px' }}>
          <span style={{ color: '#94a3b8', fontSize: '10px', letterSpacing: '3px', fontWeight: '700' }}>LEGAL DOCUMENT PLATFORM</span>
        </div>
        <h1 style={{ fontSize: '36px', fontWeight: '800', color: '#ffffff', margin: '0 0 10px', letterSpacing: '-0.5px' }}>Automate Your Legal Operations</h1>
        <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px', lineHeight: '1.6' }}>AI-powered document processing — follow the steps in order for best results</p>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '8px 20px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', letterSpacing: '1px', fontWeight: '600' }}>🔒 FILES PROCESSED IN MEMORY — NEVER STORED</span>
        </div>
      </div>

      {!activeTool && <StepNavBar tools={tools} onSelect={setActiveTool} />}

      {!activeTool && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {tools.map(tool => (
              <ToolCard key={tool.id} tool={tool} onSelect={() => tool.active && setActiveTool(tool.id)} />
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: '820px', margin: '0 auto', padding: activeTool ? '28px 20px' : '0' }}>
        {activeTool === 'duplicate'            && <DuplicateTool              onBack={() => setActiveTool(null)} />}
        {activeTool === 'splitter'             && <SplitterTool               onBack={() => setActiveTool(null)} />}
        {activeTool === 'categorise'           && <CategoriseTool             onBack={() => setActiveTool(null)} />}
        {activeTool === 'stamping'             && <StampingTool               onBack={() => setActiveTool(null)} />}
        {activeTool === 'extraction'           && <ExtractionTool             onBack={() => setActiveTool(null)} />}
        {activeTool === 'tracker'              && <StatementTrackerTool       onBack={() => setActiveTool(null)} />}
        {activeTool === 'desc-categoriser'     && <DescriptionCategoriserTool onBack={() => setActiveTool(null)} />}
        {activeTool === 'transaction-analysis' && <TransactionAnalysisTool    onBack={() => setActiveTool(null)} />}
        {activeTool === 'qc-bank'              && <QCBankExtractionTool       onBack={() => setActiveTool(null)} />}
      </div>

      <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8', fontSize: '11px', letterSpacing: '1px' }}>
        POWERED BY CLAUDE AI • ANTHROPIC
      </div>

      {/* ── Downloads Dashboard + Toast — always mounted after login ── */}
      <DownloadsDashboard />
      <DownloadsToast />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// TOOL CARD
// ─────────────────────────────────────────────────────────────
function ToolCard({ tool, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onSelect} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: 'white', borderRadius: '14px', padding: '22px 24px', cursor: tool.active ? 'pointer' : 'default', border: hover && tool.active ? `2px solid ${tool.color}` : '2px solid #e5e7eb', boxShadow: hover && tool.active ? `0 8px 24px ${tool.color}18` : '0 1px 4px rgba(0,0,0,0.06)', opacity: tool.active ? 1 : 0.45, transition: 'all 0.18s', position: 'relative', overflow: 'hidden' }}>
      {tool.active && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: tool.color, borderRadius: '14px 14px 0 0', opacity: hover ? 1 : 0.6, transition: 'opacity 0.18s' }} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '30px', lineHeight: 1 }}>{tool.icon}</span>
        {!tool.active && <span style={{ background: '#f3f4f6', color: '#9ca3af', borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '700' }}>SOON</span>}
      </div>
      <h3 style={{ color: '#0f172a', margin: '0 0 6px', fontSize: '15px', fontWeight: '700' }}>{tool.title}</h3>
      <p style={{ color: '#6b7280', fontSize: '12px', margin: '0', lineHeight: '1.6' }}>{tool.desc}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TRANSACTION ANALYSIS TOOL
// ─────────────────────────────────────────────────────────────
function TransactionAnalysisTool({ onBack }) {
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'transaction-analysis' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const loadFiles = (fileList) => {
    const valid = Array.from(fileList).filter(f => { const n = f.name.toLowerCase(); return (n.endsWith('.csv') || n.endsWith('.xlsx') || n.endsWith('.xls')) && f.size > 0; });
    setAllFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); valid.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelected(prev => { const u = { ...prev }; valid.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
  };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const toggleAll  = () => { const a = {}; allFiles.forEach(f => a[f.name] = !allChecked); setSelected(a); };
  const clearAll   = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const handleAnalyse = () => {
    if (selectedFiles.length === 0) { setError('Please select at least one file.'); return; }
    const sizeErr = checkSizeLimit('transaction-analysis', selectedFiles);
    if (sizeErr) { setError(sizeErr); return; }
    setError(''); setResult(null);
    const filesToProcess = [...selectedFiles];

    store.addJob({
      toolName:    'transaction-analysis',
      displayName: `Transaction Analysis (${filesToProcess.length} file${filesToProcess.length !== 1 ? 's' : ''})`,
      executeFn: async () => {
        const formData = new FormData();
        filesToProcess.forEach(f => formData.append('files', f));
        const res  = await fetch('/api/transaction-analysis', { method: 'POST', body: formData });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server error: ${res.status}`); }
        const data = await res.json();
        const blob = base64ToBlob(data.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { blob, fileName: data.fileName || 'Transaction_Analysis.xlsx', aiSummary: `Pivot across ${data.qcData?.accounts?.length || '?'} accounts`, category: 'Transaction Analysis', extra: data };
      },
      onSuccess: (result) => {
        const url = URL.createObjectURL(result.blob);
        setResult({ url, fileName: result.fileName, qcData: result.extra?.qcData || { fileCount: filesToProcess.length, accounts: [], flaggedTransfers: [] } });
      },
      onError: (err) => setError(err.message || 'Something went wrong.'),
    });
  };

  const handleDownload = () => { if (!result) return; const a = document.createElement('a'); a.href = result.url; a.download = result.fileName; a.click(); };
  const handleClear = () => { if (result?.url) URL.revokeObjectURL(result.url); clearAll(); };
  const iconFn = (name) => name.toLowerCase().endsWith('.csv') ? '📄' : '📊';

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={8} icon="📈" title="Transaction Analysis" desc="Upload a transaction dataset → Claude AI detects columns & builds pivot → Heatmap + AI insight report in Excel" badge />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <UploadZone icon="📁" title="Upload Folder" subtitle="All CSV / Excel files inside" folder multiple onChange={e => loadFiles(e.target.files)} />
        <UploadZone icon="📊" title="Upload Files" subtitle="Pick specific .csv / .xlsx files" color="#15803d" accept=".csv,.xlsx,.xls" multiple onChange={e => loadFiles(e.target.files)} />
      </div>
      <FileSelectionPanel files={allFiles} selected={selected} onToggle={n => setSelected(p => ({ ...p, [n]: !p[n] }))} onToggleAll={toggleAll} onClear={clearAll} label="Files" iconFn={iconFn} />
      {error && <div style={S.errorBox}>❌ {error}</div>}
      <QueuedBanner toolName="transaction-analysis" onOpenDownloads={store.openDashboard} />
      <button onClick={handleAnalyse} disabled={isQueued || selectedFiles.length === 0} style={{ ...S.primaryBtn(isQueued || selectedFiles.length === 0), marginBottom: '16px' }}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Processing…' : '🕐 Queued') : '📈 Generate Transaction Analysis'}
      </button>
      {result && (
        <div style={S.successBox}>
          <p style={{ color: '#166534', fontWeight: '700', fontSize: '15px', margin: '0 0 14px' }}>✅ Analysis Ready!</p>
          <button onClick={handleDownload} style={{ ...S.successBtn, marginBottom: '10px' }}>📥 Download Transaction_Analysis.xlsx</button>
          <QCBadge toolName="transaction-analysis" toolOutput={result.qcData} metadata={{}} />
          <button onClick={handleClear} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>↺ Analyse Another File</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STATEMENT TRACKER TOOL
// ─────────────────────────────────────────────────────────────
function StatementTrackerTool({ onBack }) {
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'tracker' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const loadFiles = (fileList) => {
    const excels = Array.from(fileList).filter(f => (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && f.size > 0);
    setAllFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); excels.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelected(prev => { const u = { ...prev }; excels.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
    setResult(null); setError('');
  };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const toggleAll = () => { const a = {}; allFiles.forEach(f => a[f.name] = !allChecked); setSelected(a); };
  const clearAll  = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const handleGenerate = () => {
    if (selectedFiles.length === 0) { setError('Please select at least one Excel file.'); return; }
    setError(''); setResult(null);
    const filesToProcess = [...selectedFiles];

    store.addJob({
      toolName:    'tracker',
      displayName: `Statement Tracker (${filesToProcess.length} files)`,
      executeFn: async () => {
        const fd = new FormData();
        filesToProcess.forEach(f => fd.append('excels', f));
        const res  = await fetch('/api/tracker', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const blob = base64ToBlob(data.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { blob, fileName: 'Statement_Tracker.xlsx', aiSummary: `${data.totalAccounts} accounts, ${data.totalMonths} months, ${data.totalGaps} gap${data.totalGaps !== 1 ? 's' : ''}`, category: 'Statement Tracker', extra: data };
      },
      onSuccess: (result) => setResult(result.extra),
      onError:   (err)    => setError(err.message),
    });
  };

  const handleDownload = () => {
    if (!result?.excelFile) return;
    const blob = base64ToBlob(result.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'Statement_Tracker.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={6} icon="📋" title="Statement Tracker" desc="Upload Bank Statement or Credit Card extraction Excels → AI normalizes data → Unified month-wise tracker generated" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <UploadZone icon="📁" title="Upload Folder" subtitle="All Excel files inside" folder multiple onChange={e => loadFiles(e.target.files)} />
        <UploadZone icon="📊" title="Upload Excel Files" subtitle=".xlsx or .xls files" color="#15803d" accept=".xlsx,.xls" multiple onChange={e => loadFiles(e.target.files)} />
      </div>
      <FileSelectionPanel files={allFiles} selected={selected} onToggle={n => setSelected(p => ({ ...p, [n]: !p[n] }))} onToggleAll={toggleAll} onClear={clearAll} label="Excel Files" iconFn={() => '📊'} />
      {error && <div style={S.errorBox}>❌ {error}</div>}
      <QueuedBanner toolName="tracker" onOpenDownloads={store.openDashboard} />
      <button onClick={handleGenerate} disabled={isQueued || selectedFiles.length === 0} style={{ ...S.primaryBtn(isQueued || selectedFiles.length === 0), marginBottom: '20px' }}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Generating tracker…' : '🕐 Queued') : `📋 Generate Tracker${selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : ''}`}
      </button>
      {result && (
        <div style={S.successBox}>
          <p style={{ color: '#166534', fontWeight: '700', fontSize: '15px', margin: '0 0 16px' }}>✅ Tracker Generated!</p>
          <StatTiles stats={[
            { value: result.totalBankAccounts ?? 0, label: '🏦 Bank Accounts', color: '#002060', bg: '#eff6ff', border: '#bfdbfe' },
            { value: result.totalCreditCards ?? 0, label: '💳 Credit Cards', color: '#6A0DAD', bg: '#faf5ff', border: '#e9d5ff' },
            { value: result.totalMonths, label: 'Months Covered', color: '#1a3c6e' },
            { value: result.totalGaps ?? 0, label: result.totalGaps > 0 ? '⚠️ Gaps' : 'Gaps (None)', color: result.totalGaps > 0 ? '#c62828' : '#6b7280', bg: result.totalGaps > 0 ? '#fef2f2' : '#f8fafc', border: result.totalGaps > 0 ? '#fca5a5' : '#e5e7eb' },
          ]} />
          <button onClick={handleDownload} style={{ ...S.successBtn, marginBottom: '10px' }}>📥 Download Statement Tracker (.xlsx)</button>
          <QCBadge toolName="tracker" toolOutput={{ gaps: result.totalGaps||0, totalMonths: result.totalMonths||0, totalBankAccounts: result.totalBankAccounts||0, totalCreditCards: result.totalCreditCards||0, missingMonths: result.missingMonths||[], duplicateAccounts: result.duplicateAccounts||[] }} metadata={{}} />
          <button onClick={clearAll} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>↺ Upload Another Set</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DESCRIPTION CATEGORISER TOOL
// ─────────────────────────────────────────────────────────────
function DescriptionCategoriserTool({ onBack }) {
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [progress, setProgress] = useState('');
  const [error, setError]       = useState('');
  const [results, setResults]   = useState([]);
  const [done, setDone]         = useState(false);
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'desc-categoriser' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const loadFiles = (fileList) => {
    const excels = Array.from(fileList).filter(f => (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && f.size > 0);
    setAllFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); excels.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelected(prev => { const u = { ...prev }; excels.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
    setResults([]); setDone(false); setError('');
  };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const toggleAll  = () => { const a = {}; allFiles.forEach(f => a[f.name] = !allChecked); setSelected(a); };
  const clearAll   = () => { setAllFiles([]); setSelected({}); setResults([]); setDone(false); setError(''); };

  const handleCategorise = async () => {
    if (selectedFiles.length === 0) { setError('Please select at least one Excel file.'); return; }
    setError(''); setResults([]); setDone(false);

    // Read Excel in browser first (this is client-side, not a job)
    try {
      setProgress('Loading Excel parser…');
      if (!window.XLSX) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Excel parser.'));
          document.head.appendChild(script);
        });
      }
      const XLSX = window.XLSX;
      const allDescriptions = new Set();
      for (const file of selectedFiles) {
        setProgress(`Reading ${file.name}…`);
        const buffer   = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          for (const row of rows) {
            const key = Object.keys(row).find(k => k.trim().toLowerCase() === 'description');
            if (key && row[key] && String(row[key]).trim() !== '') allDescriptions.add(String(row[key]).trim());
          }
        }
      }
      if (allDescriptions.size === 0) throw new Error('No "Description" column found.');
      setProgress('');
      const descArray = [...allDescriptions];

      store.addJob({
        toolName:    'desc-categoriser',
        displayName: `Desc. Categoriser (${descArray.length} descriptions)`,
        executeFn: async () => {
          const res  = await fetch('/api/categorise-descriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descriptions: descArray }) });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Categorisation failed');
          const csvRows = [['Description', 'Category'], ...data.results.map(r => [r.description, r.category])];
          const csvText = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob    = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8;' });
          return { blob, fileName: 'categorised_descriptions.csv', aiSummary: `${data.results.length} descriptions categorised`, category: 'Desc. Categoriser', extra: data };
        },
        onSuccess: (result) => { setResults(result.extra.results); setDone(true); },
        onError:   (err)    => setError(err.message),
      });

    } catch (err) { setError(err.message); setProgress(''); }
  };

  const downloadCSV = () => {
    const rows = [['Description', 'Category'], ...results.map(r => [r.description, r.category])];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'categorised_descriptions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={7} icon="🏷️" title="Description Categoriser" desc='Upload Excel files with a "Description" column → AI categorises each → Download CSV' badge />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <UploadZone icon="📁" title="Upload Folder" folder multiple onChange={e => loadFiles(e.target.files)} />
        <UploadZone icon="📊" title="Upload Excel Files" subtitle=".xlsx or .xls" color="#15803d" accept=".xlsx,.xls" multiple onChange={e => loadFiles(e.target.files)} />
      </div>
      <FileSelectionPanel files={allFiles} selected={selected} onToggle={n => setSelected(p => ({ ...p, [n]: !p[n] }))} onToggleAll={toggleAll} onClear={clearAll} label="Excel Files" iconFn={() => '📊'} />
      {error && <div style={S.errorBox}>❌ {error}</div>}
      <QueuedBanner toolName="desc-categoriser" onOpenDownloads={store.openDashboard} />
      <button onClick={handleCategorise} disabled={isQueued || selectedFiles.length === 0} style={{ ...S.primaryBtn(isQueued || selectedFiles.length === 0), marginBottom: '20px' }}>
        {isQueued ? (queue[0]?.status === 'processing' ? `⏳ ${progress || 'Processing…'}` : '🕐 Queued') : `🏷️ Categorise${selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : ''}`}
      </button>
      {done && results.length > 0 && (
        <div style={S.successBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ color: '#166534', fontWeight: '700', fontSize: '15px', margin: '0' }}>✅ {results.length} descriptions categorised!</p>
            <button onClick={downloadCSV} style={{ padding: '9px 18px', background: '#166534', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>⬇ Download CSV</button>
          </div>
          <QCBadge toolName="desc-categoriser" toolOutput={{ descriptions: results.map(r => ({ description: r.description, category: r.category, confidence: r.confidence || null })), semanticMismatches: [] }} metadata={{}} />
          <div style={{ border: '1px solid #86efac', borderRadius: '10px', overflow: 'hidden', maxHeight: '300px', overflowY: 'auto', marginTop: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: '#166534' }}>
                  {['#', 'Description', 'Category'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'white', fontWeight: '700' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f0fff4', borderBottom: '1px solid #dcfce7' }}>
                    <td style={{ padding: '8px 14px', color: '#9ca3af', fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ padding: '8px 14px', color: '#374151', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</td>
                    <td style={{ padding: '8px 14px' }}><span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '700' }}>{row.category}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={clearAll} style={{ width: '100%', marginTop: '12px', padding: '10px', background: 'transparent', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>↺ Upload Another File</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DUPLICATE REPORT TOOL
// ─────────────────────────────────────────────────────────────
function DuplicateTool({ onBack }) {
  const [files, setFiles]   = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'duplicate' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const handleFolderSelect = (e) => { setFiles(Array.from(e.target.files).filter(f => f.size > 0 && !f.name.startsWith('.'))); setResult(null); setError(''); };

  const hashFile = async (file) => {
    const buffer     = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async () => {
    if (files.length === 0) { setError('Please select a folder with files!'); return; }
    setError('');

    // Hash files client-side first (no size limit — just hashing)
    const fileData = [], hashMap = {};
    for (const file of files) {
      const hash = await hashFile(file);
      fileData.push({ fileName: file.name, hash, sizeKB: (file.size / 1024).toFixed(2) });
      if (!hashMap[hash]) hashMap[hash] = [];
      hashMap[hash].push(file.name);
    }
    const duplicates     = Object.entries(hashMap).filter(([, f]) => f.length > 1).map(([hash, f]) => ({ hash, files: f }));
    const duplicateCount = duplicates.reduce((acc, g) => acc + g.files.length - 1, 0);

    store.addJob({
      toolName:    'duplicate',
      displayName: `Duplicate Report (${files.length} files)`,
      executeFn: async () => {
        const res  = await fetch('/api/duplicate-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileData, hashMap, duplicateCount, duplicates }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        const blob = base64ToBlob(data.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { blob, fileName: 'duplicate_report.xlsx', aiSummary: `${data.uniqueFiles} unique, ${data.duplicateCount} duplicate${data.duplicateCount !== 1 ? 's' : ''} in ${data.totalFiles} files`, category: 'Duplicate Report', extra: data };
      },
      onSuccess: (result) => setResult(result.extra),
      onError:   (err)    => setError(err.message),
    });
  };

  const downloadExcel = () => {
    if (!result?.excelFile) return;
    const blob = base64ToBlob(result.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'duplicate_report.xlsx' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={1} icon="📊" title="Duplicate Report" desc="Scan folder → Find duplicates using SHA-256 hash → Download Excel report" />
      <UploadZone icon={files.length > 0 ? '✅' : '📂'} title={files.length > 0 ? `${files.length} files ready` : 'Click to select folder'} subtitle={files.length > 0 ? 'Click to change selection' : 'All file types supported'} color={files.length > 0 ? '#15803d' : '#1a3c6e'} folder multiple onChange={handleFolderSelect} />
      {error && <div style={{ ...S.errorBox, marginTop: '16px' }}>❌ {error}</div>}
      <QueuedBanner toolName="duplicate" onOpenDownloads={store.openDashboard} />
      <button onClick={handleSubmit} disabled={isQueued || files.length === 0} style={{ ...S.primaryBtn(isQueued || files.length === 0), marginTop: '20px' }}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Scanning files…' : '🕐 Queued') : '🔍 Generate Duplicate Report'}
      </button>
      {result?.success && (
        <div style={{ marginTop: '24px' }}>
          <StatTiles stats={[
            { value: result.totalFiles, label: 'Total Files', color: '#1a3c6e' },
            { value: result.uniqueFiles, label: 'Unique', color: '#15803d', bg: '#f0fff4', border: '#bbf7d0' },
            { value: result.duplicateCount, label: 'Duplicates', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          ]} />
          <button onClick={downloadExcel} style={S.successBtn}>⬇ Download Excel Report</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PDF SPLITTER TOOL
// ─────────────────────────────────────────────────────────────
function SplitterTool({ onBack }) {
  const [file, setFile]             = useState(null);
  const [docType, setDocType]       = useState('auto');
  const [splitMode, setSplitMode]   = useState('ai');
  const [splitPages, setSplitPages] = useState('');
  const [splitNames, setSplitNames] = useState('');
  const [result, setResult]         = useState(null);
  const [progress, setProgress]     = useState('');
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'splitter' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const handleSubmit = () => {
    if (!file) { alert('Please select a PDF!'); return; }
    setResult(null); setProgress('');
    const fileSnap = file;

    store.addJob({
      toolName:    'splitter',
      displayName: `PDF Splitter — ${fileSnap.name}`,
      executeFn: async () => {
        const formData = new FormData();
        formData.append('pdf', fileSnap); formData.append('docType', docType);
        formData.append('splitMode', splitMode); formData.append('splitPages', splitPages); formData.append('splitNames', splitNames);
        const res  = await fetch('/api/split-pdf', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Split failed');
        const blob = base64ToBlob(data.zipFile, 'application/zip');
        const summary = `${data.splitCount} documents${data.aiExplanation ? ': ' + data.aiExplanation.slice(0, 60) : ''}`;
        return { blob, fileName: 'split_documents.zip', aiSummary: summary, category: 'PDF Splitter', extra: data };
      },
      onSuccess: (result) => setResult(result.extra),
      onError:   (err)    => setProgress('Error: ' + err.message),
    });
  };

  const downloadZip = () => {
    if (!result?.zipFile) return;
    const blob = base64ToBlob(result.zipFile, 'application/zip');
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'split_documents.zip' }).click();
    URL.revokeObjectURL(url);
  };

  const ToggleGroup = ({ options, value, onChange, cols = 2 }) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px' }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          style={{ padding: '10px 8px', borderRadius: '8px', border: `2px solid ${value === opt.value ? '#1a3c6e' : '#e5e7eb'}`, background: value === opt.value ? '#eff6ff' : 'white', color: value === opt.value ? '#1a3c6e' : '#6b7280', fontSize: '12px', fontWeight: value === opt.value ? '700' : '400', cursor: 'pointer', transition: 'all 0.15s' }}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={2} icon="✂️" title="PDF Splitter" desc="Split bank statements, invoices & tax filings into separate documents" badge />
      <UploadZone icon={file ? '✅' : '📂'} title={file ? file.name : 'Click to select PDF'} subtitle={file ? 'Click to change' : 'Single .pdf file'} color={file ? '#15803d' : '#1a3c6e'} accept=".pdf" onChange={e => setFile(e.target.files[0])} />
      <div style={{ marginTop: '20px', marginBottom: '16px' }}>
        <label style={S.label}>Document Type</label>
        <ToggleGroup cols={4} value={docType} onChange={setDocType} options={[{ value: 'auto', label: '🤖 Auto' }, { value: 'bank', label: '🏦 Bank' }, { value: 'invoice', label: '🧾 Invoice' }, { value: 'tax', label: '📑 Tax' }]} />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={S.label}>How to Split?</label>
        <ToggleGroup value={splitMode} onChange={setSplitMode} options={[{ value: 'ai', label: '🤖 AI decides' }, { value: 'manual', label: '✏️ Manual pages' }]} />
      </div>
      {splitMode === 'manual' && (
        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="text" value={splitPages} onChange={e => setSplitPages(e.target.value)} placeholder="Split at pages: e.g. 4, 7, 9" style={S.inputBase} />
          <input type="text" value={splitNames} onChange={e => setSplitNames(e.target.value)} placeholder="Names: e.g. April, May, June" style={S.inputBase} />
        </div>
      )}
      <QueuedBanner toolName="splitter" onOpenDownloads={store.openDashboard} />
      <button onClick={handleSubmit} disabled={isQueued || !file} style={S.primaryBtn(isQueued || !file)}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Splitting…' : '🕐 Queued') : '✂️ Split PDF'}
      </button>
      {progress && <p style={{ textAlign: 'center', marginTop: '14px', color: '#6b7280', fontSize: '13px' }}>{progress}</p>}
      {result?.success && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
            <p style={{ color: '#166534', fontWeight: '700', margin: '0 0 10px' }}>✅ {result.splitCount} documents created</p>
            {result.documents.map((doc, i) => <p key={i} style={{ color: '#4b5563', fontSize: '13px', margin: '3px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {doc.name} ({doc.pages} pages)</p>)}
          </div>
          <button onClick={downloadZip} style={S.successBtn}>⬇ Download Split Documents (ZIP)</button>
          <QCBadge toolName="splitter" toolOutput={{ splits: result.documents.map(d => ({ name: d.name, pageCount: d.pages })), totalPages: result.totalPages || 0 }} metadata={{}} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CATEGORISATION TOOL
// ─────────────────────────────────────────────────────────────
const ALL_CATEGORIES = [
  { folder: '01_Bank_Statements', icon: '🏦' },      { folder: '02_Financial_Records', icon: '📊' },
  { folder: '03_Tax_Documents', icon: '🧾' },         { folder: '04_Invoices_And_Receipts', icon: '🧾' },
  { folder: '05_Contracts', icon: '📋' },              { folder: '06_Legal_Agreements', icon: '🤝' },
  { folder: '07_Corporate_Documents', icon: '🏢' },   { folder: '08_Correspondence', icon: '✉️' },
  { folder: '09_Court_Filings', icon: '⚖️' },         { folder: '10_Employment_Records', icon: '👤' },
  { folder: '11_Real_Estate_Documents', icon: '🏠' }, { folder: '12_Insurance_Documents', icon: '🛡️' },
  { folder: '13_Intellectual_Property', icon: '💡' }, { folder: '14_Regulatory_And_Compliance', icon: '📜' },
  { folder: '15_Loan_And_Credit', icon: '💳' },       { folder: '16_Client_And_Customer_Records', icon: '👥' },
  { folder: '17_Payment_Records', icon: '💸' },       { folder: '18_Digital_And_Electronic_Evidence', icon: '💻' },
  { folder: '19_Expert_Reports_And_Appraisals', icon: '🔬' }, { folder: '20_Miscellaneous_Uncategorized', icon: '📁' },
];

function ConfidenceBadge({ confidence }) {
  const map = { HIGH: { bg: '#dcfce7', color: '#166534', border: '#86efac' }, MEDIUM: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' }, LOW: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' } };
  const s = map[confidence] || map.LOW;
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '700' }}>{confidence || 'LOW'}</span>;
}

function CategoriseTool({ onBack }) {
  const [files, setFiles]             = useState([]);
  const [result, setResult]           = useState(null);
  const [progress, setProgress]       = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'categorise' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const handleFolderSelect = (e) => { setFiles(Array.from(e.target.files).filter(f => !f.name.startsWith('.') && f.size > 0)); setResult(null); setExpandedRow(null); };

  const handleSubmit = () => {
    if (files.length === 0) { alert('Please select a folder!'); return; }
    const sizeErr = checkSizeLimit('categorise', files);
    if (sizeErr) { setProgress('❌ ' + sizeErr); return; }
    setResult(null); setExpandedRow(null); setProgress('');
    const filesToProcess = [...files];

    store.addJob({
      toolName:    'categorise',
      displayName: `Categorisation (${filesToProcess.length} files)`,
      executeFn: async () => {
        const formData = new FormData();
        for (const f of filesToProcess) formData.append('files', f);
        const res  = await fetch('/api/categorise-pdf', { method: 'POST', body: formData });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('Server error: ' + text.slice(0, 150)); }
        if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong');
        const blob = base64ToBlob(data.zipFile, 'application/zip');
        return { blob, fileName: 'categorised_documents.zip', aiSummary: `${data.totalFiles} files → ${data.categoryCount} folder${data.categoryCount !== 1 ? 's' : ''}`, category: 'Categorisation', extra: data };
      },
      onSuccess: (result) => { setResult(result.extra); setProgress(''); },
      onError:   (err)    => setProgress('❌ Error: ' + err.message),
    });
  };

  const downloadZip = (zipData) => {
    const blob = base64ToBlob(zipData, 'application/zip');
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'categorised_documents.zip' }).click();
    URL.revokeObjectURL(url);
  };

  const getFolderIcon = (fn) => { const c = ALL_CATEGORIES.find(x => x.folder === fn); return c ? c.icon : '📁'; };

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={3} icon="📂" title="Categorisation" desc="Upload any file type → AI sorts into 20 legal category folders automatically" badge />
      <UploadZone icon={files.length > 0 ? '✅' : '📂'} title={files.length > 0 ? `${files.length} files selected` : 'Click to select folder'} subtitle={files.length > 0 ? 'Click to change' : 'All file types supported'} color={files.length > 0 ? '#15803d' : '#1a3c6e'} folder multiple onChange={handleFolderSelect} />
      <QueuedBanner toolName="categorise" onOpenDownloads={store.openDashboard} />
      <button onClick={handleSubmit} disabled={isQueued || files.length === 0} style={{ ...S.primaryBtn(isQueued || files.length === 0), marginTop: '20px' }}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Categorising with AI…' : '🕐 Queued') : '📂 Categorise Documents'}
      </button>
      {progress && <p style={{ textAlign: 'center', marginTop: '14px', color: '#6b7280', fontSize: '13px' }}>{progress}</p>}
      {result?.success && (
        <div style={{ marginTop: '28px' }}>
          <StatTiles stats={[
            { value: result.totalFiles, label: 'Total Files', color: '#1a3c6e' },
            { value: result.categoryCount, label: 'Folders Used', color: '#15803d', bg: '#f0fff4', border: '#bbf7d0' },
            { value: result.categorizationResults?.filter(r => r.confidence === 'LOW' || r.confidence === 'MEDIUM').length || 0, label: 'Flagged', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
          ]} />
          {result.categorizationResults?.length > 0 && (
            <div style={{ marginBottom: '20px', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
              {result.categorizationResults.map((r, i) => (
                <div key={i}>
                  <div onClick={() => setExpandedRow(expandedRow === i ? null : i)} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', padding: '10px 14px', background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getFolderIcon(r.assigned_folder)} {r.original_filename}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {r.assigned_folder}</div>
                    </div>
                    <ConfidenceBadge confidence={r.confidence} />
                    <span style={{ color: '#d1d5db', fontSize: '12px' }}>{expandedRow === i ? '▲' : '▼'}</span>
                  </div>
                  {expandedRow === i && r.notes && <div style={{ background: '#fffbeb', padding: '10px 14px', borderBottom: '1px solid #fde68a', fontSize: '12px', color: '#92400e' }}>⚠️ {r.notes}</div>}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => downloadZip(result.zipFile)} style={S.successBtn}>⬇ Download Categorised Folders (ZIP)</button>
          <QCBadge toolName="categorisation" toolOutput={{ files: (result.categorizationResults || []).map(r => ({ file: r.original_filename, folder: r.assigned_folder, confidence: r.confidence === 'HIGH' ? 0.9 : r.confidence === 'MEDIUM' ? 0.5 : 0.2, notes: r.notes })), semanticMismatches: [] }} metadata={{}} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BATES STAMPING TOOL
// ─────────────────────────────────────────────────────────────
function StampingTool({ onBack }) {
  const [allFiles, setAllFiles]         = useState([]);
  const [selected, setSelected]         = useState({});
  const [prefix, setPrefix]             = useState('DOC-');
  const [startNumber, setStartNumber]   = useState(1);
  const [padLength, setPadLength]       = useState(6);
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cornerPct, setCornerPct]       = useState(10);
  const [fontSize, setFontSize]         = useState(10);
  const [stampColor, setStampColor]     = useState('black');
  const [stampFont, setStampFont]       = useState('Helvetica');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState('');
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'bates-stamp' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const loadFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf') && f.size > 0);
    setAllFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); pdfs.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelected(prev => { const u = { ...prev }; pdfs.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
    setResult(null); setError('');
  };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const toggleAll  = () => { const a = {}; allFiles.forEach(f => a[f.name] = !allChecked); setSelected(a); };
  const clearAll   = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const handleSubmit = () => {
    if (selectedFiles.length === 0) { setError('Please select at least one PDF file.'); return; }
    const sizeErr = checkSizeLimit('bates-stamp', selectedFiles);
    if (sizeErr) { setError(sizeErr); return; }
    setError('');
    const filesToProcess = [...selectedFiles];
    const snapPrefix = prefix, snapStart = startNumber, snapPad = padLength, snapPassword = password;
    const snapCorner = cornerPct, snapFontSize = fontSize, snapColor = stampColor, snapFont = stampFont;

    store.addJob({
      toolName:    'bates-stamp',
      displayName: `Bates Stamping (${filesToProcess.length} PDFs)`,
      executeFn: async () => {
        const formData = new FormData();
        filesToProcess.forEach(f => formData.append('pdfs', f));
        formData.append('prefix', snapPrefix); formData.append('startNumber', snapStart);
        formData.append('padLength', snapPad); formData.append('password', snapPassword);
        formData.append('cornerPct', (snapCorner / 100).toString()); formData.append('fontSize', snapFontSize.toString());
        formData.append('stampColor', snapColor); formData.append('stampFont', snapFont);
        const res  = await fetch('/api/process-pdf', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong.');
        const blob = base64ToBlob(data.zipFile, 'application/zip');
        return { blob, fileName: `stamped_pdfs.zip`, aiSummary: `${data.processedCount} PDFs stamped, ${data.totalStampedPages} pages`, category: 'Bates Stamping', extra: data };
      },
      onSuccess: (result) => setResult(result.extra),
      onError:   (err)    => setError(err.message),
    });
  };

  const downloadZip = () => {
    if (!result?.zipFile) return;
    const blob = base64ToBlob(result.zipFile, 'application/zip');
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'stamped_pdfs.zip' }).click();
    URL.revokeObjectURL(url);
  };

  const buildQCData = () => {
    if (!result) return {};
    const stamped = result.processedCount || 0, totalPages = result.totalStampedPages || 0;
    const pad = Number(padLength) || 6, start = Number(startNumber) || 1;
    if (result.processedFiles?.length > 0) return { files: result.processedFiles.map(f => ({ name: f.name, batesNumber: f.batesStart, pages: f.pageCount || 0, position: f.position })), stampedCount: stamped, totalFiles: selectedFiles.length, totalStampedPages: totalPages, totalInputPages: totalPages };
    const ppp = stamped > 0 ? Math.round(totalPages / stamped) : 1;
    let cursor = start;
    const files = selectedFiles.slice(0, stamped).map(f => { const bn = prefix + String(cursor).padStart(pad, '0'); cursor += (ppp || 1); return { name: f.name, batesNumber: bn, pages: ppp || 1 }; });
    return { files, stampedCount: stamped, totalFiles: selectedFiles.length, totalStampedPages: totalPages, totalInputPages: totalPages };
  };

  const ToggleBtn = ({ val, cur, set, label }) => (
    <button onClick={() => set(val)} style={{ padding: '9px 8px', borderRadius: '8px', border: `2px solid ${cur === val ? '#1a3c6e' : '#e5e7eb'}`, background: cur === val ? '#eff6ff' : 'white', color: cur === val ? '#1a3c6e' : '#6b7280', fontSize: '12px', fontWeight: cur === val ? '700' : '400', cursor: 'pointer', transition: 'all 0.15s' }}>{label}</button>
  );

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={4} icon="📄" title="Bates Stamping" desc="Upload a folder or pick individual PDFs → AI detects best corner → Stamps every page sequentially" badge />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <UploadZone icon="📁" title="Upload Folder" subtitle="All PDFs inside" folder multiple onChange={e => loadFiles(e.target.files)} />
        <UploadZone icon="📄" title="Upload PDFs" subtitle="Pick specific .pdf files" color="#15803d" accept=".pdf" multiple onChange={e => loadFiles(e.target.files)} />
      </div>
      <FileSelectionPanel files={allFiles} selected={selected} onToggle={n => setSelected(p => ({ ...p, [n]: !p[n] }))} onToggleAll={toggleAll} onClear={clearAll} label="PDF Files" iconFn={() => '📄'} />
      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <label style={S.label}>PDF Password (optional)</label>
        <div style={{ position: 'relative' }}>
          <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="For encrypted PDFs only" style={{ ...S.inputBase, paddingRight: '46px' }} />
          <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px', padding: 0 }}>{showPassword ? '🙈' : '👁️'}</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div><label style={S.label}>Prefix</label><input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="DOC-" style={S.inputBase} /></div>
        <div><label style={S.label}>Start Number</label><input type="number" value={startNumber} onChange={e => setStartNumber(e.target.value)} style={S.inputBase} /></div>
        <div><label style={S.label}>Pad Length</label><input type="number" value={padLength} onChange={e => setPadLength(e.target.value)} style={S.inputBase} /></div>
      </div>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
        <span style={{ color: '#6b7280', fontSize: '12px' }}>Preview: </span>
        <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#1e40af', fontSize: '14px' }}>{prefix}{String(startNumber).padStart(Number(padLength), '0')}</span>
        <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '8px' }}>→ {prefix}{String(Number(startNumber) + Math.max(0, selectedFiles.length - 1)).padStart(Number(padLength), '0')} (est.)</span>
      </div>
      <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', color: '#6b7280', fontSize: '12px', cursor: 'pointer', marginBottom: '16px', width: '100%', textAlign: 'left' }}>
        {showAdvanced ? '▲' : '▼'} Advanced Settings
      </button>
      {showAdvanced && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div><label style={S.label}>Font Size: {fontSize}pt</label><input type="range" min="6" max="16" step="1" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#1a3c6e' }} /></div>
          <div><label style={S.label}>Stamp Color</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}><ToggleBtn val="black" cur={stampColor} set={setStampColor} label="⚫ Black" /><ToggleBtn val="red" cur={stampColor} set={setStampColor} label="🔴 Red" /></div></div>
          <div><label style={S.label}>Font</label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}><ToggleBtn val="Helvetica" cur={stampFont} set={setStampFont} label="Helvetica" /><ToggleBtn val="Courier" cur={stampFont} set={setStampFont} label="Courier" /><ToggleBtn val="Times" cur={stampFont} set={setStampFont} label="Times" /></div></div>
          <div><label style={S.label}>Corner Zone: {cornerPct}%</label><input type="range" min="5" max="15" step="1" value={cornerPct} onChange={e => setCornerPct(Number(e.target.value))} style={{ width: '100%', accentColor: '#1a3c6e' }} /><p style={{ color: '#9ca3af', fontSize: '11px', margin: '4px 0 0' }}>AI checks the outer {cornerPct}% of each corner for existing content.</p></div>
        </div>
      )}
      {error && <div style={S.errorBox}>❌ {error}</div>}
      <QueuedBanner toolName="bates-stamp" onOpenDownloads={store.openDashboard} />
      <button onClick={handleSubmit} disabled={isQueued || selectedFiles.length === 0} style={S.primaryBtn(isQueued || selectedFiles.length === 0)}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Stamping with AI…' : '🕐 Queued') : `🚀 Start Stamping${selectedFiles.length > 0 ? ` (${selectedFiles.length} PDF${selectedFiles.length !== 1 ? 's' : ''})` : ''}`}
      </button>
      {result?.success && (
        <div style={{ marginTop: '28px' }}>
          <StatTiles stats={[
            { value: result.processedCount, label: 'Stamped', color: '#15803d', bg: '#f0fff4', border: '#bbf7d0' },
            { value: (result.fallbackFiles?.length || 0) + (result.scannedPDFs?.length || 0), label: 'Warnings', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
            { value: result.skippedCount || 0, label: 'Skipped', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          ]} />
          {result.totalStampedPages > 0 && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1e40af' }}>📃 <strong>{result.totalStampedPages}</strong> pages stamped across {result.processedCount} files</div>}
          <button onClick={downloadZip} style={S.successBtn}>⬇ Download Stamped PDFs (ZIP)</button>
          <QCBadge toolName="bates-stamp" toolOutput={buildQCData()} metadata={{}} />
          <button onClick={clearAll} style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#1e40af', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>↺ Stamp Another Batch</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXTRACTION TOOL (router)
// ─────────────────────────────────────────────────────────────
function ExtractionTool({ onBack }) {
  const [activeType, setActiveType] = useState(null);
  if (activeType === 'invoice') return <InvoiceExtractTool onBack={() => setActiveType(null)} />;
  if (activeType === 'bank')    return <BankExtractTool    onBack={() => setActiveType(null)} />;
  if (activeType === 'tax')     return <TaxExtractTool     onBack={() => setActiveType(null)} />;

  const options = [
    { type: 'invoice', icon: '🧾', title: 'Structured Invoices', desc: 'Upload invoice folder → Specify fields → Extract data → Excel output', active: true },
    { type: 'bank',    icon: '🏦', title: 'Bank Statements',     desc: 'Upload folder → Select specific PDFs → Transactions extracted → Excel output', active: true },
    { type: 'tax',     icon: '📑', title: 'Tax Statements',      desc: 'Coming soon', active: false },
  ];

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={5} icon="🔍" title="Extraction" desc="Select the type of document you want to extract data from" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {options.map(opt => <ExtractionOptionCard key={opt.type} opt={opt} onSelect={() => opt.active && setActiveType(opt.type)} />)}
      </div>
    </div>
  );
}

function ExtractionOptionCard({ opt, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onSelect} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: hover && opt.active ? '#eff6ff' : '#f8fafc', borderRadius: '12px', padding: '20px 24px', cursor: opt.active ? 'pointer' : 'not-allowed', border: `2px solid ${hover && opt.active ? '#1a3c6e' : '#e5e7eb'}`, opacity: opt.active ? 1 : 0.5, transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '34px' }}>{opt.icon}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: '#0f172a', margin: '0 0 4px', fontSize: '15px', fontWeight: '700' }}>{opt.title}</h3>
          <p style={{ color: '#6b7280', fontSize: '12px', margin: '0' }}>{opt.desc}</p>
        </div>
        {opt.active ? <span style={{ color: '#1a3c6e', fontSize: '18px' }}>→</span> : <span style={{ background: '#e5e7eb', color: '#9ca3af', borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '700' }}>SOON</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INVOICE EXTRACTION TOOL
// ─────────────────────────────────────────────────────────────
function InvoiceExtractTool({ onBack }) {
  const [files, setFiles]     = useState([]);
  const [fields, setFields]   = useState('Invoice Date, Invoice Number, Customer Name, Vendor Name, Amount, Tax, Total Amount, Due Date');
  const [result, setResult]   = useState(null);
  const [progress, setProgress] = useState('');
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'extraction-invoice' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const handleFolderSelect = (e) => { setFiles(Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'))); };

  const handleSubmit = () => {
    if (files.length === 0) { alert('Please select a folder!'); return; }
    if (!fields.trim()) { alert('Please enter fields to extract!'); return; }
    const sizeErr = checkSizeLimit('extraction-invoice', files);
    if (sizeErr) { setProgress('❌ ' + sizeErr); return; }
    setResult(null); setProgress('');
    const filesToProcess = [...files];

    store.addJob({
      toolName:    'extraction-invoice',
      displayName: `Invoice Extraction (${filesToProcess.length} PDFs)`,
      executeFn: async () => {
        const formData = new FormData();
        for (const f of filesToProcess) formData.append('pdfs', f);
        formData.append('fields', fields);
        const res  = await fetch('/api/extract-invoice', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Extraction failed');
        const blob = base64ToBlob(data.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { blob, fileName: 'invoice_extraction.xlsx', aiSummary: `${data.successCount}/${data.totalFiles} invoices extracted`, category: 'Invoice Extraction', extra: data };
      },
      onSuccess: (result) => setResult(result.extra),
      onError:   (err)    => setProgress('Error: ' + err.message),
    });
  };

  const downloadExcel = () => {
    if (!result?.excelFile) return;
    const blob = base64ToBlob(result.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'invoice_extraction.xlsx' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Extraction</button>
      <ToolHeader step="5A" icon="🧾" title="Invoice Extraction" desc="Upload invoices folder → Specify fields → Extract → Excel output" badge />
      <UploadZone icon={files.length > 0 ? '✅' : '📂'} title={files.length > 0 ? `${files.length} invoice files ready` : 'Click to select folder'} subtitle={files.length > 0 ? 'Click to change' : 'PDF files only'} color={files.length > 0 ? '#15803d' : '#1a3c6e'} folder multiple onChange={handleFolderSelect} />
      <div style={{ marginTop: '20px', marginBottom: '20px' }}>
        <label style={S.label}>Fields to Extract</label>
        <textarea value={fields} onChange={e => setFields(e.target.value)} rows={3} placeholder="Invoice Date, Invoice Number, Customer Name, Amount…" style={{ ...S.inputBase, resize: 'vertical', lineHeight: '1.5' }} />
      </div>
      <QueuedBanner toolName="extraction-invoice" onOpenDownloads={store.openDashboard} />
      <button onClick={handleSubmit} disabled={isQueued || files.length === 0} style={S.primaryBtn(isQueued || files.length === 0)}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Extracting…' : '🕐 Queued') : '🔍 Extract Invoice Data'}
      </button>
      {progress && <p style={{ textAlign: 'center', marginTop: '14px', color: '#6b7280', fontSize: '13px' }}>{progress}</p>}
      {result?.success && (
        <div style={{ marginTop: '24px' }}>
          <StatTiles stats={[
            { value: result.totalFiles, label: 'Total', color: '#1a3c6e' },
            { value: result.successCount, label: 'Success', color: '#15803d', bg: '#f0fff4', border: '#bbf7d0' },
            { value: result.errorCount, label: 'Failed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          ]} />
          <button onClick={downloadExcel} style={S.successBtn}>⬇ Download Excel Report</button>
          <QCBadge toolName="extraction-invoice" toolOutput={{ invoices: result.invoices || [], summary: { totalFiles: result.totalFiles, successCount: result.successCount, errorCount: result.errorCount } }} metadata={{ pageCount: result.pageCount }} />
        </div>
      )}
      {result && !result.success && <div style={{ marginTop: '16px', ...S.errorBox }}>❌ Error: {result.error}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BANK STATEMENT EXTRACTION TOOL
// ─────────────────────────────────────────────────────────────
function BankExtractTool({ onBack }) {
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const store = useDownloadsStore();
  const queue = store.queue.filter(j => j.toolName === 'extraction-bank' && (j.status === 'waiting' || j.status === 'processing'));
  const isQueued = queue.length > 0;

  const loadFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    setAllFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); pdfs.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelected(prev => { const u = { ...prev }; pdfs.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
    setResult(null); setError('');
  };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const toggleAll  = () => { const a = {}; allFiles.forEach(f => a[f.name] = !allChecked); setSelected(a); };
  const clearAll   = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const handleExtract = () => {
    if (selectedFiles.length === 0) { setError('Please select at least one PDF.'); return; }
    const sizeErr = checkSizeLimit('extraction-bank', selectedFiles);
    if (sizeErr) { setError(sizeErr); return; }
    setError(''); setResult(null);
    const filesToProcess = [...selectedFiles];

    store.addJob({
      toolName:    'extraction-bank',
      displayName: `Bank Extraction (${filesToProcess.length} PDF${filesToProcess.length !== 1 ? 's' : ''})`,
      executeFn: async () => {
        const formData = new FormData();
        filesToProcess.forEach(f => formData.append('pdfs', f));
        const res  = await fetch('/api/extract-bank', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed.');
        const blob = base64ToBlob(data.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { blob, fileName: data.fileName || 'bank_extraction.xlsx', aiSummary: `${data.totalTransactions} transactions from ${data.totalFiles} statement${data.totalFiles !== 1 ? 's' : ''}`, category: 'Bank Extraction', extra: data };
      },
      onSuccess: (result) => setResult(result.extra),
      onError:   (err)    => setError(err.message),
    });
  };

  const handleDownload = () => {
    if (!result?.excelFile) return;
    const blob = base64ToBlob(result.excelFile, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = result.fileName || 'Bank_Statement_Extraction.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Extraction</button>
      <ToolHeader step="5B" icon="🏦" title="Bank Statement Extraction" desc="Upload folder or pick individual PDFs → check/uncheck → Extract → Excel" badge />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <UploadZone icon="📁" title="Upload Folder" subtitle="All PDF files inside" folder multiple onChange={e => loadFiles(e.target.files)} />
        <UploadZone icon="📄" title="Upload PDFs" subtitle="Pick specific .pdf files" color="#15803d" accept=".pdf" multiple onChange={e => loadFiles(e.target.files)} />
      </div>
      <FileSelectionPanel files={allFiles} selected={selected} onToggle={n => setSelected(p => ({ ...p, [n]: !p[n] }))} onToggleAll={toggleAll} onClear={clearAll} label="PDF Files" iconFn={() => '📄'} />
      {error && <div style={S.errorBox}>❌ {error}</div>}
      <QueuedBanner toolName="extraction-bank" onOpenDownloads={store.openDashboard} />
      <button onClick={handleExtract} disabled={isQueued || selectedFiles.length === 0} style={{ ...S.primaryBtn(isQueued || selectedFiles.length === 0), marginBottom: '20px' }}>
        {isQueued ? (queue[0]?.status === 'processing' ? '⏳ Extracting transactions…' : '🕐 Queued') : `🏦 Extract ${selectedFiles.length > 0 ? selectedFiles.length + ' ' : ''}Bank Statement${selectedFiles.length !== 1 ? 's' : ''}`}
      </button>
      {result && (
        <div style={S.successBox}>
          <p style={{ color: '#166534', fontWeight: '700', fontSize: '15px', margin: '0 0 16px' }}>✅ Extraction Complete!</p>
          <StatTiles stats={[
            { value: result.totalFiles, label: 'Files Processed', color: '#1a3c6e' },
            { value: result.totalTransactions, label: 'Transactions', color: '#15803d', bg: '#f0fff4', border: '#bbf7d0' },
          ]} />
          {result.summaries?.map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px', fontSize: '13px', border: '1px solid #e5e7eb' }}>
              <p style={{ fontWeight: '700', color: '#1a3c6e', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {s.file}</p>
              <p style={{ color: '#6b7280', margin: '0', fontSize: '12px' }}>{s.bank} • {s.account_holder} • {s.account_number} • {s.period} • {s.transaction_count} transactions</p>
            </div>
          ))}
          {result.reconciliation?.length > 0 && (
            <div style={{ marginBottom: '16px', marginTop: '4px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#1a3c6e', marginBottom: '10px' }}>🔍 AI Extraction Verification</div>
              {result.reconciliation.map((rec, i) => {
                const allMatch = rec.debitsMatch && rec.creditsMatch;
                const noData   = rec.pdfDebits == null && rec.pdfCredits == null;
                const bCol  = noData ? '#e5e7eb' : allMatch ? '#86efac' : '#fca5a5';
                const bgCol = noData ? '#f9fafb' : allMatch ? '#f0fff4' : '#fef2f2';
                return (
                  <div key={i} style={{ background: bgCol, border: `1.5px solid ${bCol}`, borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>📄 {rec.file.replace(/^.*[\\/]/, '')}</div>
                      <div style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', flexShrink: 0, background: noData ? '#f3f4f6' : allMatch ? '#dcfce7' : '#fee2e2', color: noData ? '#6b7280' : allMatch ? '#166534' : '#991b1b' }}>
                        {noData ? '— Not verified' : allMatch ? '✅ Totals match' : '❌ Mismatch found'}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {[
                        { label: 'TOTAL DEBITS',  match: rec.debitsMatch,  pdfVal: rec.pdfDebits,  rowVal: rec.rowDebits,  lbl: rec.debitLabel },
                        { label: 'TOTAL CREDITS', match: rec.creditsMatch, pdfVal: rec.pdfCredits, rowVal: rec.rowCredits, lbl: rec.creditLabel },
                      ].map((col) => (
                        <div key={col.label} style={{ background: col.match ? '#dcfce7' : col.pdfVal == null ? '#f3f4f6' : '#fee2e2', borderRadius: '8px', padding: '12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#6b7280', marginBottom: '6px', letterSpacing: '0.05em' }}>{col.label}</div>
                          <div style={{ fontSize: '20px', fontWeight: '800', marginBottom: '6px', color: col.match ? '#166534' : col.pdfVal == null ? '#9ca3af' : '#991b1b' }}>{col.match ? '✅' : col.pdfVal == null ? '—' : '❌'}</div>
                          <div style={{ fontSize: '12px', color: '#555', marginBottom: '2px' }}><span style={{ fontWeight: '600' }}>PDF: </span>{col.pdfVal != null ? `$${col.pdfVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span style={{ color: '#9ca3af' }}>Not found</span>}</div>
                          <div style={{ fontSize: '12px', color: '#555' }}><span style={{ fontWeight: '600' }}>Extracted: </span>${col.rowVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                          {!col.match && col.pdfVal != null && <div style={{ fontSize: '11px', color: '#991b1b', fontWeight: '700', marginTop: '4px' }}>Off by ${Math.abs(col.pdfVal - col.rowVal).toFixed(2)}</div>}
                          {col.lbl && <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>from: "{col.lbl}"</div>}
                        </div>
                      ))}
                    </div>
                    {noData && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '10px', textAlign: 'center' }}>Claude could not find summary totals in this PDF — verify manually</div>}
                    {!noData && !allMatch && <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fef2f2', borderRadius: '6px', fontSize: '12px', color: '#991b1b' }}>⚠️ Extraction totals do not match PDF summary — some transactions may be missing or duplicated.</div>}
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={handleDownload} style={S.successBtn}>📥 Download Excel File</button>
          <QCBadge toolName="extraction-bank" toolOutput={result.qcData || { statements: (result.summaries || []).map(s => ({ file: s.file, openingBalance: s.opening_balance || null, closingBalance: s.closing_balance || null, totalDebits: s.total_debits || null, totalCredits: s.total_credits || null, transactionCount: s.transaction_count || 0, periodStart: null, periodEnd: null })), transactions: [], dateGaps: [], amountOutliers: [] }} metadata={{ pageCount: result.pageCount }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAX STATEMENT — placeholder
// ─────────────────────────────────────────────────────────────
function TaxExtractTool({ onBack }) {
  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Extraction</button>
      <ToolHeader step="5C" icon="📑" title="Tax Statement Extraction" desc="Coming soon" />
      <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '24px', textAlign: 'center', marginTop: '8px' }}>
        <p style={{ fontSize: '32px', margin: '0 0 12px' }}>⏳</p>
        <p style={{ color: '#92400e', fontWeight: '700', fontSize: '15px', margin: '0 0 8px' }}>Coming Soon</p>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0' }}>Will be built after Invoice & Bank Statement extraction are complete.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QC BANK EXTRACTION TOOL — no change needed (no file download)
// ─────────────────────────────────────────────────────────────
function QCBankExtractionTool({ onBack }) {
  const [excelFiles, setExcelFiles]     = useState([]);
  const [pdfFiles, setPdfFiles]         = useState([]);
  const [selectedExcels, setSelExcels]  = useState({});
  const [selectedPDFs, setSelPDFs]      = useState({});
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [report, setReport]             = useState(null);
  const [expandedFile, setExpandedFile] = useState(null);

  const loadExcels = (fileList) => {
    const valid = Array.from(fileList).filter(f => (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls') || f.name.toLowerCase().endsWith('.csv')) && f.size > 0);
    setExcelFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); valid.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelExcels(prev => { const u = { ...prev }; valid.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
  };
  const loadPDFs = (fileList) => {
    const valid = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf') && f.size > 0);
    setPdfFiles(prev => { const m = new Map(prev.map(f => [f.name, f])); valid.forEach(f => m.set(f.name, f)); return Array.from(m.values()); });
    setSelPDFs(prev => { const u = { ...prev }; valid.forEach(f => { if (!(f.name in u)) u[f.name] = true; }); return u; });
  };

  const selExcelList = excelFiles.filter(f => selectedExcels[f.name]);
  const selPDFList   = pdfFiles.filter(f => selectedPDFs[f.name]);
  const canRun       = selExcelList.length > 0 && selPDFList.length > 0;
  const clearAll     = () => { setExcelFiles([]); setPdfFiles([]); setSelExcels({}); setSelPDFs({}); setReport(null); setError(''); setExpandedFile(null); };

  const handleRun = async () => {
    setLoading(true); setError(''); setReport(null);
    try {
      const fd = new FormData();
      selExcelList.forEach(f => fd.append('excels', f));
      selPDFList.forEach(f   => fd.append('pdfs',   f));
      const res  = await fetch('/api/qc-bank-extraction', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'QC failed');
      setReport(data);
      if (data.results?.length > 0) setExpandedFile(data.results[0].file);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const riskColor  = (r) => r === 'high' ? '#dc2626' : r === 'medium' ? '#d97706' : '#16a34a';
  const riskBg     = (r) => r === 'high' ? '#fef2f2' : r === 'medium' ? '#fffbeb' : '#f0fff4';
  const riskBorder = (r) => r === 'high' ? '#fca5a5' : r === 'medium' ? '#fde68a' : '#86efac';
  const riskIcon   = (r) => r === 'high' ? '🔴' : r === 'medium' ? '🟡' : '🟢';
  const riskLabel  = (r) => r === 'high' ? 'High — Not Reliable' : r === 'medium' ? 'Medium — Usable with Caution' : 'Low — Reliable';
  const statusIcon  = (s) => s === 'pass' ? '✅' : s === 'fail' ? '❌' : '⚠️';
  const statusColor = (s) => s === 'pass' ? '#166534' : s === 'fail' ? '#991b1b' : '#854d0e';
  const statusBg    = (s) => s === 'pass' ? '#dcfce7' : s === 'fail' ? '#fee2e2' : '#fef9c3';

  return (
    <div style={S.card}>
      <button onClick={onBack} style={S.backBtn}>← Back to Dashboard</button>
      <ToolHeader step={9} icon="🔬" title="QC Bank Extraction" desc="Upload extracted Excel + original PDF(s) → Validate accuracy → Full audit-ready QC report" badge />
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div><label style={S.label}>📊 Excel Files (Extracted Data)</label><UploadZone icon="📊" title="Upload Excel / CSV" subtitle=".xlsx, .xls, .csv" color="#1a3c6e" accept=".xlsx,.xls,.csv" multiple onChange={e => loadExcels(e.target.files)} /></div>
            {excelFiles.length > 0 && <FileList files={excelFiles} selected={selectedExcels} onToggle={n => setSelExcels(p => ({ ...p, [n]: !p[n] }))} iconFn={() => '📊'} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div><label style={S.label}>📄 Bank Statement PDFs (Ground Truth)</label><UploadZone icon="📄" title="Upload PDFs" subtitle="Original bank statement PDFs" color="#15803d" accept=".pdf" multiple onChange={e => loadPDFs(e.target.files)} /></div>
            {pdfFiles.length > 0 && <FileList files={pdfFiles} selected={selectedPDFs} onToggle={n => setSelPDFs(p => ({ ...p, [n]: !p[n] }))} iconFn={() => '📄'} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ flex: 1, background: 'white', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>📊</span>
            <div><div style={{ fontWeight: '700', fontSize: '14px', color: '#1a3c6e' }}>{selExcelList.length}</div><div style={{ fontSize: '11px', color: '#6b7280' }}>Excel selected</div></div>
          </div>
          <div style={{ flex: 1, background: 'white', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>📄</span>
            <div><div style={{ fontWeight: '700', fontSize: '14px', color: '#15803d' }}>{selPDFList.length}</div><div style={{ fontSize: '11px', color: '#6b7280' }}>PDFs selected</div></div>
          </div>
          <div style={{ flex: 2, background: canRun ? '#eff6ff' : '#f8fafc', borderRadius: '8px', padding: '10px 14px', border: `1px solid ${canRun ? '#bfdbfe' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>{canRun ? 'ℹ️' : '⚠️'}</span>
            <p style={{ margin: 0, fontSize: '11px', color: canRun ? '#1e40af' : '#9ca3af', lineHeight: '1.4' }}>{canRun ? 'Matching via File Name column. If none found, all rows matched to PDF.' : 'Upload at least 1 Excel and 1 PDF to run QC.'}</p>
          </div>
        </div>
      </div>
      {error && <div style={S.errorBox}>❌ {error}</div>}
      <button onClick={handleRun} disabled={loading || !canRun} style={{ ...S.primaryBtn(loading || !canRun), marginBottom: '8px' }}>
        {loading ? '⏳ Running QC validation…' : `🔬 Run QC Check (${selExcelList.length} Excel, ${selPDFList.length} PDF)`}
      </button>
      {report && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ background: riskBg(report.overallRisk), border: `2px solid ${riskBorder(report.overallRisk)}`, borderRadius: '14px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'white', border: `3px solid ${riskColor(report.overallRisk)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: riskColor(report.overallRisk), lineHeight: 1 }}>{report.overallScore ?? 100}%</span>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>QC Score</div>
                  <div style={{ fontSize: '17px', fontWeight: '800', color: riskColor(report.overallRisk) }}>{riskIcon(report.overallRisk)} {riskLabel(report.overallRisk)}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
                <div style={{ marginBottom: '4px' }}>{report.totalPDFs} PDF(s) · {report.totalExcels} Excel(s) · {report.totalRows} rows</div>
                <div style={{ color: report.totalFails > 0 ? '#dc2626' : '#16a34a', fontWeight: '700', fontSize: '13px' }}>{report.totalFails} fail(s) · {report.totalWarns} warning(s)</div>
              </div>
            </div>
          </div>
          {report.results.map((res) => (
            <div key={res.file} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
              <div onClick={() => setExpandedFile(expandedFile === res.file ? null : res.file)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#f8fafc', cursor: 'pointer', borderBottom: expandedFile === res.file ? '1px solid #e5e7eb' : 'none', gap: '12px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {res.file}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{res.bankName} • {res.accountHolder} • {res.statementPeriod} • {res.transactionRows} rows</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ background: 'white', color: riskColor(res.riskLevel), border: `2px solid ${riskColor(res.riskLevel)}`, borderRadius: '20px', padding: '3px 12px', fontSize: '13px', fontWeight: '900' }}>{res.score ?? '—'}%</span>
                  <span style={{ background: riskBg(res.riskLevel), color: riskColor(res.riskLevel), border: `1px solid ${riskBorder(res.riskLevel)}`, borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>{riskIcon(res.riskLevel)} {res.riskLevel.toUpperCase()}</span>
                  <span style={{ color: '#d1d5db', fontSize: '14px' }}>{expandedFile === res.file ? '▲' : '▼'}</span>
                </div>
              </div>
              {expandedFile === res.file && (
                <div style={{ padding: '20px' }}>
                  {res.insights.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ color: '#1a3c6e', fontSize: '11px', fontWeight: '800', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🔍 Insights</h4>
                      {res.insights.map((ins, i) => <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '12px', color: '#374151' }}><span style={{ color: '#6b7280' }}>›</span><span>{ins}</span></div>)}
                    </div>
                  )}
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ color: '#1a3c6e', fontSize: '11px', fontWeight: '800', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>📊 Core Validation</h4>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead><tr style={{ background: '#0f2444' }}>{['Check','Status','PDF','Excel','Details'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '11px' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {res.checks.map((c, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '9px 12px', color: '#374151', fontWeight: '600' }}>{c.type}</td>
                              <td style={{ padding: '9px 12px', textAlign: 'center' }}><span style={{ background: statusBg(c.status), color: statusColor(c.status), borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>{statusIcon(c.status)}</span></td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{c.pdfVal}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{c.excelVal}</td>
                              <td style={{ padding: '9px 12px', color: statusColor(c.status), fontStyle: 'italic', fontSize: '11px' }}>
                                {c.detail}
                                {c.errors?.map((e, ei) => <div key={ei} style={{ fontSize: '11px', color: '#991b1b', fontStyle: 'normal', marginTop: '2px' }}>Row {e.row} ({e.date}): expected ${e.expected}, found ${e.found}</div>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {res.txIssues.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ color: '#1a3c6e', fontSize: '11px', fontWeight: '800', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🔎 Transaction-Level Issues</h4>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead><tr style={{ background: '#0f2444' }}>{['Date','Description','Issue','Expected','Extracted'].map(h => <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'white', fontWeight: '700', fontSize: '11px' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {res.txIssues.map((t, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderTop: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px 12px', color: '#6b7280' }}>{t.date}</td>
                                <td style={{ padding: '8px 12px', color: '#374151', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                                <td style={{ padding: '8px 12px' }}><span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>{t.issue}</span></td>
                                <td style={{ padding: '8px 12px', color: '#166534', fontWeight: '600' }}>{t.expected}</td>
                                <td style={{ padding: '8px 12px', color: '#991b1b', fontWeight: '600' }}>{t.extracted}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {res.categoryChecks.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ color: '#1a3c6e', fontSize: '11px', fontWeight: '800', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>📂 Category-Level Mismatches</h4>
                      {res.categoryChecks.map((c, i) => <div key={i} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', fontSize: '12px' }}><strong>{c.label}:</strong> PDF ${c.pdfAmount.toFixed(2)} vs Excel ${c.extracted.toFixed(2)} — off by <strong style={{ color: '#dc2626' }}>${c.diff.toFixed(2)}</strong></div>)}
                    </div>
                  )}
                  {res.patterns.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ color: '#1a3c6e', fontSize: '11px', fontWeight: '800', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>⚠️ Pattern Analysis</h4>
                      {res.patterns.map((p, i) => <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '12px', color: '#92400e', background: '#fffbeb', borderRadius: '6px', padding: '8px 12px' }}><span>⚠</span><span>{p}</span></div>)}
                    </div>
                  )}
                  <div style={{ background: riskBg(res.riskLevel), border: `1px solid ${riskBorder(res.riskLevel)}`, borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
                    <h4 style={{ color: riskColor(res.riskLevel), fontSize: '11px', fontWeight: '800', margin: '0 0 6px', textTransform: 'uppercase' }}>🚨 Risk Level: {riskIcon(res.riskLevel)} {riskLabel(res.riskLevel)}</h4>
                    <p style={{ color: '#6b7280', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>
                      {res.riskLevel === 'high'   && 'Critical validation failures detected. Do not use for litigation or audit without re-extraction and manual verification.'}
                      {res.riskLevel === 'medium' && 'Some issues detected. Usable with caution — verify flagged items before relying on this data for formal analysis.'}
                      {res.riskLevel === 'low'    && 'All key validations passed. Data appears reliable for financial analysis and legal use.'}
                    </p>
                  </div>
                  <div>
                    <h4 style={{ color: '#1a3c6e', fontSize: '11px', fontWeight: '800', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>💡 Recommendations</h4>
                    {res.recommendations.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', fontSize: '12px', color: '#374151', background: '#eff6ff', borderRadius: '8px', padding: '10px 12px' }}>
                        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{i + 1}</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={clearAll} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#6b7280', cursor: 'pointer', fontSize: '13px', fontWeight: '600', marginTop: '8px' }}>
            ↺ Run Another QC Check
          </button>
        </div>
      )}
    </div>
  );
}