import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
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
  Share2,
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
  displayTranscript,
  isGarbageTranscript,
  isNoSpeechResult,
  isPronunciationMatch,
  isSameSyllableWrongTone,
  isTonelessLatinNearMiss,
  mergeCountMaps,
  onlyHanzi,
  pickBestTranscriptCandidate,
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
  const [lastChanceToast, setLastChanceToast] = useState(false);
  const [comboShareToast, setComboShareToast] = useState<number | null>(null);
  const [jumpReadyToast, setJumpReadyToast] = useState<number | null>(null);
  const [stageTipToast, setStageTipToast] = useState<string | null>(null);
  const [speedToast, setSpeedToast] = useState<string | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [practiceTipDismissed, setPracticeTipDismissed] = useState(false);
  const [practiceTipExpanded, setPracticeTipExpanded] = useState(false);
  const [errorTipsExpanded, setErrorTipsExpanded] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [homeToast, setHomeToast] = useState<string | null>(null);
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const extendListenRef = useRef<(() => void) | null>(null);
  const skipPrepareRef = useRef<(() => void) | null>(null);
  const skipDemoRef = useRef<(() => void) | null>(null);
  const lastBlindTapRef = useRef(0);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const lastListenTapRef = useRef(0);
  const playHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playHoldTriggeredRef = useRef(false);
  const mobileChipBarRef = useRef<HTMLDivElement | null>(null);
  const replayHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayHoldTriggeredRef = useRef(false);
  const liveMatchCountRef = useRef(0);
  const skipHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipHoldTriggeredRef = useRef(false);
  const peekHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekHoldTriggeredRef = useRef(false);
  const peekHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extendHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extendHoldTriggeredRef = useRef(false);
  const correctCopyHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctCopyHoldTriggeredRef = useRef(false);
  const perfectHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const perfectHoldTriggeredRef = useRef(false);
  const copyWordHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyWordHoldTriggeredRef = useRef(false);
  const progressHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressHoldTriggeredRef = useRef(false);

  useEffect(() => {
    const onUpdate = () => setSwUpdateReady(true);
    window.addEventListener('pm-sw-update', onUpdate);
    return () => window.removeEventListener('pm-sw-update', onUpdate);
  }, []);

  useEffect(() => {
    const goOff = () => {
      setOffline(true);
      setStageTipToast('已離線 · 本地仍可練');
      window.setTimeout(() => setStageTipToast(null), 2400);
    };
    const goOn = () => {
      setOffline(false);
      setStageTipToast('已恢復連線 · 語音評分較穩');
      window.setTimeout(() => setStageTipToast(null), 2200);
      try {
        if (navigator.vibrate) navigator.vibrate(8);
      } catch {
        /* ignore */
      }
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
  const micPeakRef = useRef(0);
  const micLevelSamplesRef = useRef(0);
  const isCustomModeRef = useRef(isCustomMode);
  const dictionaryRef = useRef(dictionary);
  const phaseRef = useRef(phase);
  const activePracticeRef = useRef(activePractice);
  const srsRef = useRef(srs);
  const pathProgressRef = useRef(pathProgress);
  const listenSecondsRef = useRef(listenSeconds);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);
  const screenRef = useRef(screen);
  const skipConfirmOpenRef = useRef(false);
  const leaveConfirmOpenRef = useRef(false);
  const showDictionaryRef = useRef(false);
  const showHistoryRef = useRef(false);
  const showCustomInputRef = useRef(false);
  const showSpeedPanelRef = useRef(false);
  const showShortcutsHelpRef = useRef(false);
  const backToHomeRef = useRef<() => void>(() => undefined);
  const lessonCompleteBannerRef = useRef(lessonCompleteBanner);

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
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { skipConfirmOpenRef.current = skipConfirmOpen; }, [skipConfirmOpen]);
  useEffect(() => { leaveConfirmOpenRef.current = leaveConfirmOpen; }, [leaveConfirmOpen]);
  useEffect(() => { showDictionaryRef.current = showDictionary; }, [showDictionary]);
  useEffect(() => { showHistoryRef.current = showHistory; }, [showHistory]);
  useEffect(() => { showCustomInputRef.current = showCustomInput; }, [showCustomInput]);
  useEffect(() => { showSpeedPanelRef.current = showSpeedPanel; }, [showSpeedPanel]);
  useEffect(() => {
    if (isPlaying && jumpReadyToast != null) setJumpReadyToast(null);
  }, [isPlaying, jumpReadyToast]);
  useEffect(() => { showShortcutsHelpRef.current = showShortcutsHelp; }, [showShortcutsHelp]);
  useEffect(() => { lessonCompleteBannerRef.current = lessonCompleteBanner; }, [lessonCompleteBanner]);

  useEffect(() => {
    if (!errorData) return;
    try {
      if (navigator.vibrate) navigator.vibrate([18, 40, 18]);
    } catch {
      /* ignore */
    }
  }, [errorData]);

  useEffect(() => {
    if (!errorData) return;
    setErrorTipsExpanded(false);
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) return;
    const el = resultPanelRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [errorData]);

  useEffect(() => {
    if (phase !== 'user_speaking') {
      liveMatchCountRef.current = 0;
      return;
    }
    if (!currentWord) return;
    const targetChars = [...currentWord.hanzi];
    const simChars = [...(currentWord.sim || currentWord.hanzi)];
    const heardChars = [...onlyHanzi(liveTranscript)];
    let matched = 0;
    while (
      matched < targetChars.length &&
      matched < heardChars.length &&
      (heardChars[matched] === targetChars[matched] || heardChars[matched] === simChars[matched])
    ) {
      matched += 1;
    }
    if (matched > liveMatchCountRef.current && matched > 0) {
      try {
        if (navigator.vibrate) navigator.vibrate(matched >= targetChars.length ? [10, 30, 14] : 7);
      } catch {
        /* ignore */
      }
    }
    liveMatchCountRef.current = matched;
  }, [phase, liveTranscript, currentWord]);

  useEffect(() => {
    if (phase !== 'user_speaking' || timeLeft !== 3) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([18, 40, 18]);
    } catch {
      /* ignore */
    }
  }, [phase, timeLeft]);

  useEffect(() => {
    if (!lessonCompleteBanner) return;
    try {
      if (!navigator.vibrate) return;
      navigator.vibrate(
        lessonCompleteBanner.passed
          ? lessonCompleteBanner.accuracy >= 100
            ? [20, 40, 20, 40, 40]
            : [16, 35, 24]
          : [12, 50, 12],
      );
    } catch {
      /* ignore */
    }
  }, [lessonCompleteBanner]);

  useEffect(() => {
    if (phase !== 'user_speaking') return;
    mobileChipBarRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [phase]);

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
    setWakeLockOn(false);
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, [clearEvalTimeouts]);

  const requestWakeLock = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator)) return;
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockOn(true);
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeLockOn(false);
      });
    } catch {
      setWakeLockOn(false);
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
    setPracticeTipDismissed(() => {
      if (practice.mode === 'lesson' && practice.lessonId) {
        try {
          return sessionStorage.getItem(`pm_tip_dismiss_${practice.lessonId}`) === '1';
        } catch {
          return false;
        }
      }
      return false;
    });
    setPracticeTipExpanded(false);    currentMistakesRef.current = 0;
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
    try {
      const coarse =
        typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
      if (coarse && !sessionStorage.getItem('pm_swipe_hint_v1')) {
        sessionStorage.setItem('pm_swipe_hint_v1', '1');
        window.setTimeout(() => {
          setStageTipToast('小提示：暫停時左右滑可換題');
          window.setTimeout(() => setStageTipToast(null), 2800);
        }, 700);
      }
    } catch {
      /* ignore */
    }
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
        const isTouch =
          typeof window !== 'undefined' &&
          (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
        setStageTipToast(
          isTouch
            ? '手機提示：盲跟可點「偷看」· 時間緊可點「加時」'
            : '快捷鍵：按 ? 睇說明 · Space 播放 · R 重播 · E 加時（長句兩次）',
        );
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
        if (lesson.stageId === 'tones' || lesson.kind === 'tone_drill') {
          try {
            if (!sessionStorage.getItem('pm_tone_single_tip_v1')) {
              sessionStorage.setItem('pm_tone_single_tip_v1', '1');
              window.setTimeout(() => {
                setStageTipToast('單字提示：稍拉長、對住咪 · 辨識錯唔一定係你讀錯');
                window.setTimeout(() => setStageTipToast(null), 3600);
              }, 4500);
            }
          } catch {
            /* ignore */
          }
        }
      }, 3600);
    } else {
      showShortcutsHint();
      if (lesson.stageId === 'tones' || lesson.kind === 'tone_drill') {
        try {
          if (!sessionStorage.getItem('pm_tone_single_tip_v1')) {
            sessionStorage.setItem('pm_tone_single_tip_v1', '1');
            window.setTimeout(() => {
              setStageTipToast('單字提示：稍拉長、對住咪 · 辨識錯唔一定係你讀錯');
              window.setTimeout(() => setStageTipToast(null), 3600);
            }, 4500);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }, [beginPractice]);

  const resumeInterruptedLesson = useCallback(() => {
    const saved = loadActiveLesson();
    if (!saved) return;
    const lesson = getLesson(saved.lessonId);
    if (!lesson) return;
    const idx = Math.min(Math.max(0, saved.index), lesson.items.length - 1);
    startLesson(lesson, idx);
    setHomeToast(`繼續「${lesson.title}」· 第 ${idx + 1} 題`);
    window.setTimeout(() => setHomeToast(null), 2400);
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

  const leaveToHome = useCallback(() => {
    setLeaveConfirmOpen(false);
    stopPracticeAudio();
    setScreen('home');
    setActivePractice(null);
    setLessonCompleteBanner(null);
    setLessonForceBlind(false);
    try {
      window.history.replaceState({ pm: 'home' }, '');
    } catch {
      /* ignore */
    }
  }, [stopPracticeAudio]);

  const backToHome = useCallback(() => {
    const practice = activePracticeRef.current;
    if (
      practice?.mode === 'lesson' &&
      practice.lessonId &&
      globalIndexRef.current > 0 &&
      globalIndexRef.current < dictionaryRef.current.length
    ) {
      setLeaveConfirmOpen(true);
      return;
    }
    leaveToHome();
  }, [leaveToHome]);
  backToHomeRef.current = backToHome;

  useEffect(() => {
    if (screen !== 'practice') return;
    const st = window.history.state as { pm?: string } | null;
    if (st?.pm !== 'practice') {
      window.history.pushState({ pm: 'practice' }, '');
    }
  }, [screen]);

  useEffect(() => {
    const onPop = () => {
      if (screenRef.current !== 'practice') return;
      window.history.pushState({ pm: 'practice' }, '');
      if (skipConfirmOpenRef.current) {
        setSkipConfirmOpen(false);
        return;
      }
      if (leaveConfirmOpenRef.current) {
        setLeaveConfirmOpen(false);
        return;
      }
      if (showDictionaryRef.current) {
        setShowDictionary(false);
        return;
      }
      if (showHistoryRef.current) {
        setShowHistory(false);
        return;
      }
      if (showCustomInputRef.current) {
        setShowCustomInput(false);
        return;
      }
      if (showSpeedPanelRef.current) {
        setShowSpeedPanel(false);
        return;
      }
      if (showShortcutsHelpRef.current) {
        setShowShortcutsHelp(false);
        return;
      }
      if (lessonCompleteBannerRef.current) {
        setLessonCompleteBanner(null);
        setScreen('home');
        setActivePractice(null);
        try {
          window.history.replaceState({ pm: 'home' }, '');
        } catch {
          /* ignore */
        }
        return;
      }
      backToHomeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
    const meta = document.querySelector('meta[name="theme-color"]');
    if (screen === 'home') {
      document.title = 'Pinyin Master · 零到流利';
      meta?.setAttribute('content', '#0f172a');
      return;
    }
    const label = activePractice?.title || (isCustomMode ? '自訂練習' : '練習中');
    const prog =
      dictionary.length > 0
        ? ` · ${Math.min(globalIndex + 1, dictionary.length)}/${dictionary.length}`
        : '';
    document.title = `${label}${prog} · Pinyin Master`;
    meta?.setAttribute('content', '#f8fafc');
  }, [screen, activePractice?.title, isCustomMode, globalIndex, dictionary.length]);

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
      isCorrect =
        !isGarbageTranscript(cleanTranscript) &&
        isPronunciationMatch(cleanTranscript, wordObj.hanzi, wordObj.sim);
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
          setStageTipToast(
            typeof window !== 'undefined' &&
              (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
              ? '連對 5 · 可撳頂欄調語速'
              : '連對 5 · 可按 [ ] 微調語速',
          );
          window.setTimeout(() => setStageTipToast(null), 2400);
        } else if (next === 10) {
          setComboShareToast(10);
          window.setTimeout(() => setComboShareToast(null), 5000);
          try {
            if (navigator.vibrate) navigator.vibrate([16, 30, 16, 30, 24]);
          } catch {
            /* ignore */
          }
        } else if (next === 20) {
          setComboShareToast(20);
          window.setTimeout(() => setComboShareToast(null), 5000);
          try {
            if (navigator.vibrate) navigator.vibrate([20, 40, 20, 40, 30]);
          } catch {
            /* ignore */
          }
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
      } else {
        const left = goal - nextPath.dailyCorrect;
        if (left >= 1 && left <= 3) {
          try {
            const key = `pm_near_goal_${left}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, '1');
              setStageTipToast(
                left === 1 ? '今日目標仲差 1 次 · 加油' : `今日目標仲差 ${left} 次`,
              );
              window.setTimeout(() => setStageTipToast(null), 2400);
            }
          } catch {
            /* ignore */
          }
        }
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
        if (passed && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([20, 40, 20, 40, 30]);
        }
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

    const displayUserText = displayTranscript(cleanTranscript) || '(未偵測到發音)';
    const tonelessNear = isTonelessLatinNearMiss(cleanTranscript, wordObj.hanzi);
    const noSpeech =
      !tonelessNear &&
      (isNoSpeechResult(cleanTranscript) || displayUserText === '(未偵測到發音)');
    const pinyinOfWrongWord = onlyHanzi(cleanTranscript)
      ? toPinyinString(onlyHanzi(cleanTranscript), 'symbol')
      : tonelessNear
        ? cleanTranscript.trim().toLowerCase()
        : '---';
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
    // Pure ASR miss / noise — don't pollute tone stats as if they mispronounced
    if (!noSpeech) {
      analyzeAndRecordMistakes(wordObj.hanzi, cleanTranscript);
    }
    currentMistakesRef.current += 1;
    setRoundMistakes(currentMistakesRef.current);
    if (currentMistakesRef.current === 2) {
      setLastChanceToast(true);
      addEvalTimeout(() => setLastChanceToast(false), 4200);
      setStageTipToast(
        noSpeech ? '最後機會 · 靠近咪再講清楚' : '最後一次機會 · 聽清楚再跟',
      );
      window.setTimeout(() => setStageTipToast(null), 2200);
    } else if (noSpeech) {
      setStageTipToast('系統未聽清 · 唔算發音分析 · 再試一次');
      window.setTimeout(() => setStageTipToast(null), 2400);
    } else if (isSameSyllableWrongTone(cleanTranscript, wordObj.hanzi)) {
      setStageTipToast('聲調差少少 · 睇曲線再跟一次');
      window.setTimeout(() => setStageTipToast(null), 2600);
    } else if (isTonelessLatinNearMiss(cleanTranscript, wordObj.hanzi)) {
      setStageTipToast('聽到韻母 · 請加上正確聲調再講');
      window.setTimeout(() => setStageTipToast(null), 2800);
    }
    {
      const raw = dictionaryRef.current[globalIndexRef.current];
      // Only track as "mistake word" when we heard a real wrong pronunciation
      if (raw && !noSpeech) sessionMistakeWordsRef.current.push(raw);
    }
    const brokenCombo = comboStreakRef.current;
    setComboStreak(0);
    comboStreakRef.current = 0;
    if (brokenCombo >= 3 && !noSpeech) {
      setComboBreakToast(true);
      addEvalTimeout(() => setComboBreakToast(false), 1600);
    }
    try {
      if (navigator.vibrate) navigator.vibrate(noSpeech ? [10, 30, 10] : [20, 40, 20]);
    } catch {
      /* ignore */
    }
    setSessionAttempts((n) => {
      const next = n + 1;
      sessionAttemptsRef.current = next;
      return next;
    });

    {
      const practice = activePracticeRef.current;
      if (practice?.mode === 'lesson' && practice.lessonId) {
        const total = sessionAttemptsRef.current;
        const ok = sessionCorrectRef.current;
        const liveAcc = total > 0 ? Math.round((ok / total) * 100) : 100;
        const passAcc = passAccuracyForLesson(practice.lessonId);
        if (total >= 5 && liveAcc < passAcc) {
          try {
            const key = `pm_acc_warn_${practice.lessonId}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, '1');
              setStageTipToast(`正確率 ${liveAcc}% · 過關要 ≥${passAcc}% · 放慢再跟`);
              window.setTimeout(() => setStageTipToast(null), 3200);
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    const srsKey = dictionaryRef.current[globalIndexRef.current] || wordObj.hanzi;
    // Don't schedule SRS "again" for mic/ASR misses — that isn't a pronunciation error
    if (!noSpeech) {
      const nextSrs = reviewCard(srsRef.current, srsKey, false);
      setSrs(nextSrs);
      saveSrs(nextSrs);
    }

    const practiceForCoach = activePracticeRef.current;
    const lessonForCoach = practiceForCoach?.lessonId ? getLesson(practiceForCoach.lessonId) : undefined;
    const toneNearMiss = !noSpeech && isSameSyllableWrongTone(cleanTranscript, wordObj.hanzi);
    const heardForContrast = onlyHanzi(cleanTranscript);

    // Auto-coach: skip slow TTS when ASR heard nothing; tone near-miss plays wrong→right contrast
    if (!noSpeech) {
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
        if (toneNearMiss && heardForContrast && heardForContrast !== text) {
          setPairContrastHint(`${heardForContrast} → ${text}`);
          speakHanzi(heardForContrast, {
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
        speakHanzi(text, { voices, rate: slowRate });
      }, 450);
    }

    if (currentMistakesRef.current >= 3) {
      addEvalTimeout(() => goToIndex(globalIndexRef.current + 1), noSpeech ? 1800 : 2800);
    } else {
      const retryMs = noSpeech
        ? 1100
        : toneNearMiss
          ? 2400
          : lessonForCoach?.kind === 'minimal_pair' && globalIndexRef.current % 2 === 1
            ? 2600
            : 1900;
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

  const peekBriefly = useCallback((ms = 1600) => {
    const duration = Math.max(800, Math.min(5000, ms));
    if (peekHideTimerRef.current) clearTimeout(peekHideTimerRef.current);
    if (peekToastTimerRef.current) clearTimeout(peekToastTimerRef.current);
    setPeekReveal(true);
    setStageTipToast(
      duration >= 2800 ? `偷看 ${(duration / 1000).toFixed(1)} 秒 · 記住聲調` : '偷看 1.6 秒 · 盡量靠耳朵',
    );
    try {
      if (navigator.vibrate) navigator.vibrate(duration >= 2800 ? [10, 40, 10] : 8);
    } catch {
      /* ignore */
    }
    peekHideTimerRef.current = setTimeout(() => setPeekReveal(false), duration);
    peekToastTimerRef.current = setTimeout(() => setStageTipToast(null), duration + 200);
  }, []);

  /** Skip the brief celebration pause after a correct answer. */
  const skipPerfectWait = useCallback(() => {
    if (phase !== 'evaluating' || errorData) return;
    clearEvalTimeouts();
    setLiveTranscript('');
    if (!isPlayingRef.current) {
      setPhase('idle');
      return;
    }
    setPhase('idle');
    window.setTimeout(() => {
      if (isPlayingRef.current) {
        setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
      }
    }, 50);
  }, [phase, errorData, clearEvalTimeouts]);

  /** Skip auto-coach delay after a miss — retry now or advance after 3 fails. */
  const skipErrorWait = useCallback(() => {
    if (!errorData || phase !== 'evaluating') return;
    clearEvalTimeouts();
    window.speechSynthesis.cancel();
    setPairContrastHint(null);
    if (currentMistakesRef.current >= 3) {
      goToIndex(globalIndexRef.current + 1);
      return;
    }
    if (isPlayingRef.current) setPhase('system_speaking');
  }, [errorData, phase, clearEvalTimeouts, goToIndex]);

  const onPracticeSwipeStart = useCallback((e: TouchEvent) => {
    swipeStartXRef.current = e.touches[0]?.clientX ?? null;
    swipeStartYRef.current = e.touches[0]?.clientY ?? null;
  }, []);

  const onPracticeSwipeEnd = useCallback(
    (e: TouchEvent) => {
      const startX = swipeStartXRef.current;
      const startY = swipeStartYRef.current;
      swipeStartXRef.current = null;
      swipeStartYRef.current = null;
      if (startX == null || startY == null || isPlayingRef.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const next = globalIndexRef.current + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= dictionaryRef.current.length) return;
      window.speechSynthesis.cancel();
      clearEvalTimeouts();
      stopRecognition();
      setErrorData(null);
      setLiveTranscript('');
      goToIndex(next);
      setStageTipToast(dx < 0 ? '下一題（滑動）' : '上一題（滑動）');
      window.setTimeout(() => setStageTipToast(null), 1200);
    },
    [clearEvalTimeouts, goToIndex],
  );

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

    skipDemoRef.current = () => {
      if (!isPlayingRef.current) return;
      if (phaseRef.current !== 'system_speaking' && phaseRef.current !== 'preparing') return;
      isEnded = true;
      window.speechSynthesis.cancel();
      clearEvalTimeouts();
      setPairContrastHint(null);
      demoPassRef.current = 2;
      setDemoPass(2);
      skipPrepareRef.current = null;
      skipDemoRef.current = null;
      setPhase('user_speaking');
    };

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
        skipDemoRef.current = null;
        setPhase('user_speaking');
      };

      skipPrepareRef.current = () => {
        if (needsSecondDemo) {
          if (prepareDone || !isPlayingRef.current) return;
          prepareDone = true;
          skipPrepareRef.current = null;
          skipDemoRef.current = null;
          if (prepareTimer) clearTimeout(prepareTimer);
          demoPassRef.current = 2;
          setDemoPass(2);
          setPhase('user_speaking');
          return;
        }
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
  }, [addEvalTimeout, clearEvalTimeouts, voices]);

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
    micPeakRef.current = 0;
    micLevelSamplesRef.current = 0;
    // Ensure demo TTS isn't still feeding the mic when listening starts
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
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
    // Short utterances: non-continuous gives cleaner finals; long lines need continuous
    recognition.continuous = hanziLen > 2;
    recognition.interimResults = true;
    // More alternatives help monosyllables — Web Speech often picks wrong 椅/以/已 or digits
    recognition.maxAlternatives = hanziLen <= 2 ? 5 : 3;

    let graceUsed = false;
    let garbageRetryUsed = false;
    let manualExtendCount = 0;
    let remaining = seconds;
    // Short items: don't early-fail on first interim wrong guess (ASR is noisy)
    const allowEarlyFail = hanziLen >= 2 && hanziLen <= 4;
    // Keep every alternative seen this turn — later interim "222" must not erase earlier 以/椅
    const heardCandidates = new Set<string>();
    // Ignore instant "matches" right after demo — speaker echo often triggers false passes
    const listenArmedAt = performance.now() + (hanziLen <= 2 ? 480 : 0);
    const isListenArmed = () => performance.now() >= listenArmedAt;
    let stableMatchHits = 0;
    let lastStableMatch = '';

    const restartRecognition = () => {
      try { recognition.abort(); } catch { /* ignore */ }
      window.setTimeout(() => {
        if (isCancelled) return;
        try { recognition.start(); } catch { /* ignore */ }
      }, 120);
    };

    const finishListen = () => {
      if (isCancelled) return;
      const raw = liveTranscriptRef.current;
      const partial = onlyHanzi(raw);
      const target = currentWordRef.current;
      const targetLen = target?.hanzi.length ?? 0;
      const micWasQuiet = micPeakRef.current < 0.045;
      const micMeterReady = micLevelSamplesRef.current >= 12;

      // Silent room: ignore ASR hallucinations — only when meter actually sampled levels
      if (micMeterReady && micWasQuiet && targetLen <= 2) {
        isCancelled = true;
        if (timerId) clearTimeout(timerId);
        if (countdownInterval) clearInterval(countdownInterval);
        try { recognition.abort(); } catch { /* ignore */ }
        setStageTipToast('咪太靜 · 靠近啲再講（未計發音分析）');
        window.setTimeout(() => setStageTipToast(null), 2400);
        evaluateResult(false, '');
        return;
      }

      // Final pick against ALL candidates heard this turn (not just last interim)
      if (target && heardCandidates.size > 0) {
        const picked = pickBestTranscriptCandidate([...heardCandidates], target.hanzi, target.sim);
        if (picked.matched) {
          isCancelled = true;
          if (timerId) clearTimeout(timerId);
          if (countdownInterval) clearInterval(countdownInterval);
          try { recognition.abort(); } catch { /* ignore */ }
          evaluateResult(true, picked.transcript);
          return;
        }
        if (picked.transcript) {
          liveTranscriptRef.current = picked.transcript;
          setLiveTranscript(picked.transcript);
        }
      }

      // If learner already started speaking a long line, give one short extension
      if (!graceUsed && partial.length > 0 && partial.length < targetLen && targetLen > 4) {
        graceUsed = true;
        remaining = 4;
        setTimeLeft(4);
        timerId = setTimeout(() => {
          if (isCancelled) return;
          isCancelled = true;
          try { recognition.abort(); } catch { /* ignore */ }
          const t = currentWordRef.current;
          if (t && heardCandidates.size > 0) {
            const picked = pickBestTranscriptCandidate([...heardCandidates], t.hanzi, t.sim);
            if (picked.matched) {
              evaluateResult(true, picked.transcript);
              return;
            }
            evaluateResult(false, picked.transcript || displayTranscript(liveTranscriptRef.current));
            return;
          }
          evaluateResult(false, displayTranscript(liveTranscriptRef.current));
        }, 4000);
        return;
      }
      // Monosyllables: ASR often returns only digits on first pass — one soft retry + mic restart
      const latest = liveTranscriptRef.current;
      if (
        !garbageRetryUsed &&
        targetLen <= 2 &&
        (!onlyHanzi(latest) || isGarbageTranscript(latest))
      ) {
        // Pool may still have a real Hanzi from earlier interim — don't treat as silence
        if (target && heardCandidates.size > 0) {
          const poolPick = pickBestTranscriptCandidate([...heardCandidates], target.hanzi, target.sim);
          if (poolPick.matched) {
            isCancelled = true;
            if (timerId) clearTimeout(timerId);
            if (countdownInterval) clearInterval(countdownInterval);
            try { recognition.abort(); } catch { /* ignore */ }
            evaluateResult(true, poolPick.transcript);
            return;
          }
          if (poolPick.transcript && !isNoSpeechResult(poolPick.transcript)) {
            isCancelled = true;
            if (timerId) clearTimeout(timerId);
            if (countdownInterval) clearInterval(countdownInterval);
            try { recognition.abort(); } catch { /* ignore */ }
            evaluateResult(false, poolPick.transcript);
            return;
          }
        }
        garbageRetryUsed = true;
        remaining = 4;
        setTimeLeft(4);
        setStageTipToast('未聽清 · 對住咪再講清楚啲');
        window.setTimeout(() => setStageTipToast(null), 2000);
        try {
          if (navigator.vibrate) navigator.vibrate([8, 40, 8]);
        } catch {
          /* ignore */
        }
        restartRecognition();
        scheduleFinish(4000);
        return;
      }
      isCancelled = true;
      try { recognition.abort(); } catch { /* ignore */ }
      if (target && heardCandidates.size > 0) {
        const picked = pickBestTranscriptCandidate([...heardCandidates], target.hanzi, target.sim);
        evaluateResult(picked.matched, picked.transcript || displayTranscript(liveTranscriptRef.current));
        return;
      }
      evaluateResult(false, displayTranscript(liveTranscriptRef.current));
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
      try {
        if (navigator.vibrate) navigator.vibrate(10);
      } catch {
        /* ignore */
      }
      const coarse =
        typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
      if (left === 1) {
        setStageTipToast(coarse ? '仲可以再撳一次加時' : '還可以再按 E 加時一次');
        window.setTimeout(() => setStageTipToast(null), 2200);
      } else if (left === 0) {
        setStageTipToast('已加時 · 本輪加時用完');
        window.setTimeout(() => setStageTipToast(null), 1800);
      }
    };

    scheduleFinish(seconds * 1000);

    countdownInterval = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      setTimeLeft(remaining);
    }, 1000);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (isCancelled || !isPlayingRef.current) return;

      const candidates: string[] = [];
      let latestFinal = false;
      for (let ri = 0; ri < event.results.length; ri++) {
        const result = event.results[ri];
        if (result.isFinal) latestFinal = true;
        for (let ai = 0; ai < result.length; ai++) {
          const alt = result[ai]?.transcript;
          if (alt) {
            candidates.push(alt);
            heardCandidates.add(alt.trim());
          }
        }
      }
      const joined = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join('');
      if (joined) {
        candidates.unshift(joined);
        heardCandidates.add(joined.trim());
      }

      const target = currentWordRef.current;
      if (!target) return;

      const picked = pickBestTranscriptCandidate(
        [...heardCandidates, ...candidates],
        target.hanzi,
        target.sim,
      );
      const display = displayTranscript(picked.transcript || joined);
      // Don't overwrite a good Hanzi live view with empty garbage interim
      if (display || !onlyHanzi(liveTranscriptRef.current)) {
        liveTranscriptRef.current = display;
        setLiveTranscript(display);
      }

      if (picked.matched) {
        // No real mic energy yet — likely speaker bleed / hallucination; wait
        if (
          hanziLen <= 2 &&
          micLevelSamplesRef.current >= 12 &&
          micPeakRef.current < 0.045
        ) {
          if (display || !onlyHanzi(liveTranscriptRef.current)) {
            liveTranscriptRef.current = display;
            setLiveTranscript(display);
          }
          return;
        }
        // Wait out speaker-echo window for short items; still keep candidate for later
        if (!isListenArmed()) {
          if (display || !onlyHanzi(liveTranscriptRef.current)) {
            liveTranscriptRef.current = display;
            setLiveTranscript(display);
          }
          return;
        }
        // Monosyllables: need a final result OR two consistent interim matches (anti-flicker)
        if (hanziLen <= 2) {
          const key = onlyHanzi(picked.transcript) || picked.transcript;
          if (key === lastStableMatch) stableMatchHits += 1;
          else {
            lastStableMatch = key;
            stableMatchHits = 1;
          }
          const confidentAlt = (() => {
            for (let ri = 0; ri < event.results.length; ri++) {
              const result = event.results[ri];
              for (let ai = 0; ai < result.length; ai++) {
                const alt = result[ai];
                if (!alt) continue;
                if (
                  alt.confidence > 0 &&
                  alt.confidence < 0.35 &&
                  isPronunciationMatch(alt.transcript, target.hanzi, target.sim)
                ) {
                  return false;
                }
                if (
                  alt.confidence >= 0.35 &&
                  isPronunciationMatch(alt.transcript, target.hanzi, target.sim)
                ) {
                  return true;
                }
              }
            }
            return null;
          })();
          const stableEnough =
            latestFinal ||
            stableMatchHits >= 2 ||
            confidentAlt === true ||
            performance.now() >= listenArmedAt + 1600;
          if (!stableEnough) {
            if (display || !onlyHanzi(liveTranscriptRef.current)) {
              liveTranscriptRef.current = display;
              setLiveTranscript(display);
            }
            return;
          }
        }
        isCancelled = true;
        if (timerId) clearTimeout(timerId);
        if (countdownInterval) clearInterval(countdownInterval);
        try { recognition.abort(); } catch { /* ignore */ }
        setStageTipToast('提前聽對 · 好');
        window.setTimeout(() => setStageTipToast(null), 1200);
        evaluateResult(true, picked.transcript);
        return;
      }
      stableMatchHits = 0;
      lastStableMatch = '';

      // Early fail only on final results for short multi-char items — never for single chars
      const clean = onlyHanzi(display);
      if (
        allowEarlyFail &&
        latestFinal &&
        clean.length === target.hanzi.length &&
        !isGarbageTranscript(display)
      ) {
        const poolPick = pickBestTranscriptCandidate([...heardCandidates], target.hanzi, target.sim);
        if (poolPick.matched) {
          isCancelled = true;
          if (timerId) clearTimeout(timerId);
          if (countdownInterval) clearInterval(countdownInterval);
          try { recognition.abort(); } catch { /* ignore */ }
          evaluateResult(true, poolPick.transcript);
          return;
        }
        // Tone near-miss: keep listening — a better alternative may still arrive
        if (
          isSameSyllableWrongTone(poolPick.transcript || clean, target.hanzi) ||
          isSameSyllableWrongTone(clean, target.hanzi)
        ) {
          if (poolPick.transcript) {
            liveTranscriptRef.current = poolPick.transcript;
            setLiveTranscript(poolPick.transcript);
          }
          return;
        }
        isCancelled = true;
        if (timerId) clearTimeout(timerId);
        if (countdownInterval) clearInterval(countdownInterval);
        try { recognition.abort(); } catch { /* ignore */ }
        evaluateResult(false, poolPick.transcript || clean);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (isCancelled || !isPlayingRef.current) return;
      if (event.error === 'aborted') return;
      // Short items + non-continuous: silence ends the session — restart until our timer finishes
      if (event.error === 'no-speech') {
        if (hanziLen <= 2) {
          try {
            recognition.start();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (event.error === 'network') {
        setStageTipToast(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? '離線時語音辨識可能唔穩 · 恢復網絡再試'
            : '語音辨識連線失敗 · 檢查網絡後再跟',
        );
        window.setTimeout(() => setStageTipToast(null), 3600);
        return;
      }
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (countdownInterval) clearInterval(countdownInterval);
      setIsPlaying(false);
      setPhase('idle');
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture'
      ) {
        setStageTipToast('麥克風或語音服務被拒 · 請喺瀏覽器允許後再開始');
      } else {
        setStageTipToast('語音辨識出錯 · 已暫停，可再按開始');
      }
      window.setTimeout(() => setStageTipToast(null), 3600);
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
      setWakeLockOn(false);
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }

    if (!speechSupported) {
      setBrowserWarningDismissed(false);
      setStageTipToast('此瀏覽器不支援語音辨識 · 請用 Chrome／Safari');
      window.setTimeout(() => setStageTipToast(null), 3200);
      return;
    }

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }
      setMicStream(mediaStreamRef.current);
      setMicDenied(false);
    } catch (err) {
      console.warn('麥克風權限未取得：', err);
      setMicStream(null);
      setMicDenied(true);
      setStageTipToast('請允許麥克風權限，否則無法跟讀評分');
      window.setTimeout(() => setStageTipToast(null), 3600);
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
      const coarse =
        typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
      if (coarse && !sessionStorage.getItem('pm_hold_restart_v1')) {
        sessionStorage.setItem('pm_hold_restart_v1', '1');
        window.setTimeout(() => {
          setStageTipToast('小提示：長按開始掣可重播本題');
          window.setTimeout(() => setStageTipToast(null), 2800);
        }, 1400);
      }
    } catch {
      /* ignore */
    }
  };

  const handleSkipWord = useCallback(() => {
    if (!currentWordRef.current) return;
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    setSkipConfirmOpen(false);
    setSessionAttempts((n) => {
      const next = n + 1;
      sessionAttemptsRef.current = next;
      return next;
    });
    setComboStreak(0);
    comboStreakRef.current = 0;
    const newHistory = recordHistory(currentWordRef.current, false, '手動跳過', '---');
    setStageTipToast('已跳過 · 會計入本課正確率');
    window.setTimeout(() => setStageTipToast(null), 2200);
    goToIndex(globalIndexRef.current + 1, newHistory);
  }, [clearEvalTimeouts, goToIndex]);

  const requestSkipWord = useCallback(() => {
    const practice = activePracticeRef.current;
    if (practice?.mode === 'lesson') {
      setSkipConfirmOpen(true);
      return;
    }
    handleSkipWord();
  }, [handleSkipWord]);

  /** Long-press play: re-run the current item from demo / listen. */
  const restartCurrentItem = useCallback(() => {
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    setErrorData(null);
    setLiveTranscript('');
    setPairContrastHint(null);
    currentMistakesRef.current = 0;
    setRoundMistakes(0);
    demoPassRef.current = 1;
    setDemoPass(1);
    setPeekReveal(false);
    setStageTipToast('已重播本題');
    window.setTimeout(() => setStageTipToast(null), 1800);
    try {
      if (navigator.vibrate) navigator.vibrate(14);
    } catch {
      /* ignore */
    }
    if (!isPlayingRef.current) {
      void togglePlayPause();
      return;
    }
    setPhase('idle');
    window.setTimeout(() => {
      if (!isPlayingRef.current) return;
      setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
    }, 50);
  }, [clearEvalTimeouts]);

  const handlePrevWord = useCallback(() => {
    if (globalIndexRef.current <= 0) {
      setStageTipToast('已經係第一題');
      window.setTimeout(() => setStageTipToast(null), 1400);
      try {
        if (navigator.vibrate) navigator.vibrate(8);
      } catch {
        /* ignore */
      }
      return;
    }
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
      if (showCustomInput || showDictionary || showHistory || showSpeedPanel || leaveConfirmOpen || skipConfirmOpen) {
        if (e.key === 'Escape' && leaveConfirmOpen) {
          e.preventDefault();
          setLeaveConfirmOpen(false);
        }
        if (e.key === 'Escape' && skipConfirmOpen) {
          e.preventDefault();
          setSkipConfirmOpen(false);
        }
        return;
      }
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
        peekBriefly();
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
  }, [screen, showCustomInput, showDictionary, showHistory, showSpeedPanel, showShortcutsHelp, leaveConfirmOpen, skipConfirmOpen, replayCorrectPronunciation, peekBriefly, togglePlayPause, handleSkipWord, handlePrevWord, isBlindMode, lessonForceBlind, phase, isPlaying]);

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
    setStageTipToast(`已生成 ${newWords.length} 題 · 撳藍色鍵開始`);
    window.setTimeout(() => setStageTipToast(null), 2800);
    try {
      if (navigator.vibrate) navigator.vibrate([8, 40, 8]);
    } catch {
      /* ignore */
    }
  };

  const exitCustomMode = () => {
    backToHome();
  };

  const handleJumpToWord = (index: number) => {
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    stopRecognition();
    stopMediaStream();
    setMicStream(null);
    setIsPlaying(false);
    setPhase('idle');
    setErrorData(null);
    setLiveTranscript('');
    setPausedByHide(false);
    goToIndex(index);
    setShowDictionary(false);
    setJumpReadyToast(index + 1);
    window.setTimeout(() => setJumpReadyToast(null), 5000);
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch {
      /* ignore */
    }
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
        {homeToast && (
          <button
            type="button"
            role="status"
            aria-live="polite"
            aria-label={`${homeToast}（撳關閉）`}
            onClick={() => setHomeToast(null)}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-xl animate-fade-in text-center max-w-[92%] active:scale-[0.98]"
          >
            {homeToast}
          </button>
        )}
        {swUpdateReady && (
          <div
            className="fixed inset-x-0 bottom-0 z-[70] p-4 pb-safe pointer-events-none animate-fade-in"
            onTouchStart={(e) => {
              (e.currentTarget as HTMLElement).dataset.ty = String(e.touches[0]?.clientY ?? '');
            }}
            onTouchEnd={(e) => {
              const start = Number((e.currentTarget as HTMLElement).dataset.ty || '');
              const end = e.changedTouches[0]?.clientY ?? start;
              if (Number.isFinite(start) && end - start > 56) setSwUpdateReady(false);
            }}
          >
            <div className="mx-auto max-w-sm pointer-events-auto rounded-3xl bg-indigo-600 text-white px-5 py-4 shadow-2xl">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/35 md:hidden" aria-hidden />
              <p className="text-sm font-black">有新版本可用</p>
              <p className="text-[11px] font-bold text-indigo-100/90 mt-1">重新整理即可用上最新介面同內容</p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="flex-1 bg-white text-indigo-700 font-black py-3 rounded-2xl active:scale-[0.98]"
                  onClick={() => window.location.reload()}
                >
                  立即更新
                </button>
                <button
                  type="button"
                  className="px-4 font-bold text-white/80 border border-white/30 rounded-2xl active:scale-[0.98]"
                  onClick={() => setSwUpdateReady(false)}
                >
                  稍後
                </button>
              </div>
            </div>
          </div>
        )}
        <PathHome
          pathProgress={pathProgress}
          srs={srs}
          resumeLesson={resumeLessonId ? getLesson(resumeLessonId) ?? null : null}
          resumeIndex={resumeIndex}
          onStartLesson={(l) => startLesson(l, 0)}
          onStartSlowLesson={(l) => {
            setTtsSpeed(0.7);
            saveSettings({ ttsSpeed: 0.7 });
            setHomeToast('慢速重練 0.70x');
            window.setTimeout(() => setHomeToast(null), 2200);
            startLesson(l, 0);
          }}
          onResumeLesson={resumeInterruptedLesson}
          onStartSrs={startSrsReview}
          onStartFree={startFreeDictionary}
          onOpenCustom={() => {
            setShowCustomInput(true);
            setHomeToast('貼上句子 → 撳生成 · 即開自訂練習');
            window.setTimeout(() => setHomeToast(null), 2800);
          }}
          onOpenDiagnosis={() => setShowHistory(true)}
          onStartWeakDrill={handleStartWeakDrill}
          canStartWeakDrill={canStartWeakDrill}
          onSetDailyGoal={(goal) => {
            const next = setDailyGoal(pathProgress, goal);
            setPathProgress(next);
            savePathProgress(next);
            setHomeToast(`今日目標改為 ${goal} 次正確跟讀`);
            window.setTimeout(() => setHomeToast(null), 2200);
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
            setHomeToast('已匯出進度備份');
            window.setTimeout(() => setHomeToast(null), 2400);
          }}
          onImportBackup={(file) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const parsed = JSON.parse(String(reader.result));
                const result = importLearningBackup(parsed);
                if (result.ok === false) {
                  setHomeToast(result.error);
                  window.setTimeout(() => setHomeToast(null), 3200);
                  return;
                }
                setPathProgress(loadPathProgress());
                setSrs(loadSrs());
                setToneStats(loadToneStats());
                setInitialStats(loadInitialStats());
                setFinalStats(loadFinalStats());
                const prog = loadDefaultProgress();
                setHistory(prog.history);
                setHomeToast('備份已匯入');
                window.setTimeout(() => setHomeToast(null), 2400);
              } catch {
                setHomeToast('無法讀取備份檔');
                window.setTimeout(() => setHomeToast(null), 2800);
              }
            };
            reader.readAsText(file);
          }}
          onShareProgress={async () => {
            const done = pathProgress.completedLessons.length;
            const text = `我喺 Pinyin Master 練普通話：連續 ${pathProgress.streak} 日、完成 ${done} 課、累計正確 ${pathProgress.lifetimeCorrect} 次。零到流利開波！ #PinyinMaster`;
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
              setHomeToast('進度文案已複製');
              window.setTimeout(() => setHomeToast(null), 2400);
            } catch {
              setHomeToast(text);
              window.setTimeout(() => setHomeToast(null), 4000);
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
        {showCustomInput && (
          <CustomInputModal
            customText={customText}
            onChange={setCustomText}
            onClose={() => setShowCustomInput(false)}
            onSubmit={handleAddCustomText}
          />
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
      {swUpdateReady && (
        <div
          className="absolute inset-x-0 bottom-0 z-[70] p-4 pb-safe pointer-events-none animate-fade-in"
          onTouchStart={(e) => {
            (e.currentTarget as HTMLElement).dataset.ty = String(e.touches[0]?.clientY ?? '');
          }}
          onTouchEnd={(e) => {
            const start = Number((e.currentTarget as HTMLElement).dataset.ty || '');
            const end = e.changedTouches[0]?.clientY ?? start;
            if (Number.isFinite(start) && end - start > 56) setSwUpdateReady(false);
          }}
        >
          <div className="mx-auto max-w-sm pointer-events-auto rounded-3xl bg-indigo-600 text-white px-5 py-4 shadow-2xl">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/35 md:hidden" aria-hidden />
            <p className="text-sm font-black">有新版本可用</p>
            <p className="text-[11px] font-bold text-indigo-100/90 mt-1">重新整理即可用上最新介面同內容</p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="flex-1 bg-white text-indigo-700 font-black py-3 rounded-2xl active:scale-[0.98]"
                onClick={() => window.location.reload()}
              >
                立即更新
              </button>
              <button
                type="button"
                className="px-4 font-bold text-white/80 border border-white/30 rounded-2xl active:scale-[0.98]"
                onClick={() => setSwUpdateReady(false)}
              >
                稍後
              </button>
            </div>
          </div>
        </div>
      )}
      {dailyGoalToast && (
        <div
          className="absolute inset-0 z-[55] bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pb-safe animate-fade-in"
          onClick={() => setDailyGoalToast(false)}
        >
          <div
            role="dialog"
            aria-labelledby="daily-goal-title"
            className="w-full max-w-sm rounded-3xl bg-emerald-600 text-white shadow-2xl p-5 pt-3"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              if (endY - startY > 64) setDailyGoalToast(false);
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/35 sm:hidden" aria-hidden />
            <h2 id="daily-goal-title" className="text-xl font-black tracking-wide">
              今日目標達成！
            </h2>
            <p className="text-sm font-bold text-emerald-50/90 mt-2 leading-relaxed">
              連續 {pathProgress.streak} 日開口 · 完成 {pathProgress.dailyCorrect}/{pathProgress.dailyGoal} 次正確跟讀
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 bg-white text-emerald-800 font-black py-3.5 rounded-2xl active:scale-[0.98]"
                onClick={async () => {
                  const text = `我喺 Pinyin Master 達成今日目標 ${pathProgress.dailyCorrect}/${pathProgress.dailyGoal} · 連續 ${pathProgress.streak} 日！ #PinyinMaster`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: 'Pinyin Master', text });
                      setDailyGoalToast(false);
                      return;
                    }
                  } catch {
                    /* cancelled */
                  }
                  try {
                    await navigator.clipboard.writeText(text);
                    setStageTipToast('已複製分享文案');
                    window.setTimeout(() => setStageTipToast(null), 2000);
                  } catch {
                    /* ignore */
                  }
                  setDailyGoalToast(false);
                }}
              >
                <Share2 className="w-4 h-4" /> 分享今日成績
              </button>
              <button
                type="button"
                className="w-full py-3 rounded-2xl border border-white/35 font-bold active:scale-[0.98]"
                onClick={() => setDailyGoalToast(false)}
              >
                繼續練
              </button>
            </div>
          </div>
        </div>
      )}

      {comboBreakToast && (
        <button
          type="button"
          onClick={() => {
            setComboBreakToast(false);
            setTtsSpeed(0.7);
            saveSettings({ ttsSpeed: 0.7 });
            setSpeedToast('已調慢 0.70x');
            window.setTimeout(() => setSpeedToast(null), 1600);
            try {
              if (navigator.vibrate) navigator.vibrate(8);
            } catch {
              /* ignore */
            }
          }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-2.5 rounded-2xl bg-amber-600 text-white text-xs font-black shadow-xl animate-fade-in text-center max-w-[90%] active:scale-[0.98]"
        >
          連擊中斷 · 撳呢度調慢語速再跟
        </button>
      )}

      {lastChanceToast && (
        <button
          type="button"
          onClick={() => {
            setLastChanceToast(false);
            setTtsSpeed(0.55);
            saveSettings({ ttsSpeed: 0.55 });
            replayCorrectPronunciation({ extraSlow: true });
            setSpeedToast('極慢 0.55x · 最後機會');
            window.setTimeout(() => setSpeedToast(null), 1800);
            try {
              if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
            } catch {
              /* ignore */
            }
          }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[56] px-4 py-2.5 rounded-2xl bg-rose-600 text-white text-xs font-black shadow-xl animate-fade-in text-center max-w-[92%] active:scale-[0.98]"
        >
          最後機會 · 撳呢度極慢聽正音
        </button>
      )}

      {comboShareToast != null && (
        <button
          type="button"
          onClick={async () => {
            const n = comboShareToast;
            setComboShareToast(null);
            const text = `我喺 Pinyin Master 連對 ${n} 題！ #PinyinMaster`;
            try {
              if (navigator.share) {
                await navigator.share({ title: 'Pinyin Master', text });
                return;
              }
            } catch {
              /* cancelled */
            }
            try {
              await navigator.clipboard.writeText(text);
              setStageTipToast('連對文案已複製');
              window.setTimeout(() => setStageTipToast(null), 2000);
            } catch {
              /* ignore */
            }
          }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[56] px-4 py-2.5 rounded-2xl bg-amber-500 text-amber-950 text-xs font-black shadow-xl animate-fade-in text-center max-w-[92%] active:scale-[0.98]"
        >
          連對 {comboShareToast}！ · 撳呢度分享
        </button>
      )}

      {jumpReadyToast != null && (
        <button
          type="button"
          onClick={() => {
            setJumpReadyToast(null);
            void togglePlayPause();
            try {
              if (navigator.vibrate) navigator.vibrate(10);
            } catch {
              /* ignore */
            }
          }}
          onTouchStart={(e) => {
            swipeStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = swipeStartYRef.current;
            swipeStartYRef.current = null;
            if (startY == null) return;
            const endY = e.changedTouches[0]?.clientY ?? startY;
            if (endY - startY > 40) setJumpReadyToast(null);
          }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[56] px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-black shadow-xl animate-fade-in text-center max-w-[92%] active:scale-[0.98] inline-flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" fill="currentColor" /> 已跳到第 {jumpReadyToast} 題 · 撳開始跟讀
        </button>
      )}

      {stageTipToast && (
        <button
          type="button"
          role="status"
          aria-live="polite"
          aria-label={`${stageTipToast}（撳關閉）`}
          onClick={() => setStageTipToast(null)}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-2.5 rounded-2xl bg-indigo-700 text-white text-xs font-bold shadow-xl animate-fade-in text-center max-w-[92%] leading-snug active:scale-[0.98]"
        >
          {stageTipToast}
        </button>
      )}

      {speedToast && (
        <button
          type="button"
          onClick={() => setSpeedToast(null)}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-3 py-1.5 rounded-full bg-violet-700 text-white text-xs font-black shadow-xl animate-fade-in active:scale-[0.98]"
        >
          {speedToast}
        </button>
      )}

      {leaveConfirmOpen && (
        <div
          className="absolute inset-0 z-[65] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pb-safe animate-fade-in"
          onClick={() => setLeaveConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-5 pt-3 text-slate-800"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              const dy = endY - startY;
              if (dy > 64) {
                setLeaveConfirmOpen(false);
                return;
              }
              if (dy < -56) {
                leaveToHome();
                try {
                  if (navigator.vibrate) navigator.vibrate(10);
                } catch {
                  /* ignore */
                }
              }
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <p className="sm:hidden text-[10px] font-bold text-slate-400 text-center -mt-1 mb-2">上滑返回路徑 · 下滑繼續練</p>
            <h2 id="leave-confirm-title" className="text-lg font-black tracking-wide">
              返回學習路徑？
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
              課程尚未完成，進度已自動保存。之後可喺路徑頁「繼續未完成課」。
            </p>
            {currentWord && (
              <button
                type="button"
                onClick={() => {
                  replayCorrectPronunciation({ extraSlow: true });
                  try {
                    if (navigator.vibrate) navigator.vibrate(8);
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerDown={(e) => {
                  const target = e.currentTarget;
                  target.dataset.slowHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.slowHold = '1';
                    const w = currentWordRef.current?.hanzi;
                    if (w) speakHanzi(w, { voices, rate: 0.5 });
                    try {
                      if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
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
                className="mt-3 w-full rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-left active:scale-[0.99]"
                title="點慢聽 · 長按極慢"
              >
                <div className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                  目前進度 · {globalIndex + 1}/{dictionary.length}
                  {sessionAttempts > 0
                    ? ` · 正確率 ${Math.round((sessionCorrect / sessionAttempts) * 100)}%`
                    : ''}
                  {' · 點慢聽'}
                </div>
                <div className="text-base font-black text-slate-800 mt-0.5 truncate">{currentWord.hanzi}</div>
                <div className="text-xs font-mono text-slate-400 truncate">{currentWord.pinyin}</div>
              </button>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
              <button
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.98]"
              >
                繼續練習
              </button>
              <button
                type="button"
                onClick={leaveToHome}
                className="flex-1 py-3 rounded-2xl bg-indigo-500 text-white font-black hover:bg-indigo-600 active:scale-[0.98]"
              >
                返回路徑
              </button>
            </div>
          </div>
        </div>
      )}

      {skipConfirmOpen && (
        <div
          className="absolute inset-0 z-[65] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pb-safe animate-fade-in"
          onClick={() => setSkipConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-5 pt-3 text-slate-800"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              const dy = endY - startY;
              if (dy > 64) {
                setSkipConfirmOpen(false);
                return;
              }
              if (dy < -56) {
                handleSkipWord();
                try {
                  if (navigator.vibrate) navigator.vibrate(10);
                } catch {
                  /* ignore */
                }
              }
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <p className="sm:hidden text-[10px] font-bold text-slate-400 text-center -mt-1 mb-2">上滑確定跳過 · 下滑取消</p>
            <h2 id="skip-confirm-title" className="text-lg font-black tracking-wide">
              跳過呢題？
            </h2>
            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
              跳過會當做錯、計入本課正確率。想聽清楚可以撳「再聽」再跟。
            </p>
            {currentWord && (
              <button
                type="button"
                onClick={() => {
                  replayCorrectPronunciation({ extraSlow: true });
                  try {
                    if (navigator.vibrate) navigator.vibrate(8);
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerDown={(e) => {
                  const target = e.currentTarget;
                  target.dataset.slowHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.slowHold = '1';
                    const w = currentWordRef.current?.hanzi;
                    if (w) speakHanzi(w, { voices, rate: 0.5 });
                    try {
                      if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
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
                className="mt-3 w-full rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-center active:scale-[0.99]"
                title="點慢聽 · 長按極慢"
              >
                <div className="text-[10px] font-black tracking-wider text-amber-600/80 uppercase">
                  第 {globalIndex + 1} 題 · 點慢聽
                </div>
                <div className="text-xl font-black text-amber-950 mt-0.5 truncate">{currentWord.hanzi}</div>
                <div className="text-xs font-mono text-amber-700/70 truncate">{currentWord.pinyin}</div>
              </button>
            )}
            <div className="flex flex-col gap-2 mt-5">
              <button
                type="button"
                onClick={() => {
                  setSkipConfirmOpen(false);
                  replayCorrectPronunciation({ extraSlow: true });
                  try {
                    if (navigator.vibrate) navigator.vibrate(8);
                  } catch {
                    /* ignore */
                  }
                }}
                className="w-full py-3 rounded-2xl bg-indigo-50 border border-indigo-200 font-black text-indigo-800 active:scale-[0.98] inline-flex items-center justify-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" /> 先慢聽再跟
              </button>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setSkipConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.98]"
              >
                唔跳
              </button>
              <button
                type="button"
                onClick={handleSkipWord}
                className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-black hover:bg-amber-600 active:scale-[0.98]"
              >
                確定跳過
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showShortcutsHelp && (
        <div
          className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4 pb-safe sm:pb-4 animate-fade-in"
          onClick={() => setShowShortcutsHelp(false)}
          role="dialog"
          aria-label="練習說明"
        >
          <div
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-white/15 p-5 pt-3 text-left shadow-2xl sm:mb-0"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              if (endY - startY > 64) setShowShortcutsHelp(false);
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25 sm:hidden" aria-hidden />
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-lg text-white">練習說明</h3>
              <button
                type="button"
                className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1"
                onClick={() => setShowShortcutsHelp(false)}
              >
                關閉
              </button>
            </div>
            <ul className="space-y-2 text-sm text-slate-200 md:hidden">
              <li>藍色大掣：開始／暫停 · 長按可重播本題；跳過掣長按可直接跳過</li>
              <li>底欄有語速／加時／偷看／再聽；「再聽」可長按慢速</li>
              <li>頂欄「聽／讀」、眼睛圖示：盲跟；語速掣可「試聽本句」</li>
              <li>頂部進度條可點開詞庫跳題</li>
              <li>暫停時左右滑可換題（唔計跳過）</li>
              <li>示範中可「跳過示範」；準備／答對／答錯等待都可立即繼續</li>
              <li>跟讀緊可撳「加時」、雙擊／長按咪圖；盲跟可「偷看」（長按更久）或雙擊漢字區</li>
              <li>課完畫面：下滑回路徑 · 上滑分享 · 過關左滑下一課 · 未過關右滑慢速重練</li>
              <li>判定區可上滑繼續；分析中可撳跳過等待</li>
              <li>未聽到聲時睇麥克風條 · 靠近咪再試</li>
              <li>系統返回鍵：先關彈窗，再離開練習</li>
              <li>跳過會計入本課正確率</li>
            </ul>
            <ul className="space-y-1.5 text-sm text-slate-200 hidden md:block">
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
        <div
          className="absolute inset-0 z-[55] bg-slate-950/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 pb-safe animate-fade-in"
          onClick={() => setPausedByHide(false)}
        >
          <div
            role="dialog"
            aria-labelledby="paused-hide-title"
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 text-white shadow-2xl p-5 pt-3"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              const dy = endY - startY;
              if (dy > 64) {
                setPausedByHide(false);
                return;
              }
              if (dy < -56) {
                setPausedByHide(false);
                void togglePlayPause();
                try {
                  if (navigator.vibrate) navigator.vibrate(10);
                } catch {
                  /* ignore */
                }
              }
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25 sm:hidden" aria-hidden />
            <p className="sm:hidden text-[10px] font-bold text-white/45 text-center -mt-1 mb-2">上滑繼續 · 下滑關閉</p>
            <h2 id="paused-hide-title" className="text-lg font-black tracking-wide">
              已暫停
            </h2>
            <p className="text-sm text-white/70 font-medium mt-1.5 leading-relaxed">
              離開畫面時自動停咗，進度仲喺。返嚟撳繼續就可以跟讀。
            </p>
            {currentWord && (
              <button
                type="button"
                onClick={() => {
                  replayCorrectPronunciation({ extraSlow: true });
                  try {
                    if (navigator.vibrate) navigator.vibrate(8);
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerDown={(e) => {
                  const target = e.currentTarget;
                  target.dataset.slowHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.slowHold = '1';
                    const w = currentWordRef.current?.hanzi;
                    if (w) speakHanzi(w, { voices, rate: 0.5 });
                    try {
                      if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
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
                className="mt-3 w-full rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5 text-center active:scale-[0.99]"
                title="點慢聽 · 長按極慢"
              >
                <div className="text-[10px] font-black tracking-wider text-white/50 uppercase">本題 · 點慢聽 · 長按極慢</div>
                <div className="text-xl font-black mt-0.5 truncate">{currentWord.hanzi}</div>
                <div className="text-xs font-mono text-white/55 truncate">{currentWord.pinyin}</div>
              </button>
            )}
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 font-black text-base py-3.5 rounded-2xl active:scale-[0.98]"
                onClick={() => {
                  setPausedByHide(false);
                  void togglePlayPause();
                  try {
                    if (navigator.vibrate) navigator.vibrate(10);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <Play className="w-5 h-5" fill="currentColor" /> 繼續練習
              </button>
              <button
                type="button"
                className="w-full py-3 rounded-2xl border border-white/20 font-bold text-white/80 active:scale-[0.98]"
                onClick={() => setPausedByHide(false)}
              >
                稍後
              </button>
            </div>
          </div>
        </div>
      )}

      {lessonCompleteBanner && (
        <div
          className={`absolute inset-0 z-50 text-white flex flex-col items-center justify-center gap-3 animate-fade-in px-6 text-center pt-safe pb-safe overflow-y-auto ${
            lessonCompleteBanner.passed ? 'bg-emerald-600/95' : 'bg-amber-700/95'
          }`}
          onTouchStart={(e) => {
            swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            swipeStartXRef.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = swipeStartYRef.current;
            const startX = swipeStartXRef.current;
            swipeStartYRef.current = null;
            swipeStartXRef.current = null;
            if (startY == null || startX == null) return;
            const endY = e.changedTouches[0]?.clientY ?? startY;
            const endX = e.changedTouches[0]?.clientX ?? startX;
            const dy = endY - startY;
            const dx = endX - startX;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (dy > 72 && absDy > absDx * 1.4) {
              setLessonCompleteBanner(null);
              setScreen('home');
              setActivePractice(null);
              return;
            }

            if (dy < -72 && absDy > absDx * 1.4) {
              const b = lessonCompleteBanner;
              const text = `我喺 Pinyin Master 練緊「${b.title}」· 正確率 ${b.accuracy}%（${b.correct}/${b.total}）· 繼續加油！ #PinyinMaster`;
              void (async () => {
                try {
                  if (navigator.share) {
                    await navigator.share({ title: 'Pinyin Master', text });
                    return;
                  }
                } catch {
                  /* cancelled */
                }
                try {
                  await navigator.clipboard.writeText(text);
                  setStageTipToast('進度文案已複製');
                  window.setTimeout(() => setStageTipToast(null), 2200);
                } catch {
                  setStageTipToast(text);
                  window.setTimeout(() => setStageTipToast(null), 4000);
                }
              })();
              try {
                if (navigator.vibrate) navigator.vibrate(10);
              } catch {
                /* ignore */
              }
              return;
            }

            if (absDx < 72 || absDx < absDy * 1.35) return;

            if (dx < 0 && lessonCompleteBanner.passed) {
              const id = lessonCompleteBanner.lessonId;
              const completed = id
                ? [...new Set([...pathProgress.completedLessons, id])]
                : pathProgress.completedLessons;
              const next = recommendNextLesson(completed, id);
              if (next.id !== id) {
                setLessonCompleteBanner(null);
                startLesson(next, 0);
                try {
                  if (navigator.vibrate) navigator.vibrate(10);
                } catch {
                  /* ignore */
                }
              }
              return;
            }

            if (dx > 0 && !lessonCompleteBanner.passed) {
              const id = lessonCompleteBanner.lessonId;
              setLessonCompleteBanner(null);
              if (id) {
                const lesson = getLesson(id);
                if (lesson) {
                  setTtsSpeed(0.7);
                  saveSettings({ ttsSpeed: 0.7 });
                  setSpeedToast('已調慢語速 0.70x · 重練');
                  window.setTimeout(() => setSpeedToast(null), 2200);
                  startLesson(lesson, 0);
                  try {
                    if (navigator.vibrate) navigator.vibrate(10);
                  } catch {
                    /* ignore */
                  }
                }
              }
            }
          }}
        >
          <div className="my-auto w-full max-w-md flex flex-col items-center gap-3 py-6">
          <div className="h-1 w-10 rounded-full bg-white/35 mb-1 sm:hidden" aria-hidden />
          <p className="text-[10px] font-bold text-white/55 tracking-wide sm:hidden -mt-1 mb-1">
            下滑回路徑 · 上滑分享
            {lessonCompleteBanner.passed ? ' · 左滑下一課' : ' · 右滑慢速重練'}
          </p>
          <CheckCircle2 className="w-16 h-16 shrink-0" />
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
              <button
                type="button"
                className="text-2xl tracking-widest text-amber-200 animate-pulse active:scale-95"
                aria-label={`${stars} 星${lessonCompleteBanner.passed ? ' · 點擊分享' : ''}`}
                title={lessonCompleteBanner.passed ? '點擊分享過關' : undefined}
                onClick={async () => {
                  if (!lessonCompleteBanner.passed) return;
                  const b = lessonCompleteBanner;
                  const text = `我喺 Pinyin Master 過關「${b.title}」· ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · 正確率 ${b.accuracy}% #PinyinMaster`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: 'Pinyin Master', text });
                      return;
                    }
                  } catch {
                    /* cancelled */
                  }
                  try {
                    await navigator.clipboard.writeText(text);
                    setStageTipToast('過關文案已複製');
                    window.setTimeout(() => setStageTipToast(null), 2200);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
              </button>
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
                : (() => {
                    const need = passAccuracyForLesson(lessonCompleteBanner.lessonId);
                    const gap = Math.max(0, need - lessonCompleteBanner.accuracy);
                    return `正確率 ${lessonCompleteBanner.accuracy}% · 過關要 ≥${need}%${
                      gap > 0 ? `（仲差約 ${gap} 百分點）` : ''
                    }。建議調慢語速、對住聲調曲線跟讀。`;
                  })()}
            </p>
          )}
          {lessonCompleteBanner.passed ? (
            <div className="flex flex-wrap gap-2 justify-center mt-2 w-full max-w-sm sm:max-w-none px-1 pb-2 sm:pb-0">
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
                    className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-white text-emerald-800 font-black text-sm sm:text-base shadow-lg active:scale-[0.98]"
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
                    <span className="opacity-60 font-bold"> · {next.minutes} 分</span>
                  </button>
                    ) : null}
                    {id && scenePackForLessonId(id) && (
                      <button
                        type="button"
                        className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-emerald-950/30 border border-white/40 font-black active:scale-[0.98]"
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
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-white/15 border border-white/30 font-bold active:scale-[0.98]"
                onClick={() => {
                  setLessonCompleteBanner(null);
                  setScreen('home');
                  setActivePractice(null);
                }}
              >
                返回路徑
              </button>
              <button
                type="button"
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-emerald-950/25 border border-white/35 font-black inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
                onClick={async () => {
                  const b = lessonCompleteBanner;
                  const text = `我喺 Pinyin Master 過關「${b.title}」· 正確率 ${b.accuracy}%（${b.correct}/${b.total}）· 連續 ${pathProgress.streak} 日！ #PinyinMaster`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: 'Pinyin Master', text });
                      return;
                    }
                  } catch {
                    /* cancelled */
                  }
                  try {
                    await navigator.clipboard.writeText(text);
                    setStageTipToast('過關文案已複製');
                    window.setTimeout(() => setStageTipToast(null), 2200);
                  } catch {
                    setStageTipToast(text);
                    window.setTimeout(() => setStageTipToast(null), 4000);
                  }
                }}
              >
                <Share2 className="w-4 h-4" /> 分享過關
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 mt-2 w-full max-w-sm sm:max-w-md px-1 pb-2">
              {(lessonCompleteBanner.mistakeWords?.length ?? 0) > 0 && (
                <div className="w-full rounded-2xl bg-black/15 border border-white/20 p-3 text-left">
                  <div className="text-[10px] font-black tracking-wider uppercase text-amber-100/80 mb-2">
                    本課失手 · 撳字慢聽 · 長按極慢
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lessonCompleteBanner.mistakeWords!.slice(0, 12).map((raw) => {
                      const w = parseWord(raw);
                      return (
                        <button
                          key={raw}
                          type="button"
                          onClick={() => {
                            speakHanzi(w.hanzi, { voices, rate: 0.65 });
                            try {
                              if (navigator.vibrate) navigator.vibrate(8);
                            } catch {
                              /* ignore */
                            }
                          }}
                          onPointerDown={(e) => {
                            const target = e.currentTarget;
                            target.dataset.slowHold = '0';
                            const timer = window.setTimeout(() => {
                              target.dataset.slowHold = '1';
                              speakHanzi(w.hanzi, { voices, rate: 0.5 });
                              try {
                                if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
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
                          className="inline-flex items-center gap-1 text-sm font-black bg-white/95 text-amber-950 px-2.5 py-1.5 rounded-xl active:scale-95"
                          title="點聽 · 長按極慢"
                        >
                          <Volume2 className="w-3.5 h-3.5 opacity-70" />
                          {w.hanzi}
                        </button>
                      );
                    })}
                    {lessonCompleteBanner.mistakeWords!.length > 12 && (
                      <span className="text-[11px] font-bold text-white/60 self-center">
                        +{lessonCompleteBanner.mistakeWords!.length - 12}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-center w-full">
              {(lessonCompleteBanner.mistakeWords?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-white text-amber-900 font-black active:scale-[0.98] shadow-lg"
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
                className="flex-1 min-w-[8rem] px-5 py-3 rounded-2xl bg-white/90 text-amber-800 font-black active:scale-[0.98]"
                onClick={() => {
                  const id = lessonCompleteBanner.lessonId;
                  setLessonCompleteBanner(null);
                  if (id) {
                    const lesson = getLesson(id);
                    if (lesson) {
                      setTtsSpeed(0.7);
                      saveSettings({ ttsSpeed: 0.7 });
                      setSpeedToast('已調慢語速 0.70x · 重練');
                      window.setTimeout(() => setSpeedToast(null), 2200);
                      startLesson(lesson, 0);
                    }
                  }
                }}
              >
                慢速重練
              </button>
              <button
                type="button"
                className="flex-1 min-w-[8rem] px-5 py-3 rounded-2xl bg-white/20 border border-white/30 text-white font-bold active:scale-[0.98]"
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
                className="w-full px-5 py-3 rounded-2xl bg-white/15 border border-white/30 font-bold active:scale-[0.98]"
                onClick={() => {
                  setLessonCompleteBanner(null);
                  setScreen('home');
                  setActivePractice(null);
                }}
              >
                返回路徑
              </button>
              <button
                type="button"
                className="w-full px-5 py-3 rounded-2xl bg-amber-950/30 border border-white/35 font-black inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
                onClick={async () => {
                  const b = lessonCompleteBanner;
                  const text = `我喺 Pinyin Master 練緊「${b.title}」· 正確率 ${b.accuracy}%（${b.correct}/${b.total}）· 繼續加油！ #PinyinMaster`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: 'Pinyin Master', text });
                      return;
                    }
                  } catch {
                    /* cancelled */
                  }
                  try {
                    await navigator.clipboard.writeText(text);
                    setStageTipToast('進度文案已複製');
                    window.setTimeout(() => setStageTipToast(null), 2200);
                  } catch {
                    setStageTipToast(text);
                    window.setTimeout(() => setStageTipToast(null), 4000);
                  }
                }}
              >
                <Share2 className="w-4 h-4" /> 分享本次練習
              </button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {!speechSupported && !browserWarningDismissed && (
        <div
          className="absolute inset-0 z-40 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-start justify-center sm:justify-stretch p-0 sm:p-0 animate-fade-in"
          onClick={() => setBrowserWarningDismissed(true)}
        >
          <div
            className="w-full sm:absolute sm:inset-x-0 sm:top-0 bg-amber-50 border border-amber-200 sm:border-b sm:border-x-0 rounded-t-3xl sm:rounded-none px-4 py-4 pt-3 sm:pt-safe pb-safe sm:pb-3 shadow-2xl sm:shadow-none max-w-lg sm:max-w-none mx-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              if (endY - startY > 56) setBrowserWarningDismissed(true);
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-amber-300/80 sm:hidden" aria-hidden />
            <p className="sm:hidden text-[10px] font-bold text-amber-700/70 text-center -mt-1 mb-2">下滑關閉</p>
            <div className="flex items-start gap-3">
              <div className="flex-1 text-sm text-amber-900 font-medium leading-snug">
                <p className="font-black mb-1">此瀏覽器唔支援語音評分</p>
                <ol className="list-decimal pl-4 space-y-1 text-[13px] font-bold text-amber-800/90">
                  <li>改用 Chrome、Edge 或 Safari</li>
                  <li>用 HTTPS／主畫面 App 開啟</li>
                  <li>允許麥克風權限</li>
                </ol>
              </div>
              <button
                type="button"
                onClick={() => setBrowserWarningDismissed(true)}
                className="p-2 text-amber-700 bg-amber-100/80 rounded-xl shrink-0 active:scale-95"
                aria-label="關閉提示"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {micDenied && speechSupported && (
        <div
          className="absolute inset-0 z-40 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-start justify-center animate-fade-in"
          onClick={() => setMicDenied(false)}
        >
          <div
            role="dialog"
            aria-labelledby="mic-denied-title"
            className="w-full sm:absolute sm:inset-x-0 sm:top-0 bg-rose-50 border border-rose-200 sm:border-b sm:border-x-0 rounded-t-3xl sm:rounded-none px-4 py-4 pt-3 sm:pt-safe pb-safe sm:pb-3 shadow-2xl sm:shadow-none max-w-lg sm:max-w-none mx-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              swipeStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = swipeStartYRef.current;
              swipeStartYRef.current = null;
              if (startY == null) return;
              const endY = e.changedTouches[0]?.clientY ?? startY;
              if (endY - startY > 56) setMicDenied(false);
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rose-300/80 sm:hidden" aria-hidden />
            <p className="sm:hidden text-[10px] font-bold text-rose-700/70 text-center -mt-1 mb-2">下滑關閉</p>
            <h2 id="mic-denied-title" className="text-base font-black text-rose-900 mb-1">
              需要麥克風先可以評分
            </h2>
            <ol className="list-decimal pl-4 space-y-1 text-[13px] font-bold text-rose-800/90 mb-3">
              <li>撳網址列左邊嘅鎖頭／Aa</li>
              <li>將「麥克風」設為允許</li>
              <li>返嚟撳「再試」</li>
            </ol>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMicDenied(false);
                  void togglePlayPause();
                }}
                className="flex-1 text-sm font-black text-white bg-rose-500 py-3 rounded-2xl active:scale-[0.98]"
              >
                再試
              </button>
              <button
                type="button"
                onClick={() => setMicDenied(false)}
                className="px-4 text-sm font-bold text-rose-700 bg-rose-100/80 rounded-2xl active:scale-[0.98]"
              >
                稍後
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex-none w-full max-w-5xl mx-auto flex items-center justify-between p-3 md:p-4 md:px-6 pt-safe z-20 gap-1.5 md:gap-2">
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          <button
            type="button"
            onClick={backToHome}
            className="px-2 py-2 md:p-2.5 rounded-xl border shadow-sm bg-white text-slate-600 hover:bg-slate-100 flex items-center gap-1 active:scale-95"
            title="返回學習路徑"
            aria-label="返回學習路徑"
          >
            <Home className="w-4 h-4" />
            <span className="text-[11px] font-black md:hidden">路徑</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDictPage(Math.floor(globalIndex / WORDS_PER_PAGE));
              setShowDictionary(true);
            }}
            onPointerDown={() => {
              if (!currentWord) return;
              copyWordHoldTriggeredRef.current = false;
              if (copyWordHoldTimerRef.current) clearTimeout(copyWordHoldTimerRef.current);
              copyWordHoldTimerRef.current = setTimeout(async () => {
                copyWordHoldTriggeredRef.current = true;
                const text = `${currentWord.hanzi} ${currentWord.pinyin}`.trim();
                try {
                  await navigator.clipboard.writeText(text);
                  setStageTipToast('已複製本題');
                  window.setTimeout(() => setStageTipToast(null), 1600);
                  if (navigator.vibrate) navigator.vibrate(8);
                } catch {
                  setStageTipToast('複製失敗');
                  window.setTimeout(() => setStageTipToast(null), 1600);
                }
              }, 480);
            }}
            onPointerUp={() => {
              if (copyWordHoldTimerRef.current) {
                clearTimeout(copyWordHoldTimerRef.current);
                copyWordHoldTimerRef.current = null;
              }
            }}
            onPointerLeave={() => {
              if (copyWordHoldTimerRef.current) {
                clearTimeout(copyWordHoldTimerRef.current);
                copyWordHoldTimerRef.current = null;
              }
            }}
            onPointerCancel={() => {
              if (copyWordHoldTimerRef.current) {
                clearTimeout(copyWordHoldTimerRef.current);
                copyWordHoldTimerRef.current = null;
              }
            }}
            onClickCapture={(e) => {
              if (copyWordHoldTriggeredRef.current) {
                e.preventDefault();
                e.stopPropagation();
                copyWordHoldTriggeredRef.current = false;
              }
            }}
            className="flex items-center gap-1.5 md:gap-2 bg-white px-2.5 md:px-3 py-2 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 active:scale-95 transition-all text-blue-600 font-bold min-w-0"
            title="點開詞庫 · 長按複製本題"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span className="text-xs tracking-wider truncate min-w-0">
              <span className="tabular-nums">{Math.min(globalIndex + 1, dictionary.length)}/{dictionary.length}</span>
              <span className="hidden sm:inline">
                {activePractice ? ` · ${activePractice.title}` : isCustomMode ? ' · 自訂' : ' · 詞'}
              </span>
              <span className="sm:hidden text-slate-400">
                {activePractice ? ` · ${activePractice.title.slice(0, 6)}${activePractice.title.length > 6 ? '…' : ''}` : isCustomMode ? ' · 自訂' : ''}
              </span>
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
              <button
                type="button"
                onClick={() => {
                  if (copyWordHoldTriggeredRef.current) {
                    copyWordHoldTriggeredRef.current = false;
                    return;
                  }
                  setShowSpeedPanel(true);
                  setStageTipToast(
                    comboStreak >= 10
                      ? '連對 10+ · 可試快啲語速'
                      : comboStreak >= 5
                        ? '連對 5+ · 可微調語速挑戰'
                        : '連對中 · 保持節奏',
                  );
                  window.setTimeout(() => setStageTipToast(null), 2200);
                }}
                onPointerDown={() => {
                  copyWordHoldTriggeredRef.current = false;
                  if (copyWordHoldTimerRef.current) clearTimeout(copyWordHoldTimerRef.current);
                  copyWordHoldTimerRef.current = setTimeout(async () => {
                    copyWordHoldTriggeredRef.current = true;
                    const text = `我喺 Pinyin Master 連對 ${comboStreak} 題！ #PinyinMaster`;
                    try {
                      if (navigator.share) {
                        await navigator.share({ title: 'Pinyin Master', text });
                        return;
                      }
                    } catch {
                      /* cancelled */
                    }
                    try {
                      await navigator.clipboard.writeText(text);
                      setStageTipToast('連對文案已複製');
                      window.setTimeout(() => setStageTipToast(null), 2000);
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }, 480);
                }}
                onPointerUp={() => {
                  if (copyWordHoldTimerRef.current) {
                    clearTimeout(copyWordHoldTimerRef.current);
                    copyWordHoldTimerRef.current = null;
                  }
                }}
                onPointerLeave={() => {
                  if (copyWordHoldTimerRef.current) {
                    clearTimeout(copyWordHoldTimerRef.current);
                    copyWordHoldTimerRef.current = null;
                  }
                }}
                onPointerCancel={() => {
                  if (copyWordHoldTimerRef.current) {
                    clearTimeout(copyWordHoldTimerRef.current);
                    copyWordHoldTimerRef.current = null;
                  }
                }}
                className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md font-black animate-pulse active:scale-95"
                title="點開語速 · 長按分享連對"
              >
                連對 {comboStreak}{comboStreak >= 10 ? ' · 火熱' : comboStreak >= 5 ? ' · 語速↑' : ''}
              </button>
            )}
            {accuracy != null && (
              <span className="hidden sm:inline text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                {accuracy}%
              </span>
            )}
            {offline && (
              <button
                type="button"
                onClick={() => {
                  setStageTipToast(
                    isPlaying
                      ? '離線中 · 本地仍可練，語音辨識可能唔穩'
                      : '離線中 · 本地進度仍可儲存',
                  );
                  window.setTimeout(() => setStageTipToast(null), 2400);
                }}
                className={`inline-flex items-center gap-0.5 text-[10px] border px-1.5 py-0.5 rounded-md shrink-0 active:scale-95 ${
                  isPlaying
                    ? 'text-amber-800 bg-amber-100 border-amber-300 font-black'
                    : 'text-amber-700 bg-amber-50 border-amber-200 font-bold'
                }`}
                title="本地進度仍可儲存；語音辨識多數需要網絡"
              >
                <WifiOff className="w-3 h-3" /> {isPlaying ? '辨識可能唔穩' : '離線'}
              </button>
            )}
            {wakeLockOn && isPlaying && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await wakeLockRef.current?.release();
                    } catch {
                      /* ignore */
                    }
                    wakeLockRef.current = null;
                    setWakeLockOn(false);
                    setStageTipToast('已關常亮 · 螢幕可自動暗');
                    window.setTimeout(() => setStageTipToast(null), 2200);
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  })();
                }}
                className="inline-flex items-center gap-0.5 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-md font-bold shrink-0 active:scale-95"
                title="點擊關閉螢幕常亮"
              >
                常亮 · 可關
              </button>
            )}
            {isSavedPulse && (
              <button
                type="button"
                onClick={() => {
                  setIsSavedPulse(false);
                  setStageTipToast('進度已存本地 · 唔會自動上傳');
                  window.setTimeout(() => setStageTipToast(null), 2000);
                }}
                className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md font-black shrink-0 animate-pulse active:scale-95"
                title="進度已自動儲存"
              >
                <Save className="w-3 h-3" /> 已存
              </button>
            )}
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
              setStageTipToast(next ? '先聽：每題先播示範再跟讀' : '先讀：直接開口跟讀');
              window.setTimeout(() => setStageTipToast(null), 2200);
            }}
            onPointerDown={(e) => {
              const target = e.currentTarget;
              target.dataset.helpHold = '0';
              const timer = window.setTimeout(() => {
                target.dataset.helpHold = '1';
                setShowShortcutsHelp(true);
                try {
                  if (navigator.vibrate) navigator.vibrate(10);
                } catch {
                  /* ignore */
                }
              }, 520);
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
              if (e.currentTarget.dataset.helpHold === '1') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.dataset.helpHold = '0';
              }
            }}
            className={`px-2.5 sm:px-3 py-2 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 gap-1 sm:gap-1.5 font-bold text-[11px] sm:text-xs ${
              autoPreRead ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
            title="切換先聽或先讀 · 長按練習說明"
          >
            {autoPreRead ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="sm:hidden">{autoPreRead ? '聽' : '讀'}</span>
            <span className="hidden sm:inline">{autoPreRead ? '先聽' : '先讀'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (lessonForceBlind) {
                setStageTipToast('本課係耳口模式，跟讀時會隱藏漢字');
                window.setTimeout(() => setStageTipToast(null), 2200);
                return;
              }
              const next = !isBlindMode;
              setIsBlindMode(next);
              saveSettings({ blindMode: next });
              setStageTipToast(next ? '盲跟已開：跟讀時隱藏漢字' : '盲跟已關');
              window.setTimeout(() => setStageTipToast(null), 2200);
            }}
            className={`px-2 md:p-2.5 py-2 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 gap-1 ${
              isBlindMode || lessonForceBlind
                ? 'bg-orange-50 border-orange-200 text-orange-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
            title={
              lessonForceBlind
                ? '本課強制耳口盲跟（跟讀時隱藏漢字）'
                : '盲讀模式（朗讀時隱藏拼音與漢字）'
            }
            aria-label={isBlindMode || lessonForceBlind ? '盲跟開啟' : '盲跟關閉'}
          >
            {isBlindMode || lessonForceBlind ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="text-[11px] font-black md:hidden">
              {isBlindMode || lessonForceBlind ? '盲跟' : '看字'}
            </span>
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
              <span className="ml-1 text-[10px] sm:text-xs font-black tabular-nums">{ttsSpeed.toFixed(2)}x</span>
            </button>
            {showSpeedPanel && (() => {
              const speedControls = (
                <>
                  <div className="flex items-center justify-between mb-3 md:mb-2">
                    <div className="text-sm md:text-[10px] font-black md:font-bold text-slate-700 md:text-slate-400 tracking-wider">
                      示範語速
                    </div>
                    <button
                      type="button"
                      className="md:hidden text-xs font-bold text-slate-400 px-2 py-1"
                      onClick={() => setShowSpeedPanel(false)}
                    >
                      完成
                    </button>
                  </div>
                  <div className="flex gap-1.5 mb-3 md:mb-2">
                    {[
                      { label: '極慢', value: 0.55 },
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
                          try {
                            if (navigator.vibrate) navigator.vibrate(8);
                          } catch {
                            /* ignore */
                          }
                          // Preview at the new rate without closing the panel
                          const word = currentWordRef.current?.hanzi;
                          if (word) {
                            speakHanzi(word, {
                              voices,
                              rate: rateForLessonContext({
                                ttsSpeed: preset.value,
                                stageId: activePracticeRef.current?.lessonId
                                  ? getLesson(activePracticeRef.current.lessonId)?.stageId
                                  : undefined,
                                kind: activePracticeRef.current?.lessonId
                                  ? getLesson(activePracticeRef.current.lessonId)?.kind
                                  : undefined,
                              }),
                            });
                            setSpeedToast(`試聽 ${preset.value.toFixed(2)}x`);
                            window.setTimeout(() => setSpeedToast(null), 1200);
                          }
                        }}
                        className={`flex-1 text-sm md:text-xs font-black py-3 md:py-2.5 sm:py-1.5 rounded-xl md:rounded-lg border transition active:scale-95 ${
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
                  <button
                    type="button"
                    onClick={() => {
                      replayCorrectPronunciation();
                      setSpeedToast(`試聽 ${ttsSpeed.toFixed(2)}x`);
                      window.setTimeout(() => setSpeedToast(null), 1400);
                    }}
                    onPointerDown={(e) => {
                      const target = e.currentTarget;
                      target.dataset.slowHold = '0';
                      const timer = window.setTimeout(() => {
                        target.dataset.slowHold = '1';
                        const word = currentWordRef.current?.hanzi;
                        if (word) {
                          speakHanzi(word, { voices, rate: 0.55 });
                          setSpeedToast('極慢試聽 0.55x');
                          window.setTimeout(() => setSpeedToast(null), 1400);
                        }
                        try {
                          if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
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
                    className="mt-3 md:mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-sm md:text-xs font-black text-violet-800 bg-violet-50 border border-violet-200 py-3 md:py-2.5 rounded-xl md:rounded-lg active:scale-95 hover:bg-violet-100 transition"
                    title="點試聽 · 長按極慢"
                  >
                    <Volume2 className="w-4 h-4 md:w-3.5 md:h-3.5" /> 試聽本句 · 長按極慢
                  </button>
                </>
              );
              return (
                <>
                  <div
                    className="md:hidden fixed inset-0 z-[60] bg-slate-950/50 backdrop-blur-sm animate-fade-in"
                    onClick={() => setShowSpeedPanel(false)}
                    role="presentation"
                  >
                    <div
                      data-speed-panel
                      role="dialog"
                      aria-label="調整語速"
                      className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white border-t border-slate-200 shadow-2xl p-5 pb-safe"
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={(e) => {
                        swipeStartYRef.current = e.touches[0]?.clientY ?? null;
                      }}
                      onTouchEnd={(e) => {
                        const startY = swipeStartYRef.current;
                        swipeStartYRef.current = null;
                        if (startY == null) return;
                        const endY = e.changedTouches[0]?.clientY ?? startY;
                        if (endY - startY > 64) setShowSpeedPanel(false);
                      }}
                    >
                      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" aria-hidden />
                      <p className="md:hidden text-[10px] font-bold text-slate-400 text-center -mt-1 mb-2">
                        撳預設會試聽 · 下滑關閉
                      </p>
                      {speedControls}
                    </div>
                  </div>
                  <div
                    data-speed-panel
                    className="hidden md:block absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-30"
                  >
                    {speedControls}
                  </div>
                </>
              );
            })()}
          </div>

          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="hidden md:flex bg-white text-slate-600 p-2 md:p-2.5 rounded-xl border border-slate-200 shadow-sm items-center hover:bg-slate-100 active:scale-95 transition-all"
            title="自訂詞句"
            aria-label="自訂詞句"
          >
            <FileEdit className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="hidden md:flex bg-white text-slate-600 px-2.5 py-2 md:p-2.5 rounded-xl border border-slate-200 shadow-sm items-center gap-1 hover:bg-slate-100 active:scale-95 transition-all"
            title="發音診斷中心"
            aria-label="發音診斷"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-none px-4 md:px-6 max-w-5xl mx-auto w-full -mt-1 mb-1">
        <button
          type="button"
          className="w-full text-left rounded-xl active:opacity-90"
          onClick={() => {
            if (progressHoldTriggeredRef.current) {
              progressHoldTriggeredRef.current = false;
              return;
            }
            setDictPage(Math.floor(globalIndex / WORDS_PER_PAGE));
            setShowDictionary(true);
          }}
          onPointerDown={() => {
            progressHoldTriggeredRef.current = false;
            if (progressHoldTimerRef.current) clearTimeout(progressHoldTimerRef.current);
            progressHoldTimerRef.current = setTimeout(() => {
              progressHoldTriggeredRef.current = true;
              const isLesson = activePractice?.mode === 'lesson';
              const passAcc = passAccuracyForLesson(activePractice?.lessonId);
              const liveAcc =
                sessionAttempts > 0 ? Math.round((sessionCorrect / sessionAttempts) * 100) : null;
              const leftItems = Math.max(0, dictionary.length - globalIndex);
              const secsPer = activePractice?.earFirst || (lesson && shouldForcePreRead(lesson)) ? 32 : 25;
              const etaMin = Math.max(1, Math.ceil((leftItems * secsPer) / 60));
              setStageTipToast(
                `${globalIndex + 1}/${dictionary.length} · 約剩 ${etaMin} 分${
                  liveAcc != null ? ` · 正確率 ${liveAcc}%` : ''
                }${isLesson ? `（過關 ≥${passAcc}%）` : ''} · 點開詞庫跳題`,
              );
              window.setTimeout(() => setStageTipToast(null), 2800);
              try {
                if (navigator.vibrate) navigator.vibrate(8);
              } catch {
                /* ignore */
              }
            }, 450);
          }}
          onPointerUp={() => {
            if (progressHoldTimerRef.current) {
              clearTimeout(progressHoldTimerRef.current);
              progressHoldTimerRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (progressHoldTimerRef.current) {
              clearTimeout(progressHoldTimerRef.current);
              progressHoldTimerRef.current = null;
            }
          }}
          onPointerCancel={() => {
            if (progressHoldTimerRef.current) {
              clearTimeout(progressHoldTimerRef.current);
              progressHoldTimerRef.current = null;
            }
          }}
          title="點開詞庫 · 長按睇進度摘要"
          aria-label="打開詞庫跳題"
        >
        <div className="h-2 md:h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
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
          const accBarPct = liveAcc == null ? 0 : Math.min(100, liveAcc);
          const accPassing = liveAcc != null && liveAcc >= passAcc;
          const nearPass =
            isLesson && liveAcc != null && !accPassing && liveAcc >= Math.max(0, passAcc - 8);
          return (
            <>
              {isLesson && sessionAttempts > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="block h-1.5 mt-1 w-full bg-slate-200/80 rounded-full overflow-hidden active:opacity-80"
                  title={
                    accPassing
                      ? `正確率 ${liveAcc}% · 已達過關線`
                      : `正確率 ${liveAcc}% · 過關 ≥${passAcc}% · 點擊調慢`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (accPassing) {
                      setStageTipToast(`正確率 ${liveAcc}% · 已達過關 ≥${passAcc}%`);
                      window.setTimeout(() => setStageTipToast(null), 2000);
                      return;
                    }
                    setTtsSpeed(0.7);
                    saveSettings({ ttsSpeed: 0.7 });
                    setShowSpeedPanel(true);
                    setSpeedToast('調慢 0.70x · 穩過關');
                    window.setTimeout(() => setSpeedToast(null), 1800);
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                >
                  <span
                    className={`block h-full transition-all duration-300 ${
                      accPassing ? 'bg-emerald-500' : nearPass ? 'bg-amber-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${accBarPct}%` }}
                  />
                </span>
              )}
              {nearPass && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTtsSpeed(0.7);
                    saveSettings({ ttsSpeed: 0.7 });
                    setStageTipToast(`接近過關 · ${liveAcc}%／≥${passAcc}% · 已調慢`);
                    window.setTimeout(() => setStageTipToast(null), 2200);
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).click();
                    }
                  }}
                  className="mt-1 inline-block text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg active:scale-95"
                >
                  接近過關 · 點一下調慢穩過
                </span>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] md:text-[10px] font-bold text-slate-400 mt-1 tracking-wide">
                <span>
                  {globalIndex + 1}/{dictionary.length} · 約剩 {etaMin} 分鐘
                </span>
                <span
                  role={pathProgress.dailyCorrect >= pathProgress.dailyGoal ? 'button' : undefined}
                  tabIndex={pathProgress.dailyCorrect >= pathProgress.dailyGoal ? 0 : undefined}
                  onClick={(e) => {
                    if (pathProgress.dailyCorrect < pathProgress.dailyGoal) return;
                    e.stopPropagation();
                    setDailyGoalToast(true);
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onKeyDown={(e) => {
                    if (pathProgress.dailyCorrect < pathProgress.dailyGoal) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setDailyGoalToast(true);
                    }
                  }}
                  className={
                    pathProgress.dailyCorrect >= pathProgress.dailyGoal
                      ? 'text-emerald-600 underline decoration-emerald-300 underline-offset-2'
                      : 'text-slate-400'
                  }
                  title={
                    pathProgress.dailyCorrect >= pathProgress.dailyGoal ? '點擊分享今日達標' : undefined
                  }
                >
                  今日 {pathProgress.dailyCorrect}/{pathProgress.dailyGoal}
                  {pathProgress.dailyCorrect >= pathProgress.dailyGoal ? ' ✓ 分享' : ''}
                </span>
                {isLesson && needMore > 0 && sessionAttempts > 0 && (
                  <span
                    className={
                      needMore <= 3
                        ? 'text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md'
                        : ''
                    }
                  >
                    過關至少 {minAttempts} 題 · 還差 {needMore} 次
                  </span>
                )}
                {liveAcc != null && (
                  <span className={isLesson && liveAcc >= passAcc ? 'text-emerald-600' : liveAcc >= 60 ? 'text-emerald-600' : 'text-amber-600'}>
                    正確率 {liveAcc}%{isLesson ? `（過關 ≥${passAcc}%）` : ''}
                  </span>
                )}
                <span className="text-indigo-500 md:hidden">· 點此跳題</span>
              </div>
            </>
          );
        })()}
        </button>
      </div>

      {practiceTip && !practiceTipDismissed && (
        <div
          className="flex-none px-4 md:px-6 max-w-5xl mx-auto w-full -mt-1 mb-2"
          onTouchStart={(e) => {
            swipeStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = swipeStartYRef.current;
            swipeStartYRef.current = null;
            if (startY == null) return;
            const endY = e.changedTouches[0]?.clientY ?? startY;
            if (endY - startY < 48) return;
            setPracticeTipDismissed(true);
            if (activePractice?.lessonId) {
              try {
                sessionStorage.setItem(`pm_tip_dismiss_${activePractice.lessonId}`, '1');
              } catch {
                /* ignore */
              }
            }
          }}
        >
          <div className="flex items-start gap-2 text-[11px] md:text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5 md:py-2">
            <button
              type="button"
              onClick={() => setPracticeTipExpanded((v) => !v)}
              className="flex-1 text-left min-w-0"
              aria-expanded={practiceTipExpanded}
            >
              <p className={`min-w-0 ${practiceTipExpanded ? '' : 'line-clamp-2 md:line-clamp-none'}`}>
                {practiceTip}
              </p>
              <span className="md:hidden text-[10px] font-black text-indigo-400 mt-0.5 inline-block">
                {practiceTipExpanded ? '收起' : '撳開睇全文 · 下滑關閉'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPracticeTipDismissed(true);
                if (activePractice?.lessonId) {
                  try {
                    sessionStorage.setItem(`pm_tip_dismiss_${activePractice.lessonId}`, '1');
                  } catch {
                    /* ignore */
                  }
                }
              }}
              className="shrink-0 p-1 rounded-md text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100"
              aria-label="收起提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col px-4 md:px-6 pb-2 gap-3 md:gap-6 min-h-0 overflow-hidden">
        <div
          className="flex-1 w-full bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row overflow-hidden min-h-0"
          onTouchStart={onPracticeSwipeStart}
          onTouchEnd={onPracticeSwipeEnd}
        >
          <div className="flex-[3] flex flex-col items-center justify-center p-4 sm:p-8 relative min-h-0 overflow-y-auto w-full select-none">
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
              <div className={`mb-3 font-black px-3.5 py-2 rounded-2xl border shadow-sm ${
                shouldHidePinyin
                  ? 'text-amber-900 bg-amber-50 border-amber-200 text-sm md:text-base'
                  : 'text-indigo-700 bg-indigo-50 border-indigo-200 text-xs md:text-sm'
              }`}>
                {lessonHint}
              </div>
            )}
            {activePractice?.subtitle && lessonHint && (
              <div className="mb-2 text-[10px] md:text-xs font-bold text-slate-400 tracking-wider text-center px-4 line-clamp-2">
                {activePractice.subtitle}
              </div>
            )}
            {!shouldHidePinyin && (
              <ToneContour hanzi={currentWord.hanzi} compact={currentWord.hanzi.length > 4} />
            )}
            {activePractice?.subtitle && !lessonHint && (
              <div className="mb-2 text-[10px] md:text-xs font-bold text-slate-400 tracking-wider text-center px-4">
                {activePractice.subtitle}
              </div>
            )}
            {lesson?.kind === 'dictation' && (
              <div className="mb-2 text-[10px] font-black tracking-widest uppercase text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
                聽寫 · 先聽兩次 · 跟讀藏字
              </div>
            )}
            {lessonForceBlind && lesson?.kind !== 'dictation' && (
              <div className="mb-2 text-[10px] font-black tracking-widest uppercase text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
                耳口模式 · 跟讀靠耳朵
              </div>
            )}
            <span
              role={shouldHideHanzi ? 'button' : !shouldHideHanzi ? 'button' : undefined}
              tabIndex={shouldHideHanzi || !shouldHideHanzi ? 0 : undefined}
              onClick={() => {
                if (shouldHideHanzi) {
                  const now = Date.now();
                  if (now - lastBlindTapRef.current < 380) {
                    peekBriefly();
                    lastBlindTapRef.current = 0;
                  } else {
                    lastBlindTapRef.current = now;
                  }
                  return;
                }
                // Visible text: tap to replay demo
                if (phase === 'user_speaking') return;
                replayCorrectPronunciation();
              }}
              onKeyDown={(e) => {
                if (shouldHideHanzi) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    peekBriefly();
                  }
                  return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (phase !== 'user_speaking') replayCorrectPronunciation();
                }
              }}
              aria-label={shouldHideHanzi ? '雙擊偷看漢字' : '撳一下再聽'}
              className={`font-black text-center break-words w-full whitespace-normal px-2 transition-opacity duration-500 ${
                shouldHideHanzi ? 'opacity-0 cursor-pointer text-slate-800' : 'opacity-100 cursor-pointer'
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
              {shouldHideHanzi || phase !== 'user_speaking' || !liveTranscript ? (
                <span className="text-slate-800">{currentWord.hanzi}</span>
              ) : (
                (() => {
                  const targetChars = [...currentWord.hanzi];
                  const simChars = [...(currentWord.sim || currentWord.hanzi)];
                  const heardChars = [...onlyHanzi(liveTranscript)];
                  let matched = 0;
                  while (
                    matched < targetChars.length &&
                    matched < heardChars.length &&
                    (heardChars[matched] === targetChars[matched] ||
                      heardChars[matched] === simChars[matched])
                  ) {
                    matched += 1;
                  }
                  return targetChars.map((ch, i) => (
                    <span
                      key={`${i}-${ch}`}
                      className={
                        i < matched
                          ? 'text-emerald-600'
                          : i === matched && heardChars.length > matched
                            ? 'text-amber-500'
                            : 'text-slate-800'
                      }
                    >
                      {ch}
                    </span>
                  ));
                })()
              )}
            </span>
            {!shouldHideHanzi && (
              <button
                type="button"
                onClick={() => replayCorrectPronunciation()}
                className="mt-4 inline-flex items-center gap-1.5 text-xs md:text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-4 py-2.5 md:px-3 md:py-1.5 rounded-xl md:rounded-full hover:bg-indigo-100 active:scale-95 transition"
              >
                <Volume2 className="w-4 h-4 md:w-3.5 md:h-3.5" /> 再聽一次正確發音
              </button>
            )}
            {!shouldHideHanzi && phase === 'user_speaking' && onlyHanzi(liveTranscript).length > 0 && (
              <span className="mt-2 text-[10px] font-black text-emerald-600/80 tracking-wide">
                綠色＝已對上 · 繼續講
              </span>
            )}
            {shouldHideHanzi && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <span className="text-slate-300 font-bold tracking-widest text-sm">盲讀中… 請跟讀</span>
                <span className="text-[10px] font-bold text-slate-400 md:hidden">雙擊漢字區可偷看</span>
                {(() => {
                  const sylCount = Math.max(1, toPinyinArray(currentWord.hanzi, 'none').length);
                  const heardSyl = Math.min(
                    sylCount,
                    onlyHanzi(liveTranscript).length > 0
                      ? toPinyinArray(onlyHanzi(liveTranscript), 'none').length
                      : 0,
                  );
                  const dots = Math.min(sylCount, 12);
                  return (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap justify-center max-w-[260px]">
                        {Array.from({ length: dots }, (_, i) => (
                          <span
                            key={i}
                            className={`w-3.5 h-3.5 md:w-2.5 md:h-2.5 rounded-full transition-colors ${
                              i < heardSyl ? 'bg-emerald-500' : 'bg-slate-200'
                            }`}
                          />
                        ))}
                        {sylCount > 12 && (
                          <span className="text-[10px] font-black text-slate-400">+{sylCount - 12}</span>
                        )}
                      </div>
                      <span className="text-xs md:text-[11px] font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                        {heardSyl > 0 ? `已聽 ${heardSyl}/${sylCount} 音節` : `約 ${sylCount} 個音節`}
                      </span>
                    </div>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => {
                    if (peekHoldTriggeredRef.current) {
                      peekHoldTriggeredRef.current = false;
                      return;
                    }
                    peekBriefly(1600);
                  }}
                  onPointerDown={() => {
                    peekHoldTriggeredRef.current = false;
                    if (peekHoldTimerRef.current) clearTimeout(peekHoldTimerRef.current);
                    peekHoldTimerRef.current = setTimeout(() => {
                      peekHoldTriggeredRef.current = true;
                      peekBriefly(3200);
                    }, 420);
                  }}
                  onPointerUp={() => {
                    if (peekHoldTimerRef.current) {
                      clearTimeout(peekHoldTimerRef.current);
                      peekHoldTimerRef.current = null;
                    }
                  }}
                  onPointerLeave={() => {
                    if (peekHoldTimerRef.current) {
                      clearTimeout(peekHoldTimerRef.current);
                      peekHoldTimerRef.current = null;
                    }
                  }}
                  onPointerCancel={() => {
                    if (peekHoldTimerRef.current) {
                      clearTimeout(peekHoldTimerRef.current);
                      peekHoldTimerRef.current = null;
                    }
                  }}
                  className="text-xs md:text-[11px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-4 py-2.5 md:px-3 md:py-1.5 rounded-full hover:bg-orange-100 active:scale-95 transition"
                  title="短撳 1.6 秒 · 長按 3.2 秒"
                >
                  偷看一下 · 長按更久
                </button>
              </div>
            )}
            {pairContrastHint && phase === 'system_speaking' && (() => {
              const parts = pairContrastHint.split(/\s*→\s*/);
              const a = parts[0]?.trim();
              const b = parts[1]?.trim();
              if (!a || !b) {
                return (
                  <div className="mt-3 text-xs md:text-sm font-black text-sky-700 bg-sky-50 border border-sky-100 px-3.5 py-2 rounded-2xl max-w-[95%] text-center leading-snug">
                    對比聽：{pairContrastHint}
                  </div>
                );
              }
              const slowRate = Math.max(0.55, ttsSpeed - 0.15);
              return (
                <div className="mt-3 flex flex-col items-center gap-2 w-full max-w-sm px-2">
                  <span className="text-[10px] font-black text-sky-600 tracking-widest uppercase">對比聽 · 撳字再聽</span>
                  <div className="flex items-stretch gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => speakHanzi(a, { voices, rate: slowRate })}
                      className="flex-1 min-w-0 rounded-2xl bg-sky-50 border border-sky-200 px-3 py-3 text-lg md:text-xl font-black text-sky-800 active:scale-[0.98]"
                    >
                      {a}
                    </button>
                    <span className="self-center text-sky-400 font-black text-sm shrink-0">→</span>
                    <button
                      type="button"
                      onClick={() => speakHanzi(b, { voices, rate: slowRate })}
                      className="flex-1 min-w-0 rounded-2xl bg-indigo-50 border border-indigo-200 px-3 py-3 text-lg md:text-xl font-black text-indigo-800 active:scale-[0.98]"
                    >
                      {b}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      speakHanzi(a, {
                        voices,
                        rate: slowRate,
                        onEnd: () => {
                          window.setTimeout(() => {
                            speakHanzi(b, { voices, rate: slowRate, cancel: false });
                          }, 280);
                        },
                      });
                      try {
                        if (navigator.vibrate) navigator.vibrate(8);
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="text-[11px] font-black text-sky-800 bg-sky-100 border border-sky-200 px-3.5 py-2 rounded-full active:scale-95"
                  >
                    連播對比 A → B
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="w-full md:w-px h-px md:h-full bg-slate-100 flex-none" />

          <div className="w-full md:w-80 flex-[2] md:flex-none flex flex-col bg-slate-50/50 p-4 sm:p-6 md:p-8 justify-center min-h-0">
            <div className="flex items-center justify-between mb-2 md:mb-6 flex-none">
              <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                <Mic className="w-3.5 h-3.5 md:w-4 md:h-4" /> 語音狀態
              </div>
              {roundMistakes > 0 && phase === 'user_speaking' && (
                <button
                  type="button"
                  onClick={() => {
                    replayCorrectPronunciation({ extraSlow: true });
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 text-[11px] md:text-xs font-black px-2.5 py-1 md:px-3 md:py-1 rounded-full animate-pulse active:scale-95 ${
                    roundMistakes >= 2 ? 'text-rose-700 bg-rose-200' : 'text-red-500 bg-red-100'
                  }`}
                  title="點擊慢聽正音"
                >
                  <span className="inline-flex gap-0.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${
                          i < Math.max(0, 3 - roundMistakes) ? 'bg-current' : 'bg-current/25'
                        }`}
                      />
                    ))}
                  </span>
                  {roundMistakes >= 2 ? '最後機會 · 慢聽' : `剩 ${Math.max(0, 3 - roundMistakes)} 次 · 慢聽`}
                </button>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
              {!isPlaying && phase === 'idle' && (
                <div className="text-slate-500 font-bold tracking-wider text-xs md:text-sm flex flex-col items-center gap-2 animate-fade-in px-3 text-center">
                  {micDenied ? (
                    <button
                      type="button"
                      onClick={() => setMicDenied(true)}
                      className="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-full active:scale-95"
                    >
                      <Mic className="w-3.5 h-3.5" /> 請允許麥克風 · 點睇步驟
                    </button>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
                        <Play className="w-3.5 h-3.5" fill="currentColor" /> 點下方藍色鍵開始
                      </span>
                      {currentWord && (
                        <span className="text-[11px] font-black text-slate-400">
                          下一題 · {currentWord.hanzi.length > 8 ? `${currentWord.hanzi.slice(0, 8)}…` : currentWord.hanzi}
                        </span>
                      )}
                    </>
                  )}
                  <span className="text-[10px] text-slate-400 font-bold tracking-widest hidden md:inline">或按空白鍵</span>
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
                    const urgent = timeLeft <= 3;
                    const ringR = 26;
                    const ringC = 2 * Math.PI * ringR;
                    const ringPct = Math.max(0, Math.min(1, timeLeft / Math.max(1, listenSeconds)));
                    const ringColor = urgent ? '#f43f5e' : onTrack ? '#10b981' : '#3b82f6';
                    return (
                      <>
                  <div
                    className="relative flex items-center justify-center mb-2 md:mb-4 w-[4.25rem] h-[4.25rem] md:w-[4.75rem] md:h-[4.75rem] cursor-pointer select-none"
                    onClick={() => {
                      if (extendHoldTriggeredRef.current) {
                        extendHoldTriggeredRef.current = false;
                        return;
                      }
                      const now = Date.now();
                      if (now - lastListenTapRef.current < 380) {
                        extendListenRef.current?.();
                      }
                      lastListenTapRef.current = now;
                    }}
                    onPointerDown={() => {
                      if (listenExtendUsed) return;
                      extendHoldTriggeredRef.current = false;
                      if (extendHoldTimerRef.current) clearTimeout(extendHoldTimerRef.current);
                      extendHoldTimerRef.current = setTimeout(() => {
                        extendHoldTriggeredRef.current = true;
                        extendListenRef.current?.();
                        try {
                          if (navigator.vibrate) navigator.vibrate(12);
                        } catch {
                          /* ignore */
                        }
                      }, 420);
                    }}
                    onPointerUp={() => {
                      if (extendHoldTimerRef.current) {
                        clearTimeout(extendHoldTimerRef.current);
                        extendHoldTimerRef.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      if (extendHoldTimerRef.current) {
                        clearTimeout(extendHoldTimerRef.current);
                        extendHoldTimerRef.current = null;
                      }
                    }}
                    onPointerCancel={() => {
                      if (extendHoldTimerRef.current) {
                        clearTimeout(extendHoldTimerRef.current);
                        extendHoldTimerRef.current = null;
                      }
                    }}
                    title={listenExtendUsed ? '加時已用完' : '雙擊或長按加時'}
                    role="presentation"
                  >
                    <svg
                      className="absolute inset-0 w-full h-full -rotate-90"
                      viewBox="0 0 64 64"
                      aria-hidden
                    >
                      <circle cx="32" cy="32" r={ringR} fill="none" stroke="#e2e8f0" strokeWidth="5" />
                      <circle
                        cx="32"
                        cy="32"
                        r={ringR}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={ringC}
                        strokeDashoffset={ringC * (1 - ringPct)}
                        className="transition-[stroke-dashoffset] duration-300 ease-linear"
                      />
                    </svg>
                    <div className={`absolute inset-2 rounded-full animate-ping opacity-15 ${urgent ? 'bg-rose-500' : onTrack ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                    <div className={`relative z-10 p-3 md:p-3.5 rounded-full shadow-sm ${
                      urgent
                        ? 'bg-rose-100 text-rose-600'
                        : onTrack
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-blue-100 text-blue-500'
                    }`}>
                      <Mic className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                  </div>
                  <div className={`text-base md:text-2xl font-bold tracking-widest text-center min-h-[2.5rem] md:min-h-[3rem] flex flex-col items-center justify-center max-w-[90%] overflow-hidden gap-1 ${onTrack ? 'text-emerald-700' : 'text-slate-600'}`}>
                    <span className="truncate">{liveTranscript ? `「${heard || liveTranscript}」` : '請朗讀...'}</span>
                    {!heard && targetLen <= 2 && (
                      <span className="text-[10px] font-black text-slate-400 px-2">
                        單字請稍拉長、對住咪 · 辨識較易飄
                      </span>
                    )}
                    {heard &&
                      targetLen <= 2 &&
                      isSameSyllableWrongTone(heard, currentWord.hanzi) && (
                      <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                        近咗 · 聲調再調（繼續講或等判定）
                      </span>
                    )}
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
                    {onTrack && ratio >= 1 && (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full animate-pulse">
                        講齊喇 · 停口等判定
                      </span>
                    )}
                    {urgent && !listenExtendUsed && (
                      <button
                        type="button"
                        onClick={() => extendListenRef.current?.()}
                        className="mt-1 text-xs font-black text-white bg-rose-500 border border-rose-400 px-4 py-2.5 rounded-xl shadow-lg active:scale-95 animate-pulse"
                      >
                        剩 {timeLeft} 秒 · 立即加時
                      </button>
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
                    className={`${
                      !listenExtendUsed
                        ? 'text-sm font-black mt-2 px-4 py-2.5 rounded-xl w-full max-w-[16rem] justify-center'
                        : 'text-xs md:text-[11px] mt-1 md:mt-2 font-bold px-3 py-1.5 md:px-2.5 md:py-1 rounded-full'
                    } tracking-widest flex items-center gap-1.5 shadow-sm transition-colors ${
                      timeLeft <= 3 && !listenExtendUsed
                        ? 'text-rose-700 bg-rose-100 animate-pulse border border-rose-200'
                        : !listenExtendUsed
                          ? 'text-blue-700 bg-blue-50 border border-blue-200'
                          : 'text-blue-500 bg-blue-100'
                    } ${listenExtendUsed ? 'opacity-60 cursor-default' : 'hover:bg-blue-100 active:scale-95'}`}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    {listenExtendUsed
                      ? `剩餘 ${timeLeft} 秒 · 加時用完`
                      : timeLeft <= 3
                        ? `剩 ${timeLeft} 秒 · 點擊加時`
                        : `剩餘 ${timeLeft} 秒 · 點擊加時`}
                    {!listenExtendUsed && listenExtendsLeft > 1 && (
                      <span className="opacity-70">×{listenExtendsLeft}</span>
                    )}
                  </button>
                  <MicLevelMeter
                    stream={micStream}
                    active={isPlaying && phase === 'user_speaking'}
                    onLevel={(lvl) => {
                      micLevelSamplesRef.current += 1;
                      if (lvl > micPeakRef.current) micPeakRef.current = lvl;
                    }}
                    onQuietTap={() => {
                      setMicDenied(true);
                      setStageTipToast('太靜 · 檢查麥克風同距離');
                      window.setTimeout(() => setStageTipToast(null), 2200);
                    }}
                  />
                </div>
              )}

              {phase === 'system_speaking' && (
                <button
                  type="button"
                  onClick={() => {
                    if (skipHoldTriggeredRef.current) {
                      skipHoldTriggeredRef.current = false;
                      return;
                    }
                    skipDemoRef.current?.();
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onPointerDown={() => {
                    skipHoldTriggeredRef.current = false;
                    if (skipHoldTimerRef.current) clearTimeout(skipHoldTimerRef.current);
                    skipHoldTimerRef.current = setTimeout(() => {
                      skipHoldTriggeredRef.current = true;
                      skipDemoRef.current?.();
                      window.setTimeout(() => skipPrepareRef.current?.(), 80);
                      setStageTipToast('已跳過示範 · 直接跟讀');
                      window.setTimeout(() => setStageTipToast(null), 1600);
                      try {
                        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
                      } catch {
                        /* ignore */
                      }
                    }, 480);
                  }}
                  onPointerUp={() => {
                    if (skipHoldTimerRef.current) {
                      clearTimeout(skipHoldTimerRef.current);
                      skipHoldTimerRef.current = null;
                    }
                  }}
                  onPointerLeave={() => {
                    if (skipHoldTimerRef.current) {
                      clearTimeout(skipHoldTimerRef.current);
                      skipHoldTimerRef.current = null;
                    }
                  }}
                  onPointerCancel={() => {
                    if (skipHoldTimerRef.current) {
                      clearTimeout(skipHoldTimerRef.current);
                      skipHoldTimerRef.current = null;
                    }
                  }}
                  className="flex flex-col items-center gap-2 md:gap-3 text-blue-500 font-bold animate-fade-in w-full max-w-sm active:scale-[0.99] transition"
                  title="撳跳過 · 長按跳過準備直接跟"
                >
                  <Volume2 className="w-8 h-8 md:w-12 md:h-12 animate-pulse mb-1" />
                  {(Boolean(activePractice?.earFirst) || Boolean(lesson && shouldForcePreRead(lesson))) &&
                    currentMistakesRef.current === 0 && (
                      <div className="flex items-center gap-2" aria-hidden>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${demoPass >= 1 ? 'bg-blue-500' : 'bg-slate-200'}`}
                        />
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${demoPass >= 2 ? 'bg-blue-500' : 'bg-slate-200'}`}
                        />
                      </div>
                    )}
                  <span className="tracking-widest text-center text-xs md:text-base">
                    {currentMistakesRef.current > 0
                      ? '老師放慢正音中...'
                      : demoPass === 1 && (Boolean(activePractice?.earFirst) || Boolean(lesson && shouldForcePreRead(lesson)))
                        ? '示範 1／2 · 先只聽'
                        : demoPass === 2 && (Boolean(activePractice?.earFirst) || Boolean(lesson && shouldForcePreRead(lesson)))
                          ? '示範 2／2 · 準備跟讀'
                          : '老師示範中...'}
                  </span>
                  <span className="text-[10px] md:text-xs font-bold text-blue-400/80 tracking-wide">
                    聽完再跟 · 唔使而家講
                  </span>
                  <span className="mt-1 text-xs font-black text-blue-900 bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl">
                    撳跳過 · 長按直接跟讀
                  </span>
                </button>
              )}

              {phase === 'preparing' && (
                <button
                  type="button"
                  onClick={() => {
                    skipPrepareRef.current?.();
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  onPointerDown={(e) => {
                    const target = e.currentTarget;
                    target.dataset.prepHold = '0';
                    const timer = window.setTimeout(() => {
                      target.dataset.prepHold = '1';
                      skipPrepareRef.current?.();
                      setStageTipToast('已跳過準備 · 直接跟讀');
                      window.setTimeout(() => setStageTipToast(null), 1400);
                      try {
                        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
                      } catch {
                        /* ignore */
                      }
                    }, 420);
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
                    if (e.currentTarget.dataset.prepHold === '1') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.dataset.prepHold = '0';
                    }
                  }}
                  onTouchStart={(e) => {
                    swipeStartYRef.current = e.touches[0]?.clientY ?? null;
                  }}
                  onTouchEnd={(e) => {
                    const startY = swipeStartYRef.current;
                    swipeStartYRef.current = null;
                    if (startY == null) return;
                    const endY = e.changedTouches[0]?.clientY ?? startY;
                    if (endY - startY < -48) {
                      skipPrepareRef.current?.();
                      setStageTipToast('已跳過準備（上滑）');
                      window.setTimeout(() => setStageTipToast(null), 1200);
                      try {
                        if (navigator.vibrate) navigator.vibrate(8);
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  className="flex flex-col items-center gap-2.5 md:gap-3 text-amber-600 font-bold animate-fade-in px-3 w-full max-w-sm active:scale-[0.99] transition"
                  title="撳一下立即跟讀 · 長按／上滑亦可"
                >
                  <div className="w-11 h-11 md:w-12 md:h-12 rounded-full border-4 border-amber-300 border-t-amber-600 animate-spin" />
                  <span className="tracking-widest text-center text-sm md:text-base">準備跟讀…</span>
                  <span className="text-[11px] md:text-xs font-bold text-amber-700/70 tracking-wide text-center">
                    腦內覆述一遍，跟住開口
                  </span>
                  {currentWord && (
                    <span className="text-[10px] font-black text-amber-800/80 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                      約 {Math.max(1, toPinyinArray(currentWord.hanzi, 'none').length)} 個音節
                    </span>
                  )}
                  <span className="mt-1 text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-4 py-2.5 rounded-xl">
                    撳／上滑立即跟讀
                    <span className="hidden md:inline font-bold opacity-60">（Enter）</span>
                  </span>
                  {(currentWord?.hanzi.length ?? 0) >= 8 && (
                    <span className="text-[10px] font-bold text-blue-500/80 tracking-wide">長句跟讀時可點「加時」兩次</span>
                  )}
                </button>
              )}

              {phase === 'evaluating' && (
                <button
                  type="button"
                  onClick={() => {
                    if (errorData) skipErrorWait();
                    else skipPerfectWait();
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="flex flex-col items-center gap-2 text-slate-500 font-bold animate-fade-in active:scale-[0.98]"
                  title="撳一下跳過等待"
                >
                  <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border-4 border-slate-200 border-t-slate-500 animate-spin" />
                  <span className="text-xs md:text-sm tracking-widest">分析處理中…</span>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                    撳跳過等待
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          ref={resultPanelRef}
          onTouchStart={(e) => {
            if (phase !== 'evaluating') return;
            swipeStartXRef.current = e.touches[0]?.clientX ?? null;
            swipeStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            if (phase !== 'evaluating') return;
            const startX = swipeStartXRef.current;
            const startY = swipeStartYRef.current;
            swipeStartXRef.current = null;
            swipeStartYRef.current = null;
            if (startX == null || startY == null) return;
            const touch = e.changedTouches[0];
            if (!touch) return;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (dy < -72 && Math.abs(dy) > Math.abs(dx) * 1.25) {
              if (errorData) skipErrorWait();
              else skipPerfectWait();
              setStageTipToast(errorData ? (roundMistakes >= 3 ? '下一題（上滑）' : '再跟（上滑）') : '下一題（上滑）');
              window.setTimeout(() => setStageTipToast(null), 1200);
              return;
            }
            if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
            if (dx < 0) {
              // swipe left → continue
              if (errorData) skipErrorWait();
              else skipPerfectWait();
              setStageTipToast(errorData ? (roundMistakes >= 3 ? '下一題（滑動）' : '再跟（滑動）') : '下一題（滑動）');
              window.setTimeout(() => setStageTipToast(null), 1200);
            } else if (errorData) {
              // swipe right → slow replay
              replayCorrectPronunciation({ extraSlow: true });
              setStageTipToast('慢聽（滑動）');
              window.setTimeout(() => setStageTipToast(null), 1200);
            } else {
              skipPerfectWait();
            }
          }}
          className={`flex-[0.8] md:flex-none w-full flex flex-col rounded-[1.5rem] md:rounded-[2rem] shadow-sm border p-3 md:p-5 transition-all duration-300 bg-white justify-center text-center
           ${!errorData && phase !== 'evaluating' ? 'min-h-[52px] md:min-h-[160px]' : 'min-h-[100px] md:min-h-[160px]'}
           ${errorData ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}
           ${phase === 'evaluating' && !errorData ? 'border-emerald-200 bg-emerald-50/30' : ''}
        `}
        >
          <div className={`flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-3 text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest justify-center md:justify-start flex-none ${
            !errorData && phase !== 'evaluating' ? 'md:flex hidden' : ''
          }`}>
            <Activity className="w-3.5 h-3.5 md:w-4 md:h-4 hidden md:block" /> 判定結果
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
            {phase === 'evaluating' && (
              <p className="md:hidden text-[10px] font-bold text-slate-400 -mt-1 mb-1">
                {errorData ? '左滑再跟／下一題 · 右滑慢聽 · 上滑繼續' : '左滑／上滑立即下一題'}
              </p>
            )}
            {!errorData && phase !== 'evaluating' && (
              <div className="text-slate-300 font-bold text-[11px] md:text-sm hidden md:block">等待發音完成...</div>
            )}
            {!errorData && phase !== 'evaluating' && (
              <div className="md:hidden text-slate-400 font-bold text-[11px]">跟讀後會顯示判定</div>
            )}

            {phase === 'evaluating' && !errorData && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (perfectHoldTriggeredRef.current) {
                    perfectHoldTriggeredRef.current = false;
                    return;
                  }
                  skipPerfectWait();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    skipPerfectWait();
                  }
                }}
                onPointerDown={() => {
                  perfectHoldTriggeredRef.current = false;
                  if (perfectHoldTimerRef.current) clearTimeout(perfectHoldTimerRef.current);
                  perfectHoldTimerRef.current = setTimeout(() => {
                    perfectHoldTriggeredRef.current = true;
                    replayCorrectPronunciation({ extraSlow: true });
                    setStageTipToast('慢聽本題 · 再撳下一題');
                    window.setTimeout(() => setStageTipToast(null), 1800);
                    try {
                      if (navigator.vibrate) navigator.vibrate(10);
                    } catch {
                      /* ignore */
                    }
                  }, 450);
                }}
                onPointerUp={() => {
                  if (perfectHoldTimerRef.current) {
                    clearTimeout(perfectHoldTimerRef.current);
                    perfectHoldTimerRef.current = null;
                  }
                }}
                onPointerLeave={() => {
                  if (perfectHoldTimerRef.current) {
                    clearTimeout(perfectHoldTimerRef.current);
                    perfectHoldTimerRef.current = null;
                  }
                }}
                onPointerCancel={() => {
                  if (perfectHoldTimerRef.current) {
                    clearTimeout(perfectHoldTimerRef.current);
                    perfectHoldTimerRef.current = null;
                  }
                }}
                className="flex flex-col items-center animate-fade-in-up text-emerald-500 gap-1 md:gap-2 w-full active:scale-[0.99] transition cursor-pointer"
                title="撳一下下一題 · 長按慢聽"
              >
                <CheckCircle2 className="w-8 h-8 md:w-14 md:h-14" />
                <div className="text-base md:text-2xl font-black tracking-widest">
                  {comboStreakRef.current >= 5 ? '連擊！' : comboStreakRef.current >= 3 ? '好嘢！' : '完美！'}
                </div>
                {comboStreakRef.current >= 3 && (
                  <div className="text-[11px] font-bold text-emerald-600/80">連續答對 {comboStreakRef.current} 題</div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pathProgress.dailyCorrect < pathProgress.dailyGoal) return;
                    setDailyGoalToast(true);
                    try {
                      if (navigator.vibrate) navigator.vibrate(8);
                    } catch {
                      /* ignore */
                    }
                  }}
                  disabled={pathProgress.dailyCorrect < pathProgress.dailyGoal}
                  className={`text-[11px] font-bold ${
                    pathProgress.dailyCorrect >= pathProgress.dailyGoal
                      ? 'text-emerald-600 underline decoration-emerald-300 underline-offset-2 active:scale-95'
                      : 'text-slate-400'
                  }`}
                >
                  今日 {pathProgress.dailyCorrect}/{pathProgress.dailyGoal}
                  {pathProgress.dailyCorrect >= pathProgress.dailyGoal ? ' · 達標 · 分享' : ''}
                </button>
                <div className="w-36 h-1.5 bg-emerald-100 rounded-full overflow-hidden mt-0.5">
                  <div
                    className={`h-full transition-all duration-500 ${
                      pathProgress.dailyCorrect >= pathProgress.dailyGoal
                        ? 'bg-emerald-500'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (pathProgress.dailyCorrect / Math.max(1, pathProgress.dailyGoal)) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
                {isPlaying && (
                  <span className="mt-1 text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-4 py-2.5 rounded-xl">
                    撳下一題 · 長按慢聽
                  </span>
                )}
              </div>
            )}

            {errorData && (
              <div className="flex flex-col w-full gap-2 md:gap-3 animate-fade-in-up md:h-full justify-center items-center">
                <div className="flex flex-col md:flex-row w-full gap-2 md:gap-4 justify-center items-center">
                  <button
                    type="button"
                    onClick={async () => {
                      const text = `${errorData.userText}${
                        errorData.userPinyin && errorData.userPinyin !== '---'
                          ? `（${errorData.userPinyin}）`
                          : ''
                      }`;
                      try {
                        await navigator.clipboard.writeText(text);
                        setStageTipToast('已複製「您讀成」');
                        window.setTimeout(() => setStageTipToast(null), 1600);
                        try {
                          if (navigator.vibrate) navigator.vibrate(8);
                        } catch {
                          /* ignore */
                        }
                      } catch {
                        setStageTipToast('複製失敗');
                        window.setTimeout(() => setStageTipToast(null), 1600);
                      }
                    }}
                    className={`flex-1 w-full border rounded-xl p-2.5 md:p-4 flex flex-row items-center justify-between shadow-sm min-h-0 gap-2 active:scale-[0.99] text-left ${
                      errorData.userText === '(未偵測到發音)'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-red-50 border-red-100'
                    }`}
                    title="撳一下複製"
                  >
                    <div className="flex flex-col text-left min-w-0">
                      <span
                        className={`text-[10px] md:text-xs font-bold mb-0.5 ${
                          errorData.userText === '(未偵測到發音)' ? 'text-amber-600' : 'text-red-400'
                        }`}
                      >
                        {errorData.userText === '(未偵測到發音)' ? '系統未聽清 · 可複製' : '您讀成 · 可複製'}
                      </span>
                      <span
                        className={`text-base md:text-xl font-black line-clamp-2 md:line-clamp-1 ${
                          errorData.userText === '(未偵測到發音)' ? 'text-amber-800' : 'text-red-600'
                        }`}
                      >
                        {errorData.userText}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-[10px] md:text-sm bg-white px-1.5 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg shadow-sm border max-w-[48%] truncate shrink-0 ${
                        errorData.userText === '(未偵測到發音)'
                          ? 'text-amber-700 border-amber-100'
                          : 'text-red-500 border-red-100'
                      }`}
                    >
                      {errorData.userPinyin}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (correctCopyHoldTriggeredRef.current) {
                        correctCopyHoldTriggeredRef.current = false;
                        return;
                      }
                      replayCorrectPronunciation({ extraSlow: true });
                    }}
                    onPointerDown={() => {
                      correctCopyHoldTriggeredRef.current = false;
                      if (correctCopyHoldTimerRef.current) clearTimeout(correctCopyHoldTimerRef.current);
                      correctCopyHoldTimerRef.current = setTimeout(async () => {
                        correctCopyHoldTriggeredRef.current = true;
                        const text = `${errorData.correctText}${
                          errorData.correctPinyin ? `（${errorData.correctPinyin}）` : ''
                        }`;
                        try {
                          await navigator.clipboard.writeText(text);
                          setStageTipToast('已複製正確讀法');
                          window.setTimeout(() => setStageTipToast(null), 1600);
                          if (navigator.vibrate) navigator.vibrate(8);
                        } catch {
                          setStageTipToast('複製失敗');
                          window.setTimeout(() => setStageTipToast(null), 1600);
                        }
                      }, 450);
                    }}
                    onPointerUp={() => {
                      if (correctCopyHoldTimerRef.current) {
                        clearTimeout(correctCopyHoldTimerRef.current);
                        correctCopyHoldTimerRef.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      if (correctCopyHoldTimerRef.current) {
                        clearTimeout(correctCopyHoldTimerRef.current);
                        correctCopyHoldTimerRef.current = null;
                      }
                    }}
                    onPointerCancel={() => {
                      if (correctCopyHoldTimerRef.current) {
                        clearTimeout(correctCopyHoldTimerRef.current);
                        correctCopyHoldTimerRef.current = null;
                      }
                    }}
                    className="flex-1 w-full bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 md:p-4 flex flex-row items-center justify-between shadow-sm relative overflow-hidden min-h-0 gap-2 active:scale-[0.99] text-left"
                    title="點擊慢聽 · 長按複製"
                  >
                    <div className="flex flex-col pl-0.5 md:pl-3 text-left min-w-0">
                      <span className="text-[10px] md:text-xs font-bold text-emerald-500 mb-0.5 inline-flex items-center gap-1">
                        正確應為 · 長按複製 <Volume2 className="w-3 h-3 opacity-70" />
                      </span>
                      <span className="text-base md:text-xl font-black text-emerald-700">{errorData.correctText}</span>
                    </div>
                    <span className="font-mono text-[10px] md:text-sm text-emerald-600 bg-white px-1.5 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg shadow-sm border border-emerald-100 shrink-0">
                      {errorData.correctPinyin}
                    </span>
                  </button>
                </div>

                {errorData.userText === '(未偵測到發音)' && (
                  <div className="w-full flex flex-col items-center gap-2 max-w-md">
                    <p className="text-[11px] md:text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
                      未聽清有效發音（單字有時會認成雜訊，或者咪太遠）· 睇麥克風條有冇跳動，靠近咪、稍拉長再跟。呢次唔計入發音錯分析。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMicDenied(true);
                        try {
                          if (navigator.vibrate) navigator.vibrate(8);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="text-xs font-black text-rose-800 bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl active:scale-95"
                    >
                      檢查麥克風權限
                    </button>
                  </div>
                )}
                {errorData.issues && (
                  <div className="w-full flex flex-col items-center gap-1.5">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {errorData.issues.tone && (
                        <button
                          type="button"
                          onClick={() => replayCorrectPronunciation({ extraSlow: true })}
                          className="text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-100 text-rose-600 border border-rose-200 active:scale-95"
                        >
                          聲調 · 慢聽
                        </button>
                      )}
                      {errorData.issues.initial && (
                        <button
                          type="button"
                          onClick={() => replayCorrectPronunciation({ extraSlow: true })}
                          className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 active:scale-95"
                        >
                          聲母 · 慢聽
                        </button>
                      )}
                      {errorData.issues.final && (
                        <button
                          type="button"
                          onClick={() => replayCorrectPronunciation({ extraSlow: true })}
                          className="text-[11px] font-black px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 border border-sky-200 active:scale-95"
                        >
                          韻母 · 慢聽
                        </button>
                      )}
                    </div>
                    {errorData.issues.tips.slice(0, errorTipsExpanded ? undefined : 3).map((tip) => (
                      <p
                        key={tip}
                        className="text-[11px] md:text-xs font-bold text-slate-500 text-center max-w-xl leading-relaxed px-2"
                      >
                        {tip}
                      </p>
                    ))}
                    {errorData.issues.tone && (
                      <div className="w-full flex flex-col items-center gap-1 mt-1 px-2">
                        <ToneContour
                          hanzi={errorData.correctText}
                          compact={errorData.correctText.length > 4}
                          compareHanzi={
                            onlyHanzi(errorData.userText) &&
                            isSameSyllableWrongTone(errorData.userText, errorData.correctText)
                              ? onlyHanzi(errorData.userText)
                              : undefined
                          }
                        />
                        <span className="text-[10px] font-black text-rose-600 tracking-wide">
                          {onlyHanzi(errorData.userText) &&
                          isSameSyllableWrongTone(errorData.userText, errorData.correctText)
                            ? `對比 ${onlyHanzi(errorData.userText)} → ${errorData.correctText} · 撳曲線慢聽`
                            : '聲調唔啱 · 撳曲線聽單字再跟'}
                        </span>
                      </div>
                    )}
                    {errorData.issues.tips.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setErrorTipsExpanded((v) => !v)}
                        className="text-[10px] font-black text-indigo-600 underline underline-offset-2 active:opacity-70"
                      >
                        {errorTipsExpanded
                          ? '收起提示'
                          : `仲有 ${errorData.issues.tips.length - 3} 條提示 · 撳開睇`}
                      </button>
                    )}
                  </div>
                )}
                {isPlaying && phase === 'evaluating' && (
                  <div className="w-full flex flex-col-reverse sm:flex-row gap-2 mt-0.5">
                    <button
                      type="button"
                      onClick={() => replayCorrectPronunciation({ extraSlow: true })}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-4 py-3 rounded-xl active:scale-[0.98] transition"
                    >
                      <Volume2 className="w-4 h-4" /> 慢聽正音
                    </button>
                    <button
                      type="button"
                      onClick={skipErrorWait}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-black px-4 py-3.5 rounded-xl active:scale-[0.98] transition ${
                        roundMistakes >= 3
                          ? 'text-white bg-slate-800 border border-slate-700'
                          : 'text-white bg-indigo-600 border border-indigo-500 shadow-md'
                      }`}
                    >
                      {roundMistakes >= 3 ? '下一題' : '立即再跟'}
                    </button>
                  </div>
                )}
                {!isPlaying && errorData && (
                  <button
                    type="button"
                    onClick={() => replayCorrectPronunciation({ extraSlow: true })}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-4 py-2.5 rounded-xl active:scale-[0.98] transition"
                  >
                    <Volume2 className="w-4 h-4" /> 慢聽正音
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="flex-none w-full pb-safe flex flex-col items-center justify-center gap-2 py-4 z-10 bg-gradient-to-t from-slate-50 to-transparent">
        <div className="md:hidden w-full max-w-lg mx-auto px-3">
          <button
            type="button"
            onClick={() => {
              setDictPage(Math.floor(globalIndex / WORDS_PER_PAGE));
              setShowDictionary(true);
            }}
            className="w-full group"
            title="撳開詞庫跳題"
            aria-label={`進度 ${globalIndex + 1}/${dictionary.length}，開啟詞庫`}
          >
            <div className="h-1.5 rounded-full bg-slate-200/90 overflow-hidden group-active:bg-slate-300 transition">
              <div
                className="h-full bg-indigo-400 transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(((globalIndex + (phase === 'evaluating' && !errorData ? 1 : 0)) / Math.max(1, dictionary.length)) * 100),
                  )}%`,
                }}
              />
            </div>
          </button>
        </div>
        <div
          ref={mobileChipBarRef}
          className="flex md:hidden items-center gap-2 px-3 w-full max-w-lg mx-auto overflow-x-auto no-scrollbar snap-x"
        >
          {phase === 'user_speaking' && !listenExtendUsed && (
            <button
              type="button"
              onClick={() => extendListenRef.current?.()}
              className={`shrink-0 snap-start text-xs font-black px-3.5 py-2 rounded-full active:scale-95 border ${
                timeLeft <= 3
                  ? 'text-rose-700 bg-rose-50 border-rose-300 animate-pulse'
                  : 'text-blue-700 bg-blue-50 border-blue-200'
              }`}
            >
              {listenExtendsLeft > 1 ? `加時 +5 秒（剩 ${listenExtendsLeft}）` : '加時 +5 秒'}
            </button>
          )}
          {(isBlindMode || lessonForceBlind) && phase === 'user_speaking' && (
            <button
              type="button"
              onClick={() => {
                if (peekHoldTriggeredRef.current) {
                  peekHoldTriggeredRef.current = false;
                  return;
                }
                peekBriefly(1600);
              }}
              onPointerDown={() => {
                peekHoldTriggeredRef.current = false;
                if (peekHoldTimerRef.current) clearTimeout(peekHoldTimerRef.current);
                peekHoldTimerRef.current = setTimeout(() => {
                  peekHoldTriggeredRef.current = true;
                  peekBriefly(3200);
                }, 420);
              }}
              onPointerUp={() => {
                if (peekHoldTimerRef.current) {
                  clearTimeout(peekHoldTimerRef.current);
                  peekHoldTimerRef.current = null;
                }
              }}
              onPointerLeave={() => {
                if (peekHoldTimerRef.current) {
                  clearTimeout(peekHoldTimerRef.current);
                  peekHoldTimerRef.current = null;
                }
              }}
              onPointerCancel={() => {
                if (peekHoldTimerRef.current) {
                  clearTimeout(peekHoldTimerRef.current);
                  peekHoldTimerRef.current = null;
                }
              }}
              className="shrink-0 snap-start text-xs font-black text-orange-700 bg-orange-50 border border-orange-200 px-3.5 py-2 rounded-full active:scale-95"
              title="短撳 1.6 秒 · 長按 3.2 秒"
            >
              偷看 · 長按更久
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSpeedPanel(true)}
            className={`shrink-0 snap-start text-xs font-black px-3.5 py-2 rounded-full active:scale-95 border ${
              ttsSpeed !== 0.85
                ? 'text-violet-700 bg-violet-50 border-violet-200'
                : 'text-slate-600 bg-white border-slate-200'
            }`}
          >
            語速 {ttsSpeed.toFixed(2)}x
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !autoPreRead;
              setAutoPreRead(next);
              saveSettings({ autoPreRead: next });
              setStageTipToast(next ? '先聽：每題先播示範再跟讀' : '先讀：直接開口跟讀');
              window.setTimeout(() => setStageTipToast(null), 2200);
            }}
            className={`shrink-0 snap-start text-xs font-black px-3.5 py-2 rounded-full active:scale-95 border ${
              autoPreRead
                ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                : 'text-slate-600 bg-white border-slate-200'
            }`}
          >
            {autoPreRead ? '先聽' : '先讀'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (lessonForceBlind) {
                setStageTipToast('本課係耳口模式，跟讀時會隱藏漢字');
                window.setTimeout(() => setStageTipToast(null), 2200);
                return;
              }
              const next = !isBlindMode;
              setIsBlindMode(next);
              saveSettings({ blindMode: next });
              setStageTipToast(next ? '盲跟已開：跟讀時隱藏漢字' : '盲跟已關');
              window.setTimeout(() => setStageTipToast(null), 2200);
            }}
            className={`shrink-0 snap-start text-xs font-black px-3.5 py-2 rounded-full active:scale-95 border ${
              isBlindMode || lessonForceBlind
                ? 'text-orange-700 bg-orange-50 border-orange-200'
                : 'text-slate-600 bg-white border-slate-200'
            }`}
          >
            {isBlindMode || lessonForceBlind ? '盲跟中' : '開盲跟'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (replayHoldTriggeredRef.current) {
                replayHoldTriggeredRef.current = false;
                return;
              }
              replayCorrectPronunciation();
            }}
            onPointerDown={() => {
              replayHoldTriggeredRef.current = false;
              if (replayHoldTimerRef.current) clearTimeout(replayHoldTimerRef.current);
              replayHoldTimerRef.current = setTimeout(() => {
                replayHoldTriggeredRef.current = true;
                replayCorrectPronunciation({ extraSlow: true });
                setStageTipToast('慢速再聽');
                window.setTimeout(() => setStageTipToast(null), 1400);
                try {
                  if (navigator.vibrate) navigator.vibrate(10);
                } catch {
                  /* ignore */
                }
              }, 480);
            }}
            onPointerUp={() => {
              if (replayHoldTimerRef.current) {
                clearTimeout(replayHoldTimerRef.current);
                replayHoldTimerRef.current = null;
              }
            }}
            onPointerLeave={() => {
              if (replayHoldTimerRef.current) {
                clearTimeout(replayHoldTimerRef.current);
                replayHoldTimerRef.current = null;
              }
            }}
            onPointerCancel={() => {
              if (replayHoldTimerRef.current) {
                clearTimeout(replayHoldTimerRef.current);
                replayHoldTimerRef.current = null;
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="shrink-0 snap-start text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-3.5 py-2 rounded-full active:scale-95"
            title="點按再聽 · 長按慢速"
          >
            再聽 · 長按慢
          </button>
          {isPlaying && (
            <button
              type="button"
              onClick={restartCurrentItem}
              className="shrink-0 snap-start text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 px-3.5 py-2 rounded-full active:scale-95"
            >
              重播本題
            </button>
          )}
          {(isBlindMode || lessonForceBlind) && phase !== 'user_speaking' && (
            <button
              type="button"
              onClick={() => {
                if (peekHoldTriggeredRef.current) {
                  peekHoldTriggeredRef.current = false;
                  return;
                }
                peekBriefly(1600);
              }}
              onPointerDown={() => {
                peekHoldTriggeredRef.current = false;
                if (peekHoldTimerRef.current) clearTimeout(peekHoldTimerRef.current);
                peekHoldTimerRef.current = setTimeout(() => {
                  peekHoldTriggeredRef.current = true;
                  peekBriefly(3200);
                }, 420);
              }}
              onPointerUp={() => {
                if (peekHoldTimerRef.current) {
                  clearTimeout(peekHoldTimerRef.current);
                  peekHoldTimerRef.current = null;
                }
              }}
              onPointerLeave={() => {
                if (peekHoldTimerRef.current) {
                  clearTimeout(peekHoldTimerRef.current);
                  peekHoldTimerRef.current = null;
                }
              }}
              onPointerCancel={() => {
                if (peekHoldTimerRef.current) {
                  clearTimeout(peekHoldTimerRef.current);
                  peekHoldTimerRef.current = null;
                }
              }}
              className="shrink-0 snap-start text-xs font-black text-orange-700 bg-orange-50 border border-orange-200 px-3.5 py-2 rounded-full active:scale-95"
              title="短撳 1.6 秒 · 長按 3.2 秒"
            >
              偷看 · 長按更久
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="shrink-0 snap-start text-xs font-black text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-full active:scale-95"
          >
            診斷
          </button>
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="shrink-0 snap-start text-xs font-black text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-full active:scale-95"
          >
            自訂
          </button>
          <button
            type="button"
            onClick={() => setShowShortcutsHelp(true)}
            className="shrink-0 snap-start text-xs font-black text-slate-500 bg-white border border-slate-200 px-3 py-2 rounded-full active:scale-95"
          >
            說明
          </button>
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
        <div className="flex items-end justify-center gap-5 md:gap-8">
        <button
          type="button"
          onClick={handlePrevWord}
          className={`flex flex-col items-center gap-1 ${globalIndex <= 0 ? 'opacity-40' : ''}`}
          title={globalIndex <= 0 ? '已經係第一題' : '上一題（B）'}
        >
          <span className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white border-[4px] border-slate-100 shadow-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all">
            <SkipBack className="w-5 h-5 md:w-7 md:h-7" />
          </span>
          <span className="md:hidden text-[10px] font-black text-slate-400 tracking-wide">
            {globalIndex <= 0 ? '第一題' : '上一'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (playHoldTriggeredRef.current) {
              playHoldTriggeredRef.current = false;
              return;
            }
            setPausedByHide(false);
            void togglePlayPause();
          }}
          onPointerDown={() => {
            playHoldTriggeredRef.current = false;
            if (playHoldTimerRef.current) clearTimeout(playHoldTimerRef.current);
            playHoldTimerRef.current = setTimeout(() => {
              playHoldTriggeredRef.current = true;
              restartCurrentItem();
            }, 520);
          }}
          onPointerUp={() => {
            if (playHoldTimerRef.current) {
              clearTimeout(playHoldTimerRef.current);
              playHoldTimerRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (playHoldTimerRef.current) {
              clearTimeout(playHoldTimerRef.current);
              playHoldTimerRef.current = null;
            }
          }}
          onPointerCancel={() => {
            if (playHoldTimerRef.current) {
              clearTimeout(playHoldTimerRef.current);
              playHoldTimerRef.current = null;
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="flex flex-col items-center gap-1"
          title={
            isPlaying
              ? phase === 'user_speaking'
                ? '暫停跟讀 · 長按重播本題'
                : phase === 'system_speaking'
                  ? '暫停示範 · 長按重播本題'
                  : phase === 'preparing'
                    ? '暫停準備 · 長按重播本題'
                    : '停止學習 · 長按重播本題'
              : '開始學習 · 長按重播本題'
          }
        >
          <span
            className={`w-16 h-16 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95 border-4
            ${
              isPlaying
                ? phase === 'user_speaking'
                  ? 'bg-blue-500 hover:bg-blue-600 border-blue-200 text-white shadow-[0_10px_30px_rgba(59,130,246,0.35)]'
                  : 'bg-rose-500 hover:bg-rose-600 border-rose-200 text-white shadow-[0_10px_30px_rgba(244,63,94,0.3)]'
                : 'bg-blue-500 hover:bg-blue-600 border-blue-200 text-white shadow-[0_10px_30px_rgba(59,130,246,0.3)] animate-pulse'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" />
            ) : (
              <Play className="w-8 h-8 md:w-10 md:h-10 ml-2" fill="currentColor" />
            )}
          </span>
          <span className="md:hidden text-[10px] font-black text-slate-500 tracking-wide">
            {!isPlaying
              ? '開始'
              : phase === 'user_speaking'
                ? '跟讀中 · 撳暫停'
                : phase === 'system_speaking'
                  ? '示範中 · 撳暫停'
                  : phase === 'preparing'
                    ? '準備中 · 撳暫停'
                    : phase === 'evaluating'
                      ? '判定中 · 可暫停'
                      : '暫停 · 長按重播'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (skipHoldTriggeredRef.current) {
              skipHoldTriggeredRef.current = false;
              return;
            }
            requestSkipWord();
          }}
          onPointerDown={() => {
            skipHoldTriggeredRef.current = false;
            if (skipHoldTimerRef.current) clearTimeout(skipHoldTimerRef.current);
            skipHoldTimerRef.current = setTimeout(() => {
              skipHoldTriggeredRef.current = true;
              setSkipConfirmOpen(false);
              handleSkipWord();
              try {
                if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
              } catch {
                /* ignore */
              }
              try {
                if (!sessionStorage.getItem('pm_skip_hold_v1')) {
                  sessionStorage.setItem('pm_skip_hold_v1', '1');
                  setStageTipToast('長按跳過可唔使再確認');
                  window.setTimeout(() => setStageTipToast(null), 2400);
                }
              } catch {
                /* ignore */
              }
            }, 520);
          }}
          onPointerUp={() => {
            if (skipHoldTimerRef.current) {
              clearTimeout(skipHoldTimerRef.current);
              skipHoldTimerRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (skipHoldTimerRef.current) {
              clearTimeout(skipHoldTimerRef.current);
              skipHoldTimerRef.current = null;
            }
          }}
          onPointerCancel={() => {
            if (skipHoldTimerRef.current) {
              clearTimeout(skipHoldTimerRef.current);
              skipHoldTimerRef.current = null;
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="flex flex-col items-center gap-1"
          title={
            roundMistakes >= 2
              ? '最後機會 · 跳過會計錯 · 長按直接跳'
              : '跳過（會計入本課正確率）· 長按直接跳過'
          }
        >
          <span
            className={`w-12 h-12 md:w-16 md:h-16 rounded-full bg-white border-[4px] shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all ${
              roundMistakes >= 2
                ? 'border-rose-200 text-rose-500 hover:bg-rose-50'
                : 'border-slate-100 text-slate-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50'
            }`}
          >
            <SkipForward className="w-5 h-5 md:w-7 md:h-7" />
          </span>
          <span
            className={`md:hidden text-[10px] font-black tracking-wide ${
              roundMistakes >= 2 ? 'text-rose-500' : 'text-slate-400'
            }`}
          >
            {roundMistakes >= 2 ? '跳過·計錯' : '跳過 · 長按'}
          </span>
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
