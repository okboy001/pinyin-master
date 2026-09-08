export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function supportsSpeechRecognition(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function pickMandarinVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const keywords = ['xiaoxiao', 'yaoyao', 'ting-ting', 'lili', 'girl', 'female'];
  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const v of voices) {
    if (!(v.lang.includes('zh-CN') || v.lang.includes('zh-TW') || v.lang.includes('zh-HK'))) {
      continue;
    }
    const lowerName = v.name.toLowerCase();
    let score = 0;
    if (keywords.some((kw) => lowerName.includes(kw))) score += 10;
    if (lowerName.includes('zh-cn') || lowerName.includes('普通话') || lowerName.includes('國語')) score += 5;
    if (score > bestScore) {
      bestScore = score;
      bestVoice = v;
    }
  }

  return bestVoice || voices.find((v) => v.lang.includes('zh')) || null;
}

export function unlockSpeechSynthesis() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const unlock = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(unlock);
}
