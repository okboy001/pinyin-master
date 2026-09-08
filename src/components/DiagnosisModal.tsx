import { Activity, RotateCcw, X } from 'lucide-react';
import type { HistoryEntry } from '../types';

type Props = {
  history: HistoryEntry[];
  toneStats: Record<string, number>;
  initialStats: Record<string, number>;
  finalStats: Record<string, number>;
  onClose: () => void;
  onReset: () => void;
  onRetryMistakes: () => void;
};

function ToneBars({ toneStats }: { toneStats: Record<string, number> }) {
  const total = (toneStats[1] || 0) + (toneStats[2] || 0) + (toneStats[3] || 0) + (toneStats[4] || 0) || 1;
  const labels: Record<number, string> = { 1: '陰平', 2: '陽平', 3: '上聲', 4: '去聲' };
  const colors: Record<number, string> = { 1: 'bg-rose-400', 2: 'bg-amber-400', 3: 'bg-emerald-400', 4: 'bg-blue-400' };

  return (
    <div className="flex flex-col gap-3 w-full">
      <h4 className="text-sm font-bold text-slate-500 mb-1 border-b border-slate-100 pb-2">聲調錯誤分佈</h4>
      {[1, 2, 3, 4].map((t) => {
        const pct = Math.round(((toneStats[t] || 0) / total) * 100);
        return (
          <div key={t} className="flex items-center gap-3 text-xs font-bold text-slate-500">
            <span className="w-16 text-right">{labels[t]}({t})</span>
            <div className="h-3 flex-1 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${colors[t]} transition-all duration-1000`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-right">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function StatList({ stats, title, titleColor }: { stats: Record<string, number>; title: string; titleColor: string }) {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h4 className={`text-sm font-bold ${titleColor} mb-1 border-b border-slate-100 pb-2`}>{title}</h4>
        <div className="text-sm text-slate-400 py-2">目前表現完美，無錯誤紀錄</div>
      </div>
    );
  }

  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-2">
      <h4 className={`text-sm font-bold ${titleColor} mb-1 border-b border-slate-100 pb-2`}>{title}</h4>
      <div className="grid grid-cols-2 gap-3 mt-1">
        {sorted.map(([item, count]) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div key={item} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-xl shadow-sm">
              <span className="font-mono font-black text-slate-700 text-lg">{item}</span>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-slate-500">{count} 次</span>
                <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DiagnosisModal({
  history,
  toneStats,
  initialStats,
  finalStats,
  onClose,
  onReset,
  onRetryMistakes,
}: Props) {
  const answered = history.length;
  const correct = history.filter((h) => h.isCorrect).length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
  const mistakeCount = history.filter((h) => !h.isCorrect && h.wrongText !== '手動跳過').length;

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
    <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col p-4 pt-safe sm:p-10 animate-fade-in text-slate-800">
      <div className="bg-slate-50 rounded-3xl shadow-2xl flex-1 flex flex-col overflow-hidden w-full max-w-2xl mx-auto">
        <div className="p-4 md:p-6 flex justify-between items-center border-b border-slate-200 bg-white">
          <h2 className="text-lg md:text-xl font-black tracking-widest text-slate-800 flex items-center gap-2">
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
            <div className="bg-blue-50 border border-blue-100 p-3 md:p-4 rounded-2xl text-center shadow-sm col-span-2 sm:col-span-1">
              <span className="text-[10px] md:text-xs font-bold text-blue-400 mb-1 block">最易錯聲調</span>
              <span className="text-base md:text-xl font-black text-blue-600">{topTone ? toneLabels[topTone] : '無'}</span>
              <span className="text-[10px] text-blue-500/70 mt-1 block">{maxToneCount > 0 ? `累積錯 ${maxToneCount} 次` : '表現完美'}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={mistakeCount === 0}
              onClick={onRetryMistakes}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-indigo-500 text-white disabled:opacity-40 hover:bg-indigo-600 transition"
            >
              重練錯題（{mistakeCount}）
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> 重置進度
            </button>
          </div>

          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <ToneBars toneStats={toneStats} />
          </div>
          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <StatList stats={initialStats} title="聲母錯誤統計 (Initials)" titleColor="text-rose-500" />
          </div>
          <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
            <StatList stats={finalStats} title="韻母錯誤統計 (Finals)" titleColor="text-blue-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
