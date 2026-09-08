import { Play, X } from 'lucide-react';
import { curriculumStats } from '../data/curriculum';

type Props = {
  open: boolean;
  onStart: () => void;
  onDismiss: () => void;
};

export function WelcomeModal({ open, onStart, onDismiss }: Props) {
  if (!open) return null;
  const { lessons, minutes } = curriculumStats();

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-3xl bg-white text-slate-800 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-4 text-white flex justify-between items-start">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-80">歡迎</div>
            <h2 className="text-xl font-black mt-1">3 分鐘開始講國語</h2>
          </div>
          <button type="button" onClick={onDismiss} className="p-1.5 rounded-full bg-white/15 hover:bg-white/25">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm leading-relaxed text-slate-600">
          <p className="font-bold text-slate-800">建議流程（零基礎）：</p>
          <ol className="list-decimal pl-5 space-y-1.5 font-medium">
            <li>先練四聲（聽曲線 → 跟讀）</li>
            <li>再練易混淆音（zh/z、n/l、ü…）</li>
            <li>之後先詞、再短句、最後對話</li>
          </ol>
          <p>
            請用 <span className="font-black text-indigo-600">Chrome 或 Safari</span>，允許麥克風。
            路徑共 {lessons} 課（約 {minutes} 分鐘）；每日 15 分鐘就夠，可加到主畫面、匯出進度備份。
            急用可開「今日場景」或場景包盲跟讀（生存／社交／飲食／出行／職場）——過關、掃碼、藥房都有。
          </p>
          <button
            type="button"
            onClick={onStart}
            className="w-full mt-2 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-black flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <Play className="w-4 h-4" fill="currentColor" /> 由「四聲入門」開始
          </button>
          <button type="button" onClick={onDismiss} className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 py-1">
            稍後自己選課
          </button>
        </div>
      </div>
    </div>
  );
}
