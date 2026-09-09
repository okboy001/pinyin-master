import { pickMandarinVoice } from './speech';

type SpeakOptions = {
  rate?: number;
  pitch?: number;
  voices?: SpeechSynthesisVoice[];
  onEnd?: () => void;
  /** Default true — set false when chaining utterances */
  cancel?: boolean;
};

/** Shared Mandarin TTS helper for demos and coaching replays */
export function speakHanzi(text: string, opts: SpeakOptions = {}): SpeechSynthesisUtterance | null {
  if (!text || !('speechSynthesis' in window)) {
    opts.onEnd?.();
    return null;
  }
  if (opts.cancel !== false) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = opts.rate ?? 0.85;
  utterance.pitch = opts.pitch ?? 1.1;
  const voice = pickMandarinVoice(opts.voices || window.speechSynthesis.getVoices());
  if (voice) utterance.voice = voice;
  if (opts.onEnd) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      opts.onEnd?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
  }
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function rateForLessonContext(args: {
  ttsSpeed: number;
  stageId?: string;
  kind?: string;
  extraSlow?: boolean;
  afterMistake?: boolean;
  /** Slightly faster after a good streak — push toward natural pace */
  fluencyBoost?: boolean;
}): number {
  const beginner =
    args.kind === 'tone_drill' ||
    args.stageId === 'tones' ||
    args.stageId === 'sounds';
  let rate = beginner ? Math.min(args.ttsSpeed, 0.65) : Math.min(args.ttsSpeed, 0.85);
  if (args.afterMistake) rate = Math.max(0.3, rate * 0.6);
  if (args.extraSlow) rate = Math.max(0.45, rate * 0.75);
  if (args.fluencyBoost && !args.afterMistake && !args.extraSlow) {
    rate = Math.min(1.15, rate * 1.12);
  }
  return rate;
}

/** Pause after demo so learner can prepare — longer for long phrases */
export function thinkMsAfterDemo(hanziLen: number, stageId?: string): number {
  const base =
    stageId === 'conversation' ? 1000 :
    stageId === 'phrases' ? 800 :
    stageId === 'tones' || stageId === 'sounds' ? 700 :
    550;
  let ms = Math.min(2200, base + Math.max(0, hanziLen - 2) * 90);
  // Extra gap after monosyllable demos — reduces speaker-echo into ASR
  if (hanziLen <= 1) {
    ms = Math.max(ms, stageId === 'tones' || stageId === 'sounds' ? 1200 : 950);
  }
  return ms;
}
