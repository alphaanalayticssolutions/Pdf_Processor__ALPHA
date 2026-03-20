// stores/downloadsStore.js
// Frontend-controlled execution manager + downloads hub.
// Queue: sequential, one job at a time — no backend queue needed.
// Storage: IndexedDB (blobs + metadata). Zero backend persistence.

import { create } from 'zustand';
import { dbSave, dbGetAll, dbDelete, dbDeleteExpired } from '@/lib/idb';

// ── Constants ──────────────────────────────────────────────────────────────────
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// File size limits to prevent Vercel timeout — checked before queue fires
export const FILE_SIZE_LIMITS = {
  'extraction-bank':      50 * 1024 * 1024,  // 50 MB
  'extraction-invoice':   30 * 1024 * 1024,  // 30 MB
  'bates-stamp':          80 * 1024 * 1024,  // 80 MB
  'categorise':           40 * 1024 * 1024,  // 40 MB
  'transaction-analysis': 20 * 1024 * 1024,  // 20 MB
  'splitter':             60 * 1024 * 1024,  // 60 MB
  'tracker':              10 * 1024 * 1024,  // 10 MB
  'desc-categoriser':     10 * 1024 * 1024,  // 10 MB
  'duplicate':            100 * 1024 * 1024, // 100 MB (hash only, no AI)
  'qc-bank':              50 * 1024 * 1024,  // 50 MB
};

export const TOOL_LABELS = {
  'extraction-bank':      'Bank Extraction',
  'extraction-invoice':   'Invoice Extraction',
  'transaction-analysis': 'Transaction Analysis',
  'tracker':              'Statement Tracker',
  'categorise':           'Categorisation',
  'bates-stamp':          'Bates Stamping',
  'splitter':             'PDF Splitter',
  'desc-categoriser':     'Desc. Categoriser',
  'duplicate':            'Duplicate Report',
  'qc-bank':              'QC Bank Extraction',
};

// MIME types for download
export const TOOL_MIME = {
  'extraction-bank':      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'extraction-invoice':   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'transaction-analysis': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'tracker':              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'desc-categoriser':     'text/csv',
  'duplicate':            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'categorise':           'application/zip',
  'bates-stamp':          'application/zip',
  'splitter':             'application/zip',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function genId() {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024)           return bytes + ' B';
  if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function base64ToBlob(b64, mime) {
  const bin    = atob(b64);
  const bytes  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function daysUntilExpiry(expiresAt) {
  const diff = expiresAt - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ── Store ──────────────────────────────────────────────────────────────────────
export const useDownloadsStore = create((set, get) => ({

  // ── Persistent state (IDB-backed) ──────────────────────────────────────────
  downloads: [],   // DownloadEntry[]
  loaded:    false,

  // ── Queue state (in-memory, resets on refresh — by design) ────────────────
  // Queue = frontend execution manager. Not a backend queue. Not a cloud queue.
  queue:        [],   // QueueJob[] — { id, toolName, displayName, status, executeFn, onSuccess, onError }
  isProcessing: false,

  // ── UI state ───────────────────────────────────────────────────────────────
  dashboardOpen: false,
  unreadCount:   0,
  notification:  null,  // { message, type: 'success' | 'info' | 'error' }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT — load from IDB, purge expired
  // ═══════════════════════════════════════════════════════════════════════════
  init: async () => {
    if (get().loaded) return;
    try {
      await dbDeleteExpired();
      const items = await dbGetAll();
      set({ downloads: items.sort((a, b) => b.createdAt - a.createdAt), loaded: true });
    } catch (err) {
      console.warn('[Downloads] IDB init failed:', err);
      set({ loaded: true });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD JOB — main entry point for all tools
  //
  // jobConfig: {
  //   toolName:    string                  — e.g. 'extraction-bank'
  //   displayName: string                  — shown in queue UI
  //   executeFn:   async () => ResultObj   — the actual API call
  //   onSuccess:   (result) => void        — optional: lets tool show inline results
  //   onError:     (err)    => void        — optional: lets tool show inline error
  // }
  //
  // ResultObj: {
  //   blob:       Blob      — the file to download
  //   fileName:   string    — suggested filename
  //   aiSummary:  string    — AI-generated or data-derived summary
  //   category:   string    — display category label
  //   extra:      any       — tool-specific data (qcData, reconciliation, etc.)
  // }
  // ═══════════════════════════════════════════════════════════════════════════
  addJob: (jobConfig) => {
    const id  = genId();
    const job = {
      id,
      toolName:    jobConfig.toolName,
      displayName: jobConfig.displayName || TOOL_LABELS[jobConfig.toolName] || jobConfig.toolName,
      executeFn:   jobConfig.executeFn,
      onSuccess:   jobConfig.onSuccess || null,
      onError:     jobConfig.onError   || null,
      status:      'waiting',
      addedAt:     Date.now(),
    };

    set(s => ({ queue: [...s.queue, job] }));
    get()._processNext();
    return id;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL — sequential queue processor
  // One job at a time. Next job only starts after current finishes/fails.
  // ═══════════════════════════════════════════════════════════════════════════
  _processNext: async () => {
    const state = get();
    if (state.isProcessing) return;

    const next = state.queue.find(j => j.status === 'waiting');
    if (!next) return;

    // Mark as processing
    set(s => ({
      isProcessing: true,
      queue: s.queue.map(j => j.id === next.id ? { ...j, status: 'processing' } : j),
    }));

    // Add placeholder entry to downloads list immediately (shows "Processing" status)
    const placeholder = {
      id:          next.id,
      toolName:    next.toolName,
      displayName: next.displayName,
      fileName:    'Processing…',
      fileBlob:    null,
      fileSize:    '—',
      status:      'processing',
      aiSummary:   `${next.displayName} in progress…`,
      category:    next.displayName,
      createdAt:   Date.now(),
      expiresAt:   Date.now() + SEVEN_DAYS_MS,
      errorMessage: null,
    };

    set(s => ({ downloads: [placeholder, ...s.downloads] }));

    try {
      const result = await next.executeFn();

      const entry = {
        ...placeholder,
        fileName:  result.fileName  || `${next.toolName}_output`,
        fileBlob:  result.blob      || null,
        fileSize:  result.blob ? formatBytes(result.blob.size) : '—',
        status:    'ready',
        aiSummary: result.aiSummary || 'Completed successfully',
        category:  result.category  || next.displayName,
        extra:     result.extra     || null,
      };

      // Persist to IDB (blobs are stored natively)
      try { await dbSave(entry); } catch (e) { console.warn('[Downloads] IDB save failed:', e); }

      set(s => ({
        downloads:    s.downloads.map(d => d.id === next.id ? entry : d),
        queue:        s.queue.map(j => j.id === next.id ? { ...j, status: 'done' } : j),
        isProcessing: false,
        unreadCount:  s.unreadCount + 1,
        notification: { message: `${next.displayName} ready — ${entry.fileSize}`, type: 'success' },
      }));

      // Browser notification (if permission granted)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`✅ ${next.displayName} Ready`, {
          body: `${entry.fileName} (${entry.fileSize})`,
          icon: '/favicon.ico',
        });
      }

      // Call tool's inline success callback
      if (typeof next.onSuccess === 'function') next.onSuccess(result);

    } catch (err) {
      console.error(`[Downloads] Job failed: ${next.toolName}`, err.message);

      const failed = {
        ...placeholder,
        status:       'failed',
        aiSummary:    'Processing failed',
        errorMessage: err.message || 'Unknown error',
      };

      set(s => ({
        downloads:    s.downloads.map(d => d.id === next.id ? failed : d),
        queue:        s.queue.map(j => j.id === next.id ? { ...j, status: 'failed' } : j),
        isProcessing: false,
        notification: { message: `${next.displayName} failed: ${err.message}`, type: 'error' },
      }));

      if (typeof next.onError === 'function') next.onError(err);
    }

    // Slight delay before processing next — prevents request stacking
    setTimeout(() => get()._processNext(), 200);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Single file — direct browser download */
  downloadSingle: (id) => {
    const dl = get().downloads.find(d => d.id === id);
    if (!dl?.fileBlob) return;
    triggerDownload(dl.fileBlob, dl.fileName);
  },

  /** Multiple files — client-side ZIP via dynamic import */
  downloadBulk: async (ids) => {
    const dls = get().downloads.filter(d => ids.includes(d.id) && d.fileBlob && d.status === 'ready');
    if (dls.length === 0) return;
    if (dls.length === 1) { get().downloadSingle(dls[0].id); return; }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    // Deduplicate filenames inside ZIP
    const nameCounts = {};
    for (const dl of dls) {
      const base = dl.fileName.replace(/(\.[^.]+)$/, '');
      const ext  = dl.fileName.match(/(\.[^.]+)$/)?.[1] || '';
      nameCounts[dl.fileName] = (nameCounts[dl.fileName] || 0) + 1;
      const finalName = nameCounts[dl.fileName] > 1 ? `${base}_${nameCounts[dl.fileName]}${ext}` : dl.fileName;
      zip.file(finalName, dl.fileBlob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    triggerDownload(zipBlob, `alpha_downloads_${new Date().toISOString().slice(0, 10)}.zip`);
  },

  /** Remove from store and IDB */
  deleteDownload: async (id) => {
    await dbDelete(id).catch(() => {});
    set(s => ({ downloads: s.downloads.filter(d => d.id !== id) }));
  },

  /** Clear all expired entries */
  clearExpired: async () => {
    const now     = Date.now();
    const expired = get().downloads.filter(d => d.expiresAt <= now);
    for (const e of expired) await dbDelete(e.id).catch(() => {});
    set(s => ({ downloads: s.downloads.filter(d => d.expiresAt > now) }));
  },

  /** Clear all downloads (reset) */
  clearAll: async () => {
    for (const d of get().downloads) await dbDelete(d.id).catch(() => {});
    set({ downloads: [], unreadCount: 0 });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // QUEUE HELPERS (exposed for UI)
  // ═══════════════════════════════════════════════════════════════════════════

  /** How many jobs are waiting or processing right now */
  get queueLength() {
    return get().queue.filter(j => j.status === 'waiting' || j.status === 'processing').length;
  },

  /** Cancel a waiting job (cannot cancel processing) */
  cancelJob: (id) => {
    set(s => ({
      queue:     s.queue.filter(j => j.id !== id || j.status !== 'waiting'),
      downloads: s.downloads.filter(d => d.id !== id),
    }));
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UI ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  openDashboard:  () => set({ dashboardOpen: true, unreadCount: 0 }),
  closeDashboard: () => set({ dashboardOpen: false }),
  clearNotification: () => set({ notification: null }),

  // ── Request browser notification permission (call once on login) ───────────
  requestNotificationPermission: async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
  },
}));

// ── Derived selectors (use these in components for performance) ────────────────
export const selectQueueActive  = s => s.queue.filter(j => j.status === 'waiting' || j.status === 'processing');
export const selectReadyCount   = s => s.downloads.filter(d => d.status === 'ready').length;
export const selectDaysLeft     = (item) => daysUntilExpiry(item.expiresAt);