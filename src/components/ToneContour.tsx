import { useRef } from 'react';
import { pinyin as pinyinProFn } from 'pinyin-pro';
import { speakHanzi } from '../lib/speak';

const TONE_PATHS: Record<number, string> = {
  1: 'M4 18 H76', // flat high
  2: 'M4 52 Q40 40 76 12', // rising
  3: 'M4 28 Q28 58 40 58 Q52 58 76 22', // dip
  4: 'M4 12 L76 56', // falling
  0: 'M4 36 H76', // neutral
};

const TONE_LABELS: Record<number, string> = {
  1: '陰平 · 第1聲',
  2: '陽平 · 第2聲',
  3: '上聲 · 第3聲',
  4: '去聲 · 第4聲',
  0: '輕聲',
};

const TONE_COLORS: Record<number, string> = {
  1: 'text-rose-500 stroke-rose-500',
  2: 'text-amber-500 stroke-amber-500',
  3: 'text-emerald-500 stroke-emerald-500',
  4: 'text-blue-500 stroke-blue-500',
  0: 'text-slate-400 stroke-slate-400',
};

export function extractTones(hanzi: string): number[] {
  if (!hanzi) return [];
  const nums = pinyinProFn(hanzi, { type: 'array', toneType: 'num' }) as string[];
  return nums.map((s) => {
    const m = s.match(/(\d)/);
    return m ? Number(m[1]) : 0;
  });
}

type Props = {
  hanzi: string;
  compact?: boolean;
  /** Optional wrong reading to show tone contrast (e.g. 意 vs 椅) */
  compareHanzi?: string;
};

export function ToneContour({ hanzi, compact = false, compareHanzi }: Props) {
  const tones = extractTones(hanzi).slice(0, 6);
  const compareTones = compareHanzi ? extractTones(compareHanzi).slice(0, 6) : [];
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTriggeredRef = useRef(false);
  if (!tones.length) return null;
  const hero = !compact && tones.length <= 2 && !compareHanzi;
  const chars = [...hanzi];
  const showCompare =
    Boolean(compareHanzi) &&
    compareTones.length > 0 &&
    hanzi.length <= 2 &&
    (compareHanzi?.length ?? 0) <= 2;

  const playChar = (index: number) => {
    const ch = chars[index];
    if (!ch) return;
    speakHanzi(ch, { rate: 0.65 });
    try {
      if (navigator.vibrate) navigator.vibrate(6);
    } catch {
      /* ignore */
    }
  };

  const playAllSlow = () => {
    speakHanzi(hanzi.slice(0, 12), { rate: 0.55 });
    try {
      if (navigator.vibrate) navigator.vibrate([8, 40, 8]);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`flex flex-col items-center ${compact ? 'mt-1' : 'mt-3 mb-2'}`}
      onPointerDown={() => {
        holdTriggeredRef.current = false;
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdTimerRef.current = setTimeout(() => {
          holdTriggeredRef.current = true;
          playAllSlow();
        }, 480);
      }}
      onPointerUp={() => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
      }}
      onPointerLeave={() => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
      }}
      onPointerCancel={() => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
      }}
    >
      <div className="flex flex-wrap items-end justify-center gap-3">
        {showCompare && compareHanzi && (
          <button
            type="button"
            onClick={() => {
              speakHanzi(compareHanzi, { rate: 0.65 });
              try {
                if (navigator.vibrate) navigator.vibrate(6);
              } catch {
                /* ignore */
              }
            }}
            className="flex flex-col items-center gap-1 rounded-xl px-1.5 py-1.5 hover:bg-rose-50 active:scale-95 transition min-w-[3rem] border border-rose-100 bg-rose-50/50"
            title={`你讀成「${compareHanzi}」`}
          >
            <span className="text-[9px] font-black text-rose-400 tracking-wider">你讀成</span>
            <svg viewBox="0 0 80 64" className="w-16 h-11 text-rose-500 stroke-rose-500" aria-hidden>
              <line x1="4" y1="8" x2="76" y2="8" className="stroke-slate-200" strokeWidth="1" />
              <line x1="4" y1="56" x2="76" y2="56" className="stroke-slate-200" strokeWidth="1" />
              <path
                d={TONE_PATHS[compareTones[0] ?? 0] || TONE_PATHS[0]}
                fill="none"
                stroke="currentColor"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-black text-xs text-rose-600">{compareHanzi}</span>
            <span className="text-[10px] font-bold text-rose-400">
              {TONE_LABELS[compareTones[0] ?? 0] || TONE_LABELS[0]}
            </span>
          </button>
        )}
        {tones.map((tone, i) => {
          const color = TONE_COLORS[tone] || TONE_COLORS[0];
          return (
            <button
              type="button"
              key={`${tone}-${i}`}
              onClick={() => {
                if (holdTriggeredRef.current) {
                  holdTriggeredRef.current = false;
                  return;
                }
                playChar(i);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-1.5 md:px-1 md:py-0.5 hover:bg-slate-50 active:scale-95 transition min-w-[3rem] md:min-w-0 ${
                showCompare ? 'border border-emerald-100 bg-emerald-50/50' : ''
              }`}
              title={`聽「${chars[i] ?? ''}」· ${TONE_LABELS[tone] || TONE_LABELS[0]}`}
              aria-label={`聽第 ${i + 1} 字聲調`}
            >
              {showCompare && i === 0 && (
                <span className="text-[9px] font-black text-emerald-500 tracking-wider">正確</span>
              )}
              <svg
                viewBox="0 0 80 64"
                className={`${
                  compact ? 'w-16 h-11 md:w-14 md:h-10' : hero ? 'w-28 h-20 md:w-24 md:h-16' : 'w-20 h-14'
                } ${color}`}
                aria-hidden
              >
                <line x1="4" y1="8" x2="76" y2="8" className="stroke-slate-200" strokeWidth="1" />
                <line x1="4" y1="56" x2="76" y2="56" className="stroke-slate-200" strokeWidth="1" />
                <path
                  d={TONE_PATHS[tone] || TONE_PATHS[0]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={hero ? 6 : 5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {showCompare && (
                <span className="font-black text-xs text-emerald-700">{chars[i]}</span>
              )}
              <span className={`font-black tracking-wide ${hero ? 'text-xs md:text-[10px]' : 'text-[10px]'} ${color.split(' ')[0]}`}>
                {compact
                  ? tone === 0
                    ? '輕'
                    : `${tone}`
                  : TONE_LABELS[tone] || TONE_LABELS[0]}
              </span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <span className="mt-1 text-[10px] font-bold text-slate-400 tracking-wide">
          {showCompare ? '點左／右曲線對比聽 · 長按慢聽正確' : '點曲線聽音節 · 長按慢聽整詞'}
        </span>
      )}
    </div>
  );
}
