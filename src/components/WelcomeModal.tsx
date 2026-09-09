import { Play, X } from 'lucide-react';
import { useRef } from 'react';
import { curriculumStats } from '../data/curriculum';

type Props = {
  open: boolean;
  onStart: () => void;
  onDismiss: () => void;
};

export function WelcomeModal({ open, onStart, onDismiss }: Props) {
  const swipeYRef = useRef<number | null>(null);
  if (!open) return null;
  const { lessons, minutes } = curriculumStats();

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white text-slate-800 shadow-2xl overflow-hidden pb-safe sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden flex flex-col items-center pt-2.5"
          onTouchStart={(e) => {
            swipeYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = swipeYRef.current;
            swipeYRef.current = null;
            if (startY == null) return;
            const endY = e.changedTouches[0]?.clientY ?? startY;
            const dy = endY - startY;
            if (dy > 56) {
              onDismiss();
              return;
            }
            if (dy < -48) {
              try {
                if (navigator.vibrate) navigator.vibrate(10);
              } catch {
                /* ignore */
              }
              onStart();
            }
          }}
        >
          <div className="h-1 w-10 rounded-full bg-white/40 relative z-10" aria-hidden />
          <p className="text-[10px] font-bold text-white/70 relative z-10 mt-1 -mb-1">上滑開始 · 下滑關閉</p>
        </div>
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
          <p className="text-xs md:text-sm">
            請用 <span className="font-black text-indigo-600">Chrome 或 Safari</span>，允許麥克風（否則無法評分）。
            路徑共 {lessons} 課（約 {minutes} 分鐘）；每日 15 分鐘就夠。
          </p>
          <p className="text-[11px] text-slate-400 font-medium">
            手機可「加到主畫面」當 App 用；練習時長按開始掣可重播本題。
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                if (navigator.vibrate) navigator.vibrate(10);
              } catch {
                /* ignore */
              }
              onStart();
            }}
            className="w-full mt-2 py-4 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-black flex items-center justify-center gap-2 active:scale-[0.98] transition text-base"
          >
            <Play className="w-5 h-5" fill="currentColor" /> 由「四聲入門」開始
          </button>
          <p className="text-[10px] text-center text-slate-400 font-bold -mt-1">
            開始後請允許麥克風 · 否則無法評分
          </p>
          <button type="button" onClick={onDismiss} className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 py-1">
            稍後自己選課
          </button>
        </div>
      </div>
    </div>
  );
}
