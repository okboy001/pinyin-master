export type Phase = 'idle' | 'system_speaking' | 'user_speaking' | 'evaluating';

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
