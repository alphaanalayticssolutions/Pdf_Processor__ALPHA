// stores/downloadsStore.js
// Frontend-controlled execution manager + downloads hub.
// Queue: sequential, one job at a time — no backend queue needed.
// Storage: IndexedDB (blobs + metadata). Zero backend persistence.

import { create } from 'zustand';
import { dbSave, dbGetAll, dbDelete, dbDeleteExpired } from '@/lib/idb';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const FILE_SIZE_LIMITS = {
  'extraction-bank':      50 * 1024 * 1024,
  'extraction-invoice':   30 * 1024 * 1024,
  'bates-stamp':          80 * 1024 * 1024,
  'categorise':           40 * 1024 * 1024,
  'transaction-analysis': 20 * 1024 * 1024,
  'splitter':             60 * 1024 * 1024,
  'tracker':              10 * 1024 * 1024,
  'desc-categoriser':     10 * 1024 * 1024,
  'duplicate':           100 * 1024 * 1024,
  'qc-bank':              50 * 1024 * 1024,
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

function genId() {
  return 'dl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function base64ToBlob(b64, mime) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function daysUntilExpiry(expiresAt) {
  const diff = expiresAt - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / 86400000);
}

export const useDownloadsStore = create((set, get) => ({

  downloads:     [],
  loaded:        false,
  queue:         [],
  isProcessing:  false,
  dashboardOpen: false,
  unreadCount:   0,
  notification:  null,

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

  _processNext: async () => {
    const state = get();
    if (state.isProcessing) return;
    const next = state.queue.find(j => j.status === 'waiting');
    if (!next) return;

    set(s => ({
      isProcessing: true,
      queue: s.queue.map(j => j.id === next.id ? { ...j, status: 'processing' } : j),
    }));

    const placeholder = {
      id:           next.id,
      toolName:     next.toolName,
      displayName:  next.displayName,
      fileName:     'Processing…',
      fileBlob:     null,
      fileSize:     '—',
      status:       'processing',
      aiSummary:    next.displayName + ' in progress…',
      category:     next.displayName,
      createdAt:    Date.now(),
      expiresAt:    Date.now() + SEVEN_DAYS_MS,
      errorMessage: null,
    };

    set(s => ({ downloads: [placeholder, ...s.downloads] }));

    try {
      const result = await next.executeFn();

      const entry = {
        ...placeholder,
        fileName:  result.fileName  || next.toolName + '_output',
        fileBlob:  result.blob      || null,
        fileSize:  result.blob ? formatBytes(result.blob.size) : '—',
        status:    'ready',
        aiSummary: result.aiSummary || 'Completed successfully',
        category:  result.category  || next.displayName,
        extra:     result.extra     || null,
      };

      try { await dbSave(entry); } catch (e) { console.warn('[Downloads] IDB save failed:', e); }

      set(s => ({
        downloads:    s.downloads.map(d => d.id === next.id ? entry : d),
        queue:        s.queue.map(j => j.id === next.id ? { ...j, status: 'done' } : j),
        isProcessing: false,
        unreadCount:  s.unreadCount + 1,
        notification: { message: next.displayName + ' ready — ' + entry.fileSize, type: 'success' },
      }));

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('✅ ' + next.displayName + ' Ready', {
          body: entry.fileName + ' (' + entry.fileSize + ')',
          icon: '/favicon.ico',
        });
      }

      if (typeof next.onSuccess === 'function') next.onSuccess(result);

    } catch (err) {
      console.error('[Downloads] Job failed:', next.toolName, err.message);

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
        notification: { message: next.displayName + ' failed: ' + err.message, type: 'error' },
      }));

      if (typeof next.onError === 'function') next.onError(err);
    }

    setTimeout(() => get()._processNext(), 200);
  },

  downloadSingle: (id) => {
    const dl = get().downloads.find(d => d.id === id);
    if (!dl || !dl.fileBlob) return;
    triggerDownload(dl.fileBlob, dl.fileName);
  },

  downloadBulk: async (ids) => {
    const dls = get().downloads.filter(d => ids.includes(d.id) && d.fileBlob && d.status === 'ready');
    if (dls.length === 0) return;
    if (dls.length === 1) { get().downloadSingle(dls[0].id); return; }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const nameCounts = {};
    for (const dl of dls) {
      const base = dl.fileName.replace(/(\.[^.]+)$/, '');
      const ext  = (dl.fileName.match(/(\.[^.]+)$/) || [''])[1];
      nameCounts[dl.fileName] = (nameCounts[dl.fileName] || 0) + 1;
      const finalName = nameCounts[dl.fileName] > 1 ? base + '_' + nameCounts[dl.fileName] + ext : dl.fileName;
      zip.file(finalName, dl.fileBlob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    triggerDownload(zipBlob, 'alpha_downloads_' + new Date().toISOString().slice(0, 10) + '.zip');
  },

  deleteDownload: async (id) => {
    await dbDelete(id).catch(() => {});
    set(s => ({ downloads: s.downloads.filter(d => d.id !== id) }));
  },

  clearExpired: async () => {
    const now     = Date.now();
    const expired = get().downloads.filter(d => d.expiresAt <= now);
    for (const e of expired) await dbDelete(e.id).catch(() => {});
    set(s => ({ downloads: s.downloads.filter(d => d.expiresAt > now) }));
  },

  clearAll: async () => {
    for (const d of get().downloads) await dbDelete(d.id).catch(() => {});
    set({ downloads: [], unreadCount: 0 });
  },

  cancelJob: (id) => {
    set(s => ({
      queue:     s.queue.filter(j => !(j.id === id && j.status === 'waiting')),
      downloads: s.downloads.filter(d => d.id !== id),
    }));
  },

  openDashboard:  () => set({ dashboardOpen: true, unreadCount: 0 }),
  closeDashboard: () => set({ dashboardOpen: false }),
  clearNotification: () => set({ notification: null }),

  requestNotificationPermission: async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
  },
}));

export const selectQueueActive = function(s) { return s.queue.filter(function(j) { return j.status === 'waiting' || j.status === 'processing'; }); };
export const selectReadyCount  = function(s) { return s.downloads.filter(function(d) { return d.status === 'ready'; }).length; };
export const selectDaysLeft    = function(item) { return daysUntilExpiry(item.expiresAt); };