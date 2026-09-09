import { Activity, CheckCircle2, RotateCcw, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { HistoryEntry } from '../types';
import { speakHanzi } from '../lib/speak';

type Props = {
  history: HistoryEntry[];
  toneStats: Record<string, number>;
  initialStats: Record<string, number>;
  finalStats: Record<string, number>;
  onClose: () => void;
  onReset: () => void;
  onRetryMistakes: () => void;
  onPracticeWord: (word: string) => void;
  onStartWeakDrill?: () => void;
  canStartWeakDrill?: boolean;
};

const TONE_EXAMPLES: Record<number, string> = {
  1: '妈',
  2: '麻',
  3: '马',
  4: '骂',
};

function ToneBars({ toneStats }: { toneStats: Record<string, number> }) {
  const total = (toneStats[1] || 0) + (toneStats[2] || 0) + (toneStats[3] || 0) + (toneStats[4] || 0) || 1;
  const labels: Record<number, string> = { 1: '陰平', 2: '陽平', 3: '上聲', 4: '去聲' };
  const colors: Record<number, string> = { 1: 'bg-rose-400', 2: 'bg-amber-400', 3: 'bg-emerald-400', 4: 'bg-blue-400' };

  return (
    <div className="flex flex-col gap-3 w-full">
      <h4 className="text-sm font-bold text-slate-500 mb-1 border-b border-slate-100 pb-2">
        聲調錯誤分佈 · 撳條聽例字
      </h4>
      {[1, 2, 3, 4].map((t) => {
        const pct = Math.round(((toneStats[t] || 0) / total) * 100);
        return (
          <button
            key={t}
            type="button"
            onClick={() => {
              const ex = TONE_EXAMPLES[t];
              if (!ex) return;
              speakHanzi(ex, { rate: 0.6 });
              try {
                if (navigator.vibrate) navigator.vibrate(6);
              } catch {
                /* ignore */
              }
            }}
            className="flex items-center gap-3 text-xs font-bold text-slate-500 w-full text-left active:scale-[0.99] rounded-lg py-0.5"
            title={`聽「${TONE_EXAMPLES[t]}」· 第${t}聲`}
          >
            <span className="w-16 text-right shrink-0">
              {labels[t]}({t})
            </span>
            <div className="h-3 flex-1 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${colors[t]} transition-all duration-1000`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-right shrink-0">{pct}%</span>
          </button>
        );
      })}
    </div>
  );
}

function StatList({
  stats,
  title,
  titleColor,
  kind,
}: {
  stats: Record<string, number>;
  title: string;
  titleColor: string;
  kind: 'initial' | 'final';
}) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h4 className={`text-sm font-bold ${titleColor} mb-1 border-b border-slate-100 pb-2`}>{title}</h4>
        <div className="text-sm text-slate-400 py-2">目前表現完美，無錯誤紀錄</div>
      </div>
    );
  }

  const exampleHanzi: Record<string, string> = kind === 'initial'
    ? {
        b: '八', p: '怕', m: '妈', f: '发',
        d: '大', t: '他', n: '拿', l: '拉',
        g: '哥', k: '可', h: '喝',
        j: '机', q: '七', x: '西',
        zh: '知', ch: '吃', sh: '是', r: '日',
        z: '字', c: '次', s: '四',
        y: '一', w: '五',
      }
    : {
        a: '啊', o: '哦', e: '饿', i: '衣', u: '乌', ü: '鱼', v: '鱼',
        ai: '爱', ei: '诶', ao: '奥', ou: '欧',
        an: '安', en: '恩', ang: '昂', eng: '鞥',
        ian: '烟', iang: '央', iong: '拥', iao: '要',
        uan: '弯', uang: '汪', ueng: '翁', uai: '外',
        üan: '冤', üe: '月',
      };

  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-2">
      <h4 className={`text-sm font-bold ${titleColor} mb-1 border-b border-slate-100 pb-2`}>
        {title} · 撳聽例字
      </h4>
      <div className="grid grid-cols-2 gap-3 mt-1">
        {sorted.map(([item, count]) => {
          const pct = Math.round((count / total) * 100);
          const ex = exampleHanzi[item] || exampleHanzi[item.toLowerCase()];
          return (
            <button
              key={item}
              type="button"
              disabled={!ex}
              onClick={() => {
                if (!ex) return;
                speakHanzi(ex, { rate: 0.6 });
                try {
                  if (navigator.vibrate) navigator.vibrate(6);
                } catch {
                  /* ignore */
                }
              }}
              className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-xl shadow-sm active:scale-[0.98] disabled:opacity-60 text-left"
              title={ex ? `聽「${ex}」· ${item}` : item}
            >
              <span className="font-mono font-black text-slate-700 text-lg">{item}</span>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-slate-500">{count} 次</span>
                <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type HistoryFilter = 'all' | 'wrong' | 'correct';

export function DiagnosisModal({
  history,
  toneStats,
  initialStats,
  finalStats,
  onClose,
  onReset,
  onRetryMistakes,
  onPracticeWord,
  onStartWeakDrill,
  canStartWeakDrill = false,
}: Props) {
  const [resetConfirm, setResetConfirm] = useState(false);
  const swipeYRef = useRef<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const answered = history.length;
  const correct = history.filter((h) => h.isCorrect).length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
  const mistakeCount = history.filter((h) => !h.isCorrect && h.wrongText !== '手動跳過').length;
  const recentAll = history.slice(0, 30);
  const recentWrong = recentAll.filter((h) => !h.isCorrect);
  const recentCorrect = recentAll.filter((h) => h.isCorrect);
  const recent =
    historyFilter === 'wrong'
      ? recentWrong
      : historyFilter === 'correct'
        ? recentCorrect
        : recentAll;

  const toneLabels: Record<string, string> = {
    1: '第 1 聲 (陰平)',
    2: '第 2 聲 (陽平)',
    3: '第 3 聲 (上聲)',
    4: '第 4 聲 (去聲)',
  };

  let maxToneCount = 0;
  let topTone: string | null = null;
  Object.entries(toneStats).forEach(([tone, count]) => {
    if (count > maxToneCount) {
      maxToneCount = count;
      topTone = tone;
    }
  });

  let maxInitialCount = 0;
  let topInitial: string | null = null;
  Object.entries(initialStats).forEach(([initial, count]) => {
    if (count > maxInitialCount) {
      maxInitialCount = count;
      topInitial = initial;
    }
  });

  return (
    <div
      className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-10 pt-safe pb-safe animate-fade-in text-slate-800"
      onClick={onClose}
    >
      {resetConfirm && (
        <div
          className="absolute inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pb-safe animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setResetConfirm(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reset-confirm-title" className="text-lg font-black tracking-wide text-slate-800">
              確定重置全部進度？
            </h3>
            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
              會清除歷史、路徑關卡、診斷統計同複習進度。此操作無法復原。
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
              <button
                type="button"
                onClick={() => setResetConfirm(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetConfirm(false);
                  onReset();
                }}
                className="flex-1 py-3 rounded-2xl bg-rose-500 text-white font-black hover:bg-rose-600 active:scale-[0.98]"
              >
                確定重置
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnosis-title"
        className="bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl mx-auto min-h-0 max-h-[92%] sm:max-h-full sm:flex-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden flex flex-col items-center pt-2.5 pb-1 bg-white shrink-0"
          onTouchStart={(e) => {
            swipeYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = swipeYRef.current;
            swipeYRef.current = null;
            if (startY == null) return;
            const endY = e.changedTouches[0]?.clientY ?? startY;
            if (endY - startY > 56) onClose();
          }}
        >
          <div className="h-1 w-10 rounded-full bg-slate-200" aria-hidden />
          <p className="text-[10px] font-bold text-slate-400 mt-1">下滑關閉</p>
        </div>
        <div className="px-4 pb-3 pt-1 sm:p-6 flex justify-between items-center border-b border-slate-200 bg-white shrink-0">
          <h2 id="diagnosis-title" className="text-lg md:text-xl font-black tracking-widest text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 md:w-6 md:h-6 text-blue-500" /> 發音診斷中心
          </h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 md:gap-6">
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-emerald-50 border border-emerald-100 p-3 md:p-4 rounded-2xl text-center shadow-sm">
              <span className="text-[10px] md:text-xs font-bold text-emerald-400 mb-1 block">正確率</span>
              <span className="text-xl md:text-2xl font-black text-emerald-600">{accuracy == null ? '—' : `${accuracy}%`}</span>
              <span className="text-[10px] text-emerald-500/70 mt-1 block">{answered} 筆紀錄 · 對 {correct}</span>
            </div>
            <div className="bg-rose-50 border border-rose-100 p-3 md:p-4 rounded-2xl text-center shadow-sm">
              <span className="text-[10px] md:text-xs font-bold text-rose-400 mb-1 block">最易錯聲母</span>
              <span className="text-xl md:text-2xl font-black text-rose-600">{topInitial || '無'}</span>
              <span className="text-[10px] text-rose-500/70 mt-1 block">{maxInitialCount > 0 ? `累積錯 ${maxInitialCount} 次` : '表現完美'}</span>
            </div>
            <div className="bg-blue-50 border border-blue-100 p-3 md:p-4 rounded-2xl text-center shadow-sm col-span-2">
              <span className="text-[10px] md:text-xs font-bold text-blue-400 mb-1 block">最易錯聲調</span>
              <span className="text-base md:text-xl font-black text-blue-600">{topTone ? toneLabels[topTone] : '無'}</span>
              <span className="text-[10px] text-blue-500/70 mt-1 block">{maxToneCount > 0 ? `累積錯 ${maxToneCount} 次` : '表現完美'}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <div className="flex flex-col gap-2.5 mb-3 border-b border-slate-100 pb-2">
              <h4 className="text-sm font-bold text-slate-500">最近練習紀錄</h4>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all' as const, label: `全部 ${recentAll.length}` },
                    { id: 'wrong' as const, label: `錯題 ${recentWrong.length}` },
                    { id: 'correct' as const, label: `正確 ${recentCorrect.length}` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHistoryFilter(tab.id)}
                    className={`shrink-0 text-[11px] font-black px-3 py-1.5 rounded-full border active:scale-95 transition ${
                      historyFilter === tab.id
                        ? tab.id === 'wrong'
                          ? 'bg-rose-500 text-white border-rose-500'
                          : tab.id === 'correct'
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-slate-800 text-white border-slate-800'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            {recent.length === 0 ? (
              <div className="text-sm text-slate-400 py-2">
                {historyFilter === 'wrong'
                  ? '呢段時間未有錯題'
                  : historyFilter === 'correct'
                    ? '呢段時間未有正確紀錄'
                    : '尚未有練習紀錄'}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recent.map((entry, idx) => (
                  <button
                    type="button"
                    key={`${entry.word}-${entry.time}-${idx}`}
                    onClick={() => onPracticeWord(entry.word)}
                    onPointerDown={(e) => {
                      const target = e.currentTarget;
                      target.dataset.slowHold = '0';
                      const timer = window.setTimeout(() => {
                        target.dataset.slowHold = '1';
                        speakHanzi(entry.word, { rate: 0.55 });
                        try {
                          if (navigator.vibrate) navigator.vibrate(10);
                        } catch {
                          /* ignore */
                        }
                      }, 450);
                      target.dataset.holdTimer = String(timer);
                    }}
                    onPointerUp={(e) => {
                      const t = e.currentTarget.dataset.holdTimer;
                      if (t) window.clearTimeout(Number(t));
                      delete e.currentTarget.dataset.holdTimer;
                    }}
                    onPointerLeave={(e) => {
                      const t = e.currentTarget.dataset.holdTimer;
                      if (t) window.clearTimeout(Number(t));
                      delete e.currentTarget.dataset.holdTimer;
                    }}
                    onPointerCancel={(e) => {
                      const t = e.currentTarget.dataset.holdTimer;
                      if (t) window.clearTimeout(Number(t));
                      delete e.currentTarget.dataset.holdTimer;
                    }}
                    onClickCapture={(e) => {
                      if (e.currentTarget.dataset.slowHold === '1') {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.dataset.slowHold = '0';
                      }
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`w-full flex items-center justify-between gap-3 border p-3 rounded-xl text-left transition hover:border-slate-300 active:scale-[0.99] ${
                      entry.isCorrect ? 'bg-emerald-50/60 border-emerald-100' : 'bg-rose-50/50 border-rose-100'
                    }`}
                    title="點擊重練 · 長按慢聽"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {entry.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-rose-400 text-white text-[10px] font-black flex items-center justify-center shrink-0">!</span>
                        )}
                        <span className="font-black text-slate-800 truncate">{entry.word}</span>
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">{entry.time}</span>
                      </div>
                      {!entry.isCorrect && (
                        <div className="text-[11px] text-rose-500 mt-1 truncate">
                          讀成 {entry.wrongText}
                          {entry.wrongPinyin && entry.wrongPinyin !== '---' ? `（${entry.wrongPinyin}）` : ''}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-black shrink-0 px-2 py-1 rounded-lg ${
                        entry.isCorrect
                          ? 'text-emerald-700 bg-emerald-100/80'
                          : 'text-indigo-700 bg-indigo-100'
                      }`}
                    >
                      重練
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-2 font-bold">撳重練 · 長按慢聽該詞</p>
          </div>

          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <ToneBars toneStats={toneStats} />
          </div>
          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <StatList stats={initialStats} title="聲母錯誤統計 (Initials)" titleColor="text-rose-500" kind="initial" />
          </div>
          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <StatList stats={finalStats} title="韻母錯誤統計 (Finals)" titleColor="text-blue-500" kind="final" />
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3 md:p-4 pb-safe flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={mistakeCount === 0}
            onClick={onRetryMistakes}
            className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-indigo-500 text-white disabled:opacity-40 hover:bg-indigo-600 transition active:scale-[0.98]"
          >
            重練錯題（{mistakeCount}）
          </button>
          {onStartWeakDrill && (
            <button
              type="button"
              disabled={!canStartWeakDrill}
              onClick={onStartWeakDrill}
              className="flex-1 py-3.5 rounded-xl font-bold text-sm bg-violet-500 text-white disabled:opacity-40 hover:bg-violet-600 transition active:scale-[0.98]"
            >
              針對弱項開課
            </button>
          )}
          <button
            type="button"
            onClick={() => setResetConfirm(true)}
            className="sm:flex-1 py-3 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" /> 重置進度
          </button>
        </div>
      </div>
    </div>
  );
}
