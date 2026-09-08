import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  FileEdit,
  Gauge,
  Home,
  Mic,
  Pause,
  Play,
  Save,
  SkipBack,
  SkipForward,
  Timer,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { DEFAULT_DICTIONARY, getWordByIndex, parseWord } from './data/dictionary';
import { getLesson, LESSONS, lessonToDictionary, listenSecondsForItem, listenSecondsForLesson, parseLessonHint, passAccuracyForLesson, passCoverageRatioForLesson, recommendNextLesson, shouldForcePreRead, lessonPracticeTip, type Lesson } from './data/curriculum';
import { CustomInputModal } from './components/CustomInputModal';
import { DiagnosisModal } from './components/DiagnosisModal';
import { DictionaryModal } from './components/DictionaryModal';
import { MicLevelMeter } from './components/MicLevelMeter';
import { PathHome } from './components/PathHome';
import { ToneContour } from './components/ToneContour';
import { WelcomeModal } from './components/WelcomeModal';
import {
  analyzePhoneticDiff,
  diagnoseAttempt,
  isPronunciationMatch,
  mergeCountMaps,
  onlyHanzi,
  splitCustomText,
  textToDictEntry,
  toPinyinArray,
  toPinyinString,
} from './lib/scoring';
import { getSpeechRecognitionCtor, supportsSpeechRecognition, unlockSpeechSynthesis } from './lib/speech';
import { rateForLessonContext, speakHanzi, thinkMsAfterDemo } from './lib/speak';
import { dueCards, reviewCard, weakCards, type SrsState } from './lib/srs';
import { buildDailySceneDrill, buildFluencyWarmup, buildMixedReview, drillForScenePack, scenePackForLessonId, SCENE_PACK_LABELS, SCENE_PACK_TOASTS, buildWeaknessDrill, wordsSuggestEarFirst, type ScenePackKind } from './lib/weakDrill';
import {
  exportLearningBackup,
  importLearningBackup,
  loadActiveLesson,
  loadCustomSession,
  loadDefaultProgress,
  loadFinalStats,
  loadInitialStats,
  loadPathProgress,
  loadSettings,
  loadSrs,
  loadToneStats,
  loadWelcomeSeen,
  markLessonComplete,
  recordCorrectPractice,
  recordLessonScore,
  resetLearningData,
  saveActiveLesson,
  saveCustomSession,
  saveDefaultProgress,
  saveFinalStats,
  saveInitialStats,
  savePathProgress,
  saveSettings,
  saveSrs,
  saveToneStats,
  saveWelcomeSeen,
  setDailyGoal,
} from './lib/storage';
import type { ActivePractice, ErrorData, HistoryEntry, PathProgress, Phase, WordEntry } from './types';

const WORDS_PER_PAGE = 50;
const DEFAULT_LISTEN_SECONDS = 10;

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
  const [timeLeft, setTimeLeft] = useState(DEFAULT_LISTEN_SECONDS);
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

  const [screen, setScreen] = useState<'home' | 'practice'>('home');
  const [pathProgress, setPathProgress] = useState<PathProgress>(() => loadPathProgress());
  const [srs, setSrs] = useState<SrsState>(() => loadSrs());
  const [activePractice, setActivePractice] = useState<ActivePractice | null>(null);
  const [lessonCompleteBanner, setLessonCompleteBanner] = useState<{
    title: string;
    accuracy: number;
    correct: number;
    total: number;
    passed: boolean;
    lessonId?: string;
    mistakeWords?: string[];
    failReason?: 'accuracy' | 'coverage' | null;
    minAttempts?: number;
  } | null>(null);
  const [listenSeconds, setListenSeconds] = useState(DEFAULT_LISTEN_SECONDS);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionAttempts, setSessionAttempts] = useState(0);
  const sessionCorrectRef = useRef(0);
  const sessionAttemptsRef = useRef(0);
  const [comboStreak, setComboStreak] = useState(0);
  const comboStreakRef = useRef(0);
  const [demoPass, setDemoPass] = useState<1 | 2>(1);
  const demoPassRef = useRef<1 | 2>(1);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [resumeLessonId, setResumeLessonId] = useState(() => loadActiveLesson()?.lessonId ?? null);
  const [resumeIndex, setResumeIndex] = useState(() => loadActiveLesson()?.index ?? 0);
  const [showWelcome, setShowWelcome] = useState(() => !loadWelcomeSeen());
  const [dailyGoalToast, setDailyGoalToast] = useState(false);
  const [pausedByHide, setPausedByHide] = useState(false);
  const [lessonForceBlind, setLessonForceBlind] = useState(false);
  const [peekReveal, setPeekReveal] = useState(false);
  const [pairContrastHint, setPairContrastHint] = useState<string | null>(null);
  const [listenExtendUsed, setListenExtendUsed] = useState(false);
  const [listenExtendsLeft, setListenExtendsLeft] = useState(1);
  const [roundMistakes, setRoundMistakes] = useState(0);
  const [comboBreakToast, setComboBreakToast] = useState(false);
  const [stageTipToast, setStageTipToast] = useState<string | null>(null);
  const [speedToast, setSpeedToast] = useState<string | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const extendListenRef = useRef<(() => void) | null>(null);
  const skipPrepareRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const goOff = () => {
      setOffline(true);
      setStageTipToast('已離線 · 本地仍可練');
      window.setTimeout(() => setStageTipToast(null), 2400);
    };
    const goOn = () => {
      setOffline(false);
      setStageTipToast('已恢復連線');
      window.setTimeout(() => setStageTipToast(null), 1800);
    };
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    return () => {
      window.removeEventListener('offline', goOff);
      window.removeEventListener('online', goOn);
    };
  }, []);

  const currentWordRef = useRef(currentWord);
  const globalIndexRef = useRef(globalIndex);
  const isPlayingRef = useRef(isPlaying);
  const autoPreReadRef = useRef(autoPreRead);
  const ttsSpeedRef = useRef(ttsSpeed);
  const currentMistakesRef = useRef(0);
  const sessionMistakeWordsRef = useRef<string[]>([]);
  const evalTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const liveTranscriptRef = useRef('');
  const historyRef = useRef(history);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isCustomModeRef = useRef(isCustomMode);
  const dictionaryRef = useRef(dictionary);
  const phaseRef = useRef(phase);
  const activePracticeRef = useRef(activePractice);
  const srsRef = useRef(srs);
  const pathProgressRef = useRef(pathProgress);
  const listenSecondsRef = useRef(listenSeconds);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);
  useEffect(() => { globalIndexRef.current = globalIndex; }, [globalIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { autoPreReadRef.current = autoPreRead; }, [autoPreRead]);
  useEffect(() => { ttsSpeedRef.current = ttsSpeed; }, [ttsSpeed]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { isCustomModeRef.current = isCustomMode; }, [isCustomMode]);
  useEffect(() => { dictionaryRef.current = dictionary; }, [dictionary]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { activePracticeRef.current = activePractice; }, [activePractice]);
  useEffect(() => { srsRef.current = srs; }, [srs]);
  useEffect(() => { pathProgressRef.current = pathProgress; }, [pathProgress]);
  useEffect(() => { listenSecondsRef.current = listenSeconds; }, [listenSeconds]);

  const pulseSaved = useCallback(() => {
    setIsSavedPulse(true);
    window.setTimeout(() => setIsSavedPulse(false), 1500);
  }, []);

  const clearEvalTimeouts = useCallback(() => {
    evalTimeoutsRef.current.forEach(clearTimeout);
    evalTimeoutsRef.current = [];
  }, []);

  const addEvalTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    evalTimeoutsRef.current.push(id);
  }, []);

  const persistProgress = useCallback((nextIndex: number, nextHistory: HistoryEntry[]) => {
    const practice = activePracticeRef.current;
    const useSessionBag = practice?.mode === 'custom' || practice?.mode === 'lesson' || practice?.mode === 'srs' || isCustomModeRef.current;
    if (useSessionBag && practice?.mode !== 'free') {
      const defaultProg = loadDefaultProgress();
      saveDefaultProgress(defaultProg.index, nextHistory);
      if (practice?.mode === 'custom' || isCustomModeRef.current) {
        saveCustomSession({ words: dictionaryRef.current, index: nextIndex });
      }
    } else {
      saveDefaultProgress(nextIndex, nextHistory);
      saveCustomSession(null);
    }
    pulseSaved();
  }, [pulseSaved]);

  const stopPracticeAudio = useCallback(() => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    clearEvalTimeouts();
    setIsPlaying(false);
    setPhase('idle');
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, [clearEvalTimeouts]);

  const requestWakeLock = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator)) return;
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      // unsupported / denied — ignore
    }
  }, []);

  const beginPractice = useCallback((words: string[], practice: ActivePractice, startIndex = 0) => {
    if (!words.length) return;
    setDictionary(words);
    setGlobalIndex(startIndex);
    setActivePractice(practice);
    setIsCustomMode(practice.mode === 'custom');
    setScreen('practice');
    setLessonCompleteBanner(null);
    setErrorData(null);
    currentMistakesRef.current = 0;
    setRoundMistakes(0);
    setLiveTranscript('');
    setPhase('idle');
    setIsPlaying(false);
    setSessionCorrect(0);
    setSessionAttempts(0);
    sessionCorrectRef.current = 0;
    sessionAttemptsRef.current = 0;
    sessionMistakeWordsRef.current = [];
    setComboStreak(0);
    comboStreakRef.current = 0;
    setPausedByHide(false);
    window.speechSynthesis.cancel();
    if (practice.mode === 'custom') {
      saveCustomSession({ words, index: startIndex });
    }
    if (practice.mode === 'lesson' && practice.lessonId) {
      saveActiveLesson({ lessonId: practice.lessonId, index: startIndex });
      setResumeLessonId(practice.lessonId);
      setResumeIndex(startIndex);
    } else {
      saveActiveLesson(null);
      setResumeLessonId(null);
      setLessonForceBlind(Boolean(practice.earFirst));
    }
    pulseSaved();
  }, [pulseSaved]);

  const startLesson = useCallback((lesson: Lesson, startIndex = 0) => {
    const seconds = listenSecondsForLesson(lesson);
    setListenSeconds(seconds);
    if (shouldForcePreRead(lesson)) {
      setAutoPreRead(true);
      saveSettings({ autoPreRead: true });
    }
    const earFirst =
      lesson.kind === 'dictation' ||
      lesson.stageId === 'phrases' ||
      lesson.stageId === 'conversation';
    beginPractice(lessonToDictionary(lesson), {
      mode: 'lesson',
      lessonId: lesson.id,
      title: lesson.title,
      subtitle: lesson.subtitle,
    }, startIndex);
    setLessonForceBlind(earFirst);
    if (earFirst) {
      setAutoPreRead(true);
      saveSettings({ autoPreRead: true });
    }
    const tip = lessonPracticeTip(lesson);
    const showShortcutsHint = () => {
      try {
        if (localStorage.getItem('pm_shortcuts_hint_v1')) return;
        localStorage.setItem('pm_shortcuts_hint_v1', '1');
        setStageTipToast('快捷鍵：按 ? 睇說明 · Space 播放 · R 重播 · E 加時（長句兩次）');
        window.setTimeout(() => setStageTipToast(null), 4200);
      } catch {
        /* ignore quota / private mode */
      }
    };
    if (tip) {
      setStageTipToast(tip);
      window.setTimeout(() => {
        setStageTipToast(null);
        showShortcutsHint();
      }, 3600);
    } else {
      showShortcutsHint();
    }
  }, [beginPractice]);

  const resumeInterruptedLesson = useCallback(() => {
    const saved = loadActiveLesson();
    if (!saved) return;
    const lesson = getLesson(saved.lessonId);
    if (!lesson) return;
    const idx = Math.min(Math.max(0, saved.index), lesson.items.length - 1);
    startLesson(lesson, idx);
  }, [startLesson]);

  const startSrsReview = useCallback(() => {
    setListenSeconds(12);
    const due = dueCards(srsRef.current, 20);
    const weak = weakCards(srsRef.current, 15);
    const keys = [...new Set([...due, ...weak].map((c) => c.key))];
    if (!keys.length) return;
    const words = keys.map((k) => (k.includes('|') ? k : textToDictEntry(k)));
    const earFirst = wordsSuggestEarFirst(words);
    beginPractice(words, {
      mode: 'srs',
      title: '弱項複習',
      subtitle: '根據你最近嘅錯誤，優先練返易錯項目',
      earFirst,
    });
    if (earFirst) {
      setLessonForceBlind(true);
      setAutoPreRead(true);
      saveSettings({ autoPreRead: true });
    }
  }, [beginPractice]);

  const startFreeDictionary = useCallback(() => {
    setListenSeconds(DEFAULT_LISTEN_SECONDS);
    const progress = loadDefaultProgress();
    beginPractice(DEFAULT_DICTIONARY, {
      mode: 'free',
      title: '自由詞庫',
      subtitle: '高頻詞自由練習',
    }, progress.index);
    setIsCustomMode(false);
  }, [beginPractice]);

  const backToHome = useCallback(() => {
    const practice = activePracticeRef.current;
    if (
      practice?.mode === 'lesson' &&
      practice.lessonId &&
      globalIndexRef.current > 0 &&
      globalIndexRef.current < dictionaryRef.current.length
    ) {
      const ok = window.confirm('課程尚未完成，進度已自動保存。確定返回路徑？');
      if (!ok) return;
    }
    stopPracticeAudio();
    setScreen('home');
    setActivePractice(null);
    setLessonCompleteBanner(null);
    setLessonForceBlind(false);
  }, [stopPracticeAudio]);

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
    if (dictionary.length === 0) {
      setCurrentWord(null);
      return;
    }
    if (globalIndex >= dictionary.length) {
      setCurrentWord(parseWord(dictionary[dictionary.length - 1]));
      return;
    }
    setCurrentWord(getWordByIndex(dictionary, globalIndex));
    demoPassRef.current = 1;
    setDemoPass(1);
    setPeekReveal(false);
    setPairContrastHint(null);
    const practice = activePracticeRef.current;
    if (practice?.mode === 'lesson' && practice.lessonId) {
      saveActiveLesson({ lessonId: practice.lessonId, index: globalIndex });
      setResumeLessonId(practice.lessonId);
      setResumeIndex(globalIndex);
    }
  }, [dictionary, globalIndex]);

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && isPlayingRef.current) {
        stopPracticeAudio();
        stopMediaStream();
        setMicStream(null);
        setPausedByHide(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stopPracticeAudio]);

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
    setRoundMistakes(0);
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
      setRoundMistakes(0);
      try {
        if (navigator.vibrate) navigator.vibrate(12);
      } catch {
        /* ignore */
      }
      const newHistory = recordHistory(wordObj, true);
      const dictLen = dictionaryRef.current.length;
      const nextIndex = globalIndexRef.current + 1;
      const practice = activePracticeRef.current;
      const srsKey = dictionaryRef.current[globalIndexRef.current] || wordObj.hanzi;

      setSessionAttempts((n) => {
        const next = n + 1;
        sessionAttemptsRef.current = next;
        return next;
      });
      setSessionCorrect((n) => {
        const next = n + 1;
        sessionCorrectRef.current = next;
        return next;
      });
      setComboStreak((n) => {
        const next = n + 1;
        comboStreakRef.current = next;
        if (next === 5) {
          setStageTipToast('連對 5 · 可按 [ ] 微調語速');
          window.setTimeout(() => setStageTipToast(null), 2400);
        }
        return next;
      });

      const nextSrs = reviewCard(srsRef.current, srsKey, true, {
        easy: comboStreakRef.current >= 4,
      });
      setSrs(nextSrs);
      saveSrs(nextSrs);

      let nextPath = recordCorrectPractice(pathProgressRef.current);
      const prevDaily = pathProgressRef.current.dailyCorrect;
      const goal = pathProgressRef.current.dailyGoal || 20;
      if (prevDaily < goal && nextPath.dailyCorrect >= goal) {
        setDailyGoalToast(true);
        addEvalTimeout(() => setDailyGoalToast(false), 3200);
      }
      setPathProgress(nextPath);
      savePathProgress(nextPath);

      if (practice?.mode === 'lesson' && practice.lessonId && nextIndex >= dictLen) {
        setGlobalIndex(dictLen);
        persistProgress(dictLen, newHistory);
        setIsPlaying(false);
        setPhase('idle');
        const total = sessionAttemptsRef.current;
        const ok = sessionCorrectRef.current;
        const accuracyPct = total > 0 ? Math.round((ok / total) * 100) : 100;
        const minAttempts = Math.max(1, Math.ceil(dictLen * passCoverageRatioForLesson(practice.lessonId)));
        const passAcc = passAccuracyForLesson(practice.lessonId);
        const passed = accuracyPct >= passAcc && total >= minAttempts;
        const failReason: 'accuracy' | 'coverage' | null = passed
          ? null
          : accuracyPct < passAcc
            ? 'accuracy'
            : 'coverage';
        nextPath = recordLessonScore(nextPath, practice.lessonId, accuracyPct);
        if (passed) {
          nextPath = markLessonComplete(nextPath, practice.lessonId);
          setPathProgress(nextPath);
          savePathProgress(nextPath);
          saveActiveLesson(null);
          setResumeLessonId(null);
        } else {
          setPathProgress(nextPath);
          savePathProgress(nextPath);
          // Keep resume point at start so they can retry cleanly
          saveActiveLesson({ lessonId: practice.lessonId, index: 0 });
          setResumeLessonId(practice.lessonId);
          setResumeIndex(0);
        }
        setLessonCompleteBanner({
          title: practice.title,
          correct: ok,
          total,
          accuracy: accuracyPct,
          passed,
          lessonId: practice.lessonId,
          mistakeWords: [...new Set(sessionMistakeWordsRef.current)],
          failReason,
          minAttempts,
        });
        return;
      }

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
    const issues = diagnoseAttempt(wordObj.hanzi, cleanTranscript);
    setErrorData({
      userText: displayUserText,
      userPinyin: pinyinOfWrongWord,
      correctText: wordObj.hanzi,
      correctPinyin: wordObj.pinyin,
      issues,
    });

    const newHistory = recordHistory(wordObj, false, displayUserText, pinyinOfWrongWord);
    persistProgress(globalIndexRef.current, newHistory);
    analyzeAndRecordMistakes(wordObj.hanzi, cleanTranscript);
    currentMistakesRef.current += 1;
    setRoundMistakes(currentMistakesRef.current);
    if (currentMistakesRef.current === 2) {
      setStageTipToast('最後一次機會 · 聽清楚再跟');
      window.setTimeout(() => setStageTipToast(null), 2200);
    }
    {
      const raw = dictionaryRef.current[globalIndexRef.current];
      if (raw) sessionMistakeWordsRef.current.push(raw);
    }
    const brokenCombo = comboStreakRef.current;
    setComboStreak(0);
    comboStreakRef.current = 0;
    if (brokenCombo >= 3) {
      setComboBreakToast(true);
      addEvalTimeout(() => setComboBreakToast(false), 1600);
    }
    try {
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    } catch {
      /* ignore */
    }
    setSessionAttempts((n) => {
      const next = n + 1;
      sessionAttemptsRef.current = next;
      return next;
    });

    const srsKey = dictionaryRef.current[globalIndexRef.current] || wordObj.hanzi;
    const nextSrs = reviewCard(srsRef.current, srsKey, false);
    setSrs(nextSrs);
    saveSrs(nextSrs);

    const practiceForCoach = activePracticeRef.current;
    const lessonForCoach = practiceForCoach?.lessonId ? getLesson(practiceForCoach.lessonId) : undefined;

    // Auto-coach: slow replay — for minimal pairs, replay A→B contrast
    addEvalTimeout(() => {
      if (!isPlayingRef.current) return;
      const text = currentWordRef.current?.hanzi;
      if (!text) return;
      const lesson = lessonForCoach;
      const slowRate = rateForLessonContext({
        ttsSpeed: ttsSpeedRef.current,
        stageId: lesson?.stageId ?? (practiceForCoach?.earFirst ? 'phrases' : undefined),
        kind: lesson?.kind,
        extraSlow: true,
      });
      const idx = globalIndexRef.current;
      if (lesson?.kind === 'minimal_pair' && idx % 2 === 1) {
        const prevRaw = dictionaryRef.current[idx - 1];
        const prevHanzi = prevRaw ? parseWord(prevRaw).hanzi : '';
        if (prevHanzi) {
          setPairContrastHint(`${prevHanzi} → ${text}`);
          speakHanzi(prevHanzi, {
            voices,
            rate: slowRate,
            onEnd: () => {
              speakHanzi(text, {
                voices,
                rate: slowRate,
                cancel: false,
                onEnd: () => setPairContrastHint(null),
              });
            },
          });
          return;
        }
      }
      speakHanzi(text, { voices, rate: slowRate });
    }, 450);

    if (currentMistakesRef.current >= 3) {
      addEvalTimeout(() => goToIndex(globalIndexRef.current + 1), 2800);
    } else {
      const retryMs =
        lessonForCoach?.kind === 'minimal_pair' && globalIndexRef.current % 2 === 1 ? 2600 : 1900;
      addEvalTimeout(() => {
        if (isPlayingRef.current) setPhase('system_speaking');
      }, retryMs);
    }
  }, [addEvalTimeout, analyzeAndRecordMistakes, goToIndex, persistProgress, voices]);

  const replayCorrectPronunciation = useCallback((opts?: { extraSlow?: boolean }) => {
    const text = currentWordRef.current?.hanzi;
    if (!text) return;
    unlockSpeechSynthesis();
    const practice = activePracticeRef.current;
    const lesson = practice?.lessonId ? getLesson(practice.lessonId) : undefined;
    speakHanzi(text, {
      voices,
      rate: rateForLessonContext({
        ttsSpeed: ttsSpeedRef.current,
        stageId: lesson?.stageId ?? (practice?.earFirst ? 'phrases' : undefined),
        kind: lesson?.kind,
        extraSlow: opts?.extraSlow,
      }),
    });
  }, [voices]);

  const playSystemVoice = useCallback(() => {
    if (!isPlayingRef.current) return;
    setPhase('system_speaking');

    if (!('speechSynthesis' in window)) {
      setPhase('user_speaking');
      return;
    }

    const speakText = currentWordRef.current?.hanzi || '';
    const practice = activePracticeRef.current;
    const lesson = practice?.lessonId ? getLesson(practice.lessonId) : undefined;
    const earFirst = Boolean(practice?.earFirst) || Boolean(lesson && shouldForcePreRead(lesson));
    const rate = rateForLessonContext({
      ttsSpeed: ttsSpeedRef.current,
      stageId: lesson?.stageId ?? (earFirst ? 'phrases' : undefined),
      kind: lesson?.kind,
      afterMistake: currentMistakesRef.current > 0,
      fluencyBoost: comboStreakRef.current >= 5,
    });
    let isEnded = false;

    const onAudioEnd = () => {
      if (isEnded) return;
      isEnded = true;
      const thinkMs = thinkMsAfterDemo(speakText.length, lesson?.stageId ?? (earFirst ? 'phrases' : undefined));
      const needsSecondDemo =
        earFirst &&
        currentMistakesRef.current === 0 &&
        demoPassRef.current < 2;

      if (!needsSecondDemo && thinkMs >= 400) {
        setPhase('preparing');
      }

      let prepareDone = false;
      let prepareTimer: ReturnType<typeof setTimeout> | null = null;
      const finishPrepare = () => {
        if (prepareDone || !isPlayingRef.current) return;
        prepareDone = true;
        skipPrepareRef.current = null;
        if (prepareTimer) clearTimeout(prepareTimer);
        if (needsSecondDemo) {
          demoPassRef.current = 2;
          setDemoPass(2);
          setPhase('idle');
          setTimeout(() => {
            if (isPlayingRef.current) setPhase('system_speaking');
          }, 80);
          return;
        }
        setPhase('user_speaking');
      };

      skipPrepareRef.current = () => {
        if (needsSecondDemo) return;
        finishPrepare();
      };

      prepareTimer = setTimeout(finishPrepare, thinkMs);
    };

    const speakCurrent = (opts?: { cancel?: boolean }) => {
      const utterance = speakHanzi(speakText, {
        voices,
        rate,
        cancel: opts?.cancel,
        onEnd: onAudioEnd,
      });
      const fallbackTime = currentMistakesRef.current === 0
        ? 2500 + speakText.length * 180
        : 3500 + speakText.length * 200;
      addEvalTimeout(() => {
        if (!isEnded) onAudioEnd();
      }, fallbackTime);
      if (!utterance) onAudioEnd();
    };

    const pairContrast =
      lesson?.kind === 'minimal_pair' &&
      globalIndexRef.current % 2 === 1 &&
      currentMistakesRef.current === 0 &&
      demoPassRef.current === 1;
    if (pairContrast) {
      const prevRaw = dictionaryRef.current[globalIndexRef.current - 1];
      const prevHanzi = prevRaw ? parseWord(prevRaw).hanzi : '';
      if (prevHanzi) {
        setPairContrastHint(`${prevHanzi} → ${speakText}`);
        let startedCurrent = false;
        const speakCurrentOnce = () => {
          if (startedCurrent || isEnded) return;
          startedCurrent = true;
          setPairContrastHint(null);
          speakCurrent({ cancel: false });
        };
        speakHanzi(prevHanzi, {
          voices,
          rate,
          onEnd: () => {
            if (!isPlayingRef.current) return;
            addEvalTimeout(speakCurrentOnce, 280);
          },
        });
        addEvalTimeout(speakCurrentOnce, 2200 + prevHanzi.length * 160);
        return;
      }
    }

    setPairContrastHint(null);
    speakCurrent();
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
    const practice = activePracticeRef.current;
    const lesson = practice?.lessonId ? getLesson(practice.lessonId) : undefined;
    const hanziLen = currentWordRef.current?.hanzi.length ?? 2;
    const seconds = listenSecondsForItem(lesson, hanziLen, Boolean(practice?.earFirst));
    setTimeLeft(seconds);
    setListenExtendUsed(false);
    const maxManualExtends =
      hanziLen >= 8 || lesson?.stageId === 'conversation' || Boolean(practice?.earFirst) ? 2 : 1;
    setListenExtendsLeft(maxManualExtends);

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let graceUsed = false;
    let manualExtendCount = 0;
    let remaining = seconds;

    const finishListen = () => {
      if (isCancelled) return;
      const partial = onlyHanzi(liveTranscriptRef.current);
      const targetLen = currentWordRef.current?.hanzi.length ?? 0;
      // If learner already started speaking a long line, give one short extension
      if (!graceUsed && partial.length > 0 && partial.length < targetLen && targetLen > 4) {
        graceUsed = true;
        remaining = 4;
        setTimeLeft(4);
        timerId = setTimeout(() => {
          if (isCancelled) return;
          isCancelled = true;
          try { recognition.abort(); } catch { /* ignore */ }
          evaluateResult(false, liveTranscriptRef.current);
        }, 4000);
        return;
      }
      isCancelled = true;
      try { recognition.abort(); } catch { /* ignore */ }
      evaluateResult(false, liveTranscriptRef.current);
    };

    const scheduleFinish = (ms: number) => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(finishListen, ms);
    };

    extendListenRef.current = () => {
      if (isCancelled || manualExtendCount >= maxManualExtends) return;
      manualExtendCount += 1;
      remaining += 5;
      const left = maxManualExtends - manualExtendCount;
      setListenExtendsLeft(left);
      setListenExtendUsed(left <= 0);
      setTimeLeft(remaining);
      scheduleFinish(remaining * 1000);
      if (left === 1) {
        setStageTipToast('還可以再按 E 加時一次');
        window.setTimeout(() => setStageTipToast(null), 2200);
      }
    };

    scheduleFinish(seconds * 1000);

    countdownInterval = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setTimeLeft(remaining);
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
        setStageTipToast('提前聽對 · 好');
        window.setTimeout(() => setStageTipToast(null), 1200);
        evaluateResult(true, cleanTranscript);
        return;
      }

      // Early fail only for short items — long phrases need the full listen window
      if (cleanTranscript.length === target.hanzi.length && target.hanzi.length <= 4) {
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
      extendListenRef.current = null;
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
    setPausedByHide(false);
    void requestWakeLock();
    setPhase(autoPreRead ? 'system_speaking' : 'user_speaking');
    setErrorData(null);
    currentMistakesRef.current = 0;
    setRoundMistakes(0);
    setLiveTranscript('');

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      setMicStream(mediaStreamRef.current);
    } catch (err) {
      console.warn('麥克風權限未取得：', err);
      setMicStream(null);
    }
  };

  const handleSkipWord = useCallback(() => {
    if (!currentWordRef.current) return;
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    setSessionAttempts((n) => {
      const next = n + 1;
      sessionAttemptsRef.current = next;
      return next;
    });
    setComboStreak(0);
    comboStreakRef.current = 0;
    const newHistory = recordHistory(currentWordRef.current, false, '手動跳過', '---');
    goToIndex(globalIndexRef.current + 1, newHistory);
  }, [clearEvalTimeouts, goToIndex]);

  const handlePrevWord = useCallback(() => {
    if (globalIndexRef.current <= 0) return;
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    setErrorData(null);
    setLiveTranscript('');
    goToIndex(globalIndexRef.current - 1);
  }, [clearEvalTimeouts, goToIndex]);

  useEffect(() => {
    if (screen !== 'practice') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (showCustomInput || showDictionary || showHistory || showSpeedPanel) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsHelp((v) => !v);
        return;
      }
      if (e.key === 'Escape' && showShortcutsHelp) {
        e.preventDefault();
        setShowShortcutsHelp(false);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        replayCorrectPronunciation();
      } else if (e.key === 'p' || e.key === 'P') {
        if (!(isBlindMode || lessonForceBlind)) return;
        e.preventDefault();
        setPeekReveal(true);
        setStageTipToast('偷看 1.6 秒 · 盡量靠耳朵');
        window.setTimeout(() => setPeekReveal(false), 1600);
        window.setTimeout(() => setStageTipToast(null), 1800);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSkipWord();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handlePrevWord();
      } else if (e.key === 'e' || e.key === 'E') {
        if (phase !== 'user_speaking' || !isPlaying) return;
        e.preventDefault();
        extendListenRef.current?.();
      } else if (e.key === 'Enter') {
        if (phase !== 'preparing' || !isPlaying) return;
        e.preventDefault();
        skipPrepareRef.current?.();
      } else if (e.key === '[' || e.key === '{') {
        e.preventDefault();
        setTtsSpeed((prev) => {
          const next = Math.max(0.5, Math.round((prev - 0.05) * 100) / 100);
          saveSettings({ ttsSpeed: next });
          setSpeedToast(`語速 ${next.toFixed(2)}x`);
          window.setTimeout(() => setSpeedToast(null), 900);
          return next;
        });
      } else if (e.key === ']' || e.key === '}') {
        e.preventDefault();
        setTtsSpeed((prev) => {
          const next = Math.min(1.2, Math.round((prev + 0.05) * 100) / 100);
          saveSettings({ ttsSpeed: next });
          setSpeedToast(`語速 ${next.toFixed(2)}x`);
          window.setTimeout(() => setSpeedToast(null), 900);
          return next;
        });
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        void togglePlayPause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, showCustomInput, showDictionary, showHistory, showSpeedPanel, showShortcutsHelp, replayCorrectPronunciation, togglePlayPause, handleSkipWord, handlePrevWord, isBlindMode, lessonForceBlind, phase, isPlaying]);

  const handleAddCustomText = () => {
    if (!customText.trim()) return;
    const sentences = splitCustomText(customText);
    const newWords = sentences.map(textToDictEntry);
    if (!newWords.length) return;
    setShowCustomInput(false);
    setCustomText('');
    beginPractice(newWords, {
      mode: 'custom',
      title: '自訂練習',
      subtitle: '你貼上嘅句子／詞語',
    });
  };

  const exitCustomMode = () => {
    backToHome();
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
    const words = unique.map(textToDictEntry);
    const earFirst = wordsSuggestEarFirst(words);
    beginPractice(words, {
      mode: 'srs',
      title: '錯題重練',
      subtitle: '來自最近練習紀錄',
      earFirst,
    });
    if (earFirst) {
      setLessonForceBlind(true);
      setAutoPreRead(true);
      saveSettings({ autoPreRead: true });
    }
    setShowHistory(false);
  };

  const handleStartWeakDrill = () => {
    const drill = buildWeaknessDrill(initialStats, finalStats, toneStats);
    if (!drill) return;
    const earFirst = wordsSuggestEarFirst(drill.words);
    setListenSeconds(12);
    beginPractice(drill.words, {
      mode: 'srs',
      title: drill.title,
      subtitle: drill.subtitle,
      earFirst,
    });
    if (earFirst) {
      setLessonForceBlind(true);
      setAutoPreRead(true);
      saveSettings({ autoPreRead: true });
    }
    setShowHistory(false);
  };

  const canStartWeakDrill = useMemo(
    () => Boolean(buildWeaknessDrill(initialStats, finalStats, toneStats)),
    [initialStats, finalStats, toneStats],
  );

  const handleStartMixedReview = useCallback(() => {
    const drill = buildMixedReview(pathProgress.completedLessons);
    if (!drill) return;
    setListenSeconds(12);
    beginPractice(drill.words, {
      mode: 'srs',
      title: drill.title,
      subtitle: drill.subtitle,
      earFirst: true,
    });
    setLessonForceBlind(true);
    setAutoPreRead(true);
    saveSettings({ autoPreRead: true });
  }, [beginPractice, pathProgress.completedLessons]);

  const canStartMixedReview = useMemo(
    () => Boolean(buildMixedReview(pathProgress.completedLessons)),
    [pathProgress.completedLessons],
  );

  const handleStartFluencyWarmup = useCallback(() => {
    const drill = buildFluencyWarmup(pathProgress.completedLessons);
    if (!drill) return;
    setListenSeconds(14);
    beginPractice(drill.words, {
      mode: 'srs',
      title: drill.title,
      subtitle: drill.subtitle,
      earFirst: true,
    });
    setLessonForceBlind(true);
    setAutoPreRead(true);
    saveSettings({ autoPreRead: true });
    setStageTipToast('流利熱身：耳口模式——聽示範後盲跟讀，練場景反應');
    window.setTimeout(() => setStageTipToast(null), 3200);
  }, [beginPractice, pathProgress.completedLessons]);

  const canStartFluencyWarmup = useMemo(
    () => Boolean(buildFluencyWarmup(pathProgress.completedLessons)),
    [pathProgress.completedLessons],
  );

  const startPackDrill = useCallback((
    drill: { words: string[]; title: string; subtitle: string },
    toast: string,
  ) => {
    if (!drill.words.length) return;
    setListenSeconds(14);
    beginPractice(drill.words, {
      mode: 'srs',
      title: drill.title,
      subtitle: drill.subtitle,
      earFirst: true,
    });
    setLessonForceBlind(true);
    setAutoPreRead(true);
    saveSettings({ autoPreRead: true });
    setStageTipToast(toast);
    window.setTimeout(() => setStageTipToast(null), 3400);
  }, [beginPractice]);

  const startScenePack = useCallback((kind: ScenePackKind) => {
    startPackDrill(drillForScenePack(kind, 12), SCENE_PACK_TOASTS[kind]);
  }, [startPackDrill]);

  const handleStartSurvivalDrill = useCallback(() => startScenePack('survival'), [startScenePack]);
  const handleStartSocialDrill = useCallback(() => startScenePack('social'), [startScenePack]);
  const handleStartDiningDrill = useCallback(() => startScenePack('dining'), [startScenePack]);
  const handleStartTravelDrill = useCallback(() => startScenePack('travel'), [startScenePack]);
  const handleStartWorkDrill = useCallback(() => startScenePack('work'), [startScenePack]);

  const handleStartDailySceneDrill = useCallback(() => {
    const drill = buildDailySceneDrill(12);
    startPackDrill(drill, `今日場景「${drill.shortLabel}」：耳口盲跟讀，練場面反射`);
  }, [startPackDrill]);

  const handlePracticeWord = (word: string) => {
    if (!word.trim()) return;
    beginPractice([textToDictEntry(word.trim())], {
      mode: 'custom',
      title: '單詞重練',
      subtitle: word.trim(),
    });
    setShowHistory(false);
  };

  const handleReset = () => {
    if (!window.confirm('確定重置進度、歷史、路徑關卡同診斷統計？')) return;
    resetLearningData();
    setDictionary(DEFAULT_DICTIONARY);
    setIsCustomMode(false);
    setGlobalIndex(0);
    setHistory([]);
    setToneStats({ 1: 0, 2: 0, 3: 0, 4: 0 });
    setInitialStats({});
    setFinalStats({});
    setPathProgress(loadPathProgress());
    setSrs(loadSrs());
    setActivePractice(null);
    setShowHistory(false);
    setScreen('home');
    setPhase('idle');
    setIsPlaying(false);
    window.speechSynthesis.cancel();
    stopRecognition();
    clearEvalTimeouts();
    pulseSaved();
  };

  useEffect(() => {
    if (!showSpeedPanel) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-speed-panel]')) return;
      setShowSpeedPanel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSpeedPanel(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showSpeedPanel]);

  const answered = history.length;
  const correctCount = history.filter((h) => h.isCorrect).length;
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : null;

  const shouldHidePinyin = (isBlindMode || lessonForceBlind) && !peekReveal && (phase === 'user_speaking' || phase === 'idle');
  const shouldHideHanzi = (isBlindMode || lessonForceBlind) && !peekReveal && phase === 'user_speaking';
  const lesson =
    activePractice?.mode === 'lesson' && activePractice.lessonId
      ? getLesson(activePractice.lessonId)
      : undefined;
  const lessonHint = lesson ? parseLessonHint(lesson, globalIndex) : undefined;
  const practiceTip =
    lesson?.id === 'fluency-checkpoint'
      ? lessonPracticeTip(lesson)
      : lesson?.kind === 'dictation'
      ? '聽寫模式：先聽兩次示範，跟讀時漢字會隱藏——靠聽力同記憶講出嚟。'
      : lessonForceBlind && (activePractice?.earFirst || lesson?.stageId === 'phrases' || lesson?.stageId === 'conversation')
        ? '耳口模式：跟讀時隱藏漢字，逼自己聽準再講，減少用粵語節奏讀字。示範會播兩次。'
        : lessonPracticeTip(lesson);

  if (screen === 'home') {
    return (
      <>
        <PathHome
          pathProgress={pathProgress}
          srs={srs}
          resumeLesson={resumeLessonId ? getLesson(resumeLessonId) ?? null : null}
          resumeIndex={resumeIndex}
          onStartLesson={(l) => startLesson(l, 0)}
          onResumeLesson={resumeInterruptedLesson}
          onStartSrs={startSrsReview}
          onStartFree={startFreeDictionary}
          onOpenDiagnosis={() => setShowHistory(true)}
          onStartWeakDrill={handleStartWeakDrill}
          canStartWeakDrill={canStartWeakDrill}
          onSetDailyGoal={(goal) => {
            const next = setDailyGoal(pathProgress, goal);
            setPathProgress(next);
            savePathProgress(next);
          }}
          onStartLowStar={(l) => startLesson(l, 0)}
          onStartMixedReview={handleStartMixedReview}
          canStartMixedReview={canStartMixedReview}
          onStartFluencyWarmup={handleStartFluencyWarmup}
          canStartFluencyWarmup={canStartFluencyWarmup}
          onStartSurvivalDrill={handleStartSurvivalDrill}
          onStartSocialDrill={handleStartSocialDrill}
          onStartDiningDrill={handleStartDiningDrill}
          onStartTravelDrill={handleStartTravelDrill}
          onStartWorkDrill={handleStartWorkDrill}
          onStartDailySceneDrill={handleStartDailySceneDrill}
          onExportBackup={() => {
            const blob = new Blob([JSON.stringify(exportLearningBackup(), null, 2)], {
              type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pinyin-master-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onImportBackup={(file) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const parsed = JSON.parse(String(reader.result));
                const result = importLearningBackup(parsed);
                if (result.ok === false) {
                  window.alert(result.error);
                  return;
                }
                setPathProgress(loadPathProgress());
                setSrs(loadSrs());
                setToneStats(loadToneStats());
                setInitialStats(loadInitialStats());
                setFinalStats(loadFinalStats());
                const prog = loadDefaultProgress();
                setHistory(prog.history);
                window.alert('備份已匯入');
              } catch {
                window.alert('無法讀取備份檔');
              }
            };
            reader.readAsText(file);
          }}
          onShareProgress={async () => {
            const done = pathProgress.completedLessons.length;
            const text = `我喺 Pinyin Master 練普通話：連續 ${pathProgress.streak} 日、完成 ${done} 課、累計正確 ${pathProgress.lifetimeCorrect} 次。零到流利開波！`;
            try {
              if (navigator.share) {
                await navigator.share({ title: 'Pinyin Master', text });
                return;
              }
            } catch {
              /* user cancelled or share failed — fall through */
            }
            try {
              await navigator.clipboard.writeText(text);
              window.alert('進度文案已複製');
            } catch {
              window.alert(text);
            }
          }}
        />
        <WelcomeModal
          open={showWelcome && pathProgress.completedLessons.length === 0}
          onDismiss={() => {
            saveWelcomeSeen();
            setShowWelcome(false);
          }}
          onStart={() => {
            saveWelcomeSeen();
            setShowWelcome(false);
            const first = getLesson('tone-a');
            if (first) startLesson(first, 0);
          }}
        />
        {showHistory && (
          <div className="fixed inset-0 z-[60]">
            <DiagnosisModal
              history={history}
              toneStats={toneStats}
              initialStats={initialStats}
              finalStats={finalStats}
              onClose={() => setShowHistory(false)}
              onReset={handleReset}
              onRetryMistakes={handleRetryMistakes}
              onPracticeWord={handlePracticeWord}
              onStartWeakDrill={handleStartWeakDrill}
              canStartWeakDrill={canStartWeakDrill}
            />
          </div>
        )}
      </>
    );
  }

  if (!currentWord) {
    return (
      <div className="h-[100dvh] w-full bg-slate-50 flex items-center justify-center text-slate-500 font-bold text-xl">
        載入中...
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col font-sans text-slate-800 overflow-hidden relative">
      {dailyGoalToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-black shadow-xl animate-fade-in text-center max-w-[90%]">
          今日目標達成！連續 {pathProgress.streak} 日 · 繼續保持開口
        </div>
      )}

      {comboBreakToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-2 rounded-2xl bg-amber-600 text-white text-xs font-black shadow-xl animate-fade-in text-center max-w-[90%]">
          連擊中斷 · 放慢跟讀再嚟
        </div>
      )}

      {stageTipToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-2.5 rounded-2xl bg-indigo-700 text-white text-xs font-bold shadow-xl animate-fade-in text-center max-w-[92%] leading-snug">
          {stageTipToast}
        </div>
      )}

      {speedToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-3 py-1.5 rounded-full bg-violet-700 text-white text-xs font-black shadow-xl animate-fade-in">
          {speedToast}
        </div>
      )}

      {showShortcutsHelp && (
        <div
          className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center px-4 animate-fade-in"
          onClick={() => setShowShortcutsHelp(false)}
          role="dialog"
          aria-label="練習快捷鍵"
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 p-5 text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-lg">練習快捷鍵</h3>
              <button
                type="button"
                className="text-xs font-bold text-slate-400 hover:text-white"
                onClick={() => setShowShortcutsHelp(false)}
              >
                關閉 Esc
              </button>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-200">
              <li><kbd className="font-mono text-amber-200">Space</kbd> 播放／暫停</li>
              <li><kbd className="font-mono text-amber-200">R</kbd> 重播示範</li>
              <li><kbd className="font-mono text-amber-200">S</kbd> 跳過 · <kbd className="font-mono text-amber-200">B</kbd> 上一題</li>
              <li><kbd className="font-mono text-amber-200">E</kbd> 聽寫多 +5 秒（長句／對話可兩次）</li>
              <li><kbd className="font-mono text-amber-200">P</kbd> 盲跟讀偷看</li>
              <li><kbd className="font-mono text-amber-200">Enter</kbd> 跳過準備拍</li>
              <li><kbd className="font-mono text-amber-200">[ ]</kbd> 調語速</li>
              <li><kbd className="font-mono text-amber-200">?</kbd> 開關本說明</li>
            </ul>
          </div>
        </div>
      )}

      {pausedByHide && !isPlaying && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-3 rounded-2xl bg-slate-800 text-white text-sm font-bold shadow-xl animate-fade-in text-center max-w-[90%]">
          已暫停（離開畫面）· 按播放繼續
          <button
            type="button"
            className="ml-2 underline font-black"
            onClick={() => setPausedByHide(false)}
          >
            關閉
          </button>
        </div>
      )}

      {lessonCompleteBanner && (
        <div className={`absolute inset-0 z-50 text-white flex flex-col items-center justify-center gap-3 animate-fade-in px-6 text-center ${
          lessonCompleteBanner.passed ? 'bg-emerald-600/95' : 'bg-amber-700/95'
        }`}>
          <CheckCircle2 className="w-16 h-16" />
          <div className="text-2xl font-black">
            {lessonCompleteBanner.passed
              ? lessonCompleteBanner.accuracy >= 100
                ? '滿分過關！'
                : lessonCompleteBanner.accuracy >= 95
                  ? '近完美過關！'
                  : '過關！'
              : '再練一次會更好'}
          </div>
          <div className="text-lg font-bold opacity-90">{lessonCompleteBanner.title}</div>
          {(() => {
            const a = lessonCompleteBanner.accuracy;
            const stars = a >= 90 ? 3 : a >= 75 ? 2 : a >= 60 ? 1 : 0;
            return (
              <div className="text-2xl tracking-widest text-amber-200" aria-label={`${stars} 星`}>
                {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
              </div>
            );
          })()}
          <div className="text-sm font-bold bg-white/15 px-4 py-2 rounded-full">
            本課正確率 {lessonCompleteBanner.accuracy}%（{lessonCompleteBanner.correct}/{lessonCompleteBanner.total}）
          </div>
          {lessonCompleteBanner.passed && lessonCompleteBanner.accuracy >= 100 && (
            <p className="text-xs font-bold text-amber-100/95">全部跟對 · 超穩</p>
          )}
          {!lessonCompleteBanner.passed && (
            <p className="text-sm opacity-90 max-w-sm">
              {lessonCompleteBanner.failReason === 'coverage'
                ? `題目做得太少（${lessonCompleteBanner.total}/${lessonCompleteBanner.minAttempts ?? '—'}），跳過都會計入。請多跟讀再過關。`
                : `正確率需要 ≥ ${passAccuracyForLesson(lessonCompleteBanner.lessonId)}%。建議慢速再聽、對住聲調曲線跟讀。`}
            </p>
          )}
          {lessonCompleteBanner.passed ? (
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {(() => {
                const id = lessonCompleteBanner.lessonId;
                const completed = id
                  ? [...new Set([...pathProgress.completedLessons, id])]
                  : pathProgress.completedLessons;
                const next = recommendNextLesson(completed, id);
                const isFollowUpDictation =
                  Boolean(id) && next.kind === 'dictation' && next.unlockAfter?.includes(id!);
                const isFollowUpScene =
                  Boolean(id) &&
                  !isFollowUpDictation &&
                  (next.stageId === 'conversation' || next.stageId === 'phrases') &&
                  next.unlockAfter?.includes(id!);
                return (
                  <>
                    {next.id !== id ? (
                  <button
                    type="button"
                    className="px-5 py-3 rounded-2xl bg-white text-emerald-800 font-black"
                    onClick={() => {
                      setLessonCompleteBanner(null);
                      startLesson(next, 0);
                    }}
                  >
                    {isFollowUpDictation
                      ? `接著聽寫：${next.title}`
                      : isFollowUpScene
                        ? `接著場景：${next.title}`
                        : `下一課：${next.title}`}
                  </button>
                    ) : null}
                    {id && scenePackForLessonId(id) && (
                      <button
                        type="button"
                        className="px-5 py-3 rounded-2xl bg-emerald-950/30 border border-white/40 font-black"
                        onClick={() => {
                          const pack = scenePackForLessonId(id);
                          setLessonCompleteBanner(null);
                          if (pack) startScenePack(pack);
                        }}
                      >
                        盲跟讀：{SCENE_PACK_LABELS[scenePackForLessonId(id)!]}包
                      </button>
                    )}
                  </>
                );
              })()}
              <button
                type="button"
                className="px-5 py-3 rounded-2xl bg-white/15 border border-white/30 font-bold"
                onClick={() => {
                  setLessonCompleteBanner(null);
                  setScreen('home');
                  setActivePractice(null);
                }}
              >
                返回路徑
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {(lessonCompleteBanner.mistakeWords?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="px-5 py-3 rounded-2xl bg-white text-amber-900 font-black"
                  onClick={() => {
                    const words = lessonCompleteBanner.mistakeWords ?? [];
                    const lessonId = lessonCompleteBanner.lessonId;
                    const lesson = lessonId ? getLesson(lessonId) : undefined;
                    const earFirst =
                      Boolean(lesson && shouldForcePreRead(lesson)) || wordsSuggestEarFirst(words);
                    setLessonCompleteBanner(null);
                    setListenSeconds(14);
                    beginPractice(words, {
                      mode: 'srs',
                      lessonId,
                      title: '本課錯題',
                      subtitle: '先把失手的音練準，再重開全課',
                      earFirst,
                    });
                    if (earFirst) {
                      setLessonForceBlind(true);
                      setAutoPreRead(true);
                      saveSettings({ autoPreRead: true });
                    }
                  }}
                >
                  只練錯題（{lessonCompleteBanner.mistakeWords!.length}）
                </button>
              )}
              <button
                type="button"
                className="px-5 py-3 rounded-2xl bg-white/90 text-amber-800 font-black"
                onClick={() => {
                  const id = lessonCompleteBanner.lessonId;
                  setLessonCompleteBanner(null);
                  if (id) {
                    const lesson = getLesson(id);
                    if (lesson) startLesson(lesson, 0);
                  }
                }}
              >
                整課重練
              </button>
              <button
                type="button"
                className="px-5 py-3 rounded-2xl bg-white/15 border border-white/30 font-bold"
                onClick={() => {
                  setLessonCompleteBanner(null);
                  setScreen('home');
                  setActivePractice(null);
                }}
              >
                返回路徑
              </button>
            </div>
          )}
        </div>
      )}

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
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={backToHome}
            className="p-2.5 rounded-xl border shadow-sm bg-white text-slate-600 hover:bg-slate-100"
            title="返回學習路徑"
          >
            <Home className="w-4 h-4" />
          </button>
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
              {activePractice ? ` · ${activePractice.title}` : isCustomMode ? ' 自訂' : ' 詞'}
              </span>
            {sessionAttempts > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                Math.round((sessionCorrect / sessionAttempts) * 100) >= passAccuracyForLesson(activePractice?.lessonId)
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-amber-700 bg-amber-50'
              }`}>
                {Math.round((sessionCorrect / sessionAttempts) * 100)}%
                <span className="opacity-70"> /{passAccuracyForLesson(activePractice?.lessonId)}</span>
              </span>
            )}
            {comboStreak >= 3 && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-black animate-pulse">
                連對 {comboStreak}{comboStreak >= 5 ? ' · 語速↑' : ''}
              </span>
            )}
            {accuracy != null && (
              <span className="hidden sm:inline text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                {accuracy}%
              </span>
            )}
            {offline && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold shrink-0">
                <WifiOff className="w-3 h-3" /> 離線
              </span>
            )}
            {isSavedPulse && <Save className="w-3 h-3 text-emerald-500 animate-pulse ml-0.5 shrink-0" />}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCustomMode && (
            <button
              type="button"
              onClick={exitCustomMode}
              className="px-2.5 py-2 rounded-xl border shadow-sm bg-white text-xs font-bold text-slate-500 hover:bg-slate-100"
              title="返回路徑"
            >
              路徑
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

          <div className="relative" data-speed-panel>
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
              <div data-speed-panel className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-30">
                <div className="text-[10px] font-bold text-slate-400 mb-2 tracking-wider">TTS 語速</div>
                <div className="flex gap-1 mb-2">
                  {[
                    { label: '慢', value: 0.7 },
                    { label: '正常', value: 0.85 },
                    { label: '快', value: 1.0 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setTtsSpeed(preset.value);
                        saveSettings({ ttsSpeed: preset.value });
                      }}
                      className={`flex-1 text-[10px] font-black py-1.5 rounded-lg border transition ${
                        Math.abs(ttsSpeed - preset.value) < 0.01
                          ? 'bg-violet-100 border-violet-300 text-violet-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
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

      <div className="flex-none px-4 md:px-6 max-w-5xl mx-auto w-full -mt-1 mb-1">
        <div className="h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${dictionary.length ? Math.min(100, ((globalIndex + 1) / dictionary.length) * 100) : 0}%` }}
          />
        </div>
        {dictionary.length > 0 && (() => {
          const isLesson = activePractice?.mode === 'lesson';
          const minAttempts = Math.max(
            1,
            Math.ceil(dictionary.length * passCoverageRatioForLesson(activePractice?.lessonId)),
          );
          const needMore = Math.max(0, minAttempts - sessionAttempts);
          const passAcc = passAccuracyForLesson(activePractice?.lessonId);
          const liveAcc =
            sessionAttempts > 0 ? Math.round((sessionCorrect / sessionAttempts) * 100) : null;
          const leftItems = Math.max(0, dictionary.length - globalIndex);
          const secsPer = activePractice?.earFirst || (lesson && shouldForcePreRead(lesson)) ? 32 : 25;
          const etaMin = Math.max(1, Math.ceil((leftItems * secsPer) / 60));
          return (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-bold text-slate-400 mt-1 tracking-wide">
              <span>
                {globalIndex + 1}/{dictionary.length} · 約剩 {etaMin} 分鐘
              </span>
              {isLesson && needMore > 0 && sessionAttempts > 0 && (
                <span>過關至少 {minAttempts} 題 · 還差 {needMore} 次</span>
              )}
              {liveAcc != null && (
                <span className={isLesson && liveAcc >= passAcc ? 'text-emerald-600' : liveAcc >= 60 ? 'text-emerald-600' : 'text-amber-600'}>
                  正確率 {liveAcc}%{isLesson ? `（過關 ≥${passAcc}%）` : ''}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {practiceTip && (
        <div className="flex-none px-4 md:px-6 max-w-5xl mx-auto w-full -mt-1 mb-2">
          <div className="text-[11px] md:text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
            {practiceTip}
          </div>
        </div>
      )}

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
            {lessonHint && (
              <div className={`mb-3 text-xs md:text-sm font-bold px-3 py-1.5 rounded-full border ${
                shouldHidePinyin
                  ? 'text-amber-800 bg-amber-50 border-amber-100'
                  : 'text-indigo-500 bg-indigo-50 border-indigo-100'
              }`}>
                {lessonHint}
              </div>
            )}
            {!shouldHidePinyin && (
              <ToneContour hanzi={currentWord.hanzi} compact={currentWord.hanzi.length > 4} />
            )}
            {activePractice?.subtitle && (
              <div className="mb-2 text-[10px] md:text-xs font-bold text-slate-400 tracking-wider text-center px-4">
                {activePractice.subtitle}
              </div>
            )}
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
            {!shouldHideHanzi && (
              <button
                type="button"
                onClick={() => replayCorrectPronunciation()}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full hover:bg-indigo-100 active:scale-95 transition"
              >
                <Volume2 className="w-3.5 h-3.5" /> 再聽一次正確發音
              </button>
            )}
            {shouldHideHanzi && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-slate-300 font-bold tracking-widest text-sm">盲讀中… 請跟讀</span>
                <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                  約 {Math.max(1, toPinyinArray(currentWord.hanzi, 'none').length)} 個音節
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPeekReveal(true);
                    setStageTipToast('偷看 1.6 秒 · 盡量靠耳朵');
                    window.setTimeout(() => setPeekReveal(false), 1600);
                    window.setTimeout(() => setStageTipToast(null), 1800);
                  }}
                  className="text-[11px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full hover:bg-orange-100 active:scale-95 transition"
                >
                  偷看一下（1.6 秒）
                </button>
              </div>
            )}
            {pairContrastHint && phase === 'system_speaking' && (
              <div className="mt-3 text-sm font-black text-sky-600 bg-sky-50 border border-sky-100 px-3 py-1.5 rounded-full">
                對比聽：{pairContrastHint}
              </div>
            )}
          </div>

          <div className="w-full md:w-px h-px md:h-full bg-slate-100 flex-none" />

          <div className="w-full md:w-80 flex-[2] md:flex-none flex flex-col bg-slate-50/50 p-4 sm:p-6 md:p-8 justify-center min-h-0">
            <div className="flex items-center justify-between mb-2 md:mb-6 flex-none">
              <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                <Mic className="w-3.5 h-3.5 md:w-4 md:h-4" /> 語音狀態
              </div>
              {roundMistakes > 0 && phase === 'user_speaking' && (
                <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full animate-pulse ${
                  roundMistakes >= 2 ? 'text-rose-700 bg-rose-200' : 'text-red-500 bg-red-100'
                }`}>
                  {roundMistakes >= 2 ? '最後一次機會' : `剩餘 ${Math.max(0, 3 - roundMistakes)} 次機會`}
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
                  {(() => {
                    const heard = onlyHanzi(liveTranscript);
                    const targetLen = currentWord.hanzi.length;
                    const ratio = targetLen > 0 ? heard.length / targetLen : 0;
                    const onTrack =
                      heard.length > 0 &&
                      (isPronunciationMatch(heard, currentWord.hanzi, currentWord.sim) ||
                        ratio >= 0.55);
                    return (
                      <>
                  <div className="relative flex items-center justify-center mb-2 md:mb-4">
                    <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${onTrack ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                    <div className={`p-3 md:p-4 rounded-full shadow-sm ${onTrack ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-500'}`}>
                      <Mic className="w-5 h-5 md:w-6 md:h-6 z-10" />
                    </div>
                  </div>
                  <div className={`text-base md:text-2xl font-bold tracking-widest text-center min-h-[2.5rem] md:min-h-[3rem] flex flex-col items-center justify-center max-w-[90%] overflow-hidden gap-1 ${onTrack ? 'text-emerald-700' : 'text-slate-600'}`}>
                    <span className="truncate">{liveTranscript ? `「${heard || liveTranscript}」` : '請朗讀...'}</span>
                    {heard && (
                      <span className={`text-xs md:text-sm font-mono font-bold tracking-wide truncate max-w-full ${onTrack ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {toPinyinString(heard, 'symbol')}
                      </span>
                    )}
                    {targetLen >= 3 && (
                      <span className={`text-[10px] md:text-[11px] font-black px-2 py-0.5 rounded-full border ${
                        onTrack
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-slate-500 bg-white/80 border-slate-200'
                      }`}>
                        已聽到 {Math.min(heard.length, targetLen)}/{targetLen} 字
                        {onTrack && ratio < 1 ? ' · 繼續' : onTrack ? ' · 好' : ''}
                      </span>
                    )}
                  </div>
                      </>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => extendListenRef.current?.()}
                    disabled={listenExtendUsed}
                    title={
                      listenExtendUsed
                        ? '本輪加時已用完'
                        : (currentWord?.hanzi.length ?? 0) >= 8 || lesson?.stageId === 'conversation'
                          ? '加時 +5 秒（E，長句可兩次）'
                          : '加時 +5 秒（E）'
                    }
                    className={`text-[10px] md:text-[11px] mt-1 md:mt-2 font-bold tracking-widest flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-sm transition-colors ${
                      timeLeft <= 3
                        ? 'text-rose-600 bg-rose-100 animate-pulse'
                        : 'text-blue-500 bg-blue-100'
                    } ${listenExtendUsed ? 'opacity-60 cursor-default' : 'hover:bg-blue-200/80 active:scale-95'}`}
                  >
                    <Timer className="w-3 h-3 md:w-3.5 md:h-3.5" /> 剩餘 {timeLeft} 秒
                    {!listenExtendUsed && listenExtendsLeft > 1 && timeLeft > 5 && (
                      <span className="opacity-70">· E×{listenExtendsLeft}</span>
                    )}
                    {!listenExtendUsed && timeLeft <= 5 && (
                      <span className="opacity-80">
                        · E 加時{listenExtendsLeft > 1 ? `×${listenExtendsLeft}` : ''}
                      </span>
                    )}
                    {listenExtendUsed && <span className="opacity-60">· 加時用完</span>}
                  </button>
                  <MicLevelMeter stream={micStream} active={isPlaying && phase === 'user_speaking'} />
                </div>
              )}

              {phase === 'system_speaking' && (
                <div className="flex flex-col items-center gap-2 md:gap-3 text-blue-500 font-bold animate-fade-in">
                  <Volume2 className="w-8 h-8 md:w-12 md:h-12 animate-pulse mb-1" />
                  <span className="tracking-widest text-center text-xs md:text-base">
                    {currentMistakesRef.current > 0
                      ? '老師放慢正音中...'
                      : demoPass === 1 && (Boolean(activePractice?.earFirst) || Boolean(lesson && shouldForcePreRead(lesson)))
                        ? '示範 1／2 · 先只聽'
                        : demoPass === 2 && (Boolean(activePractice?.earFirst) || Boolean(lesson && shouldForcePreRead(lesson)))
                          ? '示範 2／2 · 準備跟讀'
                          : '老師示範中...'}
                  </span>
                </div>
              )}

              {phase === 'preparing' && (
                <button
                  type="button"
                  onClick={() => skipPrepareRef.current?.()}
                  className="flex flex-col items-center gap-2 md:gap-3 text-amber-600 font-bold animate-fade-in active:scale-95"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-4 border-amber-300 border-t-amber-600 animate-spin" />
                  <span className="tracking-widest text-center text-xs md:text-base">準備跟讀…</span>
                  <span className="text-[10px] md:text-xs font-bold text-amber-700/70 tracking-wide">腦內覆述 · 點擊或 Enter 開始</span>
                  {(currentWord?.hanzi.length ?? 0) >= 8 && (
                    <span className="text-[10px] font-bold text-blue-500/80 tracking-wide">長句可 E 加時兩次</span>
                  )}
                </button>
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
                <div className="text-base md:text-2xl font-black tracking-widest">
                  {comboStreakRef.current >= 5 ? '連擊！' : comboStreakRef.current >= 3 ? '好嘢！' : 'PERFECT!'}
                </div>
                {comboStreakRef.current >= 3 && (
                  <div className="text-[11px] font-bold text-emerald-600/80">連續答對 {comboStreakRef.current} 題</div>
                )}
              </div>
            )}

            {errorData && (
              <div className="flex flex-col w-full gap-2 md:gap-3 animate-fade-in-up md:h-full justify-center items-center">
                <div className="flex flex-col md:flex-row w-full gap-2 md:gap-4 justify-center items-center">
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

                {errorData.issues && (
                  <div className="w-full flex flex-col items-center gap-1.5">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {errorData.issues.tone && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200">聲調</span>
                      )}
                      {errorData.issues.initial && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">聲母</span>
                      )}
                      {errorData.issues.final && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">韻母</span>
                      )}
                    </div>
                    {errorData.issues.tips.slice(0, 3).map((tip) => (
                      <p
                        key={tip}
                        className="text-[11px] md:text-xs font-bold text-slate-500 text-center max-w-xl leading-relaxed px-2"
                      >
                        {tip}
                      </p>
                    ))}
                    {errorData.issues.tips.length > 3 && (
                      <p className="text-[10px] font-bold text-slate-400">
                        仲有 {errorData.issues.tips.length - 3} 條提示 · 聽返正確發音再試
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => replayCorrectPronunciation({ extraSlow: true })}
                      className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full hover:bg-emerald-100 active:scale-95 transition"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> 聽返正確發音再試
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="flex-none w-full pb-safe flex flex-col items-center justify-center gap-2 py-4 z-10 bg-gradient-to-t from-slate-50 to-transparent">
        <div className="flex md:hidden items-center justify-center gap-3 text-[10px] font-bold text-slate-400 tracking-wider">
          {(isBlindMode || lessonForceBlind) && <span>P 偷看</span>}
          <span>{phase === 'user_speaking' && listenExtendsLeft > 1 ? 'E 加時×2' : 'E 加時'}</span>
        </div>
        <div className="hidden md:flex text-[10px] font-bold text-slate-400 gap-3 tracking-wider">
          <span>空白鍵 開始／暫停</span>
          <span>R 再聽</span>
          <span>B 上一題</span>
          <span>S 跳過</span>
          <span>{phase === 'user_speaking' && listenExtendsLeft > 1 ? 'E 加時×2' : 'E 加時'}</span>
          <span>[ ] 語速</span>
          <span>Enter 跳過準備</span>
          {(isBlindMode || lessonForceBlind) && <span>P 偷看</span>}
          <button
            type="button"
            className="underline decoration-dotted underline-offset-2 hover:text-slate-600"
            onClick={() => setShowShortcutsHelp(true)}
          >
            ? 說明
          </button>
        </div>
        <div className="flex items-center justify-center gap-6 md:gap-8">
        <button
          type="button"
          onClick={handlePrevWord}
          disabled={globalIndex <= 0}
          className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white border-[4px] border-slate-100 shadow-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
          title="上一題（B）"
        >
          <SkipBack className="w-5 h-5 md:w-7 md:h-7" />
        </button>
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
          title="跳過（會計入本課正確率）"
        >
          <SkipForward className="w-5 h-5 md:w-7 md:h-7" />
        </button>
        </div>
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
          onPracticeWord={handlePracticeWord}
          onStartWeakDrill={handleStartWeakDrill}
          canStartWeakDrill={canStartWeakDrill}
        />
      )}
    </div>
  );
}
