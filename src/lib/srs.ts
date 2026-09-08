/** Lightweight SM-2 inspired spaced repetition for spoken items */

export type SrsCard = {
  /** dictionary raw entry or hanzi key */
  key: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number; // epoch ms
  lastResult: 'again' | 'hard' | 'good' | 'easy' | null;
  wrongStreak: number;
};

export type SrsState = {
  cards: Record<string, SrsCard>;
};

const DAY = 24 * 60 * 60 * 1000;

export function emptySrs(): SrsState {
  return { cards: {} };
}

export function ensureCard(state: SrsState, key: string): SrsCard {
  if (state.cards[key]) return state.cards[key];
  const card: SrsCard = {
    key,
    ease: 2.3,
    intervalDays: 0,
    repetitions: 0,
    dueAt: Date.now(),
    lastResult: null,
    wrongStreak: 0,
  };
  state.cards[key] = card;
  return card;
}

function gradeFromCorrect(isCorrect: boolean, wrongStreak: number): 'again' | 'hard' | 'good' | 'easy' {
  if (!isCorrect) return 'again';
  if (wrongStreak >= 2) return 'hard';
  return 'good';
}

export function reviewCard(
  state: SrsState,
  key: string,
  isCorrect: boolean,
  opts?: { easy?: boolean },
): SrsState {
  const next: SrsState = { cards: { ...state.cards } };
  const card = { ...ensureCard({ cards: next.cards }, key) };

  if (!isCorrect) {
    card.wrongStreak += 1;
    card.repetitions = 0;
    card.intervalDays = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.dueAt = Date.now() + 5 * 60 * 1000; // retry in 5 minutes
    card.lastResult = 'again';
  } else {
    let grade = gradeFromCorrect(true, card.wrongStreak);
    if (opts?.easy && grade !== 'hard') grade = 'easy';
    card.wrongStreak = 0;
    card.lastResult = grade;
    if (card.repetitions === 0) {
      card.intervalDays = grade === 'hard' ? 0.25 : grade === 'easy' ? 2 : 1;
    } else if (card.repetitions === 1) {
      card.intervalDays = grade === 'hard' ? 1 : grade === 'easy' ? 5 : 3;
    } else {
      const mult = grade === 'hard' ? 1.2 : grade === 'easy' ? card.ease + 0.15 : card.ease;
      card.intervalDays = Math.max(1, Math.round(card.intervalDays * mult));
    }
    card.repetitions += 1;
    if (grade === 'easy') card.ease = Math.min(3.0, card.ease + 0.1);
    if (grade === 'hard') card.ease = Math.max(1.3, card.ease - 0.05);
    card.dueAt = Date.now() + card.intervalDays * DAY;
  }

  next.cards[key] = card;
  return next;
}

export function dueCards(state: SrsState, limit = 20): SrsCard[] {
  const now = Date.now();
  return Object.values(state.cards)
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt || b.wrongStreak - a.wrongStreak)
    .slice(0, limit);
}

export function weakCards(state: SrsState, limit = 15): SrsCard[] {
  return Object.values(state.cards)
    .filter((c) => c.wrongStreak > 0 || c.lastResult === 'again' || c.ease < 2.0)
    .sort((a, b) => b.wrongStreak - a.wrongStreak || a.ease - b.ease)
    .slice(0, limit);
}

export function srsStats(state: SrsState) {
  const cards = Object.values(state.cards);
  const due = cards.filter((c) => c.dueAt <= Date.now()).length;
  const learning = cards.filter((c) => c.repetitions > 0).length;
  const struggling = cards.filter((c) => c.wrongStreak > 0 || c.ease < 1.8).length;
  return { total: cards.length, due, learning, struggling };
}
