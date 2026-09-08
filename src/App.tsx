import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  FileEdit,
  Gauge,
  Mic,
  Pause,
  Play,
  Save,
  SkipForward,
  Timer,
  Volume2,
  X,
} from 'lucide-react';
import { DEFAULT_DICTIONARY, getWordByIndex } from './data/dictionary';
import { CustomInputModal } from './components/CustomInputModal';
import { DiagnosisModal } from './components/DiagnosisModal';
import { DictionaryModal } from './components/DictionaryModal';
import {
  analyzePhoneticDiff,
  isPronunciationMatch,
  mergeCountMaps,
  onlyHanzi,
  splitCustomText,
  textToDictEntry,
  toPinyinString,
} from './lib/scoring';
import { getSpeechRecognitionCtor, pickMandarinVoice, supportsSpeechRecognition, unlockSpeechSynthesis } from './lib/speech';
import {
  loadCustomSession,
  loadDefaultProgress,
  loadFinalStats,
  loadInitialStats,
  loadSettings,
  loadToneStats,
  resetLearningData,
  saveCustomSession,
  saveDefaultProgress,
  saveFinalStats,
  saveInitialStats,
  saveSettings,
  saveToneStats,
} from './lib/storage';
import type { ErrorData, HistoryEntry, Phase, WordEntry } from './types';

const WORDS_PER_PAGE = 50;
const LISTEN_SECONDS = 10;

export default function App() {
  const [dictionary, setDictionary] = useState<string[]>(() => {
    const saved = loadCustomSession();
    return saved?.words?.length ? saved.words : DEFAULT_DICTIONARY;
  });
  const [isCustomMode, setIsCustomMode] = useState(() => Boolean(loadCustomSession()?.words?.length));
  const [globalIndex, setGlobalIndex] = useState(() => {
    const saved = loadCustomSession();
    return saved?.words?.length ? saved.index : loadDefaultProgress().index;
  });
  const [currentWord, setCurrentWord] = useState<WordEntry | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechSupported] = useState(() => supportsSpeechRecognition());
  const [browserWarningDismissed, setBrowserWarningDismissed] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorData, setErrorData] = useState<ErrorData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadDefaultProgress().history);
  const [showHistory, setShowHistory] = useState(false);
  const [timeLeft, setTimeLeft] = useState(LISTEN_SECONDS);
  const [isSavedPulse, setIsSavedPulse] = useState(false);

  const [isBlindMode, setIsBlindMode] = useState(() => loadSettings().blindMode);
  const [autoPreRead, setAutoPreRead] = useState(() => loadSettings().autoPreRead);
  const [ttsSpeed, setTtsSpeed] = useState(() => loadSettings().ttsSpeed);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);

  const [toneStats, setToneStats] = useState(loadToneStats);
  const [initialStats, setInitialStats] = useState(loadInitialStats);
  const [finalStats, setFinalStats] = useState(loadFinalStats);

  const [showDictionary, setShowDictionary] = useState(false);
  const [dictPage, setDictPage] = useState(0);

  const currentWordRef = useRef(currentWord);
  const globalIndexRef = useRef(globalIndex);
  const isPlayingRef = useRef(isPlaying);
  const autoPreReadRef = useRef(autoPreRead);
  const ttsSpeedRef = useRef(ttsSpeed);
  const currentMistakesRef = useRef(0);
  const evalTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const liveTranscriptRef = useRef('');
  const historyRef = useRef(history);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isCustomModeRef = useRef(isCustomMode);
  const dictionaryRef = useRef(dictionary);
  const phaseRef = useRef(phase);

  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);
  useEffect(() => { globalIndexRef.current = globalIndex; }, [globalIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { autoPreReadRef.current = autoPreRead; }, [autoPreRead]);
  useEffect(() => { ttsSpeedRef.current = ttsSpeed; }, [ttsSpeed]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { isCustomModeRef.current = isCustomMode; }, [isCustomMode]);
  useEffect(() => { dictionaryRef.current = dictionary; }, [dictionary]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const pulseSaved = useCallback(() => {
    setIsSavedPulse(true);
    window.setTimeout(() => setIsSavedPulse(false), 1500);
  }, []);

  const persistProgress = useCallback((nextIndex: number, nextHistory: HistoryEntry[]) => {
    const useCustom = isCustomModeRef.current;
    if (useCustom) {
      // Keep default word-index intact; still persist shared history.
      const defaultProg = loadDefaultProgress();
      saveDefaultProgress(defaultProg.index, nextHistory);
      saveCustomSession({ words: dictionaryRef.current, index: nextIndex });
    } else {
      saveDefaultProgress(nextIndex, nextHistory);
      saveCustomSession(null);
    }
    pulseSaved();
  }, [pulseSaved]);

  useEffect(() => {
    document.documentElement.lang = 'zh-Hant';
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) setVoices(list);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    const word = getWordByIndex(dictionary, globalIndex);
    setCurrentWord(word);
  }, [dictionary, globalIndex]);

  const clearEvalTimeouts = useCallback(() => {
    evalTimeoutsRef.current.forEach(clearTimeout);
    evalTimeoutsRef.current = [];
  }, []);

  const addEvalTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    evalTimeoutsRef.current.push(id);
  }, []);

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  };

  const recordHistory = (wordObj: WordEntry, isCorrect: boolean, wrongText = '', wrongPinyin = '') => {
    const newEntry: HistoryEntry = {
      word: wordObj.hanzi,
      pinyin: wordObj.pinyin,
      isCorrect,
      wrongText,
      wrongPinyin,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    let newHistory: HistoryEntry[] = [];
    setHistory((prev) => {
      newHistory = [newEntry, ...prev].slice(0, 100);
      return newHistory;
    });
    return newHistory;
  };

  const goToIndex = useCallback((nextIndex: number, nextHistory?: HistoryEntry[]) => {
    const hist = nextHistory ?? historyRef.current;
    setGlobalIndex(nextIndex);
    persistProgress(nextIndex, hist);
    setErrorData(null);
    currentMistakesRef.current = 0;
    setLiveTranscript('');
    setPhase('idle');
    if (isPlayingRef.current) {
      setTimeout(() => {
        if (isPlayingRef.current) {
          setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
        }
      }, 50);
    }
  }, [persistProgress]);

  const analyzeAndRecordMistakes = useCallback((correctHanzi: string, wrongText: string) => {
    const { toneHits, initialHits, finalHits } = analyzePhoneticDiff(correctHanzi, wrongText);
    if (Object.keys(toneHits).length) {
      setToneStats((prev) => {
        const next = mergeCountMaps(prev, toneHits);
        saveToneStats(next);
        return next;
      });
    }
    if (Object.keys(initialHits).length) {
      setInitialStats((prev) => {
        const next = mergeCountMaps(prev, initialHits);
        saveInitialStats(next);
        return next;
      });
    }
    if (Object.keys(finalHits).length) {
      setFinalStats((prev) => {
        const next = mergeCountMaps(prev, finalHits);
        saveFinalStats(next);
        return next;
      });
    }
  }, []);

  const evaluateResult = useCallback((isInstantWin: boolean, cleanTranscript: string) => {
    setPhase('evaluating');
    const wordObj = currentWordRef.current;
    if (!wordObj) return;

    let isCorrect = isInstantWin;
    if (!isCorrect && cleanTranscript) {
      isCorrect = isPronunciationMatch(cleanTranscript, wordObj.hanzi, wordObj.sim);
    }

    if (isCorrect) {
      setErrorData(null);
      currentMistakesRef.current = 0;
      const newHistory = recordHistory(wordObj, true);
      const nextIndex = globalIndexRef.current + 1;
      setGlobalIndex(nextIndex);
      persistProgress(nextIndex, newHistory);

      addEvalTimeout(() => setLiveTranscript(''), 600);
      addEvalTimeout(() => {
        if (!isPlayingRef.current) return;
        setPhase('idle');
        setTimeout(() => {
          if (isPlayingRef.current) {
            setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
          }
        }, 50);
      }, 800);
      return;
    }

    const displayUserText = cleanTranscript || '(未偵測到發音)';
    const pinyinOfWrongWord = cleanTranscript ? toPinyinString(cleanTranscript, 'symbol') : '---';
    setErrorData({
      userText: displayUserText,
      userPinyin: pinyinOfWrongWord,
      correctText: wordObj.hanzi,
      correctPinyin: wordObj.pinyin,
    });

    const newHistory = recordHistory(wordObj, false, displayUserText, pinyinOfWrongWord);
    persistProgress(globalIndexRef.current, newHistory);
    analyzeAndRecordMistakes(wordObj.hanzi, cleanTranscript);
    currentMistakesRef.current += 1;

    if (currentMistakesRef.current >= 3) {
      addEvalTimeout(() => goToIndex(globalIndexRef.current + 1), 1500);
    } else {
      addEvalTimeout(() => {
        if (isPlayingRef.current) setPhase('system_speaking');
      }, 1000);
    }
  }, [addEvalTimeout, analyzeAndRecordMistakes, goToIndex, persistProgress]);

  const playSystemVoice = useCallback(() => {
    if (!isPlayingRef.current) return;
    setPhase('system_speaking');

    if (!('speechSynthesis' in window)) {
      setPhase('user_speaking');
      return;
    }

    window.speechSynthesis.cancel();
    const speakText = currentWordRef.current?.hanzi || '';
    const utterance = new SpeechSynthesisUtterance(speakText);
    utterance.lang = 'zh-CN';
    utterance.rate = currentMistakesRef.current === 0
      ? ttsSpeedRef.current
      : Math.max(ttsSpeedRef.current * 0.6, 0.3);
    utterance.pitch = 1.1;

    const girlVoice = pickMandarinVoice(voices);
    if (girlVoice) utterance.voice = girlVoice;

    let isEnded = false;
    const onAudioEnd = () => {
      if (isEnded) return;
      isEnded = true;
      setTimeout(() => {
        if (!isPlayingRef.current) return;
        setPhase('user_speaking');
      }, 600);
    };

    utterance.onend = onAudioEnd;
    utterance.onerror = onAudioEnd;
    if (isPlayingRef.current) window.speechSynthesis.speak(utterance);

    const fallbackTime = currentMistakesRef.current === 0 ? 3000 : 4500;
    addEvalTimeout(() => {
      if (!isEnded) onAudioEnd();
    }, fallbackTime);
  }, [addEvalTimeout, voices]);

  useEffect(() => {
    if (phase === 'system_speaking' && isPlaying) {
      playSystemVoice();
    }
  }, [phase, isPlaying, playSystemVoice]);

  useEffect(() => {
    let isCancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;

    if (phase !== 'user_speaking' || !isPlaying) {
      return () => undefined;
    }

    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      setIsPlaying(false);
      setPhase('idle');
      return () => undefined;
    }

    liveTranscriptRef.current = '';
    setLiveTranscript('');
    setTimeLeft(LISTEN_SECONDS);

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    timerId = setTimeout(() => {
      if (isCancelled) return;
      isCancelled = true;
      try { recognition.abort(); } catch { /* ignore */ }
      evaluateResult(false, liveTranscriptRef.current);
    }, LISTEN_SECONDS * 1000);

    countdownInterval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isCancelled || !isPlayingRef.current) return;
      const fullTranscript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('');
      liveTranscriptRef.current = fullTranscript;
      setLiveTranscript(fullTranscript);

      const target = currentWordRef.current;
      if (!target) return;
      const cleanTranscript = onlyHanzi(fullTranscript);

      if (isPronunciationMatch(cleanTranscript, target.hanzi, target.sim)) {
        isCancelled = true;
        if (timerId) clearTimeout(timerId);
        if (countdownInterval) clearInterval(countdownInterval);
        try { recognition.abort(); } catch { /* ignore */ }
        evaluateResult(true, cleanTranscript);
        return;
      }

      // Only fail early when speaker finished a same-length utterance that doesn't match
      if (cleanTranscript.length === target.hanzi.length) {
        isCancelled = true;
        if (timerId) clearTimeout(timerId);
        if (countdownInterval) clearInterval(countdownInterval);
        try { recognition.abort(); } catch { /* ignore */ }
        evaluateResult(false, cleanTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isCancelled || !isPlayingRef.current) return;
      if (event.error === 'no-speech' || event.error === 'network' || event.error === 'aborted') return;
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (countdownInterval) clearInterval(countdownInterval);
      setIsPlaying(false);
      setPhase('idle');
    };

    recognition.onend = () => {
      if (!isCancelled && isPlayingRef.current && phaseRef.current === 'user_speaking') {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    try { recognition.start(); } catch { /* ignore */ }

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (countdownInterval) clearInterval(countdownInterval);
      try { recognition.abort(); } catch { /* ignore */ }
    };
  }, [phase, isPlaying, evaluateResult]);

  const togglePlayPause = async () => {
    if (isPlaying) {
      setIsPlaying(false);
      setPhase('idle');
      window.speechSynthesis.cancel();
      stopRecognition();
      stopMediaStream();
      clearEvalTimeouts();
      setLiveTranscript('');
      setErrorData(null);
      return;
    }

    if (!speechSupported) {
      setBrowserWarningDismissed(false);
      return;
    }

    setIsPlaying(true);
    unlockSpeechSynthesis();
    setPhase(autoPreRead ? 'system_speaking' : 'user_speaking');
    setErrorData(null);
    currentMistakesRef.current = 0;
    setLiveTranscript('');

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      console.warn('麥克風權限未取得：', err);
    }
  };

  const handleSkipWord = () => {
    if (!currentWord) return;
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    const newHistory = recordHistory(currentWord, false, '手動跳過', '---');
    goToIndex(globalIndexRef.current + 1, newHistory);
  };

  const handleAddCustomText = () => {
    if (!customText.trim()) return;
    const sentences = splitCustomText(customText);
    const newWords = sentences.map(textToDictEntry);
    if (!newWords.length) return;

    setDictionary(newWords);
    setIsCustomMode(true);
    setShowCustomInput(false);
    setCustomText('');
    setGlobalIndex(0);
    saveCustomSession({ words: newWords, index: 0 });
    pulseSaved();
    setPhase('idle');
    setErrorData(null);
    currentMistakesRef.current = 0;
    if (isPlayingRef.current) {
      setTimeout(() => setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking'), 50);
    }
  };

  const exitCustomMode = () => {
    const progress = loadDefaultProgress();
    setIsCustomMode(false);
    setDictionary(DEFAULT_DICTIONARY);
    setGlobalIndex(progress.index);
    setHistory(progress.history);
    saveCustomSession(null);
    setPhase('idle');
    setIsPlaying(false);
    window.speechSynthesis.cancel();
    stopRecognition();
    clearEvalTimeouts();
    pulseSaved();
  };

  const handleJumpToWord = (index: number) => {
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    goToIndex(index);
    setShowDictionary(false);
  };

  const handleRetryMistakes = () => {
    const mistakes = history
      .filter((h) => !h.isCorrect && h.wrongText !== '手動跳過')
      .map((h) => h.word);
    const unique = [...new Set(mistakes)];
    if (!unique.length) return;

    const newWords = unique.map(textToDictEntry);
    setDictionary(newWords);
    setIsCustomMode(true);
    setGlobalIndex(0);
    saveCustomSession({ words: newWords, index: 0 });
    setShowHistory(false);
    setPhase('idle');
    setIsPlaying(false);
    window.speechSynthesis.cancel();
    stopRecognition();
    clearEvalTimeouts();
    pulseSaved();
  };

  const handleReset = () => {
    if (!window.confirm('確定重置進度、歷史同診斷統計？自訂詞庫亦會清除。')) return;
    resetLearningData();
    setDictionary(DEFAULT_DICTIONARY);
    setIsCustomMode(false);
    setGlobalIndex(0);
    setHistory([]);
    setToneStats({ 1: 0, 2: 0, 3: 0, 4: 0 });
    setInitialStats({});
    setFinalStats({});
    setShowHistory(false);
    setPhase('idle');
    setIsPlaying(false);
    window.speechSynthesis.cancel();
    stopRecognition();
    clearEvalTimeouts();
    pulseSaved();
  };

  const answered = history.length;
  const correctCount = history.filter((h) => h.isCorrect).length;
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : null;

  const shouldHidePinyin = isBlindMode && (phase === 'user_speaking' || phase === 'idle');
  const shouldHideHanzi = isBlindMode && phase === 'user_speaking';

  if (!currentWord) {
    return (
      <div className="h-[100dvh] w-full bg-slate-50 flex items-center justify-center text-slate-500 font-bold text-xl">
        載入中...
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col font-sans text-slate-800 overflow-hidden relative">
      {!speechSupported && !browserWarningDismissed && (
        <div className="absolute inset-x-0 top-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-3">
          <div className="flex-1 text-sm text-amber-900 font-medium">
            此瀏覽器不支援語音辨識。請用 Chrome、Edge 或 Safari（需 HTTPS），並允許麥克風。
          </div>
          <button type="button" onClick={() => setBrowserWarningDismissed(true)} className="p-1 text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <header className="flex-none w-full max-w-5xl mx-auto flex items-center justify-between p-4 md:px-6 pt-safe z-20 gap-2">
        <button
          type="button"
          onClick={() => {
            setDictPage(Math.floor(globalIndex / WORDS_PER_PAGE));
            setShowDictionary(true);
          }}
          className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 active:scale-95 transition-all text-blue-600 font-bold min-w-0"
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span className="text-xs tracking-wider truncate">
            {Math.min(globalIndex + 1, dictionary.length)} / {dictionary.length}
            {isCustomMode ? ' 自訂' : ' 詞'}
          </span>
          {accuracy != null && (
            <span className="hidden sm:inline text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              {accuracy}%
            </span>
          )}
          {isSavedPulse && <Save className="w-3 h-3 text-emerald-500 animate-pulse ml-0.5 shrink-0" />}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {isCustomMode && (
            <button
              type="button"
              onClick={exitCustomMode}
              className="px-2.5 py-2 rounded-xl border shadow-sm bg-white text-xs font-bold text-slate-500 hover:bg-slate-100"
              title="返回預設詞庫"
            >
              預設
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const next = !autoPreRead;
              setAutoPreRead(next);
              saveSettings({ autoPreRead: next });
            }}
            className={`px-3 py-2 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 gap-1.5 font-bold text-xs ${
              autoPreRead ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
            title="切換先聽或先讀"
          >
            {autoPreRead ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="hidden sm:inline">{autoPreRead ? '先聽' : '先讀'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !isBlindMode;
              setIsBlindMode(next);
              saveSettings({ blindMode: next });
            }}
            className={`p-2.5 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 ${
              isBlindMode ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
            title="盲讀模式（朗讀時隱藏拼音與漢字）"
          >
            {isBlindMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedPanel((v) => !v)}
              className={`p-2.5 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 ${
                showSpeedPanel || ttsSpeed !== 0.85
                  ? 'bg-violet-50 border-violet-200 text-violet-600'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
              title="調整語速"
            >
              <Gauge className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 text-xs">{ttsSpeed.toFixed(2)}x</span>
            </button>
            {showSpeedPanel && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-30">
                <div className="text-[10px] font-bold text-slate-400 mb-2 tracking-wider">TTS 語速</div>
                <input
                  className="speed-slider w-full"
                  type="range"
                  min={0.5}
                  max={1.2}
                  step={0.05}
                  value={ttsSpeed}
                  onChange={(e) => {
                    const next = Number.parseFloat(e.target.value);
                    setTtsSpeed(next);
                    saveSettings({ ttsSpeed: next });
                  }}
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-bold">
                  <span>慢</span>
                  <span>{ttsSpeed.toFixed(2)}x</span>
                  <span>快</span>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="bg-white text-slate-600 p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center hover:bg-slate-100 active:scale-95 transition-all"
            title="自訂詞句"
          >
            <FileEdit className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="bg-white text-slate-600 p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center hover:bg-slate-100 active:scale-95 transition-all"
            title="發音診斷中心"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col px-4 md:px-6 pb-2 gap-3 md:gap-6 min-h-0 overflow-hidden">
        <div className="flex-1 w-full bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row overflow-hidden min-h-0">
          <div className="flex-[3] flex flex-col items-center justify-center p-4 sm:p-8 relative min-h-0 overflow-y-auto w-full">
            <span
              className={`font-mono font-bold text-slate-300 mb-2 md:mb-4 text-center transition-opacity duration-500 break-words w-full whitespace-normal leading-relaxed px-2 ${
                shouldHidePinyin ? 'opacity-0' : 'opacity-100'
              } ${
                currentWord.pinyin.length > 40
                  ? 'text-sm md:text-lg'
                  : currentWord.pinyin.length > 20
                    ? 'text-lg md:text-2xl'
                    : currentWord.pinyin.length > 10
                      ? 'text-xl md:text-3xl tracking-wider'
                      : 'text-2xl md:text-5xl tracking-[0.2em]'
              }`}
            >
              {currentWord.pinyin}
            </span>
            <span
              className={`font-black text-slate-800 text-center break-words w-full whitespace-normal px-2 transition-opacity duration-500 ${
                shouldHideHanzi ? 'opacity-0' : 'opacity-100'
              } ${
                currentWord.hanzi.length > 25
                  ? 'text-xl sm:text-2xl md:text-3xl leading-snug'
                  : currentWord.hanzi.length > 15
                    ? 'text-[1.5rem] sm:text-[2rem] md:text-[3rem] leading-snug'
                    : currentWord.hanzi.length > 8
                      ? 'text-[2.5rem] sm:text-[3rem] md:text-[4rem] leading-tight tracking-wide'
                      : currentWord.hanzi.length > 4
                        ? 'text-[3rem] sm:text-[4rem] md:text-[5rem] lg:text-[6rem] leading-tight tracking-widest'
                        : 'text-[4rem] sm:text-[6rem] md:text-[8rem] lg:text-[9rem] leading-none tracking-widest'
              }`}
            >
              {currentWord.hanzi}
            </span>
            {shouldHideHanzi && (
              <span className="absolute text-slate-300 font-bold tracking-widest text-sm">盲讀中… 請跟讀</span>
            )}
          </div>

          <div className="w-full md:w-px h-px md:h-full bg-slate-100 flex-none" />

          <div className="w-full md:w-80 flex-[2] md:flex-none flex flex-col bg-slate-50/50 p-4 sm:p-6 md:p-8 justify-center min-h-0">
            <div className="flex items-center justify-between mb-2 md:mb-6 flex-none">
              <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                <Mic className="w-3.5 h-3.5 md:w-4 md:h-4" /> 語音狀態
              </div>
              {currentMistakesRef.current > 0 && phase === 'user_speaking' && (
                <span className="text-[10px] md:text-xs font-bold text-red-500 bg-red-100 px-2 py-0.5 md:px-3 md:py-1 rounded-full animate-pulse">
                  剩餘 {3 - currentMistakesRef.current} 次機會
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
              {!isPlaying && phase === 'idle' && (
                <div className="text-slate-400 font-bold tracking-widest text-xs md:text-sm flex items-center gap-2 animate-fade-in">
                  等待開始
                </div>
              )}

              {isPlaying && phase === 'user_speaking' && (
                <div className="flex flex-col items-center w-full animate-fade-in">
                  <div className="relative flex items-center justify-center mb-2 md:mb-4">
                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
                    <div className="bg-blue-100 p-3 md:p-4 rounded-full text-blue-500 shadow-sm">
                      <Mic className="w-5 h-5 md:w-6 md:h-6 z-10" />
                    </div>
                  </div>
                  <div className="text-base md:text-2xl font-bold text-slate-600 tracking-widest text-center min-h-[2.5rem] md:min-h-[3rem] flex items-center justify-center max-w-[90%] overflow-hidden">
                    <span className="truncate">{liveTranscript ? `「${liveTranscript}」` : '請朗讀...'}</span>
                  </div>
                  <div className="text-[10px] md:text-[11px] text-blue-500 mt-1 md:mt-2 font-bold tracking-widest flex items-center gap-1.5 bg-blue-100 px-2.5 py-1 rounded-full shadow-sm">
                    <Timer className="w-3 h-3 md:w-3.5 md:h-3.5" /> 剩餘 {timeLeft} 秒
                  </div>
                </div>
              )}

              {phase === 'system_speaking' && (
                <div className="flex flex-col items-center gap-2 md:gap-3 text-blue-500 font-bold animate-fade-in">
                  <Volume2 className="w-8 h-8 md:w-12 md:h-12 animate-pulse mb-1" />
                  <span className="tracking-widest text-center text-xs md:text-base">
                    {currentMistakesRef.current > 0 ? '老師放慢正音中...' : '老師示範中...'}
                  </span>
                </div>
              )}

              {phase === 'evaluating' && (
                <div className="text-slate-400 font-bold text-xs md:text-sm tracking-widest animate-pulse">分析處理中...</div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`flex-[0.8] md:flex-none w-full flex flex-col rounded-[1.5rem] md:rounded-[2rem] shadow-sm border p-3 md:p-5 transition-all duration-300 bg-white min-h-[100px] md:min-h-[160px] justify-center text-center
           ${errorData ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}
           ${phase === 'evaluating' && !errorData ? 'border-emerald-200 bg-emerald-50/30' : ''}
        `}
        >
          <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-3 text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest justify-center md:justify-start flex-none">
            <Activity className="w-3.5 h-3.5 md:w-4 md:h-4 hidden md:block" /> 判定結果
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
            {!errorData && phase !== 'evaluating' && (
              <div className="text-slate-300 font-bold text-[11px] md:text-sm">等待發音完成...</div>
            )}

            {phase === 'evaluating' && !errorData && (
              <div className="flex flex-col items-center animate-fade-in-up text-emerald-500 gap-1 md:gap-2">
                <CheckCircle2 className="w-8 h-8 md:w-14 md:h-14" />
                <div className="text-base md:text-2xl font-black tracking-widest">PERFECT!</div>
              </div>
            )}

            {errorData && (
              <div className="flex flex-col md:flex-row w-full gap-2 md:gap-4 animate-fade-in-up md:h-full justify-center items-center">
                <div className="flex-1 w-full bg-red-50 border border-red-100 rounded-xl p-2 md:p-4 flex flex-row items-center justify-between shadow-sm min-h-0">
                  <div className="flex flex-col text-left">
                    <span className="text-[9px] md:text-xs font-bold text-red-400 mb-0.5">您讀成</span>
                    <span className="text-sm md:text-xl font-black text-red-600 line-clamp-1">{errorData.userText}</span>
                  </div>
                  <span className="font-mono text-[9px] md:text-sm text-red-500 bg-white px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md md:rounded-lg shadow-sm border border-red-100 max-w-[50%] truncate shrink-0">
                    {errorData.userPinyin}
                  </span>
                </div>

                <div className="flex-1 w-full bg-emerald-50 border border-emerald-100 rounded-xl p-2 md:p-4 flex flex-row items-center justify-between shadow-sm relative overflow-hidden min-h-0">
                  <div className="flex flex-col pl-2 md:pl-3 text-left">
                    <span className="text-[9px] md:text-xs font-bold text-emerald-500 mb-0.5">正確應為</span>
                    <span className="text-sm md:text-xl font-black text-emerald-700">{errorData.correctText}</span>
                  </div>
                  <span className="font-mono text-[9px] md:text-sm text-emerald-600 bg-white px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md md:rounded-lg shadow-sm border border-emerald-100 shrink-0">
                    {errorData.correctPinyin}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="flex-none w-full pb-safe flex items-center justify-center gap-8 py-4 z-10 bg-gradient-to-t from-slate-50 to-transparent">
        <button
          type="button"
          onClick={togglePlayPause}
          className={`w-16 h-16 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95 border-4
            ${
              isPlaying
                ? 'bg-rose-500 hover:bg-rose-600 border-rose-200 text-white shadow-[0_10px_30px_rgba(244,63,94,0.3)]'
                : 'bg-blue-500 hover:bg-blue-600 border-blue-200 text-white shadow-[0_10px_30px_rgba(59,130,246,0.3)]'
            }`}
          title={isPlaying ? '停止學習' : '開始學習'}
        >
          {isPlaying ? (
            <Pause className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" />
          ) : (
            <Play className="w-8 h-8 md:w-10 md:h-10 ml-2" fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          onClick={handleSkipWord}
          className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white border-[4px] border-slate-100 shadow-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all"
          title="跳過此字"
        >
          <SkipForward className="w-5 h-5 md:w-7 md:h-7" />
        </button>
      </footer>

      {showDictionary && (
        <DictionaryModal
          dictionary={dictionary}
          globalIndex={globalIndex}
          dictPage={dictPage}
          wordsPerPage={WORDS_PER_PAGE}
          onClose={() => setShowDictionary(false)}
          onPageChange={setDictPage}
          onJumpTo={handleJumpToWord}
        />
      )}

      {showCustomInput && (
        <CustomInputModal
          customText={customText}
          onChange={setCustomText}
          onClose={() => setShowCustomInput(false)}
          onSubmit={handleAddCustomText}
        />
      )}

      {showHistory && (
        <DiagnosisModal
          history={history}
          toneStats={toneStats}
          initialStats={initialStats}
          finalStats={finalStats}
          onClose={() => setShowHistory(false)}
          onReset={handleReset}
          onRetryMistakes={handleRetryMistakes}
        />
      )}
    </div>
  );
}
