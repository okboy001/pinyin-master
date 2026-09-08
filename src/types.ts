export type Phase = 'idle' | 'system_speaking' | 'preparing' | 'user_speaking' | 'evaluating';

export type WordEntry = {
  hanzi: string;
  sim: string;
  pinyin: string;
};

export type HistoryEntry = {
  word: string;
  pinyin: string;
  isCorrect: boolean;
  wrongText: string;
  wrongPinyin: string;
  time: string;
};

export type ErrorData = {
  userText: string;
  userPinyin: string;
  correctText: string;
  correctPinyin: string;
  issues?: {
    tone: boolean;
    initial: boolean;
    final: boolean;
    tips: string[];
  };
};

export type AppSettings = {
  blindMode: boolean;
  autoPreRead: boolean;
  ttsSpeed: number;
};

export type ProgressState = {
  index: number;
  history: HistoryEntry[];
};

export type CustomSession = {
  words: string[];
  index: number;
} | null;

export type PathProgress = {
  completedLessons: string[];
  /** YYYY-MM-DD */
  lastPracticeDate: string | null;
  streak: number;
  /** cumulative correct answers */
  lifetimeCorrect: number;
  dailyGoal: number;
  /** correct count for lastPracticeDate */
  dailyCorrect: number;
  /** best accuracy % per lesson id */
  lessonBest: Record<string, number>;
};

export type PracticeMode = 'path' | 'lesson' | 'srs' | 'free' | 'custom';

export type ActivePractice = {
  mode: PracticeMode;
  lessonId?: string;
  title: string;
  subtitle?: string;
  /** Scene packs / warmup: double demo + blind follow */
  earFirst?: boolean;
};
