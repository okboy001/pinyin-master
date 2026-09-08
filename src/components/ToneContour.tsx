import { pinyin as pinyinProFn } from 'pinyin-pro';

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
};

export function ToneContour({ hanzi, compact = false }: Props) {
  const tones = extractTones(hanzi).slice(0, 6);
  if (!tones.length) return null;

  return (
    <div className={`flex flex-wrap items-end justify-center gap-3 ${compact ? 'mt-1' : 'mt-3 mb-2'}`}>
      {tones.map((tone, i) => {
        const color = TONE_COLORS[tone] || TONE_COLORS[0];
        return (
          <div key={`${tone}-${i}`} className="flex flex-col items-center gap-1">
            <svg
              viewBox="0 0 80 64"
              className={`${compact ? 'w-14 h-10' : 'w-20 h-14'} ${color}`}
              aria-hidden
            >
              <line x1="4" y1="8" x2="76" y2="8" className="stroke-slate-200" strokeWidth="1" />
              <line x1="4" y1="56" x2="76" y2="56" className="stroke-slate-200" strokeWidth="1" />
              <path
                d={TONE_PATHS[tone] || TONE_PATHS[0]}
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={`text-[10px] font-black tracking-wide ${color.split(' ')[0]}`}>
              {compact
                ? tone === 0
                  ? '輕'
                  : `${tone}`
                : TONE_LABELS[tone] || TONE_LABELS[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
