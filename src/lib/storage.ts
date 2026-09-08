import type { AppSettings, CustomSession, HistoryEntry, ProgressState } from '../types';

const KEYS = {
  index: 'pinyinMaster_light_index',
  history: 'pinyinMaster_light_history',
  blindMode: 'pinyinMaster_light_blindMode',
  autoPreRead: 'pinyinMaster_light_autoPreRead',
  ttsSpeed: 'pinyinMaster_light_ttsSpeed',
  toneStats: 'pinyinMaster_toneStats',
  initialStats: 'pinyinMaster_initialStats',
  finalStats: 'pinyinMaster_finalStats',
  customSession: 'pinyinMaster_customSession',
} as const;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadSettings(): AppSettings {
  const blind = safeGet(KEYS.blindMode);
  const auto = safeGet(KEYS.autoPreRead);
  const speedRaw = safeGet(KEYS.ttsSpeed);
  const speed = speedRaw ? Number.parseFloat(speedRaw) : 0.85;

  return {
    blindMode: blind === 'true',
    autoPreRead: auto === null ? true : auto === 'true',
    ttsSpeed: Number.isFinite(speed) ? Math.min(1.2, Math.max(0.5, speed)) : 0.85,
  };
}

export function saveSettings(partial: Partial<AppSettings>) {
  if (partial.blindMode !== undefined) safeSet(KEYS.blindMode, String(partial.blindMode));
  if (partial.autoPreRead !== undefined) safeSet(KEYS.autoPreRead, String(partial.autoPreRead));
  if (partial.ttsSpeed !== undefined) safeSet(KEYS.ttsSpeed, String(partial.ttsSpeed));
}

export function loadDefaultProgress(): ProgressState {
  const indexRaw = safeGet(KEYS.index);
  const index = indexRaw ? Number.parseInt(indexRaw, 10) : 0;
  const history = safeParse<HistoryEntry[]>(safeGet(KEYS.history), []);
  return {
    index: Number.isFinite(index) && index >= 0 ? index : 0,
    history: Array.isArray(history) ? history : [],
  };
}

export function saveDefaultProgress(index: number, history: HistoryEntry[]) {
  safeSet(KEYS.index, String(index));
  safeSet(KEYS.history, JSON.stringify(history.slice(0, 100)));
}

export function loadCustomSession(): CustomSession {
  return safeParse<CustomSession>(safeGet(KEYS.customSession), null);
}

export function saveCustomSession(session: CustomSession) {
  if (!session) {
    safeRemove(KEYS.customSession);
    return;
  }
  safeSet(KEYS.customSession, JSON.stringify(session));
}

export function loadToneStats(): Record<string, number> {
  return safeParse(safeGet(KEYS.toneStats), { 1: 0, 2: 0, 3: 0, 4: 0 });
}

export function saveToneStats(stats: Record<string, number>) {
  safeSet(KEYS.toneStats, JSON.stringify(stats));
}

export function loadInitialStats(): Record<string, number> {
  return safeParse(safeGet(KEYS.initialStats), {});
}

export function saveInitialStats(stats: Record<string, number>) {
  safeSet(KEYS.initialStats, JSON.stringify(stats));
}

export function loadFinalStats(): Record<string, number> {
  return safeParse(safeGet(KEYS.finalStats), {});
}

export function saveFinalStats(stats: Record<string, number>) {
  safeSet(KEYS.finalStats, JSON.stringify(stats));
}

export function resetLearningData() {
  safeRemove(KEYS.index);
  safeRemove(KEYS.history);
  safeRemove(KEYS.toneStats);
  safeRemove(KEYS.initialStats);
  safeRemove(KEYS.finalStats);
  safeRemove(KEYS.customSession);
}
