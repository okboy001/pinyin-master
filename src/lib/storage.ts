import type { AppSettings, CustomSession, HistoryEntry, PathProgress, ProgressState } from '../types';
import { emptySrs, type SrsState } from './srs';

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
  pathProgress: 'pinyinMaster_pathProgress',
  srs: 'pinyinMaster_srs',
  screen: 'pinyinMaster_screen',
  activeLesson: 'pinyinMaster_activeLesson',
  welcomeSeen: 'pinyinMaster_welcomeSeen',
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

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

export function defaultPathProgress(): PathProgress {
  return {
    completedLessons: [],
    lastPracticeDate: null,
    streak: 0,
    lifetimeCorrect: 0,
    dailyGoal: 20,
    dailyCorrect: 0,
    lessonBest: {},
  };
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

export function loadPathProgress(): PathProgress {
  const raw = safeParse<Partial<PathProgress>>(safeGet(KEYS.pathProgress), {});
  const base = defaultPathProgress();
  const merged: PathProgress = {
    ...base,
    ...raw,
    completedLessons: Array.isArray(raw.completedLessons) ? raw.completedLessons : [],
    lessonBest: raw.lessonBest && typeof raw.lessonBest === 'object' ? raw.lessonBest as Record<string, number> : {},
  };

  // Roll daily counter if date changed
  const today = todayKey();
  if (merged.lastPracticeDate && merged.lastPracticeDate !== today) {
    if (merged.lastPracticeDate !== yesterdayKey()) {
      // streak break is applied on next practice, keep streak number until then
    }
    if (merged.lastPracticeDate !== today) {
      merged.dailyCorrect = 0;
    }
  }
  return merged;
}

export function savePathProgress(progress: PathProgress) {
  safeSet(KEYS.pathProgress, JSON.stringify(progress));
}

export function recordCorrectPractice(progress: PathProgress): PathProgress {
  const today = todayKey();
  const prevDate = progress.lastPracticeDate;
  let streak = progress.streak || 0;
  let dailyCorrect = progress.dailyCorrect || 0;

  if (prevDate === today) {
    dailyCorrect += 1;
  } else {
    streak = prevDate === yesterdayKey() ? streak + 1 : 1;
    dailyCorrect = 1;
  }

  return {
    ...progress,
    lastPracticeDate: today,
    streak: Math.max(1, streak),
    dailyCorrect,
    lifetimeCorrect: (progress.lifetimeCorrect || 0) + 1,
  };
}

export function markLessonComplete(progress: PathProgress, lessonId: string): PathProgress {
  if (progress.completedLessons.includes(lessonId)) return progress;
  return {
    ...progress,
    completedLessons: [...progress.completedLessons, lessonId],
  };
}

export function recordLessonScore(progress: PathProgress, lessonId: string, accuracy: number): PathProgress {
  const prev = progress.lessonBest?.[lessonId] ?? 0;
  if (accuracy <= prev) return progress;
  return {
    ...progress,
    lessonBest: {
      ...(progress.lessonBest || {}),
      [lessonId]: accuracy,
    },
  };
}

export function setDailyGoal(progress: PathProgress, goal: number): PathProgress {
  const clamped = Math.min(50, Math.max(10, Math.round(goal)));
  if (progress.dailyGoal === clamped) return progress;
  return { ...progress, dailyGoal: clamped };
}

export function loadSrs(): SrsState {
  return safeParse<SrsState>(safeGet(KEYS.srs), emptySrs());
}

export function saveSrs(state: SrsState) {
  safeSet(KEYS.srs, JSON.stringify(state));
}

export type ActiveLessonSession = {
  lessonId: string;
  index: number;
};

export function loadActiveLesson(): ActiveLessonSession | null {
  const raw = safeParse<ActiveLessonSession | null>(safeGet(KEYS.activeLesson), null);
  if (!raw || typeof raw.lessonId !== 'string' || typeof raw.index !== 'number') return null;
  return raw;
}

export function saveActiveLesson(session: ActiveLessonSession | null) {
  if (!session) {
    safeRemove(KEYS.activeLesson);
    return;
  }
  safeSet(KEYS.activeLesson, JSON.stringify(session));
}

export function loadWelcomeSeen(): boolean {
  return safeGet(KEYS.welcomeSeen) === 'true';
}

export function saveWelcomeSeen() {
  safeSet(KEYS.welcomeSeen, 'true');
}

export function resetLearningData() {
  safeRemove(KEYS.index);
  safeRemove(KEYS.history);
  safeRemove(KEYS.toneStats);
  safeRemove(KEYS.initialStats);
  safeRemove(KEYS.finalStats);
  safeRemove(KEYS.customSession);
  safeRemove(KEYS.pathProgress);
  safeRemove(KEYS.srs);
  safeRemove(KEYS.activeLesson);
}

export type LearningBackup = {
  v: 1;
  exportedAt: string;
  pathProgress: PathProgress;
  srs: SrsState;
  toneStats: Record<string, number>;
  initialStats: Record<string, number>;
  finalStats: Record<string, number>;
  history: HistoryEntry[];
};

export function exportLearningBackup(): LearningBackup {
  return {
    v: 1,
    exportedAt: new Date().toISOString(),
    pathProgress: loadPathProgress(),
    srs: loadSrs(),
    toneStats: loadToneStats(),
    initialStats: loadInitialStats(),
    finalStats: loadFinalStats(),
    history: loadDefaultProgress().history,
  };
}

export function importLearningBackup(raw: unknown): { ok: true } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '無效檔案' };
  const data = raw as Partial<LearningBackup>;
  if (data.v !== 1 || !data.pathProgress || !data.srs) {
    return { ok: false, error: '不支援嘅備份格式' };
  }
  savePathProgress({
    ...defaultPathProgress(),
    ...data.pathProgress,
    completedLessons: Array.isArray(data.pathProgress.completedLessons)
      ? data.pathProgress.completedLessons
      : [],
    lessonBest:
      data.pathProgress.lessonBest && typeof data.pathProgress.lessonBest === 'object'
        ? data.pathProgress.lessonBest
        : {},
  });
  saveSrs(data.srs);
  if (data.toneStats) saveToneStats(data.toneStats);
  if (data.initialStats) saveInitialStats(data.initialStats);
  if (data.finalStats) saveFinalStats(data.finalStats);
  if (Array.isArray(data.history)) {
    const prog = loadDefaultProgress();
    saveDefaultProgress(prog.index, data.history.slice(0, 100));
  }
  return { ok: true };
}
