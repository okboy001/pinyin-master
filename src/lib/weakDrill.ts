import { pinyin as pinyinProFn } from 'pinyin-pro';
import { LESSONS } from '../data/curriculum';
import { DEFAULT_DICTIONARY } from '../data/dictionary';

function entryMatchesWeakness(raw: string, kind: 'initial' | 'final' | 'tone', target: string): boolean {
  const hanzi = raw.split('|')[0] || '';
  if (!hanzi || !target) return false;
  try {
    if (kind === 'tone') {
      const tones = pinyinProFn(hanzi, { type: 'array', toneType: 'num' }) as string[];
      return tones.some((s) => String(s).endsWith(target));
    }
    const parts = pinyinProFn(hanzi, {
      type: 'array',
      pattern: kind,
    }) as string[];
    return parts.some((p) => p === target);
  } catch {
    return false;
  }
}

/** Build a short drill from the learner's weakest initials/finals/tones */
export function buildWeaknessDrill(
  initialStats: Record<string, number>,
  finalStats: Record<string, number>,
  toneStats: Record<string, number> = {},
  limit = 12,
): { words: string[]; title: string; subtitle: string } | null {
  const topInitial = Object.entries(initialStats).sort((a, b) => b[1] - a[1])[0];
  const topFinal = Object.entries(finalStats).sort((a, b) => b[1] - a[1])[0];
  const topTone = Object.entries(toneStats)
    .filter(([k]) => ['1', '2', '3', '4'].includes(k))
    .sort((a, b) => b[1] - a[1])[0];

  const targets: Array<{ kind: 'initial' | 'final' | 'tone'; value: string; count: number }> = [];
  if (topInitial && topInitial[1] > 0) targets.push({ kind: 'initial', value: topInitial[0], count: topInitial[1] });
  if (topFinal && topFinal[1] > 0) targets.push({ kind: 'final', value: topFinal[0], count: topFinal[1] });
  if (topTone && topTone[1] > 0) targets.push({ kind: 'tone', value: topTone[0], count: topTone[1] });
  if (!targets.length) return null;

  targets.sort((a, b) => b.count - a.count);
  const primary = targets[0];
  const secondary = targets[1];

  const pool = [
    ...LESSONS.flatMap((l) => l.items.map((i) => i.raw)),
    ...DEFAULT_DICTIONARY,
  ];

  const seen = new Set<string>();
  const words: string[] = [];
  const addMatching = (kind: 'initial' | 'final' | 'tone', value: string, maxAdd: number) => {
    let added = 0;
    for (const raw of pool) {
      if (added >= maxAdd) break;
      const key = raw.split('|')[0];
      if (seen.has(key)) continue;
      if (entryMatchesWeakness(raw, kind, value)) {
        seen.add(key);
        words.push(raw);
        added += 1;
      }
    }
  };

  addMatching(primary.kind, primary.value, secondary ? Math.ceil(limit * 0.65) : limit);
  if (secondary) addMatching(secondary.kind, secondary.value, limit - words.length);

  // fill remainder from primary again if needed
  if (words.length < Math.min(4, limit)) {
    addMatching(primary.kind, primary.value, limit - words.length);
  }

  if (words.length < 4) return null;

  const label =
    primary.kind === 'initial'
      ? `聲母 ${primary.value}`
      : primary.kind === 'tone'
        ? `第 ${primary.value} 聲`
        : `韻母 ${primary.value}`;
  const extra =
    secondary
      ? primary.kind === 'tone' || secondary.kind === 'tone'
        ? ` · 兼練${secondary.kind === 'tone' ? `第 ${secondary.value} 聲` : secondary.kind === 'initial' ? `聲母 ${secondary.value}` : `韻母 ${secondary.value}`}`
        : ` · 兼練${secondary.kind === 'initial' ? '聲母' : '韻母'} ${secondary.value}`
      : '';

  return {
    words: shuffleInPlace(words).slice(0, limit),
    title: `弱項特訓 · ${label}`,
    subtitle: `根據你最近最常錯嘅音自動組課${extra}`,
  };
}

/** Prefer ear-first when most items are sentence-like (blind + double demo). */
export function wordsSuggestEarFirst(words: string[]): boolean {
  if (!words.length) return false;
  let long = 0;
  for (const w of words) {
    const hanzi = (w.includes('|') ? w.split('|')[0] : w).replace(/[^\u4e00-\u9fa5]/g, '');
    if (hanzi.length >= 5) long += 1;
  }
  return long >= Math.ceil(words.length * 0.4);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Shuffle items from recently completed lessons — retention under mixed order */
export function buildMixedReview(
  completedLessonIds: string[],
  limit = 16,
): { words: string[]; title: string; subtitle: string } | null {
  if (completedLessonIds.length < 2) return null;
  const recentIds = completedLessonIds.slice(-8);
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const id of recentIds) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) continue;
    for (const item of lesson.items) {
      const key = item.raw.split('|')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(item.raw);
    }
  }
  if (pool.length < 6) return null;
  const words = shuffleInPlace([...pool]).slice(0, limit);
  return {
    words,
    title: '混合複習',
    subtitle: `打亂最近 ${recentIds.length} 課內容，練隨機反應`,
  };
}

/** Warmup from completed phrase/conversation scenes — fluency retention */
export function buildFluencyWarmup(
  completedLessonIds: string[],
  limit = 10,
): { words: string[]; title: string; subtitle: string } | null {
  const sceneIds = completedLessonIds.filter((id) => {
    const lesson = LESSONS.find((l) => l.id === id);
    return lesson && (lesson.stageId === 'phrases' || lesson.stageId === 'conversation');
  });
  if (sceneIds.length < 2) return null;
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const id of sceneIds.slice(-16)) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) continue;
    for (const item of lesson.items) {
      const chars = item.raw.split('|')[0];
      if (chars.length < 5) continue; // prefer sentence-like
      const key = chars;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push(item.raw);
    }
  }
  if (pool.length < 6) return null;
  return {
    words: shuffleInPlace([...pool]).slice(0, limit),
    title: '流利熱身',
    subtitle: `從已完成嘅 ${Math.min(16, sceneIds.length)} 個場景抽句，練開口反應`,
  };
}

const SURVIVAL_LESSON_IDS = [
  'phrase-ask',
  'phrase-help',
  'phrase-emergency',
  'phrase-taxi',
  'phrase-ride',
  'phrase-metro',
  'phrase-clinic',
  'phrase-checkup',
  'conv-checkup',
  'phrase-dental',
  'phrase-pharmacy',
  'phrase-tcm',
  'phrase-glasses',
  'phrase-hair',
  'phrase-nail',
  'phrase-massage',
  'phrase-vet',
  'conv-pharmacy',
  'conv-tcm',
  'conv-dental',
  'conv-glasses',
  'conv-vet',
  'phrase-bank',
  'phrase-phone',
  'phrase-weather',
  'phrase-umbrella',
  'phrase-checkin',
  'phrase-laundry',
  'phrase-repair',
  'conv-repair',
  'phrase-agent',
  'conv-agent',
  'phrase-moving',
  'conv-moving',
  'phrase-utilities',
  'conv-utilities',
  'phrase-broadband',
  'conv-broadband',
  'phrase-water',
  'conv-water',
  'phrase-property',
  'conv-property',
  'phrase-cleaning',
  'conv-cleaning',
  'phrase-gym',
  'phrase-luggage',
  'phrase-directions',
  'phrase-delivery',
  'phrase-takeout',
  'phrase-locker',
  'conv-locker',
  'phrase-station',
  'conv-station',
  'phrase-groupbuy',
  'conv-groupbuy',
  'phrase-ship',
  'conv-ship',
  'phrase-border',
  'phrase-bus',
  'phrase-pay',
  'phrase-convenience',
  'phrase-vending',
  'phrase-grocery',
  'phrase-unmanned',
  'phrase-sim',
  'phrase-photo',
  'phrase-keys',
  'phrase-shoes',
  'phrase-phonerepair',
  'phrase-lost',
  'phrase-police',
  'phrase-parking',
  'phrase-charge',
  'phrase-laundry',
  'conv-laundry',
  'conv-lost',
  'conv-police',
  'conv-sim',
  'conv-photo',
  'conv-keys',
  'conv-shoes',
  'conv-phonerepair',
  'conv-vending',
  'conv-unmanned',
] as const;

const SOCIAL_LESSON_IDS = [
  'phrase-intro',
  'phrase-smalltalk',
  'phrase-invite',
  'phrase-refuse',
  'phrase-compliment',
  'phrase-hobbies',
  'phrase-sports',
  'phrase-gym',
  'conv-gym',
  'phrase-party',
  'phrase-apology',
  'phrase-opinion',
  'phrase-hair',
  'conv-hair',
  'phrase-nail',
  'conv-nail',
  'phrase-massage',
  'conv-massage',
  'phrase-facial',
  'conv-facial',
  'phrase-lashes',
  'conv-lashes',
  'phrase-flowers',
  'conv-flowers',
  'phrase-laundry',
  'conv-laundry',
  'phrase-vet',
  'conv-vet',
] as const;

const DINING_LESSON_IDS = [
  'phrase-order',
  'phrase-cafe',
  'phrase-canteen',
  'phrase-bargain',
  'phrase-secondhand',
  'conv-secondhand',
  'phrase-fitting',
  'phrase-hair',
  'phrase-nail',
  'phrase-massage',
  'phrase-glasses',
  'phrase-convenience',
  'phrase-grocery',
  'phrase-vending',
  'phrase-unmanned',
  'phrase-delivery',
  'phrase-takeout',
  'phrase-locker',
  'phrase-station',
  'phrase-groupbuy',
  'phrase-ship',
  'phrase-invoice',
  'phrase-refund',
  'conv-restaurant',
  'conv-cafe',
  'conv-canteen',
  'conv-market',
  'conv-grocery',
  'conv-unmanned',
  'conv-vending',
  'conv-delivery',
  'conv-takeout',
  'conv-locker',
  'conv-station',
  'conv-groupbuy',
  'conv-ship',
  'conv-invoice',
  'conv-refund',
  'conv-hair',
  'conv-nail',
  'conv-massage',
  'conv-glasses',
] as const;

const TRAVEL_LESSON_IDS = [
  'phrase-taxi',
  'phrase-ride',
  'phrase-metro',
  'phrase-airport',
  'phrase-luggage',
  'phrase-flight',
  'phrase-checkin',
  'phrase-directions',
  'phrase-border',
  'phrase-residence',
  'conv-residence',
  'phrase-bus',
  'phrase-rail',
  'phrase-bike',
  'conv-bike',
  'phrase-umbrella',
  'conv-umbrella',
  'phrase-parking',
  'phrase-charge',
  'phrase-license',
  'conv-license',
  'phrase-gas',
  'conv-gas',
  'phrase-lost',
  'phrase-police',
  'phrase-refund',
  'conv-lost',
  'conv-police',
  'conv-taxi',
  'conv-ride',
  'conv-metro',
  'conv-hotel',
  'conv-airport',
  'conv-luggage',
  'conv-flight',
  'conv-border',
  'conv-bus',
  'conv-rail',
  'conv-parking',
  'conv-charge',
] as const;

const WORK_LESSON_IDS = [
  'phrase-office',
  'phrase-phone',
  'phrase-online',
  'phrase-broadband',
  'phrase-tech',
  'phrase-phonerepair',
  'phrase-print',
  'phrase-keys',
  'phrase-shoes',
  'phrase-pay',
  'phrase-invoice',
  'phrase-refund',
  'phrase-sim',
  'phrase-photo',
  'phrase-shebao',
  'conv-shebao',
  'phrase-interview',
  'conv-interview',
  'conv-sim',
  'conv-photo',
  'conv-office',
  'conv-print',
  'conv-keys',
  'conv-shoes',
  'conv-phonerepair',
  'conv-phone',
  'conv-online',
  'conv-broadband',
  'conv-pay',
  'conv-invoice',
  'conv-refund',
] as const;

/** Prefer specific packs over survival (shared lessons like 的士／電話). */
export function scenePackForLessonId(lessonId: string): ScenePackKind | null {
  const packs: Array<[ScenePackKind, readonly string[]]> = [
    ['dining', DINING_LESSON_IDS],
    ['work', WORK_LESSON_IDS],
    ['travel', TRAVEL_LESSON_IDS],
    ['social', SOCIAL_LESSON_IDS],
    ['survival', SURVIVAL_LESSON_IDS],
  ];
  for (const [kind, ids] of packs) {
    if ((ids as readonly string[]).includes(lessonId)) return kind;
  }
  return null;
}

function buildPackDrill(
  lessonIds: readonly string[],
  limit: number,
  title: string,
  subtitle: string,
): { words: string[]; title: string; subtitle: string } {
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const id of lessonIds) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) continue;
    for (const item of lesson.items) {
      const key = item.raw.split('|')[0];
      if (seen.has(key) || key.length < 2) continue;
      seen.add(key);
      pool.push(item.raw);
    }
  }
  pool.sort((a, b) => b.split('|')[0].length - a.split('|')[0].length);
  const longPreferred = pool.slice(0, Math.ceil(pool.length * 0.65));
  const shortFill = pool.slice(Math.ceil(pool.length * 0.65));
  const mixed = shuffleInPlace([...longPreferred, ...shuffleInPlace(shortFill).slice(0, 8)]);
  return {
    words: mixed.slice(0, Math.min(limit, mixed.length)),
    title,
    subtitle,
  };
}

/** Always-on survival pack: travel / emergency / clinic phrases — ear-first fluency */
export function buildSurvivalDrill(limit = 12): { words: string[]; title: string; subtitle: string } {
  return buildPackDrill(
    SURVIVAL_LESSON_IDS,
    limit,
    '生存包熱練',
    '問路、緊急、出行、診所、銀行、入住——盲跟讀練反射',
  );
}

/** Always-on social pack: intro / invite / refuse / hobbies — ear-first fluency */
export function buildSocialDrill(limit = 12): { words: string[]; title: string; subtitle: string } {
  return buildPackDrill(
    SOCIAL_LESSON_IDS,
    limit,
    '社交包熱練',
    '介紹、寒暄、邀約、婉拒、興趣——盲跟讀練場面反應',
  );
}

/** Always-on dining pack: order / cafe / bargain / market — ear-first fluency */
export function buildDiningDrill(limit = 12): { words: string[]; title: string; subtitle: string } {
  return buildPackDrill(
    DINING_LESSON_IDS,
    limit,
    '飲食包熱練',
    '點餐、咖啡、砍價、餐廳——盲跟讀練出街開口',
  );
}

/** Always-on travel pack: taxi / metro / airport / hotel — ear-first fluency */
export function buildTravelDrill(limit = 12): { words: string[]; title: string; subtitle: string } {
  return buildPackDrill(
    TRAVEL_LESSON_IDS,
    limit,
    '出行包熱練',
    '的士、地鐵、機場、酒店——盲跟讀練旅途開口',
  );
}

export type ScenePackKind = 'survival' | 'social' | 'dining' | 'travel' | 'work';

export const SCENE_PACK_TOASTS: Record<ScenePackKind, string> = {
  survival: '生存包：耳口盲跟讀——問路／緊急／出行／診所／銀行反射練',
  social: '社交包：耳口盲跟讀——介紹／邀約／婉拒／興趣場面練',
  dining: '飲食包：耳口盲跟讀——點餐／咖啡／砍價／餐廳開口練',
  travel: '出行包：耳口盲跟讀——的士／地鐵／機場／酒店旅途練',
  work: '職場包：耳口盲跟讀——開會／電話／視訊／請假開口練',
};

export const SCENE_PACK_LABELS: Record<ScenePackKind, string> = {
  survival: '生存',
  social: '社交',
  dining: '飲食',
  travel: '出行',
  work: '職場',
};

/** Rotate daily among scene packs (Sun→survival …) */
export function dailyScenePackKind(date = new Date()): ScenePackKind {
  const kinds: ScenePackKind[] = ['survival', 'social', 'dining', 'travel', 'work'];
  return kinds[date.getDay() % kinds.length];
}

export function buildWorkDrill(limit = 12): { words: string[]; title: string; subtitle: string } {
  return buildPackDrill(
    WORK_LESSON_IDS,
    limit,
    '職場包熱練',
    '開會、電話、視訊、請假——盲跟讀練職場開口',
  );
}

export function drillForScenePack(
  kind: ScenePackKind,
  limit = 12,
): { words: string[]; title: string; subtitle: string } {
  switch (kind) {
    case 'survival':
      return buildSurvivalDrill(limit);
    case 'social':
      return buildSocialDrill(limit);
    case 'dining':
      return buildDiningDrill(limit);
    case 'travel':
      return buildTravelDrill(limit);
    case 'work':
      return buildWorkDrill(limit);
  }
}

export function buildDailySceneDrill(limit = 12): {
  words: string[];
  title: string;
  subtitle: string;
  kind: ScenePackKind;
  shortLabel: string;
} {
  const kind = dailyScenePackKind();
  const shortLabel = SCENE_PACK_LABELS[kind];
  const base = drillForScenePack(kind, limit);
  return {
    ...base,
    title: `今日場景 · ${shortLabel}`,
    subtitle: `今日推薦「${shortLabel}」包：${base.subtitle}`,
    kind,
    shortLabel,
  };
}
