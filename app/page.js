'use client';
import { useState } from 'react'
import QCBadge from "@/components/QCBadge";

const VALID_USERS = [
  { email: 'akshitapal80@alphaanalyticssol.com', password: 'Alpha@2024' },
  { email: 'krishna@alphaanalyticssol.com',      password: 'Alpha@2024' },
  { email: 'ashutosh@alphaanalyticssol.com',     password: 'Alpha@2024' },
  { email: 'info@alphaanalyticssol.com',         password: 'Alpha@2024' },
  { email: 'careers@alphaanalyticssol.com',      password: 'Alpha@2024' },
  { email: 'neelima@alphaanalyticssol.com',      password: 'Alpha@2024' },
];
const COMPANY_DOMAIN = '@alphaanalyticssol.com';

// ─────────────────────────────────────────────────────────────
// LOGIN PAGE
// ─────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = () => {
    setError('');
    if (!email || !password) { setError('Please enter email and password.'); return; }
    if (!email.endsWith(COMPANY_DOMAIN)) {
      setError('Access restricted to Alpha Analytics Solutions employees only.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const user = VALID_USERS.find(u => u.email === email.toLowerCase().trim() && u.password === password);
      if (user) { onLogin(user.email); }
      else { setError('Invalid credentials. Please contact your administrator.'); }
      setLoading(false);
    }, 800);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <main style={{ minHeight: '100vh', background: '#0f2444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Segoe UI, Arial, sans-serif', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚖️</div>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', borderRadius: '30px', padding: '5px 18px', marginBottom: '12px' }}>
            <span style={{ color: 'white', fontSize: '11px', letterSpacing: '3px', fontWeight: '600' }}>LEGAL DOCUMENT PLATFORM</span>
          </div>
          <h1 style={{ color: '#f1f5f9', fontSize: '26px', fontWeight: '800', margin: '0 0 6px' }}>Alpha Analytics Solutions</h1>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0' }}>Sign in with your company account</p>
        </div>
        <div style={{ background: 'white', borderRadius: '16px', padding: '36px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#333', fontSize: '13px', marginBottom: '8px' }}>Company Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="yourname@alphaanalyticssol.com"
              style={{ width: '100%', padding: '12px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', color: '#333', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#1a3c6e'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: '600', color: '#333', fontSize: '13px', marginBottom: '8px' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Enter your password"
                style={{ width: '100%', padding: '12px 44px 12px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', color: '#333', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#1a3c6e'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              <button onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '16px' }}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {error && (
            <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>
              🔒 {error}
            </div>
          )}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: '100%', padding: '14px', background: loading ? '#888' : '#0f2444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? '⏳ Signing in...' : '🔐 Sign In'}
          </button>
          <div style={{ marginTop: '20px', padding: '12px', background: '#f7f8fc', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: '11px', margin: '0', lineHeight: '1.6' }}>
              🔒 Access restricted to <strong>@alphaanalyticssol.com</strong> accounts only.<br />
              Contact your administrator for access.
            </p>
          </div>
        </div>
        <p style={{ textAlign: 'center', color: '#475569', fontSize: '11px', marginTop: '20px', letterSpacing: '1px' }}>
          © 2024 ALPHA ANALYTICS SOLUTIONS • CONFIDENTIAL
        </p>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// HOME / DASHBOARD
// ─────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTool, setActiveTool] = useState(null);
  const [loggedIn, setLoggedIn]     = useState(false);
  const [userEmail, setUserEmail]   = useState('');

  const handleLogin  = (email) => { setLoggedIn(true); setUserEmail(email); };
  const handleLogout = () => { setLoggedIn(false); setUserEmail(''); setActiveTool(null); };

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;

  const tools = [
    { id: 'duplicate',            step: 1, icon: '📊', title: 'Duplicate Report',        desc: 'Scan folder → Find duplicates using SHA-256 hash → Download Excel report',                                active: true  },
    { id: 'splitter',             step: 2, icon: '✂️', title: 'PDF Splitter',             desc: 'Split bank statements, invoices & tax filings — manually or let AI decide',                              active: true  },
    { id: 'categorise',           step: 3, icon: '📂', title: 'Categorisation',           desc: 'Upload mixed documents → AI sorts them into category folders automatically',                              active: true  },
    { id: 'stamping',             step: 4, icon: '📄', title: 'Bates Stamping',           desc: 'Upload folder → AI detects empty corner → Stamps every page sequentially',                               active: true  },
    { id: 'extraction',           step: 5, icon: '🔍', title: 'Extraction',               desc: 'Extract data from Invoices, Bank Statements & Tax documents into Excel',                                 active: true  },
    { id: 'tracker',              step: 6, icon: '📋', title: 'Statement Tracker',        desc: 'Upload Bank & Credit Card extraction Excels → AI generates unified month-wise tracker',                  active: true  },
    { id: 'desc-categoriser',     step: 7, icon: '🏷️', title: 'Description Categoriser', desc: 'Upload Excel with distinct descriptions → AI categorises each → Download Excel',                         active: true  },
    { id: 'transaction-analysis', step: 8, icon: '📈', title: 'Transaction Analysis',     desc: 'Upload CSV/Excel → Account × Month pivot table → Heatmap Excel output',                                 active: true  },
    { id: 'indexing',             step: 9, icon: '📁', title: 'Indexing',                 desc: 'Coming soon — Auto-organize files with AI-generated index',                                              active: false },
  ];

  return (
    <main style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div style={{ background: '#0f2444', padding: '55px 20px 45px', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '16px', right: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>{userEmail}</span>
          <button onClick={handleLogout}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
            Sign Out
          </button>
        </div>
        <div style={{ fontSize: '52px', marginBottom: '16px' }}>⚖️</div>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.15)', borderRadius: '30px', padding: '6px 20px', marginBottom: '18px' }}>
          <span style={{ color: 'white', fontSize: '12px', letterSpacing: '3px', fontWeight: '600' }}>LEGAL DOCUMENT PLATFORM</span>
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: '800', color: '#ffffff', margin: '30px 0 14px 0', letterSpacing: '-0.5px' }}>Automate Your Legal Operations</h1>
        <p style={{ fontSize: '18px', color: '#ffffff', marginBottom: '32px', lineHeight: '1.6' }}>AI-powered document processing — follow the steps in order for best results</p>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '12px', padding: '10px 26px' }}>
          <span style={{ color: '#ffffff', fontSize: '13px', letterSpacing: '1.5px', fontWeight: '600' }}>🔒 FILES PROCESSED IN MEMORY — NEVER STORED</span>
        </div>
      </div>

      {!activeTool && (
        <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '14px 20px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', maxWidth: '1200px', margin: '0 auto' }}>
            {tools.filter(t => t.active).map((t, i, arr) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: '#f0f4ff', border: '1px solid #dce6ff' }}>
                  <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>{t.step}</span>
                  <span style={{ color: '#1a3c6e', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>{t.title}</span>
                </div>
                {i < arr.length - 1 && <span style={{ color: '#ccc', fontSize: '16px' }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '30px 20px' }}>
        {!activeTool && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {tools.map(tool => (
              <div key={tool.id} onClick={() => tool.active && setActiveTool(tool.id)}
                style={{ background: 'white', borderRadius: '12px', padding: '24px', cursor: tool.active ? 'pointer' : 'default', border: '2px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', opacity: tool.active ? 1 : 0.5, transition: 'all 0.2s' }}
                onMouseOver={e => { if (tool.active) { e.currentTarget.style.borderColor = '#1a3c6e'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,60,110,0.12)'; } }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>{tool.icon}</div>
                <h3 style={{ color: '#1a3c6e', margin: '0 0 8px', fontSize: '16px', fontWeight: '700' }}>{tool.title}</h3>
                <p style={{ color: '#888', fontSize: '12px', margin: '0', lineHeight: '1.6' }}>{tool.desc}</p>
              </div>
            ))}
          </div>
        )}

        {activeTool === 'duplicate'            && <DuplicateTool              onBack={() => setActiveTool(null)} />}
        {activeTool === 'splitter'             && <SplitterTool               onBack={() => setActiveTool(null)} />}
        {activeTool === 'categorise'           && <CategoriseTool             onBack={() => setActiveTool(null)} />}
        {activeTool === 'stamping'             && <StampingTool               onBack={() => setActiveTool(null)} />}
        {activeTool === 'extraction'           && <ExtractionTool             onBack={() => setActiveTool(null)} />}
        {activeTool === 'tracker'              && <StatementTrackerTool       onBack={() => setActiveTool(null)} />}
        {activeTool === 'desc-categoriser'     && <DescriptionCategoriserTool onBack={() => setActiveTool(null)} />}
        {activeTool === 'transaction-analysis' && <TransactionAnalysisTool    onBack={() => setActiveTool(null)} />}
      </div>

      <div style={{ textAlign: 'center', padding: '20px', color: '#ccc', fontSize: '11px', letterSpacing: '1px' }}>
        POWERED BY CLAUDE AI • ANTHROPIC
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// TRANSACTION ANALYSIS TOOL
// ─────────────────────────────────────────────────────────────
function TransactionAnalysisTool({ onBack }) {
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);

  const loadFiles = (fileList) => {
    const valid = Array.from(fileList).filter(f => {
      const n = f.name.toLowerCase();
      return (n.endsWith('.csv') || n.endsWith('.xlsx') || n.endsWith('.xls')) && f.size > 0;
    });
    setAllFiles(prev => {
      const existing = new Map(prev.map(f => [f.name, f]));
      valid.forEach(f => existing.set(f.name, f));
      return Array.from(existing.values());
    });
    setSelected(prev => {
      const updated = { ...prev };
      valid.forEach(f => { if (!(f.name in updated)) updated[f.name] = true; });
      return updated;
    });
  };

  const handleFolderSelect = (e) => loadFiles(e.target.files);
  const handleFileSelect   = (e) => loadFiles(e.target.files);
  const toggleOne  = (name) => setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleAll  = () => {
    const allChecked = allFiles.every(f => selected[f.name]);
    const sel = {};
    allFiles.forEach(f => sel[f.name] = !allChecked);
    setSelected(sel);
  };
  const clearAll = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const someChecked   = allFiles.some(f => selected[f.name]);

  const handleAnalyse = async () => {
    if (selectedFiles.length === 0) { setError('Please select at least one file.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('files', f));
      const res = await fetch('/api/transaction-analysis', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
      const blob = new Blob(
        [Uint8Array.from(atob(data.excelFile), c => c.charCodeAt(0))],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const url = URL.createObjectURL(blob);
      setResult({
        url,
        fileName: data.fileName || 'Transaction_Analysis.xlsx',
        qcData: data.qcData || {
          fileCount: selectedFiles.length,
          accounts: [],
          flaggedTransfers: [],
        },
      });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = result.fileName; a.click();
  };

  const handleClear = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    clearAll();
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 8</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>📈 Transaction Analysis</h2>
        <span style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', color: '#4338ca', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '700' }}>🤖 AI-Powered</span>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>Upload a transaction dataset → Claude AI detects columns & builds pivot → Heatmap + AI insight report in Excel</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #1a3c6e', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📁</span>
          <span style={{ color: '#1a3c6e', fontWeight: '700', fontSize: '13px' }}>Upload Folder</span>
          <span style={{ color: '#aaa', fontSize: '11px' }}>All CSV/Excel files inside</span>
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #276749', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📊</span>
          <span style={{ color: '#276749', fontWeight: '700', fontSize: '13px' }}>Upload Files</span>
          <span style={{ color: '#aaa', fontSize: '11px' }}>Pick specific .csv / .xlsx files</span>
          <input type="file" multiple accept=".csv,.xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
        </label>
      </div>

      {allFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>📊 Select files ({selectedFiles.length} of {allFiles.length} selected)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #1a3c6e', color: '#1a3c6e', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={clearAll} style={{ background: 'none', border: '1px solid #ccc', color: '#888', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
            </div>
          </div>
          <div style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
            {allFiles.map((f, i) => (
              <div key={f.name} onClick={() => toggleOne(f.name)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', background: selected[f.name] ? '#f0f4ff' : (i % 2 === 0 ? 'white' : '#fafafa'), borderBottom: i < allFiles.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected[f.name] ? '#1a3c6e' : '#ccc'}`, background: selected[f.name] ? '#1a3c6e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected[f.name] && <span style={{ color: 'white', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                </div>
                <span style={{ fontSize: '13px', color: selected[f.name] ? '#1a3c6e' : '#555', fontWeight: selected[f.name] ? '600' : '400', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name.toLowerCase().endsWith('.csv') ? '📄' : '📊'} {f.name}
                </span>
                <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
          {!someChecked && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '6px' }}>⚠️ Please select at least one file.</p>}
        </div>
      )}

      {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>❌ {error}</div>}

      <button onClick={handleAnalyse} disabled={loading || selectedFiles.length === 0}
        style={{ width: '100%', padding: '14px', background: loading || selectedFiles.length === 0 ? '#ccc' : '#0f2444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: loading || selectedFiles.length === 0 ? 'not-allowed' : 'pointer', marginBottom: '16px' }}>
        {loading ? '⏳ Building pivot & heatmap...' : '📈 Generate Transaction Analysis'}
      </button>

      {result && (
        <div style={{ background: '#f0fff4', border: '2px solid #38a169', borderRadius: '10px', padding: '24px' }}>
          <p style={{ color: '#166534', fontWeight: '700', fontSize: '16px', margin: '0 0 16px' }}>✅ Analysis Ready!</p>
          <button onClick={handleDownload}
            style={{ width: '100%', padding: '14px', background: '#166534', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' }}>
            📥 Download Transaction_Analysis.xlsx
          </button>
          <QCBadge toolName="transaction-analysis" toolOutput={result.qcData} metadata={{}} />
          <button onClick={handleClear}
            style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            ↺ Analyse Another File
          </button>
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
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);

  const loadFiles = (fileList) => {
    const excels = Array.from(fileList).filter(f =>
      (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && f.size > 0
    );
    setAllFiles(prev => {
      const existing = new Map(prev.map(f => [f.name, f]));
      excels.forEach(f => existing.set(f.name, f));
      return Array.from(existing.values());
    });
    setSelected(prev => {
      const updated = { ...prev };
      excels.forEach(f => { if (!(f.name in updated)) updated[f.name] = true; });
      return updated;
    });
    setResult(null); setError('');
  };

  const handleFolderSelect = (e) => loadFiles(e.target.files);
  const handleFileSelect   = (e) => loadFiles(e.target.files);
  const toggleOne  = (name) => setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleAll  = () => {
    const allChecked = allFiles.every(f => selected[f.name]);
    const sel = {};
    allFiles.forEach(f => sel[f.name] = !allChecked);
    setSelected(sel);
  };
  const clearAll = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const someChecked   = allFiles.some(f => selected[f.name]);

  const handleGenerate = async () => {
    if (selectedFiles.length === 0) { setError('Please select at least one Excel file.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const fd = new FormData();
      selectedFiles.forEach(f => fd.append('excels', f));
      const res  = await fetch('/api/tracker', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!result?.excelFile) return;
    const blob = new Blob([Uint8Array.from(atob(result.excelFile), c => c.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'Statement_Tracker.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 6</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>📋 Statement Tracker</h2>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>Upload Bank Statement or Credit Card extraction Excels → AI normalizes data → Unified month-wise tracker generated</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #1a3c6e', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📁</span>
          <span style={{ color: '#1a3c6e', fontWeight: '700', fontSize: '13px' }}>Upload Folder</span>
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #276749', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📊</span>
          <span style={{ color: '#276749', fontWeight: '700', fontSize: '13px' }}>Upload Excel Files</span>
          <input type="file" multiple accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
        </label>
      </div>

      {allFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>Select files ({selectedFiles.length} of {allFiles.length})</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #1a3c6e', color: '#1a3c6e', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={clearAll} style={{ background: 'none', border: '1px solid #ccc', color: '#888', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
            </div>
          </div>
          <div style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
            {allFiles.map((f, i) => (
              <div key={f.name} onClick={() => toggleOne(f.name)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', background: selected[f.name] ? '#f0f4ff' : (i % 2 === 0 ? 'white' : '#fafafa'), borderBottom: i < allFiles.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected[f.name] ? '#1a3c6e' : '#ccc'}`, background: selected[f.name] ? '#1a3c6e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected[f.name] && <span style={{ color: 'white', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                </div>
                <span style={{ fontSize: '13px', color: selected[f.name] ? '#1a3c6e' : '#555', fontWeight: selected[f.name] ? '600' : '400', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📊 {f.name}</span>
                <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
          {!someChecked && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '6px' }}>⚠️ Please select at least one file.</p>}
        </div>
      )}

      {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>❌ {error}</div>}

      <button onClick={handleGenerate} disabled={loading || selectedFiles.length === 0}
        style={{ width: '100%', padding: '14px', background: loading || selectedFiles.length === 0 ? '#ccc' : '#0f2444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: loading || selectedFiles.length === 0 ? 'not-allowed' : 'pointer', marginBottom: '20px' }}>
        {loading ? '⏳ Generating tracker...' : `📋 Generate Tracker${selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : ''}`}
      </button>

      {result && (
        <div style={{ background: '#f0fff4', border: '2px solid #38a169', borderRadius: '10px', padding: '24px' }}>
          <p style={{ color: '#166534', fontWeight: '700', fontSize: '16px', margin: '0 0 16px' }}>✅ Tracker Generated!</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#002060' }}>{result.totalBankAccounts ?? 0}</div>
              <div style={{ color: '#002060', fontSize: '11px', fontWeight: '600', marginTop: '2px' }}>🏦 Bank Accounts</div>
            </div>
            <div style={{ background: '#f5f0ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#6A0DAD' }}>{result.totalCreditCards ?? 0}</div>
              <div style={{ color: '#6A0DAD', fontSize: '11px', fontWeight: '600', marginTop: '2px' }}>💳 Credit Cards</div>
            </div>
            <div style={{ background: 'white', borderRadius: '8px', padding: '14px', textAlign: 'center', border: '1px solid #eee' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a3c6e' }}>{result.totalMonths}</div>
              <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>Months Covered</div>
            </div>
            <div style={{ background: result.totalGaps > 0 ? '#FFEBEE' : 'white', border: result.totalGaps > 0 ? '2px solid #ef5350' : '1px solid #eee', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: result.totalGaps > 0 ? '#C62828' : '#888' }}>{result.totalGaps ?? 0}</div>
              <div style={{ color: result.totalGaps > 0 ? '#C62828' : '#888', fontSize: '11px', fontWeight: result.totalGaps > 0 ? '700' : '400', marginTop: '2px' }}>
                {result.totalGaps > 0 ? '⚠️ Gaps' : 'Gaps (None)'}
              </div>
            </div>
          </div>
          <button onClick={handleDownload}
            style={{ width: '100%', padding: '14px', background: '#166534', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            📥 Download Statement Tracker (.xlsx)
          </button>
          <QCBadge
            toolName="tracker"
            toolOutput={{
              gaps:               result.totalGaps         || 0,
              totalMonths:        result.totalMonths        || 0,
              totalBankAccounts:  result.totalBankAccounts  || 0,
              totalCreditCards:   result.totalCreditCards   || 0,
              missingMonths:      result.missingMonths      || [],
              duplicateAccounts:  result.duplicateAccounts  || [],
            }}
            metadata={{}}
          />
          <button onClick={clearAll}
            style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            ↺ Upload Another Set
          </button>
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
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError]       = useState('');
  const [results, setResults]   = useState([]);
  const [done, setDone]         = useState(false);

  const loadFiles = (fileList) => {
    const excels = Array.from(fileList).filter(f =>
      (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && f.size > 0
    );
    setAllFiles(prev => {
      const existing = new Map(prev.map(f => [f.name, f]));
      excels.forEach(f => existing.set(f.name, f));
      return Array.from(existing.values());
    });
    setSelected(prev => {
      const updated = { ...prev };
      excels.forEach(f => { if (!(f.name in updated)) updated[f.name] = true; });
      return updated;
    });
    setResults([]); setDone(false); setError('');
  };

  const handleFolderSelect = (e) => loadFiles(e.target.files);
  const handleFileSelect   = (e) => loadFiles(e.target.files);
  const toggleOne  = (name) => setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleAll  = () => {
    const allChecked = allFiles.every(f => selected[f.name]);
    const sel = {};
    allFiles.forEach(f => sel[f.name] = !allChecked);
    setSelected(sel);
  };
  const clearAll = () => { setAllFiles([]); setSelected({}); setResults([]); setDone(false); setError(''); };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const someChecked   = allFiles.some(f => selected[f.name]);

  const handleCategorise = async () => {
    if (selectedFiles.length === 0) { setError('Please select at least one Excel file.'); return; }
    setLoading(true); setError(''); setResults([]); setDone(false);
    try {
      setProgress('Loading Excel parser...');
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
        setProgress(`Reading ${file.name}...`);
        const buffer   = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          for (const row of rows) {
            const key = Object.keys(row).find(k => k.trim().toLowerCase() === 'description');
            if (key && row[key] && String(row[key]).trim() !== '') {
              allDescriptions.add(String(row[key]).trim());
            }
          }
        }
      }
      if (allDescriptions.size === 0) throw new Error('No "Description" column found.');
      const descArray = [...allDescriptions];
      setProgress(`Categorising ${descArray.length} descriptions...`);
      const res  = await fetch('/api/categorise-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptions: descArray }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Categorisation failed');
      setResults(data.results);
      setDone(true);
      setProgress('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 7</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>🏷️ Description Categoriser</h2>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>Upload Excel files with a <strong>Description</strong> column → AI categorises each → Download CSV</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #1a3c6e', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📁</span>
          <span style={{ color: '#1a3c6e', fontWeight: '700', fontSize: '13px' }}>Upload Folder</span>
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #276749', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📊</span>
          <span style={{ color: '#276749', fontWeight: '700', fontSize: '13px' }}>Upload Excel Files</span>
          <input type="file" multiple accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
        </label>
      </div>

      {allFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>Select files ({selectedFiles.length} of {allFiles.length})</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #1a3c6e', color: '#1a3c6e', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={clearAll} style={{ background: 'none', border: '1px solid #ccc', color: '#888', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
            </div>
          </div>
          <div style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
            {allFiles.map((f, i) => (
              <div key={f.name} onClick={() => toggleOne(f.name)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', background: selected[f.name] ? '#f0f4ff' : (i % 2 === 0 ? 'white' : '#fafafa'), borderBottom: i < allFiles.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected[f.name] ? '#1a3c6e' : '#ccc'}`, background: selected[f.name] ? '#1a3c6e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected[f.name] && <span style={{ color: 'white', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                </div>
                <span style={{ fontSize: '13px', color: selected[f.name] ? '#1a3c6e' : '#555', fontWeight: selected[f.name] ? '600' : '400', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📊 {f.name}</span>
                <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
          {!someChecked && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '6px' }}>⚠️ Please select at least one file.</p>}
        </div>
      )}

      {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>❌ {error}</div>}

      <button onClick={handleCategorise} disabled={loading || selectedFiles.length === 0}
        style={{ width: '100%', padding: '14px', background: loading || selectedFiles.length === 0 ? '#ccc' : '#0f2444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: loading || selectedFiles.length === 0 ? 'not-allowed' : 'pointer', marginBottom: '20px' }}>
        {loading ? `⏳ ${progress || 'Processing...'}` : `🏷️ Categorise${selectedFiles.length > 0 ? ` (${selectedFiles.length} files)` : ''}`}
      </button>

      {done && results.length > 0 && (
        <div style={{ background: '#f0fff4', border: '2px solid #38a169', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ color: '#166534', fontWeight: '700', fontSize: '16px', margin: '0' }}>✅ {results.length} descriptions categorised!</p>
            <button onClick={downloadCSV}
              style={{ padding: '10px 20px', background: '#166534', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
              ⬇ Download CSV
            </button>
          </div>
          <QCBadge
            toolName="desc-categoriser"
            toolOutput={{
              descriptions:      results.map(r => ({ description: r.description, category: r.category, confidence: r.confidence || null })),
              semanticMismatches: [],
            }}
            metadata={{}}
          />
          <div style={{ border: '1px solid #86efac', borderRadius: '8px', overflow: 'hidden', maxHeight: '320px', overflowY: 'auto', marginTop: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: '#166534' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'white', fontWeight: '700' }}>#</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'white', fontWeight: '700' }}>Description</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', color: 'white', fontWeight: '700' }}>Category</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f0fff4', borderBottom: '1px solid #dcfce7' }}>
                    <td style={{ padding: '8px 14px', color: '#aaa', fontSize: '11px' }}>{i + 1}</td>
                    <td style={{ padding: '8px 14px', color: '#333', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '700' }}>{row.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={clearAll}
            style={{ width: '100%', marginTop: '14px', padding: '10px', background: 'transparent', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            ↺ Upload Another File
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DUPLICATE REPORT TOOL  (no QC — no AI involved)
// ─────────────────────────────────────────────────────────────
function DuplicateTool({ onBack }) {
  const [files, setFiles]           = useState([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');

  const handleFolderSelect = (e) => {
    setFiles(Array.from(e.target.files).filter(f => f.size > 0 && !f.name.startsWith('.')));
    setResult(null); setError('');
  };

  const hashFile = async (file) => {
    const buffer     = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async () => {
    if (files.length === 0) { setError('Please select a folder with files!'); return; }
    setProcessing(true); setResult(null); setError('');
    try {
      const fileData = [], hashMap = {};
      for (const file of files) {
        const hash   = await hashFile(file);
        const sizeKB = (file.size / 1024).toFixed(2);
        fileData.push({ fileName: file.name, hash, sizeKB });
        if (!hashMap[hash]) hashMap[hash] = [];
        hashMap[hash].push(file.name);
      }
      const duplicates     = Object.entries(hashMap).filter(([, f]) => f.length > 1).map(([hash, f]) => ({ hash, files: f }));
      const duplicateCount = duplicates.reduce((acc, g) => acc + g.files.length - 1, 0);
      const res  = await fetch('/api/duplicate-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileData, hashMap, duplicateCount, duplicates }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setResult(data);
    } catch (err) { setError(err.message); }
    setProcessing(false);
  };

  const downloadExcel = (excelData) => {
    const bytes = Uint8Array.from(atob(excelData), c => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    Object.assign(document.createElement('a'), { href: url, download: 'duplicate_report.xlsx' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 1</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>📊 Duplicate Report</h2>
      </div>
      <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '28px' }}>Scan folder → Find duplicates using SHA-256 hash → Download Excel report</p>
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', padding: '22px', background: files.length > 0 ? '#f0fff4' : '#f9f9f9', border: files.length > 0 ? '2px solid #38a169' : '2px dashed #ddd', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
          {files.length > 0 ? <span style={{ color: '#38a169', fontWeight: '700' }}>✅ {files.length} files ready</span> : <span style={{ color: '#bbb' }}>📂 Click to select folder</span>}
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
      </div>
      {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>❌ {error}</div>}
      <button onClick={handleSubmit} disabled={processing || files.length === 0}
        style={{ width: '100%', background: processing || files.length === 0 ? '#ccc' : '#1a3c6e', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: processing || files.length === 0 ? 'not-allowed' : 'pointer' }}>
        {processing ? '⏳ Scanning files...' : '🔍 Generate Duplicate Report'}
      </button>
      {result && result.success && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[{ label: 'TOTAL', value: result.totalFiles, color: '#1a3c6e' }, { label: 'UNIQUE', value: result.uniqueFiles, color: '#276749' }, { label: 'DUPLICATES', value: result.duplicateCount, color: '#c53030' }].map((s, i) => (
              <div key={i} style={{ background: '#f7f8fc', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <p style={{ color: s.color, fontSize: '24px', fontWeight: '800', margin: '0' }}>{s.value}</p>
                <p style={{ color: '#aaa', fontSize: '11px', margin: '4px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => downloadExcel(result.excelFile)}
            style={{ width: '100%', background: '#276749', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            ⬇ Download Excel Report
          </button>
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
  const [processing, setProcessing] = useState(false);
  const [result, setResult]         = useState(null);
  const [progress, setProgress]     = useState('');

  const handleSubmit = async () => {
    if (!file) { alert('Please select a PDF!'); return; }
    setProcessing(true); setResult(null); setProgress('Analyzing your document...');
    const formData = new FormData();
    formData.append('pdf', file); formData.append('docType', docType);
    formData.append('splitMode', splitMode); formData.append('splitPages', splitPages); formData.append('splitNames', splitNames);
    try {
      const res  = await fetch('/api/split-pdf', { method: 'POST', body: formData });
      const data = await res.json(); setResult(data); setProgress('');
    } catch (err) { setProgress('Error: ' + err.message); }
    setProcessing(false);
  };

  const downloadZip = (zipData) => {
    const bytes = Uint8Array.from(atob(zipData), c => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    Object.assign(document.createElement('a'), { href: url, download: 'split_documents.zip' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 2</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>✂️ PDF Splitter</h2>
      </div>
      <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '28px' }}>Split bank statements, invoices & tax filings into separate documents</p>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', padding: '22px', background: file ? '#f0fff4' : '#f9f9f9', border: file ? '2px solid #38a169' : '2px dashed #ddd', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
          {file ? <span style={{ color: '#38a169', fontWeight: '700' }}>✅ {file.name}</span> : <span style={{ color: '#bbb' }}>📂 Click to select PDF</span>}
          <input type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
        </label>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#333', fontSize: '13px' }}>Document Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
          {[{ value: 'auto', label: '🤖 Auto' }, { value: 'bank', label: '🏦 Bank' }, { value: 'invoice', label: '🧾 Invoice' }, { value: 'tax', label: '📑 Tax' }].map(opt => (
            <button key={opt.value} onClick={() => setDocType(opt.value)}
              style={{ padding: '10px 6px', borderRadius: '8px', border: docType === opt.value ? '2px solid #1a3c6e' : '2px solid #eee', background: docType === opt.value ? '#eef2ff' : 'white', color: docType === opt.value ? '#1a3c6e' : '#888', fontSize: '11px', fontWeight: docType === opt.value ? '700' : 'normal', cursor: 'pointer' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#333', fontSize: '13px' }}>How to Split?</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[{ value: 'ai', label: '🤖 AI decides' }, { value: 'manual', label: '✏️ Manual' }].map(opt => (
            <button key={opt.value} onClick={() => setSplitMode(opt.value)}
              style={{ padding: '12px', borderRadius: '8px', border: splitMode === opt.value ? '2px solid #1a3c6e' : '2px solid #eee', background: splitMode === opt.value ? '#eef2ff' : 'white', color: splitMode === opt.value ? '#1a3c6e' : '#888', fontSize: '13px', fontWeight: splitMode === opt.value ? '700' : 'normal', cursor: 'pointer' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {splitMode === 'manual' && (
        <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <input type="text" value={splitPages} onChange={e => setSplitPages(e.target.value)} placeholder="Split at pages: e.g. 4, 7, 9"
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', color: '#333', marginBottom: '8px' }} />
          <input type="text" value={splitNames} onChange={e => setSplitNames(e.target.value)} placeholder="Names: e.g. April, May, June"
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', color: '#333' }} />
        </div>
      )}
      <button onClick={handleSubmit} disabled={processing}
        style={{ width: '100%', background: processing ? '#888' : '#1a3c6e', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: processing ? 'not-allowed' : 'pointer' }}>
        {processing ? '⏳ Splitting...' : '✂️ Split PDF'}
      </button>
      {progress && <p style={{ textAlign: 'center', marginTop: '15px', color: '#555' }}>{progress}</p>}
      {result && result.success && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ color: 'green' }}>✅ {result.splitCount} documents created!</h3>
          <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
            {result.documents.map((doc, i) => (
              <p key={i} style={{ color: '#555', fontSize: '13px', margin: '4px 0' }}>• {doc.name} ({doc.pages} pages)</p>
            ))}
          </div>
          <button onClick={() => downloadZip(result.zipFile)}
            style={{ width: '100%', background: '#276749', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            ⬇ Download Split Documents (ZIP)
          </button>
          <QCBadge
            toolName="splitter"
            toolOutput={{
              splits:     result.documents.map(d => ({ name: d.name, pageCount: d.pages })),
              totalPages: result.totalPages || 0,
            }}
            metadata={{}}
          />
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
  const styles = {
    HIGH:   { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
    MEDIUM: { background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047' },
    LOW:    { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  };
  const s = styles[confidence] || styles.LOW;
  return <span style={{ ...s, borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '700' }}>{confidence || 'LOW'}</span>;
}

function CategoriseTool({ onBack }) {
  const [files, setFiles]             = useState([]);
  const [processing, setProcessing]   = useState(false);
  const [result, setResult]           = useState(null);
  const [progress, setProgress]       = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const handleFolderSelect = (e) => {
    setFiles(Array.from(e.target.files).filter(f => !f.name.startsWith('.') && f.size > 0));
    setResult(null); setExpandedRow(null);
  };

  const handleSubmit = async () => {
    if (files.length === 0) { alert('Please select a folder!'); return; }
    setProcessing(true); setResult(null); setExpandedRow(null);
    setProgress('Reading and categorising your documents with AI...');
    const formData = new FormData();
    for (let f of files) formData.append('files', f);
    try {
      const res  = await fetch('/api/categorise-pdf', { method: 'POST', body: formData });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Server error: ' + text.slice(0, 150)); }
      if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong');
      setResult(data); setProgress('');
    } catch (err) { setProgress('❌ Error: ' + err.message); }
    setProcessing(false);
  };

  const downloadZip = (zipData) => {
    const bytes = Uint8Array.from(atob(zipData), c => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    Object.assign(document.createElement('a'), { href: url, download: 'categorised_documents.zip' }).click();
    URL.revokeObjectURL(url);
  };

  const getFolderIcon = (folderName) => { const cat = ALL_CATEGORIES.find(c => c.folder === folderName); return cat ? cat.icon : '📁'; };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 3</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>📂 Categorisation</h2>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '28px' }}>Upload any file type → AI sorts into 20 legal category folders automatically</p>
      <div style={{ marginBottom: '28px' }}>
        <label style={{ display: 'block', padding: '22px', background: files.length > 0 ? '#f0fff4' : '#f9f9f9', border: files.length > 0 ? '2px solid #38a169' : '2px dashed #ddd', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
          {files.length > 0 ? <span style={{ color: '#38a169', fontWeight: '700' }}>✅ {files.length} files selected</span> : <span style={{ color: '#bbb' }}>📂 Click to select folder</span>}
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
      </div>
      <button onClick={handleSubmit} disabled={processing || files.length === 0}
        style={{ width: '100%', background: processing || files.length === 0 ? '#ccc' : '#1a3c6e', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: processing || files.length === 0 ? 'not-allowed' : 'pointer' }}>
        {processing ? '⏳ Categorising with AI...' : '📂 Categorise Documents'}
      </button>
      {progress && <p style={{ textAlign: 'center', marginTop: '15px', color: '#555', fontSize: '13px' }}>{progress}</p>}
      {result && result.success && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'TOTAL FILES',  value: result.totalFiles,  color: '#1a3c6e' },
              { label: 'FOLDERS USED', value: result.categoryCount, color: '#276749' },
              { label: 'FLAGGED',      value: result.categorizationResults?.filter(r => r.confidence === 'LOW' || r.confidence === 'MEDIUM').length || 0, color: '#b7791f' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#f7f8fc', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <p style={{ color: s.color, fontSize: '22px', fontWeight: '800', margin: '0' }}>{s.value}</p>
                <p style={{ color: '#aaa', fontSize: '10px', margin: '4px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
          {result.categorizationResults && result.categorizationResults.length > 0 && (
            <div style={{ marginBottom: '20px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
              {result.categorizationResults.map((r, i) => (
                <div key={i}>
                  <div onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', padding: '10px 14px', background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getFolderIcon(r.assigned_folder)} {r.original_filename}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>→ {r.assigned_folder}</div>
                    </div>
                    <ConfidenceBadge confidence={r.confidence} />
                    <span style={{ color: '#ccc', fontSize: '12px' }}>{expandedRow === i ? '▲' : '▼'}</span>
                  </div>
                  {expandedRow === i && r.notes && (
                    <div style={{ background: '#fffbeb', padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                      <span style={{ color: '#854d0e' }}>⚠️ {r.notes}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => downloadZip(result.zipFile)}
            style={{ width: '100%', background: '#276749', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            ⬇ Download Categorised Folders (ZIP)
          </button>
          <QCBadge
            toolName="categorisation"
            toolOutput={{
              files: (result.categorizationResults || []).map(r => ({
                file:       r.original_filename,
                folder:     r.assigned_folder,
                // Map string confidence → float so rule checks work correctly
                confidence: r.confidence === 'HIGH' ? 0.9 : r.confidence === 'MEDIUM' ? 0.5 : 0.2,
                notes:      r.notes,
              })),
              semanticMismatches: [],
            }}
            metadata={{}}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BATES STAMPING TOOL
// FIX: buildQCData uses batesNumber (not batesStart) so QC sequence
//      checks actually fire on the correct field name
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
  const [processing, setProcessing]     = useState(false);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState('');

  const loadFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf') && f.size > 0);
    setAllFiles(prev => {
      const existing = new Map(prev.map(f => [f.name, f]));
      pdfs.forEach(f => existing.set(f.name, f));
      return Array.from(existing.values());
    });
    setSelected(prev => {
      const updated = { ...prev };
      pdfs.forEach(f => { if (!(f.name in updated)) updated[f.name] = true; });
      return updated;
    });
    setResult(null); setError('');
  };

  const handleFolderSelect = (e) => loadFiles(e.target.files);
  const handleFileSelect   = (e) => loadFiles(e.target.files);
  const toggleOne  = (name) => setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleAll  = () => {
    const allChecked = allFiles.every(f => selected[f.name]);
    const sel = {};
    allFiles.forEach(f => (sel[f.name] = !allChecked));
    setSelected(sel);
  };
  const clearAll = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const someChecked   = allFiles.some(f => selected[f.name]);

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) { setError('Please select at least one PDF file.'); return; }
    setProcessing(true); setResult(null); setError('');
    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('pdfs', f));
    formData.append('prefix',      prefix);
    formData.append('startNumber', startNumber);
    formData.append('padLength',   padLength);
    formData.append('password',    password);
    formData.append('cornerPct',   (cornerPct / 100).toString());
    formData.append('fontSize',    fontSize.toString());
    formData.append('stampColor',  stampColor);
    formData.append('stampFont',   stampFont);
    try {
      const res  = await fetch('/api/process-pdf', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error || 'Something went wrong.');
      else setResult(data);
    } catch (err) { setError('Request failed: ' + err.message); }
    setProcessing(false);
  };

  const downloadZip = (zipData) => {
    const bytes = Uint8Array.from(atob(zipData), c => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    Object.assign(document.createElement('a'), { href: url, download: 'stamped_pdfs.zip' }).click();
    URL.revokeObjectURL(url);
  };

  // ── BUILD QC DATA ────────────────────────────────────────────
  // KEY FIX: use `batesNumber` field (not `batesStart`) so that
  // the QC route's sequence checks (f.batesNumber || f.startBates)
  // actually find the Bates numbers and run gap/duplicate detection.
  const buildQCData = () => {
    const stamped    = result?.processedCount    || 0;
    const totalPages = result?.totalStampedPages || 0;
    const pad        = Number(padLength)  || 6;
    const start      = Number(startNumber) || 1;

    // Prefer rich per-file data from updated route (has batesStart field)
    if (result?.processedFiles && result.processedFiles.length > 0) {
      return {
        files: result.processedFiles.map(f => ({
          name:        f.name,
          batesNumber: f.batesStart,   // ← FIX: map to batesNumber so QC finds it
          pages:       f.pageCount || 0,
          position:    f.position,
        })),
        stampedCount:      stamped,
        totalFiles:        selectedFiles.length,
        totalStampedPages: totalPages,
        totalInputPages:   totalPages, // same — skipped files have 0 pages
      };
    }

    // Fallback — reconstruct from frontend state when old route is deployed
    const pagesPerFile = stamped > 0 ? Math.round(totalPages / stamped) : 1;
    let cursor = start;
    const files = selectedFiles.slice(0, stamped).map(f => {
      const filePages  = pagesPerFile || 1;
      const batesNumber = prefix + String(cursor).padStart(pad, '0');
      cursor += filePages;
      return { name: f.name, batesNumber, pages: filePages };
    });

    return {
      files,
      stampedCount:      stamped,
      totalFiles:        selectedFiles.length,
      totalStampedPages: totalPages,
      totalInputPages:   totalPages,
    };
  };

  const inputStyle = { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', color: '#333' };
  const optBtn = (val, cur, set, label) => (
    <button key={val} onClick={() => set(val)}
      style={{ padding: '9px 8px', borderRadius: '8px', border: `2px solid ${cur === val ? '#1a3c6e' : '#eee'}`, background: cur === val ? '#eef2ff' : 'white', color: cur === val ? '#1a3c6e' : '#888', fontSize: '12px', fontWeight: cur === val ? '700' : '400', cursor: 'pointer' }}>
      {label}
    </button>
  );

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 4</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>📄 Bates Stamping</h2>
        <span style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', color: '#4338ca', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '700' }}>🤖 AI-Powered</span>
      </div>
      <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '24px' }}>Upload a folder or pick individual PDFs → AI detects best corner → Stamps every page sequentially</p>

      {/* Dual upload */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #1a3c6e', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📁</span>
          <span style={{ color: '#1a3c6e', fontWeight: '700', fontSize: '13px' }}>Upload Folder</span>
          <span style={{ color: '#aaa', fontSize: '11px' }}>All PDFs inside the folder</span>
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #276749', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📄</span>
          <span style={{ color: '#276749', fontWeight: '700', fontSize: '13px' }}>Upload PDFs</span>
          <span style={{ color: '#aaa', fontSize: '11px' }}>Pick specific .pdf files</span>
          <input type="file" multiple accept=".pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Checkbox file list */}
      {allFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>📄 Select PDFs ({selectedFiles.length} of {allFiles.length} selected)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #1a3c6e', color: '#1a3c6e', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={clearAll} style={{ background: 'none', border: '1px solid #ccc', color: '#888', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
            </div>
          </div>
          <div style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
            {allFiles.map((f, i) => (
              <div key={f.name} onClick={() => toggleOne(f.name)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', background: selected[f.name] ? '#f0f4ff' : (i % 2 === 0 ? 'white' : '#fafafa'), borderBottom: i < allFiles.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected[f.name] ? '#1a3c6e' : '#ccc'}`, background: selected[f.name] ? '#1a3c6e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected[f.name] && <span style={{ color: 'white', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                </div>
                <span style={{ fontSize: '13px', color: selected[f.name] ? '#1a3c6e' : '#555', fontWeight: selected[f.name] ? '600' : '400', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}</span>
                <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
          {!someChecked && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '6px' }}>⚠️ Please select at least one PDF.</p>}
        </div>
      )}

      {/* Password */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
          placeholder="PDF Password (optional — for encrypted PDFs)"
          style={{ ...inputStyle, paddingRight: '44px' }} />
        <button onClick={() => setShowPassword(!showPassword)}
          style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '16px' }}>
          {showPassword ? '🙈' : '👁️'}
        </button>
      </div>

      {/* Prefix & numbering */}
      <div style={{ marginBottom: '16px' }}>
        <input type="text" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="Prefix e.g. DOC-" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <input type="number" value={startNumber} onChange={e => setStartNumber(e.target.value)} placeholder="Start number" style={inputStyle} />
        <input type="number" value={padLength}   onChange={e => setPadLength(e.target.value)}   placeholder="Digits (pad length)" style={inputStyle} />
      </div>

      {/* Preview */}
      <div style={{ background: '#f0f4ff', border: '1px solid #dce6ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
        <span style={{ color: '#888', fontSize: '12px' }}>Preview: </span>
        <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#1a3c6e', fontSize: '14px' }}>
          {prefix}{String(startNumber).padStart(Number(padLength), '0')}
        </span>
        <span style={{ color: '#aaa', fontSize: '11px', marginLeft: '8px' }}>
          → {prefix}{String(Number(startNumber) + Math.max(0, selectedFiles.length - 1)).padStart(Number(padLength), '0')} (est.)
        </span>
      </div>

      {/* Advanced */}
      <button onClick={() => setShowAdvanced(!showAdvanced)}
        style={{ background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 16px', color: '#555', fontSize: '12px', cursor: 'pointer', marginBottom: '16px', width: '100%', textAlign: 'left' }}>
        {showAdvanced ? '▲' : '▼'} Advanced Settings
      </button>
      {showAdvanced && (
        <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#333', fontSize: '13px' }}>Font Size: {fontSize}pt</label>
            <input type="range" min="6" max="16" step="1" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '100%', accentColor: '#1a3c6e' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#333', fontSize: '13px' }}>Stamp Color</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {optBtn('black', stampColor, setStampColor, '⚫ Black')}
              {optBtn('red',   stampColor, setStampColor, '🔴 Red')}
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#333', fontSize: '13px' }}>Font</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {optBtn('Helvetica', stampFont, setStampFont, 'Helvetica')}
              {optBtn('Courier',   stampFont, setStampFont, 'Courier')}
              {optBtn('Times',     stampFont, setStampFont, 'Times')}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#333', fontSize: '13px' }}>Corner Zone: {cornerPct}%</label>
            <input type="range" min="5" max="15" step="1" value={cornerPct} onChange={e => setCornerPct(Number(e.target.value))} style={{ width: '100%', accentColor: '#1a3c6e' }} />
            <p style={{ color: '#aaa', fontSize: '11px', marginTop: '4px' }}>AI checks the outer {cornerPct}% of each corner for existing content before placing the stamp.</p>
          </div>
        </div>
      )}

      {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>❌ {error}</div>}

      <button onClick={handleSubmit} disabled={processing || selectedFiles.length === 0}
        style={{ width: '100%', background: processing || selectedFiles.length === 0 ? '#ccc' : '#1a3c6e', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: processing || selectedFiles.length === 0 ? 'not-allowed' : 'pointer' }}>
        {processing
          ? '⏳ Stamping with AI…'
          : `🚀 Start Stamping${selectedFiles.length > 0 ? ` (${selectedFiles.length} PDF${selectedFiles.length !== 1 ? 's' : ''})` : ''}`}
      </button>

      {result && result.success && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'STAMPED',  value: result.processedCount, color: '#276749' },
              { label: 'WARNINGS', value: (result.fallbackFiles?.length || 0) + (result.scannedPDFs?.length || 0), color: '#b7791f' },
              { label: 'SKIPPED',  value: result.skippedCount || 0, color: '#c53030' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#f7f8fc', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <p style={{ color: s.color, fontSize: '26px', fontWeight: '800', margin: '0' }}>{s.value}</p>
                <p style={{ color: '#aaa', fontSize: '11px', margin: '4px 0 0', fontWeight: '600' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {result.totalStampedPages > 0 && (
            <div style={{ background: '#f0f4ff', border: '1px solid #dce6ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#1a3c6e' }}>
              📃 <strong>{result.totalStampedPages}</strong> pages stamped across {result.processedCount} files
            </div>
          )}

          <button onClick={() => downloadZip(result.zipFile)}
            style={{ width: '100%', background: '#276749', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            ⬇ Download Stamped PDFs (ZIP)
          </button>

          <QCBadge toolName="bates-stamp" toolOutput={buildQCData()} metadata={{}} />

          <button onClick={clearAll}
            style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', border: '1px solid #c6d4ea', borderRadius: '8px', color: '#1a3c6e', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            ↺ Stamp Another Batch
          </button>
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
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 5</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>🔍 Extraction</h2>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '32px' }}>Select the type of document you want to extract data from</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        {[
          { type: 'invoice', icon: '🧾', title: 'Structured Invoices', desc: 'Upload invoice folder → Specify fields → Extract data → Excel output', active: true },
          { type: 'bank',    icon: '🏦', title: 'Bank Statements',     desc: 'Upload folder → Select specific PDFs → Transactions extracted → Excel output', active: true },
          { type: 'tax',     icon: '📑', title: 'Tax Statements',      desc: 'Coming soon', active: false },
        ].map(opt => (
          <div key={opt.type} onClick={() => opt.active && setActiveType(opt.type)}
            style={{ background: '#f7f8fc', borderRadius: '12px', padding: '24px', cursor: opt.active ? 'pointer' : 'not-allowed', border: '2px solid #eee', opacity: opt.active ? 1 : 0.5 }}
            onMouseOver={e => { if (opt.active) { e.currentTarget.style.borderColor = '#1a3c6e'; e.currentTarget.style.background = '#eef2ff'; } }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#eee'; e.currentTarget.style.background = '#f7f8fc'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '36px' }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: '#1a3c6e', margin: '0 0 4px', fontSize: '16px', fontWeight: '700' }}>{opt.title}</h3>
                <p style={{ color: '#888', fontSize: '12px', margin: '0' }}>{opt.desc}</p>
              </div>
              {opt.active ? <span style={{ color: '#1a3c6e', fontSize: '20px' }}>→</span> : <span style={{ background: '#ccc', color: 'white', borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '700' }}>SOON</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INVOICE EXTRACTION TOOL
// ─────────────────────────────────────────────────────────────
function InvoiceExtractTool({ onBack }) {
  const [files, setFiles]           = useState([]);
  const [fields, setFields]         = useState('Invoice Date, Invoice Number, Customer Name, Vendor Name, Amount, Tax, Total Amount, Due Date');
  const [processing, setProcessing] = useState(false);
  const [result, setResult]         = useState(null);
  const [progress, setProgress]     = useState('');

  const handleFolderSelect = (e) => {
    setFiles(Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf')));
  };

  const handleSubmit = async () => {
    if (files.length === 0) { alert('Please select a folder!'); return; }
    if (!fields.trim()) { alert('Please enter fields to extract!'); return; }
    setProcessing(true); setResult(null);
    setProgress('Reading and extracting data from your invoices...');
    const formData = new FormData();
    for (let f of files) formData.append('pdfs', f);
    formData.append('fields', fields);
    try {
      const res  = await fetch('/api/extract-invoice', { method: 'POST', body: formData });
      const data = await res.json();
      setResult(data); setProgress('');
    } catch (err) { setProgress('Error: ' + err.message); }
    setProcessing(false);
  };

  const downloadExcel = (excelData) => {
    const bytes = Uint8Array.from(atob(excelData), c => c.charCodeAt(0));
    const url   = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    Object.assign(document.createElement('a'), { href: url, download: 'invoice_extraction.xlsx' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Extraction</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 5A</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>🧾 Invoice Extraction</h2>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '28px' }}>Upload invoices folder → Specify fields → Extract → Excel output</p>
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', padding: '22px', background: files.length > 0 ? '#f0fff4' : '#f9f9f9', border: files.length > 0 ? '2px solid #38a169' : '2px dashed #ddd', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
          {files.length > 0 ? <span style={{ color: '#38a169', fontWeight: '700' }}>✅ {files.length} invoice files ready</span> : <span style={{ color: '#bbb' }}>📂 Click to select folder</span>}
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
      </div>
      <div style={{ marginBottom: '28px' }}>
        <textarea value={fields} onChange={e => setFields(e.target.value)} rows={3}
          placeholder="Fields to extract: Invoice Date, Invoice Number, Customer Name, Amount..."
          style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', color: '#333', resize: 'vertical' }} />
      </div>
      <button onClick={handleSubmit} disabled={processing}
        style={{ width: '100%', background: processing ? '#888' : '#1a3c6e', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: processing ? 'not-allowed' : 'pointer' }}>
        {processing ? '⏳ Extracting...' : '🔍 Extract Invoice Data'}
      </button>
      {progress && <p style={{ textAlign: 'center', marginTop: '15px', color: '#555', fontSize: '13px' }}>{progress}</p>}
      {result && result.success && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[{ label: 'TOTAL', value: result.totalFiles, color: '#1a3c6e' }, { label: 'SUCCESS', value: result.successCount, color: '#276749' }, { label: 'FAILED', value: result.errorCount, color: '#c53030' }].map((s, i) => (
              <div key={i} style={{ background: '#f7f8fc', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <p style={{ color: s.color, fontSize: '24px', fontWeight: '800', margin: '0' }}>{s.value}</p>
                <p style={{ color: '#aaa', fontSize: '11px', margin: '4px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => downloadExcel(result.excelFile)}
            style={{ width: '100%', background: '#276749', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            ⬇ Download Excel Report
          </button>
          <QCBadge
            toolName="extraction-invoice"
            toolOutput={{
              invoices: result.invoices || [],
              summary:  { totalFiles: result.totalFiles, successCount: result.successCount, errorCount: result.errorCount },
            }}
            metadata={{ pageCount: result.pageCount }}
          />
        </div>
      )}
      {result && !result.success && (
        <div style={{ marginTop: '16px', background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', padding: '14px' }}>
          <p style={{ color: '#c53030', fontWeight: '700', margin: '0' }}>❌ Error: {result.error}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BANK STATEMENT EXTRACTION TOOL
// ─────────────────────────────────────────────────────────────
function BankExtractTool({ onBack }) {
  const [allFiles, setAllFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  const loadFiles = (fileList) => {
    const pdfs = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    setAllFiles(prev => {
      const existing = new Map(prev.map(f => [f.name, f]));
      pdfs.forEach(f => existing.set(f.name, f));
      return Array.from(existing.values());
    });
    setSelected(prev => {
      const updated = { ...prev };
      pdfs.forEach(f => { if (!(f.name in updated)) updated[f.name] = true; });
      return updated;
    });
    setResult(null); setError('');
  };

  const handleFolderSelect = (e) => loadFiles(e.target.files);
  const handleFileSelect   = (e) => loadFiles(e.target.files);
  const toggleOne  = (name) => setSelected(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleAll  = () => {
    const allChecked = allFiles.every(f => selected[f.name]);
    const sel = {};
    allFiles.forEach(f => sel[f.name] = !allChecked);
    setSelected(sel);
  };
  const clearAll = () => { setAllFiles([]); setSelected({}); setResult(null); setError(''); };

  const selectedFiles = allFiles.filter(f => selected[f.name]);
  const allChecked    = allFiles.length > 0 && allFiles.every(f => selected[f.name]);
  const someChecked   = allFiles.some(f => selected[f.name]);

  const handleExtract = async () => {
    if (selectedFiles.length === 0) { setError('Please select at least one PDF.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append('pdfs', f));
      const res  = await fetch('/api/extract-bank', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || 'Extraction failed.'); return; }
      setResult(data);
    } catch (err) { setError('Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!result?.excelFile) return;
    const blob = new Blob([Uint8Array.from(atob(result.excelFile), c => c.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = result.fileName || 'Bank_Statement_Extraction.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Extraction</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 5B</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>🏦 Bank Statement Extraction</h2>
      </div>
      <p style={{ color: '#888', fontSize: '13px', marginBottom: '28px' }}>Upload folder or pick individual PDFs → check/uncheck → Extract → Excel</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #1a3c6e', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📁</span>
          <span style={{ color: '#1a3c6e', fontWeight: '700', fontSize: '13px' }}>Upload Folder</span>
          <input type="file" webkitdirectory="true" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 12px', background: '#f7f8fc', border: '2px dashed #276749', borderRadius: '10px', cursor: 'pointer', textAlign: 'center' }}>
          <span style={{ fontSize: '28px' }}>📄</span>
          <span style={{ color: '#276749', fontWeight: '700', fontSize: '13px' }}>Upload PDFs</span>
          <input type="file" multiple accept=".pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
        </label>
      </div>
      {allFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>Select PDFs ({selectedFiles.length} of {allFiles.length})</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleAll} style={{ background: 'none', border: '1px solid #1a3c6e', color: '#1a3c6e', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
              <button onClick={clearAll} style={{ background: 'none', border: '1px solid #ccc', color: '#888', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
            </div>
          </div>
          <div style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', maxHeight: '300px', overflowY: 'auto' }}>
            {allFiles.map((f, i) => (
              <div key={f.name} onClick={() => toggleOne(f.name)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', background: selected[f.name] ? '#f0f4ff' : (i % 2 === 0 ? 'white' : '#fafafa'), borderBottom: i < allFiles.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selected[f.name] ? '#1a3c6e' : '#ccc'}`, background: selected[f.name] ? '#1a3c6e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected[f.name] && <span style={{ color: 'white', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                </div>
                <span style={{ fontSize: '13px', color: selected[f.name] ? '#1a3c6e' : '#555', fontWeight: selected[f.name] ? '600' : '400', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}</span>
                <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
          {!someChecked && <p style={{ color: '#cc0000', fontSize: '12px', marginTop: '6px' }}>⚠️ Please select at least one PDF.</p>}
        </div>
      )}
      {error && <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#cc0000', fontSize: '13px' }}>❌ {error}</div>}
      <button onClick={handleExtract} disabled={loading || selectedFiles.length === 0}
        style={{ width: '100%', padding: '14px', background: loading || selectedFiles.length === 0 ? '#ccc' : '#1a3c6e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: loading || selectedFiles.length === 0 ? 'not-allowed' : 'pointer', marginBottom: '20px' }}>
        {loading ? '⏳ Extracting transactions...' : `🏦 Extract ${selectedFiles.length > 0 ? selectedFiles.length + ' ' : ''}Bank Statement${selectedFiles.length !== 1 ? 's' : ''}`}
      </button>
      {result && (
        <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: '10px', padding: '20px' }}>
          <p style={{ color: '#166534', fontWeight: '700', fontSize: '16px', margin: '0 0 16px' }}>✅ Extraction Complete!</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a3c6e' }}>{result.totalFiles}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>Files Processed</div>
            </div>
            <div style={{ background: 'white', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a3c6e' }}>{result.totalTransactions}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>Transactions Extracted</div>
            </div>
          </div>
          {result.summaries && result.summaries.map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '8px', fontSize: '13px' }}>
              <p style={{ fontWeight: '700', color: '#1a3c6e', margin: '0 0 4px' }}>📄 {s.file}</p>
              <p style={{ color: '#555', margin: '0' }}>{s.bank} • {s.account_holder} • {s.account_number} • {s.period} • {s.transaction_count} transactions</p>
            </div>
          ))}
          <button onClick={handleDownload}
            style={{ width: '100%', padding: '14px', background: '#166534', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
            📥 Download Excel File
          </button>
          <QCBadge
            toolName="extraction-bank"
            toolOutput={result.qcData || {
              statements: (result.summaries || []).map(s => ({
                file:             s.file,
                openingBalance:   s.opening_balance   || null,
                closingBalance:   s.closing_balance   || null,
                totalDebits:      s.total_debits      || null,
                totalCredits:     s.total_credits     || null,
                transactionCount: s.transaction_count || 0,
                periodStart:      null,
                periodEnd:        null,
              })),
              transactions: [], dateGaps: [], amountOutliers: [],
            }}
            metadata={{ pageCount: result.pageCount }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAX STATEMENT EXTRACTION — placeholder
// ─────────────────────────────────────────────────────────────
function TaxExtractTool({ onBack }) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '36px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1a3c6e', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', padding: '0' }}>← Back to Extraction</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span style={{ background: '#1a3c6e', color: 'white', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700' }}>STEP 5C</span>
        <h2 style={{ color: '#1a3c6e', fontSize: '22px', margin: '0' }}>📑 Tax Statement Extraction</h2>
      </div>
      <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '20px', textAlign: 'center', marginTop: '20px' }}>
        <p style={{ fontSize: '32px', margin: '0 0 12px' }}>⏳</p>
        <p style={{ color: '#b7791f', fontWeight: '700', fontSize: '15px', margin: '0 0 8px' }}>Coming Soon</p>
        <p style={{ color: '#888', fontSize: '13px', margin: '0' }}>Will be built after Invoice & Bank Statement extraction are complete.</p>
      </div>
    </div>
  );
}