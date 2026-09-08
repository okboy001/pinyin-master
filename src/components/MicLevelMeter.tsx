import { useEffect, useRef, useState } from 'react';

type Props = {
  stream: MediaStream | null;
  active: boolean;
};

/** Simple mic level meter so beginners know the mic is picking them up */
export function MicLevelMeter({ stream, active }: Props) {
  const [level, setLevel] = useState(0);
  const [quietTooLong, setQuietTooLong] = useState(false);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const quietSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !stream) {
      setLevel(0);
      setQuietTooLong(false);
      quietSinceRef.current = null;
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
        else if (now - quietSinceRef.current > 2200) setQuietTooLong(true);
      } else {
        quietSinceRef.current = null;
        setQuietTooLong(false);
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
  return (
    <div className="flex flex-col items-center gap-1 mt-2">
      <div className="flex items-end gap-1 h-6" title="麥克風音量">
        {Array.from({ length: bars }).map((_, i) => {
          const threshold = (i + 1) / bars;
          const on = level >= threshold * 0.35;
          return (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ${on ? 'bg-blue-500' : 'bg-slate-200'}`}
              style={{ height: `${30 + i * 14}%` }}
            />
          );
        })}
        <span className={`ml-1 text-[10px] font-bold ${quietTooLong ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`}>
          {quietTooLong ? '太靜：靠近咪／講大聲啲' : level < 0.05 ? '請出聲' : '聽到中'}
        </span>
      </div>
    </div>
  );
}
