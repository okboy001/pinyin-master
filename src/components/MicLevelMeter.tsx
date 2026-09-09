import { useEffect, useRef, useState } from 'react';

type Props = {
  stream: MediaStream | null;
  active: boolean;
  onQuietTap?: () => void;
};

/** Simple mic level meter so beginners know the mic is picking them up */
export function MicLevelMeter({ stream, active, onQuietTap }: Props) {
  const [level, setLevel] = useState(0);
  const [quietTooLong, setQuietTooLong] = useState(false);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const quietSinceRef = useRef<number | null>(null);
  const quietBuzzedRef = useRef(false);

  useEffect(() => {
    if (!active || !stream) {
      setLevel(0);
      setQuietTooLong(false);
      quietSinceRef.current = null;
      quietBuzzedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      const next = Math.min(1, avg * 2.2);
      setLevel(next);

      const now = performance.now();
      if (next < 0.06) {
        if (quietSinceRef.current == null) quietSinceRef.current = now;
        else if (now - quietSinceRef.current > 2200) {
          setQuietTooLong(true);
          if (!quietBuzzedRef.current) {
            quietBuzzedRef.current = true;
            try {
              if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        quietSinceRef.current = null;
        setQuietTooLong(false);
        quietBuzzedRef.current = false;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    void ctx.resume();
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try { source.disconnect(); } catch { /* ignore */ }
      void ctx.close();
      ctxRef.current = null;
    };
  }, [stream, active]);

  if (!active) return null;

  const bars = 5;
  const tip = quietTooLong
    ? '太靜 · 靠近咪／講大聲啲 · 點睇步驟'
    : level < 0.05
      ? '請出聲'
      : '咪有聲 · 繼續';

  return (
    <button
      type="button"
      onClick={() => {
        if (quietTooLong && onQuietTap) {
          onQuietTap();
          return;
        }
        try {
          if (navigator.vibrate) navigator.vibrate(6);
        } catch {
          /* ignore */
        }
      }}
      className="flex flex-col items-center gap-1.5 mt-2 active:scale-[0.98] transition"
      title={quietTooLong ? '點擊睇麥克風步驟' : '麥克風音量'}
    >
      <div className="flex items-end gap-1.5 h-7 md:h-6" aria-hidden>
        {Array.from({ length: bars }).map((_, i) => {
          const threshold = (i + 1) / bars;
          const on = level >= threshold * 0.35;
          return (
            <div
              key={i}
              className={`w-2 md:w-1.5 rounded-full transition-all duration-75 ${
                quietTooLong ? 'bg-amber-400' : on ? 'bg-emerald-500' : 'bg-slate-200'
              }`}
              style={{ height: `${30 + i * 14}%` }}
            />
          );
        })}
      </div>
      <span
        className={`text-[11px] md:text-[10px] font-black px-2.5 py-1 md:py-0.5 rounded-full border ${
          quietTooLong
            ? 'text-amber-800 bg-amber-50 border-amber-200 animate-pulse'
            : level < 0.05
              ? 'text-slate-500 bg-slate-100 border-slate-200'
              : 'text-emerald-700 bg-emerald-50 border-emerald-200'
        }`}
      >
        {tip}
      </span>
    </button>
  );
}
