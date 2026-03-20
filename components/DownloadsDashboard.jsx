'use client';
// components/DownloadsDashboard.jsx
// Slide-in panel — Downloads Hub + Notification Bell
// Follows the exact same inline-style system as page.js

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  useDownloadsStore,
  selectQueueActive,
  selectReadyCount,
  selectDaysLeft,
  TOOL_LABELS,
} from '@/stores/downloadsStore';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS = {
  processing: { icon: '⏳', label: 'Processing', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
  waiting:    { icon: '🕐', label: 'Waiting',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  ready:      { icon: '✅', label: 'Ready',      color: '#16a34a', bg: '#f0fff4', border: '#86efac' },
  failed:     { icon: '❌', label: 'Failed',     color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const FILE_ICONS = {
  '.xlsx': '📊', '.xls': '📊', '.csv': '📄',
  '.zip':  '🗜',  '.pdf': '📄',
};
function fileIcon(name = '') {
  const ext = name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return FILE_ICONS[ext] || '📁';
}

function ExpiryLabel({ expiresAt }) {
  const days = selectDaysLeft({ expiresAt });
  if (days <= 0) return <span style={{ fontSize: '10px', color: '#dc2626' }}>Expired</span>;
  const color = days <= 2 ? '#dc2626' : days <= 4 ? '#d97706' : '#9ca3af';
  return (
    <span style={{ fontSize: '10px', color }}>
      Expires in {days}d
    </span>
  );
}

// ── Progress bar (animated) ────────────────────────────────────────────────────
function ProgressBar({ active }) {
  if (!active) return null;
  return (
    <div style={{ height: '3px', borderRadius: '2px', background: '#e5e7eb', overflow: 'hidden', margin: '6px 0 2px' }}>
      <div style={{
        height: '100%',
        background: 'linear-gradient(90deg, #6366f1, #818cf8)',
        borderRadius: '2px',
        animation: 'dl-sweep 1.4s ease-in-out infinite',
        width: '45%',
      }} />
      <style>{`@keyframes dl-sweep { 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }`}</style>
    </div>
  );
}

// ── Single download item row ───────────────────────────────────────────────────
function DownloadItem({ item, isSelected, onToggleSelect, onDownload, onDelete, onCancel }) {
  const cfg     = STATUS[item.status] || STATUS.waiting;
  const isReady = item.status === 'ready';
  const isProc  = item.status === 'processing';
  const isWait  = item.status === 'waiting';
  const isFail  = item.status === 'failed';
  const { cancelJob } = useDownloadsStore();

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '12px 18px',
      borderBottom: '1px solid #f3f4f6',
      background: isSelected ? '#eff6ff' : 'white',
      transition: 'background 0.1s',
    }}>
      {/* Checkbox — only for ready items */}
      <div
        onClick={() => isReady && onToggleSelect(item.id)}
        style={{
          width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, marginTop: '3px',
          border: `2px solid ${isReady ? (isSelected ? '#1a3c6e' : '#d1d5db') : '#e5e7eb'}`,
          background: isSelected ? '#1a3c6e' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isReady ? 'pointer' : 'default',
          transition: 'all 0.1s',
        }}
      >
        {isSelected && <span style={{ color: 'white', fontSize: '9px', fontWeight: '800', lineHeight: 1 }}>✓</span>}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', flexShrink: 0 }}>{fileIcon(item.fileName)}</span>
          <span style={{
            fontSize: '12px', fontWeight: '700', color: '#111827',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px',
          }}>
            {item.fileName === 'Processing…' || item.fileName === '—' ? item.displayName : item.fileName}
          </span>
          <span style={{
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
            borderRadius: '20px', padding: '1px 7px', fontSize: '10px', fontWeight: '700', flexShrink: 0,
          }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '3px' }}>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>{item.displayName}</span>
          {item.fileSize && item.fileSize !== '—' && (
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>· {item.fileSize}</span>
          )}
          {isReady && <ExpiryLabel expiresAt={item.expiresAt} />}
        </div>

        {/* AI summary */}
        {item.aiSummary && !['Processing…', 'In queue…'].some(s => item.aiSummary.startsWith(s)) && (
          <div style={{
            fontSize: '11px', color: '#374151', fontStyle: 'italic',
            background: '#f8fafc', borderRadius: '5px', padding: '3px 7px', marginTop: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.aiSummary}
          </div>
        )}

        {/* Progress bar */}
        <ProgressBar active={isProc} />

        {/* Error */}
        {isFail && item.errorMessage && (
          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', lineHeight: '1.4' }}>
            ⚠ {item.errorMessage.slice(0, 100)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
        {isReady && (
          <button onClick={() => onDownload(item.id)}
            style={{ padding: '5px 10px', background: '#1a3c6e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
            title="Download">
            ⬇
          </button>
        )}
        {isWait && (
          <button onClick={() => cancelJob(item.id)}
            style={{ padding: '5px 8px', background: '#f1f5f9', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}
            title="Cancel">
            ✕
          </button>
        )}
        {(isReady || isFail) && (
          <button onClick={() => onDelete(item.id)}
            style={{ padding: '5px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
            title="Delete">
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ── Queue status banner ────────────────────────────────────────────────────────
function QueueBanner() {
  const queue    = useDownloadsStore(selectQueueActive);
  if (queue.length === 0) return null;

  const processing = queue.find(j => j.status === 'processing');
  const waiting    = queue.filter(j => j.status === 'waiting');

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
      padding: '10px 18px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'dl-spin 1s linear infinite', flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px' }}>⟳</span>
        </div>
        <div style={{ flex: 1 }}>
          {processing && (
            <div style={{ fontSize: '12px', color: '#c7d2fe', fontWeight: '600' }}>
              Processing: <span style={{ color: 'white' }}>{processing.displayName}</span>
            </div>
          )}
          {waiting.length > 0 && (
            <div style={{ fontSize: '11px', color: '#818cf8', marginTop: '1px' }}>
              {waiting.length} job{waiting.length !== 1 ? 's' : ''} waiting in queue
            </div>
          )}
        </div>
      </div>
      <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: '8px' }}>
        <div style={{
          height: '100%', background: 'linear-gradient(90deg, #818cf8, #a5b4fc)',
          borderRadius: '2px', animation: 'dl-sweep 1.2s ease-in-out infinite', width: '40%',
        }} />
      </div>
      <style>{`
        @keyframes dl-spin  { to { transform: rotate(360deg); } }
        @keyframes dl-sweep { 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }
      `}</style>
    </div>
  );
}

// ── Main Downloads Dashboard (slide-in panel) ─────────────────────────────────
export default function DownloadsDashboard() {
  const {
    downloads, dashboardOpen, closeDashboard,
    downloadSingle, downloadBulk, deleteDownload, clearAll,
  } = useDownloadsStore();

  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [filterStatus,  setFilterStatus]  = useState('All');
  const [filterTool,    setFilterTool]    = useState('All');
  const [search,        setSearch]        = useState('');
  const [bulkLoading,   setBulkLoading]   = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const panelRef = useRef(null);

  // Reset selections when dashboard closes
  useEffect(() => { if (!dashboardOpen) setSelectedIds(new Set()); }, [dashboardOpen]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && dashboardOpen) closeDashboard(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dashboardOpen, closeDashboard]);

  // Tool options for filter
  const toolOptions = useMemo(() => {
    const tools = new Set(downloads.map(d => d.displayName).filter(Boolean));
    return ['All', ...Array.from(tools).sort()];
  }, [downloads]);

  // Filtered list
  const filtered = useMemo(() => {
    return downloads.filter(d => {
      if (filterStatus !== 'All' && d.status !== filterStatus.toLowerCase()) return false;
      if (filterTool   !== 'All' && d.displayName !== filterTool)             return false;
      if (search) {
        const q = search.toLowerCase();
        const inName    = d.fileName?.toLowerCase().includes(q);
        const inSummary = d.aiSummary?.toLowerCase().includes(q);
        const inTool    = d.displayName?.toLowerCase().includes(q);
        if (!inName && !inSummary && !inTool) return false;
      }
      return true;
    });
  }, [downloads, filterStatus, filterTool, search]);

  const readyFiltered = filtered.filter(d => d.status === 'ready');
  const allSelected   = readyFiltered.length > 0 && readyFiltered.every(d => selectedIds.has(d.id));

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(readyFiltered.map(d => d.id)));
  };

  const handleBulkDownload = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkLoading(true);
    try { await downloadBulk(ids); } catch (e) { console.error(e); }
    setBulkLoading(false);
    setSelectedIds(new Set());
  };

  const handleClearAll = async () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; }
    await clearAll();
    setSelectedIds(new Set()); setConfirmClear(false);
  };

  if (!dashboardOpen) return null;

  const readyCount      = downloads.filter(d => d.status === 'ready').length;
  const processingCount = downloads.filter(d => d.status === 'processing').length;
  const failedCount     = downloads.filter(d => d.status === 'failed').length;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={closeDashboard}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 998, backdropFilter: 'blur(2px)' }}
      />

      {/* Slide-in panel */}
      <div ref={panelRef} style={{
        position:   'fixed',
        top: 0, right: 0, bottom: 0,
        width:      'min(520px, 95vw)',
        background: 'white',
        zIndex:     999,
        display:    'flex',
        flexDirection: 'column',
        boxShadow:  '-12px 0 48px rgba(0,0,0,0.18)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        animation:  'dl-slide-in 0.22s ease-out',
      }}>
        <style>{`
          @keyframes dl-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
          .dl-item:hover { background: #fafafa !important; }
        `}</style>

        {/* ── Header ── */}
        <div style={{ background: '#0f2444', padding: '18px 20px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h2 style={{ color: 'white', margin: '0 0 2px', fontSize: '17px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📥 Downloads Hub
              </h2>
              <p style={{ color: '#64748b', margin: 0, fontSize: '11px' }}>
                {readyCount} ready · {processingCount > 0 ? `${processingCount} processing · ` : ''}{downloads.length} total · Files expire in 7 days
              </p>
            </div>
            <button onClick={closeDashboard}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: '8px', padding: '7px 11px', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Stats pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { label: `${readyCount} Ready`,      color: '#22c55e', show: readyCount > 0 },
              { label: `${processingCount} Active`, color: '#818cf8', show: processingCount > 0 },
              { label: `${failedCount} Failed`,     color: '#f87171', show: failedCount > 0 },
            ].filter(p => p.show).map(p => (
              <span key={p.label} style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '20px', padding: '2px 10px', fontSize: '10px', fontWeight: '700', color: p.color,
              }}>{p.label}</span>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginTop: '10px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '13px' }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search files, summaries, tools…"
              style={{
                width: '100%', padding: '8px 12px 8px 30px', borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.08)', color: 'white',
                fontSize: '12px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* ── Queue Banner ── */}
        <QueueBanner />

        {/* ── Filters ── */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
          background: '#f8fafc', flexShrink: 0,
          display: 'flex', gap: '6px', overflowX: 'auto', alignItems: 'center',
        }}>
          {['All', 'Ready', 'Processing', 'Failed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{
                padding: '4px 11px', borderRadius: '20px',
                border: `1px solid ${filterStatus === s ? '#1a3c6e' : '#e5e7eb'}`,
                background: filterStatus === s ? '#1a3c6e' : 'white',
                color: filterStatus === s ? 'white' : '#6b7280',
                fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              {s}
            </button>
          ))}
          {toolOptions.length > 2 && (
            <select value={filterTool} onChange={e => setFilterTool(e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: '20px', border: '1px solid #e5e7eb',
                background: filterTool !== 'All' ? '#eff6ff' : 'white',
                color: filterTool !== 'All' ? '#1e40af' : '#6b7280',
                fontSize: '11px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, outline: 'none',
              }}>
              {toolOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* ── Bulk Action Bar ── */}
        {selectedIds.size > 0 && (
          <div style={{
            padding: '8px 16px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          }}>
            <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>
              {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ padding: '5px 10px', background: 'white', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#6b7280', fontSize: '11px', cursor: 'pointer' }}>
                Deselect
              </button>
              <button onClick={handleBulkDownload} disabled={bulkLoading}
                style={{ padding: '5px 14px', background: '#1a3c6e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: bulkLoading ? 'not-allowed' : 'pointer' }}>
                {bulkLoading ? '⏳ Zipping…' : selectedIds.size === 1 ? '⬇ Download' : `⬇ ZIP ${selectedIds.size} Files`}
              </button>
            </div>
          </div>
        )}

        {/* ── Downloads List ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
              <div style={{ fontSize: '44px', marginBottom: '14px' }}>
                {downloads.length === 0 ? '📭' : '🔍'}
              </div>
              <p style={{ fontWeight: '700', margin: '0 0 6px', color: '#374151', fontSize: '14px' }}>
                {downloads.length === 0 ? 'No downloads yet' : 'No results match your filters'}
              </p>
              <p style={{ fontSize: '12px', margin: '0 0 16px', lineHeight: '1.6' }}>
                {downloads.length === 0
                  ? 'Run any tool — outputs will appear here automatically.'
                  : 'Try clearing filters or changing the search term.'}
              </p>
              {downloads.length === 0 && (
                <button onClick={closeDashboard}
                  style={{ padding: '8px 20px', background: '#1a3c6e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  Go to Tools →
                </button>
              )}
            </div>
          ) : (
            filtered.map(item => (
              <DownloadItem
                key={item.id}
                item={item}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
                onDownload={downloadSingle}
                onDelete={deleteDownload}
              />
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e5e7eb',
          background: '#f8fafc', flexShrink: 0,
          display: 'flex', gap: '8px', alignItems: 'center',
        }}>
          {readyFiltered.length > 1 && (
            <button onClick={toggleSelectAll}
              style={{ flex: 1, padding: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#374151', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
              {allSelected ? 'Deselect All' : `Select All Ready (${readyFiltered.length})`}
            </button>
          )}
          {downloads.length > 0 && (
            <button onClick={handleClearAll}
              style={{
                padding: '8px 14px', background: confirmClear ? '#fee2e2' : 'white',
                border: `1px solid ${confirmClear ? '#fca5a5' : '#e5e7eb'}`,
                borderRadius: '8px', color: confirmClear ? '#dc2626' : '#9ca3af',
                fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
              }}>
              {confirmClear ? '⚠ Confirm Clear All' : '🗑 Clear All'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Bell Button — drop-in for the page header ──────────────────────────────────
export function DownloadsBell() {
  const {
    openDashboard, unreadCount, downloads,
  } = useDownloadsStore();

  const activeQueue    = useDownloadsStore(selectQueueActive);
  const processingCount = activeQueue.length;
  const badge          = processingCount > 0 ? processingCount : unreadCount;

  return (
    <button
      onClick={openDashboard}
      style={{
        position:   'relative',
        background: 'rgba(255,255,255,0.08)',
        border:     '1px solid rgba(255,255,255,0.14)',
        borderRadius: '10px',
        padding:    '7px 14px',
        cursor:     'pointer',
        display:    'flex', alignItems: 'center', gap: '7px',
        color:      'white', fontSize: '13px', fontWeight: '600',
        transition: 'all 0.15s',
      }}
      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
      onMouseOut={e  => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
      title="Downloads Hub"
    >
      <span style={{ fontSize: '15px' }}>📥</span>
      <span>Downloads</span>
      {badge > 0 && (
        <span style={{
          background:   processingCount > 0 ? '#6366f1' : '#dc2626',
          color:        'white',
          borderRadius: '10px',
          padding:      '1px 6px',
          fontSize:     '10px',
          fontWeight:   '800',
          minWidth:     '16px',
          textAlign:    'center',
          animation:    processingCount > 0 ? 'dl-pulse 1.5s ease-in-out infinite' : 'none',
        }}>
          {badge}
        </span>
      )}
      {downloads.length > 0 && badge === 0 && (
        <span style={{ fontSize: '10px', color: '#64748b' }}>{downloads.length}</span>
      )}
      <style>{`@keyframes dl-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>
    </button>
  );
}

// ── Toast Notification (auto-dismiss) ─────────────────────────────────────────
export function DownloadsToast() {
  const { notification, clearNotification } = useDownloadsStore();

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(clearNotification, 4000);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  if (!notification) return null;

  const colors = {
    success: { bg: '#f0fff4', border: '#86efac', color: '#166534', icon: '✅' },
    error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: '❌' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', icon: 'ℹ️' },
  };
  const c = colors[notification.type] || colors.info;

  return (
    <div style={{
      position:  'fixed', bottom: '24px', right: '24px',
      zIndex:    1000,
      background: c.bg, border: `1.5px solid ${c.border}`,
      borderRadius: '12px', padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      maxWidth: '340px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      animation: 'dl-toast-in 0.25s ease-out',
    }}>
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{c.icon}</span>
      <span style={{ fontSize: '13px', color: c.color, fontWeight: '600', lineHeight: '1.4' }}>{notification.message}</span>
      <button onClick={clearNotification}
        style={{ background: 'none', border: 'none', color: c.color, cursor: 'pointer', fontSize: '14px', flexShrink: 0, opacity: 0.6, padding: 0, marginLeft: '4px' }}>
        ×
      </button>
      <style>{`@keyframes dl-toast-in { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}