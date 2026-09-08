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

  const expandErhua = (s: string): string[] => {
    const variants = [s];
    if (s.endsWith('儿') || s.endsWith('兒')) variants.push(s.slice(0, -1));
    else if (s.length <= 4) {
      variants.push(`${s}儿`, `${s}兒`);
    }
    return variants;
  };

  const targets = [...new Set([targetHanzi, targetSim].filter(Boolean).flatMap(expandErhua))];
  // Soft particles: ASR often prefixes filler / suffixes 了吗呢吧
  const softStrip = (s: string) =>
    s
      .replace(/^(那个|那個|这个|這個|嗯|啊|哦|呃|那|请|請)+/u, '')
      .replace(/[了的吗嗎呢吧啊哦哟喲]+$/u, '');
  const softTargets = targets.flatMap((t) => (t.length >= 4 ? [t, softStrip(t)] : [t]));
  const allTargets = [...new Set(softTargets.filter(Boolean))];
  const cleanSoft = softStrip(clean);

  // Exact (or simplified) match on whole utterance or trailing window of same length
  for (const t of allTargets) {
    if (clean === t || cleanSoft === t || softStrip(clean) === t) return true;
  }

  // Trailing window — common when ASR adds a particle
  for (const t of allTargets) {
    const len = t.length;
    for (const source of [clean, cleanSoft]) {
      if (source.length >= len && source.length <= len + 2) {
        const window = source.slice(-len);
        if (window === t) return true;
        const userPy = normalizePinyinSyllables(window);
        const targetPy = normalizePinyinSyllables(t);
        if (userPy.length === targetPy.length && userPy.length > 0 && userPy.join('') === targetPy.join('')) {
          return true;
        }
      }
    }
  }

  const pinyinCloseEnough = (user: string, target: string, allowed: number) => {
    const userPy = normalizePinyinSyllables(user);
    const targetPy = normalizePinyinSyllables(target);
    if (userPy.length === 0 || targetPy.length === 0) return false;
    if (Math.abs(userPy.length - targetPy.length) > 1) return false;
    return editDistance(userPy, targetPy) <= allowed;
  };

  // Same / near character count — longer phrases tolerate 1–2 ASR syllable slips
  for (const t of allTargets) {
    const allowed =
      t.length <= 2 ? 0 : t.length <= 4 ? 1 : t.length <= 8 ? 1 : 2;
    for (const source of [clean, cleanSoft]) {
      if (source.length === t.length && pinyinCloseEnough(source, t, allowed)) return true;
      // ASR sometimes drops/adds one character on long survival lines
      if (t.length >= 5 && Math.abs(source.length - t.length) === 1 && pinyinCloseEnough(source, t, Math.max(1, allowed))) {
        return true;
      }
    }
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

/** Immediate coaching chips for a single wrong attempt */
export function diagnoseAttempt(correctHanzi: string, wrongText: string): {
  tone: boolean;
  initial: boolean;
  final: boolean;
  tips: string[];
} {
  const { toneHits, initialHits, finalHits } = analyzePhoneticDiff(correctHanzi, wrongText);
  const tone = Object.keys(toneHits).length > 0;
  const initial = Object.keys(initialHits).length > 0;
  const final = Object.keys(finalHits).length > 0;
  const tips: string[] = [];

  if (!onlyHanzi(wrongText)) {
    tips.push('未聽到清晰發音，對住聲調曲線再試一次');
    return { tone: false, initial: false, final: false, tips };
  }

  if (tone) {
    const tones = Object.keys(toneHits).join('、');
    tips.push(`聲調要留意第 ${tones} 聲——睇曲線：1 平、2 升、3 拐、4 降`);
    if (toneHits['3']) tips.push('第 3 聲要夠低：先落再輕升，唔好讀成第 2 聲');
    if (toneHits['3'] && correctHanzi.length >= 2) {
      tips.push('兩個上聲相連時，前字常變似陽平（例如你好 ní hǎo）');
    }
    if (toneHits['4']) tips.push('第 4 聲要急降、短促有力——粵語常唔夠「斬」');
    if (toneHits['1']) tips.push('第 1 聲要夠高、夠平，唔好中途下滑');
    if (toneHits['2']) tips.push('第 2 聲要由中升到高，結尾唔好掉——粵語常升唔夠');
    if (toneHits['0'] || toneHits['5']) tips.push('輕聲要短、輕、唔好拖長——粵語常讀得太重');
  }
  if (initial) {
    const initials = Object.keys(initialHits);
    tips.push(`聲母唔啱：目標有 ${initials.join('、')}，慢慢對口型`);
    if (initials.some((i) => ['zh', 'ch', 'sh', 'r'].includes(i))) {
      tips.push('翹舌：舌尖上捲抵硬顎，唔好用平舌 z/c/s 或 l');
    }
    if (initials.some((i) => ['z', 'c', 's'].includes(i))) {
      tips.push('平舌：舌尖抵下齒背，唔好捲成 zh/ch/sh');
    }
    if (initials.includes('n')) tips.push('n：氣流走鼻，舌尖抵上牙齦（對照 l）');
    if (initials.includes('l')) tips.push('l：舌尖抵上牙齦再放開，唔好鼻音化成 n');
    if (initials.includes('r')) tips.push('r：舌尖輕捲，粵語常無此音——聽清楚再跟');
    if (initials.includes('h')) tips.push('h：氣流從喉／軟顎出，唔好咬唇成 f');
    if (initials.includes('f')) tips.push('f：上齒輕碰下唇，唔好讀成 h');
    if (initials.some((i) => ['j', 'q', 'x'].includes(i))) {
      tips.push('j/q/x：舌面貼硬顎，唔好讀成 zh/ch/sh');
    }
  }
  if (final) {
    const finals = Object.keys(finalHits);
    tips.push(`韻母唔啱：留意 ${finals.join('、')}（an/ang、en/eng 好易混）`);
    if (finals.some((f) => /ü|v|yu|üe|üan|ün/.test(f) || f.includes('ü'))) {
      tips.push('ü：先發 i，再圓唇，唔好讀成 u');
    }
    if (finals.some((f) => f.includes('üe') || f === 'ue' || f.includes('üan') || f.includes('uan'))) {
      tips.push('üe／üan：保持 ü 唇形，再滑去 e 或 an');
    }
    if (finals.some((f) => f.includes('ang') || f === 'an' || f.includes('uan') || f.includes('uang'))) {
      tips.push('an/uan 舌尖抵牙齦；ang/uang 口更大、氣走軟顎');
    }
    if (finals.some((f) => f.includes('eng') || f === 'en' || f.includes('ong'))) {
      tips.push('en 前鼻音；eng 後鼻音，口略開、氣走軟顎');
    }
    if (finals.some((f) => f.includes('ing') || f === 'in')) {
      tips.push('in 前鼻音；ing 後鼻音，舌根略抬');
    }
    if (finals.some((f) => f === 'ai' || f === 'ei' || f.endsWith('ai') || f.endsWith('ei'))) {
      tips.push('ai 口更開、舌更前；ei 口略收、靠 e');
    }
    if (finals.some((f) => f === 'ao' || f === 'ou' || f.endsWith('ao') || f.endsWith('ou'))) {
      tips.push('ao 口更開、唇略圓；ou 唇更圓、舌位稍後');
    }
    if (finals.some((f) => f === 'iao' || f === 'iou' || f === 'iu' || f.endsWith('iao') || f.endsWith('iu'))) {
      tips.push('iao 有清楚 a；iu（iou）更快滑過，唔好多加 a');
    }
    if (finals.some((f) => f.includes('er') || f.endsWith('r'))) {
      tips.push('儿化：尾音捲舌一帶而過，唔好獨立讀成「兒」字');
    }
  }
  if (!tone && !initial && !final) {
    tips.push('差少少！放慢速度，對住示範再跟一次');
  }

  return { tone, initial, final, tips: tips.slice(0, 3) };
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
