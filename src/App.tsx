import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, Play, Pause, History, X, Eye, EyeOff, AlertCircle, CheckCircle2, BookOpen, ChevronLeft, ChevronRight, Volume2, Activity, SkipForward, Timer, Save, DownloadCloud, Gauge, FileEdit } from 'lucide-react';
import { pinyin as pinyinProFn } from 'pinyin-pro';

// --- 真實高頻詞庫 ---
const INITIAL_REAL_WORDS = [
  "真實|真实|zhēn shí", "朋友|朋友|péng yǒu", "漂亮|漂亮|piào liang", "蘋果|苹果|píng guǒ", "貓咪|猫咪|māo mī", "天空|天空|tiān kōng", "可愛|可爱|kě ài", "星星|星星|xīng xing",
  "時間|时间|shí jiān", "學習|学习|xué xí", "學校|学校|xué xiào", "電腦|电脑|diàn nǎo", "手機|手机|shǒu jī", "吃飯|吃饭|chī fàn", "睡覺|睡觉|shuì jiào", "衣服|衣服|yī fu",
  "機場|机场|jī chǎng", "音樂|音乐|yīn yuè", "快樂|快乐|kuài lè", "悲傷|悲伤|bēi shāng", "努力|努力|nǔ lì", "世界|世界|shì jiè", "風景|风景|fēng jǐng", "海洋|海洋|hǎi yáng",
  "放棄|放弃|fàng qì", "環境|环境|huán jìng", "挑戰|挑战|tiǎo zhàn", "夢想|梦想|mèng xiǎng", "自由|自由|zì yóu", "愛情|爱情|ài qíng", "希望|希望|xī wàng", "溫柔|温柔|wēn róu",
  "宇宙|宇宙|yǔ zhòu", "魔法|魔法|mó fǎ", "命運|命运|mìng yùn", "奇蹟|奇迹|qí jì", "靈魂|灵魂|líng hún", "永恆|永恒|yǒng héng", "毀滅|毁灭|huǐ miè", "守護|守护|shǒu hù",
  "知識|知识|zhī shi", "經驗|经验|jīng yàn", "決定|决定|jué dìng", "選擇|选择|xuǎn zé", "相信|相信|xiāng xìn", "懷疑|怀疑|huái yí", "理解|理解|lǐ jiě", "支持|支持|zhī chí",
  "國家|国家|guó jiā", "社會|社会|shè huì", "經濟|经济|jīng jì", "文化|文化|wén huà", "歷史|历史|lì shǐ", "科學|科学|kē xué", "技術|技术|jì shù", "藝術|艺术|yì shù",
  "太陽|太阳|tài yáng", "月亮|月亮|yuè liang", "森林|森林|sēn lín", "沙漠|沙漠|shā mò", "高山|高山|gāo shān", "河流|河流|hé liú", "冰雪|冰雪|bīng xuě", "城市|城市|chéng shì",
  "獅子|狮子|shī zi", "老虎|老虎|lǎo hǔ", "大象|大象|dà xiàng", "企鵝|企鹅|qǐ é", "兔子|兔子|tù zi", "狐狸|狐狸|hú li", "蝴蝶|蝴蝶|hú dié", "海豚|海豚|hǎi tún",
  "奔跑|奔跑|bēn pǎo", "跳躍|跳跃|tiào yuè", "游泳|游泳|yóu yǒng", "飛翔|飞翔|fēi xiáng", "思考|思考|sī kǎo", "探索|探索|tàn suǒ", "尋找|寻找|xún zhǎo", "發現|发现|fā xiàn",
  "憤怒|愤怒|fèn nù", "驚訝|惊呀|jīng yà", "恐懼|恐惧|kǒng jù", "激動|激动|jī dòng", "幸福|幸福|xìng fú", "孤獨|孤独|gū dú", "期待|期待|qī dài", "絕望|绝望|jué wàng"
];

const generate10kDictionary = () => {
  let largeDict: string[] = [];
  const targetSize = 10000;
  while (largeDict.length < targetSize) {
    const shuffled = [...INITIAL_REAL_WORDS].sort(() => 0.5 - Math.random());
    largeDict = largeDict.concat(shuffled);
  }
  return largeDict.slice(0, targetSize);
};

export default function App() {
  const [dictionary, setDictionary] = useState(generate10kDictionary());
  const [globalIndex, setGlobalIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState<{ hanzi: string, sim: string, pinyin: string } | null>(null);
  const [isDownloadingDict, setIsDownloadingDict] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'system_speaking' | 'user_speaking' | 'evaluating'>('idle');

  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorData, setErrorData] = useState<{ userText: string, userPinyin: string, correctText: string, correctPinyin: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [isSavedPulse, setIsSavedPulse] = useState(false);

  const [isBlindMode, setIsBlindMode] = useState(false);
  const [autoPreRead, setAutoPreRead] = useState(true);
  const [ttsSpeed, setTtsSpeed] = useState(0.85);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const [toneStats, setToneStats] = useState<Record<string, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [initialStats, setInitialStats] = useState<Record<string, number>>({});
  const [finalStats, setFinalStats] = useState<Record<string, number>>({});

  const [showDictionary, setShowDictionary] = useState(false);
  const [dictPage, setDictPage] = useState(0);
  const WORDS_PER_PAGE = 50;

  const currentWordRef = useRef(currentWord);
  const globalIndexRef = useRef(globalIndex);
  const isPlayingRef = useRef(isPlaying);
  const autoPreReadRef = useRef(autoPreRead);
  const currentMistakesRef = useRef(0);
  const evalTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef('');
  const historyRef = useRef(history);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);
  useEffect(() => { globalIndexRef.current = globalIndex; }, [globalIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { autoPreReadRef.current = autoPreRead; }, [autoPreRead]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // --- 本地存檔 ---
  useEffect(() => {
    const savedIndex = localStorage.getItem('pinyinMaster_light_index');
    const savedHistory = localStorage.getItem('pinyinMaster_light_history');
    const savedBlindMode = localStorage.getItem('pinyinMaster_light_blindMode');
    const savedAutoPreRead = localStorage.getItem('pinyinMaster_light_autoPreRead');
    const savedTtsSpeed = localStorage.getItem('pinyinMaster_light_ttsSpeed');
    const savedToneStats = localStorage.getItem('pinyinMaster_toneStats');
    const savedInitials = localStorage.getItem('pinyinMaster_initialStats');
    const savedFinals = localStorage.getItem('pinyinMaster_finalStats');

    if (savedIndex) setGlobalIndex(parseInt(savedIndex, 10));
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    if (savedBlindMode) setIsBlindMode(savedBlindMode === 'true');
    if (savedAutoPreRead !== null) setAutoPreRead(savedAutoPreRead === 'true');
    if (savedTtsSpeed) setTtsSpeed(parseFloat(savedTtsSpeed));
    if (savedToneStats) setToneStats(JSON.parse(savedToneStats));
    if (savedInitials) setInitialStats(JSON.parse(savedInitials));
    if (savedFinals) setFinalStats(JSON.parse(savedFinals));
  }, []);

  const saveProgress = useCallback((newIndex: number, newHistory: any[]) => {
    localStorage.setItem('pinyinMaster_light_index', newIndex.toString());
    localStorage.setItem('pinyinMaster_light_history', JSON.stringify(newHistory));
    setIsSavedPulse(true);
    setTimeout(() => setIsSavedPulse(false), 1500);
  }, []);

  const toggleTtsSpeed = () => {
    setTtsSpeed(prev => {
      const next = prev === 0.85 ? 0.6 : prev === 0.6 ? 1.0 : 0.85;
      localStorage.setItem('pinyinMaster_light_ttsSpeed', next.toString());
      return next;
    });
  };

  const toggleBlindMode = () => {
    const newVal = !isBlindMode;
    setIsBlindMode(newVal);
    localStorage.setItem('pinyinMaster_light_blindMode', newVal.toString());
  };

  const toggleAutoPreRead = () => {
    const newVal = !autoPreRead;
    setAutoPreRead(newVal);
    localStorage.setItem('pinyinMaster_light_autoPreRead', newVal.toString());
  };

  const openDictionary = () => {
    const targetPage = Math.floor(globalIndex / WORDS_PER_PAGE);
    setDictPage(targetPage);
    setShowDictionary(true);
  };

  const handleAddCustomText = () => {
    if (!customText.trim()) return;
    
    // 依據標點符號、空白、換行等分隔
    const rawPhrases = customText.split(/[。！？\n,.;!?，、\s\t]+/).filter(s => s.trim().length > 0);
    
    const sentences: string[] = [];
    // 限制每句最大長度，超過強制拆成較短片段以利發音與顯示
    const MAX_LEN = 8;
    rawPhrases.forEach(s => {
      let currentString = s;
      while (currentString.length > MAX_LEN) {
        sentences.push(currentString.substring(0, MAX_LEN));
        currentString = currentString.substring(MAX_LEN);
      }
      if (currentString.length > 0) {
        sentences.push(currentString);
      }
    });

    const newWords = sentences.map(s => {
      const cleanS = s.trim();
      const pinyinStr = (pinyinProFn(cleanS, { type: 'array' }) as string[]).join(' ');
      return `${cleanS}|${cleanS}|${pinyinStr}`;
    });

    if (newWords.length > 0) {
      // Temporarily store the parsed first word to set as current immediately
      const firstWordParsed = {
        hanzi: sentences[0].trim(),
        sim: sentences[0].trim(),
        pinyin: (pinyinProFn(sentences[0].trim(), { type: 'array' }) as string[]).join(' ')
      };

      // 完全替換詞庫，確保只進行自訂練習
      setDictionary(newWords);
      setIsCustomMode(true);
      setShowCustomInput(false);
      setCustomText('');
      
      // 從 0 開始這個自訂練習
      const nextIndex = 0;
      setGlobalIndex(nextIndex);
      setCurrentWord(firstWordParsed);
      saveProgress(nextIndex, historyRef.current);
      setPhase('idle');
      if (isPlayingRef.current) {
        setTimeout(() => setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking'), 50);
      }
    }
  };

  const analyzeAndRecordMistakes = useCallback((correctHanzi: string, wrongText: string) => {
    if (!wrongText) return;
    const cleanWrongText = wrongText.replace(/[^\u4e00-\u9fa5]/g, '');
    if (!cleanWrongText) return;

    try {
      const cPinyinNum = pinyinProFn(correctHanzi, { type: 'array', toneType: 'num' }) as string[];
      const wPinyinNum = pinyinProFn(cleanWrongText, { type: 'array', toneType: 'num' }) as string[];

      const cInitials = pinyinProFn(correctHanzi, { type: 'array', pattern: 'initial' }) as string[];
      const wInitials = pinyinProFn(cleanWrongText, { type: 'array', pattern: 'initial' }) as string[];

      const cFinals = pinyinProFn(correctHanzi, { type: 'array', pattern: 'final' }) as string[];
      const wFinals = pinyinProFn(cleanWrongText, { type: 'array', pattern: 'final' }) as string[];

      setToneStats(prev => {
        const next = { ...prev };
        for (let i = 0; i < Math.min(cPinyinNum.length, wPinyinNum.length); i++) {
          if (cPinyinNum[i] !== wPinyinNum[i]) {
            const match = cPinyinNum[i].match(/\d/);
            if (match) {
              const tone = match[0];
              next[tone] = (next[tone] || 0) + 1;
            }
          }
        }
        localStorage.setItem('pinyinMaster_toneStats', JSON.stringify(next));
        return next;
      });

      setInitialStats(prev => {
        const next = { ...prev };
        for (let i = 0; i < Math.min(cInitials.length, wInitials.length); i++) {
          if (cInitials[i] !== wInitials[i] && cInitials[i]) {
            next[cInitials[i]] = (next[cInitials[i]] || 0) + 1;
          }
        }
        localStorage.setItem('pinyinMaster_initialStats', JSON.stringify(next));
        return next;
      });

      setFinalStats(prev => {
        const next = { ...prev };
        for (let i = 0; i < Math.min(cFinals.length, wFinals.length); i++) {
          if (cFinals[i] !== wFinals[i] && cFinals[i]) {
            next[cFinals[i]] = (next[cFinals[i]] || 0) + 1;
          }
        }
        localStorage.setItem('pinyinMaster_finalStats', JSON.stringify(next));
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const parseWord = useCallback((rawString: string) => {
    const parts = rawString.split('|');
    if (parts.length === 3) return { hanzi: parts[0], sim: parts[1], pinyin: parts[2] };
    return { hanzi: parts[0], sim: parts[0], pinyin: parts[1] };
  }, []);

  const getWordByIndex = useCallback((index: number) => {
    return parseWord(dictionary[index % dictionary.length]);
  }, [dictionary, parseWord]);

  useEffect(() => {
    document.documentElement.lang = 'zh-cmn-Hans-CN';
    const loadVoices = () => {
      const windowVoices = window.speechSynthesis.getVoices();
      if (windowVoices.length > 0) setVoices(windowVoices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const getGirlVoice = useCallback(() => {
    if (!voices || voices.length === 0) return null;
    const keywords = ['xiaoxiao', 'yaoyao', 'ting-ting', 'lili', 'girl', 'female'];
    let bestVoice = null;
    let bestScore = -1;
    for (const v of voices) {
      if (v.lang.includes('zh-CN') || v.lang.includes('zh-TW') || v.lang.includes('zh-HK')) {
        const lowerName = v.name.toLowerCase();
        let score = 0;
        if (keywords.some(kw => lowerName.includes(kw))) score += 10;
        if (lowerName.includes('zh-cn') || lowerName.includes('普通话')) score += 5;
        if (score > bestScore) { bestScore = score; bestVoice = v; }
      }
    }
    return bestVoice || voices.find(v => v.lang.includes('zh'));
  }, [voices]);

  const clearEvalTimeouts = useCallback(() => {
    evalTimeoutsRef.current.forEach(clearTimeout);
    evalTimeoutsRef.current = [];
  }, []);

  const addEvalTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    evalTimeoutsRef.current.push(id);
  }, []);

  const checkAndExpandDictionary = useCallback((currentIndex: number) => {
    if (isCustomMode) return;
    if (currentIndex >= dictionary.length - 10 && !isDownloadingDict) {
      setIsDownloadingDict(true);
      setTimeout(() => {
        setDictionary(prev => [...prev, ...generate10kDictionary()]);
        setIsDownloadingDict(false);
      }, 2000);
    }
  }, [dictionary.length, isDownloadingDict, isCustomMode]);

  const initGame = useCallback(() => {
    const savedIndex = localStorage.getItem('pinyinMaster_light_index');
    const startIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
    setGlobalIndex(startIndex);
    setCurrentWord(getWordByIndex(startIndex));
    setPhase('idle');
    setErrorData(null);
  }, [getWordByIndex]);

  useEffect(() => { initGame(); }, [initGame]);

  const recordHistory = (wordObj: any, isCorrect: boolean, wrongText = '', wrongPinyin = '') => {
    const newEntry = {
      word: wordObj.hanzi,
      pinyin: wordObj.pinyin,
      isCorrect: isCorrect,
      wrongText: wrongText,
      wrongPinyin: wrongPinyin,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    let newHistory: any[] = [];
    setHistory(prev => {
      newHistory = [newEntry, ...prev].slice(0, 100);
      return newHistory;
    });
    return newHistory;
  };

  // 失敗 3 次後的無縫跳轉邏輯
  const handleMoveToNextWordAfterFailure = useCallback(() => {
    const nextIndex = globalIndexRef.current + 1;
    setGlobalIndex(nextIndex);
    saveProgress(nextIndex, historyRef.current);
    setCurrentWord(getWordByIndex(nextIndex));
    setErrorData(null);
    currentMistakesRef.current = 0;
    setLiveTranscript('');
    checkAndExpandDictionary(nextIndex);

    setPhase('idle');
    setTimeout(() => {
      if (isPlayingRef.current) setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
    }, 50);
  }, [getWordByIndex, saveProgress, checkAndExpandDictionary]);

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const togglePlayPause = async () => {
    if (isPlaying) {
      setIsPlaying(false);
      setPhase('idle');
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
      stopMediaStream();
      clearEvalTimeouts();
      setLiveTranscript('');
      setErrorData(null);
    } else {
      // 1. 【關鍵修復】必須在使用者點擊的「同步」時間內觸發 speechSynthesis.speak 才能解鎖 iOS 限制
      setIsPlaying(true);
      window.speechSynthesis.cancel(); // 確保清除之前卡住的語音陣列
      const unlockAudio = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(unlockAudio);

      // 2. 同步設定狀態，確保 React 能夠順利切換 Phase
      if (autoPreRead) {
        setPhase('system_speaking');
      } else {
        setPhase('user_speaking');
      }
      setErrorData(null);
      currentMistakesRef.current = 0;
      setLiveTranscript('');

      // 3. 非同步請求麥克風權限並保持開啟狀態，避免 iOS 一直彈出權限提示
      // [注意：此步驟放在 unlock 語音之後，以免 await 阻隔了點擊事件的上下文判定]
      try {
        if (!mediaStreamRef.current) {
          mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } catch (err) {
        console.warn("未取得麥克風權限或環境不支援：", err);
      }
    }
  };

  // 1. 電腦示範
  const playSystemVoice = useCallback(() => {
    if (!isPlayingRef.current) return;

    setPhase('system_speaking');
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speakText = currentWordRef.current?.hanzi || '';
      const utterance = new SpeechSynthesisUtterance(speakText);
      utterance.lang = 'zh-CN';

      // 首次正常，錯後會稍微放慢
      utterance.rate = currentMistakesRef.current === 0 ? ttsSpeed : Math.max(ttsSpeed * 0.6, 0.3);
      utterance.pitch = 1.1;

      const girlVoice = getGirlVoice();
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

    } else {
      setPhase('user_speaking');
    }
  }, [getGirlVoice, addEvalTimeout, ttsSpeed]);

  useEffect(() => {
    if (phase === 'system_speaking' && isPlaying) {
      playSystemVoice();
    }
  }, [phase, isPlaying, playSystemVoice]);

  // 2. 10 秒聆聽系統
  useEffect(() => {
    let isCancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;

    if (phase === 'user_speaking' && isPlaying) {
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsPlaying(false);
        setPhase('idle');
        alert("您的瀏覽器不支援語音辨識功能。");
        return;
      }

      liveTranscriptRef.current = '';
      setLiveTranscript('');
      setTimeLeft(10);

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'zh-cmn-Hans-CN';
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      timerId = setTimeout(() => {
        if (isCancelled) return;
        isCancelled = true;
        try { recognition.abort(); } catch (e) { }
        evaluateResult(false, liveTranscriptRef.current);
      }, 10000);

      countdownInterval = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);

      recognition.onresult = (event: any) => {
        if (isCancelled || !isPlayingRef.current) return;

        const fullTranscript = Array.from(event.results).map((r: any) => r[0].transcript).join('');
        liveTranscriptRef.current = fullTranscript;
        setLiveTranscript(fullTranscript);

        const targetHanzi = currentWordRef.current?.hanzi || '';
        const targetSim = currentWordRef.current?.sim || '';
        const cleanTranscript = fullTranscript.replace(/[^\u4e00-\u9fa5]/g, '');

        let isMatch = cleanTranscript.includes(targetHanzi) || (targetSim && cleanTranscript.includes(targetSim));

        if (!isMatch && cleanTranscript.length > 0) {
          const checkText = cleanTranscript.slice(-targetHanzi.length);
          const userPinyinStr = (pinyinProFn(checkText, { toneType: 'none', type: 'array' }) as string[]).join('');
          const targetPinyinStr = (pinyinProFn(targetHanzi, { toneType: 'none', type: 'array' }) as string[]).join('');
          if (checkText.length === targetHanzi.length && userPinyinStr === targetPinyinStr) {
            isMatch = true;
          }
        }

        if (isMatch) {
          isCancelled = true;
          clearTimeout(timerId!); clearInterval(countdownInterval!);
          try { recognition.abort(); } catch (e) { }
          evaluateResult(true, cleanTranscript);
        } else if (cleanTranscript.length >= targetHanzi.length) {
          isCancelled = true;
          clearTimeout(timerId!); clearInterval(countdownInterval!);
          try { recognition.abort(); } catch (e) { }
          evaluateResult(false, cleanTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        if (isCancelled || !isPlayingRef.current) return;
        if (event.error === 'no-speech' || event.error === 'network') {
          // 忽略無聲
        } else {
          isCancelled = true;
          clearTimeout(timerId!); clearInterval(countdownInterval!);
          setIsPlaying(false);
          setPhase('idle');
        }
      };

      recognition.onend = () => {
        if (!isCancelled && isPlayingRef.current && phase === 'user_speaking') {
          try { recognition.start(); } catch (e) { }
        }
      };

      try { recognition.start(); } catch (e) { }
    }

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (countdownInterval) clearInterval(countdownInterval);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) { }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isPlaying]);

  // 3. 結果判斷
  const evaluateResult = (isInstantWin: boolean, cleanTranscript: string) => {
    setPhase('evaluating');

    if (!currentWordRef.current) return;
    const wordObj = currentWordRef.current;
    let isCorrect = isInstantWin;

    if (!isCorrect && cleanTranscript.length > 0) {
      const userPinyinStr = (pinyinProFn(cleanTranscript, { toneType: 'none', type: 'array' }) as string[]).join('');
      const targetPinyinStr = (pinyinProFn(wordObj.hanzi, { toneType: 'none', type: 'array' }) as string[]).join('');
      if (userPinyinStr.includes(targetPinyinStr)) {
        isCorrect = true;
      }
    }

    if (isCorrect) {
      setErrorData(null);
      currentMistakesRef.current = 0;
      const newHistory = recordHistory(wordObj, true);
      const nextIndex = globalIndexRef.current + 1;

      setGlobalIndex(nextIndex);
      saveProgress(nextIndex, newHistory);
      checkAndExpandDictionary(nextIndex);

      addEvalTimeout(() => {
        setCurrentWord(getWordByIndex(nextIndex));
        setLiveTranscript('');
      }, 600);

      addEvalTimeout(() => {
        if (isPlayingRef.current) {
          setPhase('idle');
          setTimeout(() => {
            if (isPlayingRef.current) setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
          }, 50);
        }
      }, 800);

    } else {
      let pinyinOfWrongWord = '---';
      let displayUserText = cleanTranscript || '(未偵測到發音)';

      if (cleanTranscript) {
        pinyinOfWrongWord = pinyinProFn(cleanTranscript, { type: 'string', toneType: 'symbol' }) as string;
      }

      setErrorData({
        userText: displayUserText,
        userPinyin: pinyinOfWrongWord,
        correctText: wordObj.hanzi,
        correctPinyin: wordObj.pinyin
      });

      recordHistory(wordObj, false, displayUserText, pinyinOfWrongWord);
      analyzeAndRecordMistakes(wordObj.hanzi, cleanTranscript);
      currentMistakesRef.current += 1;

      if (currentMistakesRef.current >= 3) {
        // 錯 3 次防卡死：展示錯誤 1.5 秒後直接跳轉至新字，不再重試舊字
        addEvalTimeout(() => {
          handleMoveToNextWordAfterFailure();
        }, 1500);
      } else {
        addEvalTimeout(() => {
          if (isPlayingRef.current) setPhase('system_speaking');
        }, 1000);
      }
    }
  };

  const handleSkipWord = () => {
    if (!currentWord) return;
    window.speechSynthesis.cancel();
    clearEvalTimeouts();
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) { }
    }

    const newHistory = recordHistory(currentWord, false, '手動跳過', '---');
    let nextIndex = globalIndexRef.current + 1;

    setGlobalIndex(nextIndex);
    saveProgress(nextIndex, newHistory);
    setCurrentWord(getWordByIndex(nextIndex));
    checkAndExpandDictionary(nextIndex);

    setErrorData(null);
    currentMistakesRef.current = 0;
    setLiveTranscript('');

    if (isPlayingRef.current) {
      setPhase('idle');
      setTimeout(() => {
        if (isPlayingRef.current) setPhase(autoPreReadRef.current ? 'system_speaking' : 'user_speaking');
      }, 50);
    } else {
      setPhase('idle');
    }
  };

  const shouldHidePinyin = isBlindMode && (phase === 'user_speaking' || phase === 'idle');

  // --- 繪製統計圖表組件 ---
  const renderToneBars = () => {
    const totalTones = (toneStats[1] || 0) + (toneStats[2] || 0) + (toneStats[3] || 0) + (toneStats[4] || 0) || 1;
    const toneLabels: Record<number, string> = { 1: '陰平', 2: '陽平', 3: '上聲', 4: '去聲' };
    const colors: Record<number, string> = { 1: 'bg-rose-400', 2: 'bg-amber-400', 3: 'bg-emerald-400', 4: 'bg-blue-400' };

    return (
      <div className="flex flex-col gap-3 w-full">
        <h4 className="text-sm font-bold text-slate-500 mb-1 border-b border-slate-100 pb-2">聲調錯誤分佈</h4>
        {[1, 2, 3, 4].map(t => {
          const pct = Math.round(((toneStats[t] || 0) / totalTones) * 100);
          return (
            <div key={t} className="flex items-center gap-3 text-xs font-bold text-slate-500">
              <span className="w-16 text-right">{toneLabels[t]}({t})</span>
              <div className="h-3 flex-1 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${colors[t]} transition-all duration-1000`} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-10 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    );
  };

  const renderStatList = (stats: Record<string, number>, title: string, titleColor: string) => {
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    if (total === 0) return (
      <div className="flex flex-col gap-2">
        <h4 className={`text-sm font-bold ${titleColor} mb-1 border-b border-slate-100 pb-2`}>{title}</h4>
        <div className="text-sm text-slate-400 py-2">目前表現完美，無錯誤紀錄</div>
      </div>
    );

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
  };

  if (!currentWord) return <div className="h-[100dvh] w-full bg-slate-50 flex items-center justify-center text-slate-500 font-bold text-xl">載入中...</div>;

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col font-sans text-slate-800 overflow-hidden relative">

      {isDownloadingDict && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <DownloadCloud className="w-16 h-16 text-blue-500 animate-bounce mb-4" />
          <h2 className="text-2xl font-black tracking-widest text-slate-800 mb-2">擴充詞庫自動載入中</h2>
          <p className="text-sm font-bold text-slate-500">保證您的學習永不中斷...</p>
        </div>
      )}

      {/* 頂部全域導航列 */}
      <header className="flex-none w-full max-w-5xl mx-auto flex items-center justify-between p-4 md:px-6 pt-safe z-20">
        <button
          onClick={openDictionary}
          className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 active:scale-95 transition-all text-blue-600 font-bold"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-xs tracking-wider">
            {globalIndex} / {dictionary.length} 詞
          </span>
          {isSavedPulse && <Save className="w-3 h-3 text-emerald-500 animate-pulse ml-0.5" />}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoPreRead}
            className={`px-3 py-2 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 gap-1.5 font-bold text-xs ${autoPreRead ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            title="切換先聽或先讀"
          >
            {autoPreRead ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="hidden sm:inline">{autoPreRead ? '先聽' : '先讀'}</span>
          </button>

          <button
            onClick={toggleBlindMode}
            className={`p-2.5 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 ${isBlindMode ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            title="盲讀模式"
          >
            {isBlindMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleTtsSpeed}
            className={`p-2.5 rounded-xl border shadow-sm flex items-center justify-center transition-all active:scale-95 ${ttsSpeed !== 0.85 ? 'bg-purple-50 border-purple-200 text-purple-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'}`}
            title="調整語速"
          >
            <Gauge className="w-4 h-4" />
            <span className="hidden sm:inline ml-1 text-xs">{ttsSpeed}x</span>
          </button>

          <button
            onClick={() => setShowCustomInput(true)}
            className="bg-white text-slate-600 p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center hover:bg-slate-100 active:scale-95 transition-all"
            title="自訂詞句"
          >
            <FileEdit className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className="bg-white text-slate-600 p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center hover:bg-slate-100 active:scale-95 transition-all"
            title="發音診斷中心"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 核心內容區域：防重疊整合佈局 */}
      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col px-4 md:px-6 pb-2 gap-3 md:gap-6 min-h-0 overflow-hidden">

        {/* 上半部分：整合式中央學習卡片 (左詞語 / 右狀態) */}
        <div className="flex-1 w-full bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row overflow-hidden min-h-0">

          {/* 左半部分：沉浸式字卡區塊 */}
          <div className="flex-[3] flex flex-col items-center justify-center p-4 sm:p-8 relative min-h-0 overflow-y-auto w-full">
            <span className={`font-mono font-bold text-slate-300 mb-2 md:mb-4 text-center transition-opacity duration-500 break-words w-full whitespace-normal leading-relaxed px-2 ${shouldHidePinyin ? 'opacity-0' : 'opacity-100'} ${
              currentWord.pinyin.length > 40 ? 'text-sm md:text-lg' :
              currentWord.pinyin.length > 20 ? 'text-lg md:text-2xl' :
              currentWord.pinyin.length > 10 ? 'text-xl md:text-3xl tracking-wider' :
              'text-2xl md:text-5xl tracking-[0.2em]'
            }`}>
              {currentWord.pinyin}
            </span>
            <span className={`font-black text-slate-800 text-center break-words w-full whitespace-normal px-2 ${
              currentWord.hanzi.length > 25 ? 'text-xl sm:text-2xl md:text-3xl leading-snug' :
              currentWord.hanzi.length > 15 ? 'text-[1.5rem] sm:text-[2rem] md:text-[3rem] leading-snug' :
              currentWord.hanzi.length > 8 ? 'text-[2.5rem] sm:text-[3rem] md:text-[4rem] leading-tight tracking-wide' :
              currentWord.hanzi.length > 4 ? 'text-[3rem] sm:text-[4rem] md:text-[5rem] lg:text-[6rem] leading-tight tracking-widest' :
              'text-[4rem] sm:text-[6rem] md:text-[8rem] lg:text-[9rem] leading-none tracking-widest'
            }`}>
              {currentWord.hanzi}
            </span>
          </div>

          {/* 視覺分隔線 */}
          <div className="w-full md:w-px h-px md:h-full bg-slate-100 flex-none"></div>

          {/* 右半部分 (手機在下)：語音狀態區塊 */}
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
                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                    <div className="bg-blue-100 p-3 md:p-4 rounded-full text-blue-500 shadow-sm">
                      <Mic className="w-5 h-5 md:w-6 md:h-6 z-10" />
                    </div>
                  </div>
                  <div className="text-base md:text-2xl font-bold text-slate-600 tracking-widest text-center min-h-[2.5rem] md:min-h-[3rem] flex items-center justify-center max-w-[90%] overflow-hidden">
                    <span className="truncate">{liveTranscript ? `「${liveTranscript}」` : "請朗讀..."}</span>
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

        {/* 下半部分：判定結果與錯誤對比面板 */}
        <div className={`flex-[0.8] md:flex-none w-full flex flex-col rounded-[1.5rem] md:rounded-[2rem] shadow-sm border p-3 md:p-5 transition-all duration-300 bg-white min-h-[100px] md:min-h-[160px] justify-center text-center
           ${errorData ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}
           ${phase === 'evaluating' && !errorData ? 'border-emerald-200 bg-emerald-50/30' : ''}
        `}>
          <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-3 text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest justify-center md:justify-start flex-none">
            <Activity className="w-3.5 h-3.5 md:w-4 md:h-4 hidden md:block" /> 判定結果
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
            {(!errorData && phase !== 'evaluating') && (
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
                  <span className="font-mono text-[9px] md:text-sm text-red-500 bg-white px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md md:rounded-lg shadow-sm border border-red-100 max-w-[50%] truncate shrink-0">{errorData.userPinyin}</span>
                </div>

                <div className="flex-1 w-full bg-emerald-50 border border-emerald-100 rounded-xl p-2 md:p-4 flex flex-row items-center justify-between shadow-sm relative overflow-hidden min-h-0">
                  <div className="flex flex-col pl-2 md:pl-3 text-left">
                    <span className="text-[9px] md:text-xs font-bold text-emerald-500 mb-0.5">正確應為</span>
                    <span className="text-sm md:text-xl font-black text-emerald-700">{errorData.correctText}</span>
                  </div>
                  <span className="font-mono text-[9px] md:text-sm text-emerald-600 bg-white px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md md:rounded-lg shadow-sm border border-emerald-100 shrink-0">{errorData.correctPinyin}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 底部控制按鈕區 */}
      <footer className="flex-none w-full pb-safe flex items-center justify-center gap-8 py-4 z-10 bg-gradient-to-t from-slate-50 to-transparent">
        <button
          onClick={togglePlayPause}
          className={`w-16 h-16 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95 border-4
            ${isPlaying
              ? 'bg-rose-500 hover:bg-rose-600 border-rose-200 text-white shadow-[0_10px_30px_rgba(244,63,94,0.3)]'
              : 'bg-blue-500 hover:bg-blue-600 border-blue-200 text-white shadow-[0_10px_30px_rgba(59,130,246,0.3)]'
            }`}
          title={isPlaying ? "停止學習" : "開始學習"}
        >
          {isPlaying ? <Pause className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" /> : <Play className="w-8 h-8 md:w-10 md:h-10 ml-2" fill="currentColor" />}
        </button>

        <button
          onClick={handleSkipWord}
          className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white border-[4px] border-slate-100 shadow-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all"
          title="跳過此字"
        >
          <SkipForward className="w-5 h-5 md:w-7 md:h-7" />
        </button>
      </footer>

      {/* 萬字詞庫總覽 Modal */}
      {showDictionary && (
        <div className="absolute inset-0 z-50 bg-gray-900/40 backdrop-blur-md flex flex-col p-4 pt-safe sm:p-10 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl flex-1 flex flex-col overflow-hidden w-full max-w-2xl mx-auto">
            <div className="p-4 md:p-6 flex justify-between items-center border-b border-gray-100">
              <h2 className="text-lg md:text-xl font-black tracking-widest text-blue-600 flex items-center gap-2">
                <BookOpen className="w-5 h-5 md:w-6 md:h-6" /> 萬字詞庫總覽
              </h2>
              <button onClick={() => setShowDictionary(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 md:p-4 bg-gray-50 border-b border-gray-100">
              <button onClick={() => setDictPage(p => Math.max(0, p - 1))} disabled={dictPage === 0} className="p-2 bg-white rounded-lg shadow-sm disabled:opacity-30 hover:bg-gray-100 transition active:scale-95">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-xs md:text-sm font-bold text-gray-600 tracking-wider">
                {dictPage * WORDS_PER_PAGE + 1} - {Math.min((dictPage + 1) * WORDS_PER_PAGE, dictionary.length)}
                <span className="text-gray-400 text-[10px] md:text-xs ml-1">/ {dictionary.length}</span>
              </span>
              <button onClick={() => setDictPage(p => p + 1)} disabled={(dictPage + 1) * WORDS_PER_PAGE >= dictionary.length} className="p-2 bg-white rounded-lg shadow-sm disabled:opacity-30 hover:bg-gray-100 transition active:scale-95">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
              {Array.from({ length: Math.min(WORDS_PER_PAGE, dictionary.length - dictPage * WORDS_PER_PAGE) }).map((_, idx) => {
                const wordIdx = dictPage * WORDS_PER_PAGE + idx;
                const w = getWordByIndex(wordIdx);
                const isLearned = wordIdx < globalIndex;
                const isCurrent = wordIdx === globalIndex;

                return (
                  <div key={wordIdx} className={`flex items-center justify-between border p-3 rounded-2xl transition-all ${isCurrent ? 'bg-blue-50 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' :
                      isLearned ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100 text-gray-400'
                    }`}>
                    <div className="flex items-center gap-3 md:gap-4">
                      <span className="text-[10px] md:text-xs font-mono text-gray-400 w-6 md:w-8 text-right">{wordIdx + 1}.</span>
                      <span className={`text-lg md:text-xl font-black ${isCurrent ? 'text-blue-600' : isLearned ? 'text-green-700' : 'text-gray-400'}`}>
                        {w.hanzi}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xs md:text-sm font-mono ${isCurrent ? 'text-blue-500' : isLearned ? 'text-green-600' : 'text-gray-400'}`}>
                        {w.pinyin}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 自訂詞句 Modal */}
      {showCustomInput && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col p-4 pt-safe sm:p-10 animate-fade-in text-slate-800">
          <div className="bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden w-full max-w-xl mx-auto my-auto max-h-full">
            <div className="p-4 md:p-6 flex justify-between items-center bg-slate-50 border-b border-slate-100">
              <h2 className="text-lg md:text-xl font-black tracking-widest text-slate-800 flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-indigo-500" /> 加入自訂練習
              </h2>
              <button onClick={() => setShowCustomInput(false)} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300 transition">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-4 md:p-6 flex flex-col gap-4 flex-1 overflow-y-auto">
              <p className="text-sm font-bold text-slate-500">
                貼上或輸入想練習的句子與詞語。系統將自動使用標點符號幫您拆分成多個句子進行訓練！
              </p>
              <textarea 
                className="w-full flex-1 min-h-[150px] md:min-h-[200px] border-2 border-slate-200 rounded-xl p-4 text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all resize-none text-lg font-medium"
                placeholder="例如：我明天要去見客戶，希望能順利。今天的空氣真好..."
                value={customText}
                onChange={e => setCustomText(e.target.value)}
              />
              <button 
                onClick={handleAddCustomText}
                className="w-full py-4 text-white bg-indigo-500 hover:bg-indigo-600 active:scale-[0.98] font-bold tracking-widest rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-2"
              >
                <FileEdit className="w-5 h-5" /> 生成自訂練習任務
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 發音診斷中心 Modal */}
      {showHistory && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col p-4 pt-safe sm:p-10 animate-fade-in text-slate-800">
          <div className="bg-slate-50 rounded-3xl shadow-2xl flex-1 flex flex-col overflow-hidden w-full max-w-2xl mx-auto">
            <div className="p-4 md:p-6 flex justify-between items-center border-b border-slate-200 bg-white">
              <h2 className="text-lg md:text-xl font-black tracking-widest text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 md:w-6 md:h-6 text-blue-500" /> 發音診斷中心
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 md:gap-6">
              {/* 頂部：最常錯發音與聲調分析 */}
              {(() => {
                const toneLabels: Record<string, string> = { 1: '第 1 聲 (陰平)', 2: '第 2 聲 (陽平)', 3: '第 3 聲 (上聲)', 4: '第 4 聲 (去聲)' };
                let maxToneCount = 0;
                let topTone: string | null = null;
                Object.entries((toneStats || {}) as Record<string, number>).forEach(([tone, count]) => {
                  if (count > maxToneCount) { maxToneCount = count; topTone = tone; }
                });

                let maxInitialCount = 0;
                let topInitial: string | null = null;
                Object.entries((initialStats || {}) as Record<string, number>).forEach(([initial, count]) => {
                  if (count > maxInitialCount) { maxInitialCount = count; topInitial = initial; }
                });

                return (
                  <div className="grid grid-cols-2 gap-3 md:gap-4 mb-2">
                    <div className="bg-rose-50 border border-rose-100 p-3 md:p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-sm">
                      <span className="text-[10px] md:text-xs font-bold text-rose-400 mb-1">最易錯聲母</span>
                      <span className="text-xl md:text-2xl font-black text-rose-600">{topInitial || '無'}</span>
                      <span className="text-[10px] text-rose-500/70 mt-1">{maxInitialCount > 0 ? `累積錯 ${maxInitialCount} 次` : '表現完美'}</span>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 p-3 md:p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-sm">
                      <span className="text-[10px] md:text-xs font-bold text-blue-400 mb-1">最易錯聲調</span>
                      <span className="text-base md:text-xl font-black text-blue-600">{topTone ? toneLabels[topTone] : '無'}</span>
                      <span className="text-[10px] text-blue-500/70 mt-1">{maxToneCount > 0 ? `累積錯 ${maxToneCount} 次` : '表現完美'}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
                {renderToneBars()}
              </div>
              <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
                {renderStatList(initialStats, '聲母錯誤統計 (Initials)', 'text-rose-500')}
              </div>
              <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-2xl shadow-sm">
                {renderStatList(finalStats, '韻母錯誤統計 (Finals)', 'text-blue-500')}
              </div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        @supports (padding-top: env(safe-area-inset-top)) {
          .pt-safe { padding-top: max(1rem, env(safe-area-inset-top)); }
          .pb-safe { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
        }
      `}} />
    </div>
  );
}