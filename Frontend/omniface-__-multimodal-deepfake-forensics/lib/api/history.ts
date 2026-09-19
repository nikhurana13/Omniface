'use client';

import { AnalysisResult } from './analysis';
import { authService } from './auth';

const BACKEND_API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const token = await authService.getIdToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

// Demo item IDs to automatically purge from legacy browser caches
const DEMO_IDS = new Set([
  'ana_172561001',
  'ana_172561002',
  'ana_172561003',
  'ana_172561004',
]);

function getHistoryKey(): string {
  if (typeof window === 'undefined') return 'omniface_analysis_history';
  try {
    const userStr = localStorage.getItem('omniface_auth_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user?.id) {
        return `omniface_history_${user.id}`;
      }
    }
  } catch {}
  return 'omniface_analysis_history';
}

// Default initial forensic history records (empty for production accounts)
const DEFAULT_HISTORY: AnalysisResult[] = [];

export const historyService = {
  // Get all history items from local cache
  getAll: (): AnalysisResult[] => {
    if (typeof window === 'undefined') return DEFAULT_HISTORY;
    try {
      const key = getHistoryKey();
      // Also clean up any legacy global key if it exists
      const legacy = localStorage.getItem('omniface_analysis_history');
      if (legacy) {
        try {
          const parsedLegacy: AnalysisResult[] = JSON.parse(legacy);
          const cleanedLegacy = parsedLegacy.filter((item) => !DEMO_IDS.has(item.id));
          if (cleanedLegacy.length === 0) {
            localStorage.removeItem('omniface_analysis_history');
          } else {
            localStorage.setItem('omniface_analysis_history', JSON.stringify(cleanedLegacy));
          }
        } catch {
          localStorage.removeItem('omniface_analysis_history');
        }
      }

      const stored = localStorage.getItem(key);
      if (!stored) {
        return DEFAULT_HISTORY;
      }
      const parsed: AnalysisResult[] = JSON.parse(stored);
      // Strip any legacy demo IDs automatically
      const clean = parsed.filter((item) => !DEMO_IDS.has(item.id));
      if (clean.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(clean));
      }
      return clean;
    } catch {
      return DEFAULT_HISTORY;
    }
  },

  // Alias for getAll
  getRecords: (): AnalysisResult[] => {
    return historyService.getAll();
  },

  // Async fetch from FastAPI backend and merge with local history
  fetchReports: async (page = 1, perPage = 50): Promise<AnalysisResult[]> => {
    const local = historyService.getAll();
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${BACKEND_API_URL}/api/v1/reports?page=${page}&per_page=${perPage}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        const remoteResults: AnalysisResult[] = items.map((r: any) => {
          const verdict = r.verdict || (r.is_deepfake ? 'fake' : 'real');
          const isSynthetic = verdict === 'fake';
          let rawConf = r.confidence;
          if (rawConf === undefined || rawConf === null) {
            if (r.confidence_score !== undefined) {
              rawConf = verdict === 'real' ? (1.0 - r.confidence_score) * 100 : r.confidence_score * 100;
            } else {
              rawConf = 94.0;
            }
          } else if (rawConf <= 1.0) {
            rawConf = rawConf * 100;
          }
          const confidence = +Number(rawConf).toFixed(1);
          const classification = isSynthetic
            ? 'DEEPFAKE DETECTED'
            : verdict === 'uncertain'
            ? 'SUSPICIOUS MANIPULATION'
            : 'AUTHENTIC MEDIA';

          return {
            id: r.report_id || `rpt_${Date.now()}`,
            fileName: r.file_name || 'analyzed_media',
            fileSize: r.file_size || 'N/A',
            mediaType: r.modality || 'image',
            previewUrl: r.preview_url || '',
            classification,
            isSynthetic,
            confidence,
            sha256: r.sha256 || '',
            timestamp: r.created_at || new Date().toISOString(),
            processingTimeMs: r.latency_ms || 120,
            indicators: r.indicators || [],
            summary: r.summary || '',
          };
        });

        // Merge remote and local (preserve local fields if remote fallback is empty)
        const localMap = new Map(local.map((item) => [item.id, item]));
        const remoteIds = new Set<string>();

        const mergedRemote = remoteResults.map((remote) => {
          remoteIds.add(remote.id);
          const existingLocal = localMap.get(remote.id);
          if (existingLocal) {
            return {
              ...existingLocal,
              ...remote,
              previewUrl: remote.previewUrl || existingLocal.previewUrl,
              fileName: remote.fileName && remote.fileName !== 'analyzed_media' ? remote.fileName : existingLocal.fileName,
              fileSize: remote.fileSize && remote.fileSize !== 'N/A' ? remote.fileSize : existingLocal.fileSize,
            };
          }
          return remote;
        });

        const merged = [...mergedRemote, ...local.filter((x) => !remoteIds.has(x.id))];
        if (typeof window !== 'undefined') {
          localStorage.setItem(getHistoryKey(), JSON.stringify(merged));
        }
        return merged;
      }
    } catch {
      // Return local on backend network error
    }
    return local;
  },

  // Save new analysis to history
  save: (result: AnalysisResult): void => {
    if (typeof window === 'undefined') return;
    try {
      const list = historyService.getAll();
      const updated = [result, ...list.filter((item) => item.id !== result.id)];
      localStorage.setItem(getHistoryKey(), JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  // Alias for save
  addRecord: (result: AnalysisResult): void => {
    historyService.save(result);
  },

  // Delete single record
  deleteRecord: (id: string): void => {
    if (typeof window === 'undefined') return;
    try {
      const list = historyService.getAll();
      const updated = list.filter((item) => item.id !== id);
      localStorage.setItem(getHistoryKey(), JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  // Get single analysis by id
  getById: (id: string): AnalysisResult | null => {
    const list = historyService.getAll();
    return list.find((item) => item.id === id) || null;
  },

  // Clear history
  clear: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getHistoryKey());
      localStorage.removeItem('omniface_analysis_history');
    }
  },

  // Alias for clear
  clearHistory: (): void => {
    historyService.clear();
  },
};
