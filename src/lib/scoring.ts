import { pinyin as pinyinProFn } from 'pinyin-pro';

export function onlyHanzi(text: string): string {
  return text.replace(/[^\u4e00-\u9fa5]/g, '');
}

export function toPinyinString(text: string, toneType: 'none' | 'symbol' | 'num' = 'symbol'): string {
  if (!text) return '';
  return pinyinProFn(text, { type: 'string', toneType }) as string;
}

export function toPinyinArray(text: string, toneType: 'none' | 'symbol' | 'num' = 'none'): string[] {
  if (!text) return [];
  return pinyinProFn(text, { type: 'array', toneType }) as string[];
}

function normalizePinyinSyllables(text: string): string[] {
  return toPinyinArray(text, 'none').map((s) => s.toLowerCase().replace(/[^a-züv]/g, ''));
}

/** Levenshtein distance for short syllable arrays */
function editDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Stricter match: prefer equal length / trailing window, disallow long
 * transcripts that merely contain the target as a substring.
 */
export function isPronunciationMatch(
  transcript: string,
  targetHanzi: string,
  targetSim: string,
): boolean {
  const clean = onlyHanzi(transcript);
  if (!clean || !targetHanzi) return false;

  const targets = [targetHanzi, targetSim].filter(Boolean);
  const targetLen = targetHanzi.length;

  // Exact (or simplified) match on whole utterance or trailing window of same length
  for (const t of targets) {
    if (clean === t) return true;
    if (clean.length === t.length && (clean === t)) return true;
  }

  // Trailing window of target length — common when ASR adds a particle
  if (clean.length >= targetLen && clean.length <= targetLen + 2) {
    const window = clean.slice(-targetLen);
    if (targets.includes(window)) return true;

    const userPy = normalizePinyinSyllables(window);
    const targetPy = normalizePinyinSyllables(targetHanzi);
    if (userPy.length === targetPy.length && userPy.join('') === targetPy.join('')) {
      return true;
    }
  }

  // Same syllable count, allow 1 edit on short words / 0 on longer
  if (clean.length === targetLen) {
    const userPy = normalizePinyinSyllables(clean);
    const targetPy = normalizePinyinSyllables(targetHanzi);
    if (userPy.length === 0 || userPy.length !== targetPy.length) return false;
    const dist = editDistance(userPy, targetPy);
    const allowed = targetLen <= 2 ? 0 : targetLen <= 4 ? 1 : 0;
    return dist <= allowed;
  }

  return false;
}

export function analyzePhoneticDiff(correctHanzi: string, wrongText: string) {
  const cleanWrong = onlyHanzi(wrongText);
  const toneHits: Record<string, number> = {};
  const initialHits: Record<string, number> = {};
  const finalHits: Record<string, number> = {};

  if (!cleanWrong) {
    return { toneHits, initialHits, finalHits };
  }

  const cPinyinNum = pinyinProFn(correctHanzi, { type: 'array', toneType: 'num' }) as string[];
  const wPinyinNum = pinyinProFn(cleanWrong, { type: 'array', toneType: 'num' }) as string[];
  const cInitials = pinyinProFn(correctHanzi, { type: 'array', pattern: 'initial' }) as string[];
  const wInitials = pinyinProFn(cleanWrong, { type: 'array', pattern: 'initial' }) as string[];
  const cFinals = pinyinProFn(correctHanzi, { type: 'array', pattern: 'final' }) as string[];
  const wFinals = pinyinProFn(cleanWrong, { type: 'array', pattern: 'final' }) as string[];

  const len = Math.min(cPinyinNum.length, wPinyinNum.length);
  for (let i = 0; i < len; i++) {
    if (cPinyinNum[i] !== wPinyinNum[i]) {
      const match = cPinyinNum[i].match(/\d/);
      if (match) toneHits[match[0]] = (toneHits[match[0]] || 0) + 1;
    }
  }

  const iLen = Math.min(cInitials.length, wInitials.length);
  for (let i = 0; i < iLen; i++) {
    if (cInitials[i] && cInitials[i] !== wInitials[i]) {
      initialHits[cInitials[i]] = (initialHits[cInitials[i]] || 0) + 1;
    }
  }

  const fLen = Math.min(cFinals.length, wFinals.length);
  for (let i = 0; i < fLen; i++) {
    if (cFinals[i] && cFinals[i] !== wFinals[i]) {
      finalHits[cFinals[i]] = (finalHits[cFinals[i]] || 0) + 1;
    }
  }

  return { toneHits, initialHits, finalHits };
}

export function mergeCountMaps(
  prev: Record<string, number>,
  hits: Record<string, number>,
): Record<string, number> {
  const next = { ...prev };
  for (const [k, v] of Object.entries(hits)) {
    next[k] = (next[k] || 0) + v;
  }
  return next;
}

export function splitCustomText(text: string, maxLen = 8): string[] {
  const rawPhrases = text.split(/[。！？\n,.;!?，、\s\t]+/).filter((s) => s.trim().length > 0);
  const sentences: string[] = [];
  for (const s of rawPhrases) {
    let current = s.trim();
    while (current.length > maxLen) {
      sentences.push(current.substring(0, maxLen));
      current = current.substring(maxLen);
    }
    if (current.length > 0) sentences.push(current);
  }
  return sentences;
}

export function textToDictEntry(text: string): string {
  const clean = text.trim();
  const pinyinStr = (pinyinProFn(clean, { type: 'array' }) as string[]).join(' ');
  return `${clean}|${clean}|${pinyinStr}`;
}
