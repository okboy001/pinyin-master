import { Activity, Flame, Play, RefreshCw, Sparkles, BookOpen, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGES, LESSONS, lessonsForStage, estimatePathProgress, isStageUnlocked, isLessonPrereqMet, recommendNextLesson, recommendDailyPlan, curriculumStats, fluencyCheckpointGaps, lessonPrereqGaps, type Lesson } from '../data/curriculum';
import { dailyScenePackKind, SCENE_PACK_LABELS } from '../lib/weakDrill';
import type { PathProgress } from '../types';
import { srsStats, type SrsState } from '../lib/srs';

type Props = {
  pathProgress: PathProgress;
  srs: SrsState;
  resumeLesson?: Lesson | null;
  resumeIndex?: number;
  onStartLesson: (lesson: Lesson) => void;
  onStartSlowLesson?: (lesson: Lesson) => void;
  onResumeLesson?: () => void;
  onStartSrs: () => void;
  onStartFree: () => void;
  onOpenCustom?: () => void;
  onOpenDiagnosis: () => void;
  onStartWeakDrill?: () => void;
  canStartWeakDrill?: boolean;
  onSetDailyGoal?: (goal: number) => void;
  onStartLowStar?: (lesson: Lesson) => void;
  onStartMixedReview?: () => void;
  canStartMixedReview?: boolean;
  onStartFluencyWarmup?: () => void;
  canStartFluencyWarmup?: boolean;
  onStartSurvivalDrill?: () => void;
  onStartSocialDrill?: () => void;
  onStartDiningDrill?: () => void;
  onStartTravelDrill?: () => void;
  onStartWorkDrill?: () => void;
  onStartDailySceneDrill?: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  onShareProgress?: () => void;
};

export function PathHome({
  pathProgress,
  srs,
  resumeLesson = null,
  resumeIndex = 0,
  onStartLesson,
  onStartSlowLesson,
  onResumeLesson,
  onStartSrs,
  onStartFree,
  onOpenCustom,
  onOpenDiagnosis,
  onStartWeakDrill,
  canStartWeakDrill = false,
  onSetDailyGoal,
  onStartLowStar,
  onStartMixedReview,
  canStartMixedReview = false,
  onStartFluencyWarmup,
  canStartFluencyWarmup = false,
  onStartSurvivalDrill,
  onStartSocialDrill,
  onStartDiningDrill,
  onStartTravelDrill,
  onStartWorkDrill,
  onStartDailySceneDrill,
  onExportBackup,
  onImportBackup,
  onShareProgress,
}: Props) {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [milestoneToast, setMilestoneToast] = useState(false);
  const [installHint, setInstallHint] = useState(false);
  const [stageOpen, setStageOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem('pm_stage_open_v1');
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [introOpen, setIntroOpen] = useState(false);
  const [scenePacksOpen, setScenePacksOpen] = useState(false);
  const [dataToolsOpen, setDataToolsOpen] = useState(false);
  const resumeRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('pm_stage_open_v1', JSON.stringify(stageOpen));
    } catch {
      /* ignore */
    }
  }, [stageOpen]);
  useEffect(() => {
    const goOff = () => setOffline(true);
    const goOn = () => setOffline(false);
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    return () => {
      window.removeEventListener('offline', goOff);
      window.removeEventListener('online', goOn);
    };
  }, []);

  useEffect(() => {
      try {
      if (localStorage.getItem('pm_milestone_v1891')) return;
      localStorage.setItem('pm_milestone_v1891', '1');
      setMilestoneToast(true);
      const t = window.setTimeout(() => setMilestoneToast(false), 4500);
      return () => window.clearTimeout(t);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem('pm_install_hint_v1')) return;
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone);
      const coarse = window.matchMedia('(pointer: coarse)').matches || nav.maxTouchPoints > 0;
      if (standalone || !coarse) return;
      localStorage.setItem('pm_install_hint_v1', '1');
      setInstallHint(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!resumeLesson) return undefined;
    setStageOpen((prev) => ({ ...prev, [resumeLesson.stageId]: true }));
    const t = window.setTimeout(() => {
      resumeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 450);
    return () => window.clearTimeout(t);
  }, [resumeLesson?.id, resumeLesson?.stageId]);

  const path = estimatePathProgress(pathProgress.completedLessons);
  const curriculum = curriculumStats();
  const srsInfo = srsStats(srs);
  const dailyPct = Math.min(100, Math.round((pathProgress.dailyCorrect / Math.max(1, pathProgress.dailyGoal)) * 100));

  const lastDone =
    pathProgress.completedLessons[pathProgress.completedLessons.length - 1] ?? null;
  const nextLesson = recommendNextLesson(pathProgress.completedLessons, lastDone);
  const nextPrereqGaps = useMemo(
    () => lessonPrereqGaps(nextLesson, pathProgress.completedLessons).slice(0, 2),
    [nextLesson, pathProgress.completedLessons],
  );
  const nextBest = pathProgress.lessonBest?.[nextLesson.id] ?? 0;
  const nextStars = nextBest >= 90 ? 3 : nextBest >= 75 ? 2 : nextBest >= 60 ? 1 : 0;
  const nextIsFollowUpDictation =
    Boolean(lastDone) &&
    nextLesson.kind === 'dictation' &&
    nextLesson.unlockAfter?.includes(lastDone!);
  const nextIsFollowUpScene =
    Boolean(lastDone) &&
    !nextIsFollowUpDictation &&
    (nextLesson.stageId === 'conversation' || nextLesson.stageId === 'phrases') &&
    nextLesson.unlockAfter?.includes(lastDone!);
  const nextFollowLabel = nextIsFollowUpDictation
    ? '聽寫跟進'
    : nextIsFollowUpScene
      ? '場景跟進'
      : null;

  const dailyPlan = recommendDailyPlan(pathProgress.completedLessons, lastDone);
  const dailyPlanMinutes = dailyPlan.reduce((sum, l) => sum + l.minutes, 0);
  const remainingMinutes = LESSONS.filter((l) => !pathProgress.completedLessons.includes(l.id)).reduce(
    (sum, l) => sum + l.minutes,
    0,
  );

  const lowStar = LESSONS
    .filter((l) => pathProgress.completedLessons.includes(l.id))
    .map((l) => ({ lesson: l, best: pathProgress.lessonBest?.[l.id] ?? 0 }))
    .filter((x) => x.best > 0 && x.best < 90)
    .sort((a, b) => a.best - b.best)[0] ?? null;
  const lowStarLesson = lowStar?.lesson ?? null;

  const dailySceneKind = useMemo(() => dailyScenePackKind(), []);
  const dailySceneLabel = SCENE_PACK_LABELS[dailySceneKind];
  const checkpointGaps = useMemo(
    () => fluencyCheckpointGaps(pathProgress.completedLessons),
    [pathProgress.completedLessons],
  );

  return (
    <div className="h-[100dvh] w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white overflow-y-auto">
      {milestoneToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-2xl bg-indigo-500 text-white text-sm font-black shadow-xl animate-fade-in text-center max-w-[92%]">
          新：連對可分享 · 今日目標就快達標會閃
        </div>
      )}
      {installHint && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[min(92%,22rem)] px-4 py-3 rounded-2xl bg-slate-900/95 border border-white/15 text-white text-xs font-bold shadow-xl animate-fade-in text-center"
          onClick={() => setInstallHint(false)}
          onTouchStart={(e) => {
            (e.currentTarget as HTMLElement).dataset.ty = String(e.touches[0]?.clientY ?? '');
          }}
          onTouchEnd={(e) => {
            const start = Number((e.currentTarget as HTMLElement).dataset.ty || '');
            const end = e.changedTouches[0]?.clientY ?? start;
            if (Number.isFinite(start) && end - start > 48) setInstallHint(false);
          }}
          role="status"
        >
          <p>可「加到主畫面」當 App 用，離線都練到</p>
          <button
            type="button"
            className="mt-2 text-[11px] font-black text-indigo-200 underline underline-offset-2"
            onClick={(e) => {
              e.stopPropagation();
              setInstallHint(false);
            }}
          >
            知道了
          </button>
        </div>
      )}
      <div className="max-w-3xl mx-auto px-4 pt-safe pb-safe py-6 md:py-10 space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold tracking-[0.2em] uppercase">
            <Sparkles className="w-4 h-4" /> Pinyin Master · 零到流利
            {offline && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal text-amber-200 bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 rounded-full">
                <WifiOff className="w-3 h-3" /> 離線
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            由完全唔識，
            <br />
            練到講得出口。
          </h1>
          <div className="text-slate-300 text-sm md:text-base max-w-xl leading-relaxed">
            <p className={introOpen ? '' : 'line-clamp-2 md:line-clamp-none'}>
              跟住六關路線：四聲 → 易混淆音 → 音節 → 高頻詞 → 短句 → 對話。聽示範、跟讀、錯咗就用間隔複習返嚟。
              而家共有 {curriculum.lessons} 課（約 {curriculum.minutes} 分鐘）。
              手機用 Chrome／Safari 可「加到主畫面」，方便每日開口。
            </p>
            <button
              type="button"
              onClick={() => setIntroOpen((v) => !v)}
              className="md:hidden mt-1.5 text-[11px] font-black text-indigo-300 underline underline-offset-2"
            >
              {introOpen ? '收起介紹' : '睇多啲'}
            </button>
          </div>
          {path.percent >= 100 && (
            <div className="rounded-2xl border border-violet-400/40 bg-violet-400/15 px-4 py-3 text-sm text-violet-100 leading-relaxed">
              <span className="font-black text-violet-200">路徑完成！</span>
              {' '}六關都過晒。可重練低星課、開弱項特訓，或者用自由詞庫／自訂句子繼續練流利。
            </div>
          )}
          {pathProgress.completedLessons.includes('fluency-checkpoint') ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-400/15 px-4 py-3 text-sm text-amber-50 leading-relaxed">
              <span className="font-black text-amber-200">流利總複習已過關！</span>
              {' '}生存句盲跟讀過咗——繼續用混合複習同弱項特訓保持開口。
            </div>
          ) : path.stageId === 'conversation' && path.percent >= 70 ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 leading-relaxed">
              <span className="font-black text-amber-200">即將挑戰流利總複習</span>
              {checkpointGaps.length > 0 ? (
                <>
                  {' '}建議先完成：
                  {checkpointGaps.map((l, i) => (
                    <span key={l.id}>
                      {i > 0 ? '、' : ''}
                      <button
                        type="button"
                        onClick={() => onStartLesson(l)}
                        className="underline underline-offset-2 font-black hover:text-white"
                      >
                        {l.title}
                      </button>
                    </span>
                  ))}
                  。生存句盲跟讀，正確率 ≥70%。
                </>
              ) : (
                <>
                  {' '}生存句盲跟讀，正確率 ≥70%、題目覆蓋更高——建議先用流利熱身熱身。
                </>
              )}
            </div>
          ) : null}
          {pathProgress.dailyCorrect >= pathProgress.dailyGoal && onShareProgress && (
            <button
              type="button"
              onClick={onShareProgress}
              className="w-full text-left rounded-2xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100 leading-relaxed active:scale-[0.99] transition"
            >
              <span className="font-black text-emerald-300">今日目標已達成！</span>
              {' '}完成 {pathProgress.dailyCorrect} 次正確跟讀。點呢度分享進度，或者繼續下一課。
            </button>
          )}
          {pathProgress.dailyCorrect >= pathProgress.dailyGoal && !onShareProgress && (
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100 leading-relaxed">
              <span className="font-black text-emerald-300">今日目標已達成！</span>
              {' '}完成 {pathProgress.dailyCorrect} 次正確跟讀。可繼續下一課，或者休息，聽日再嚟保持連續。
            </div>
          )}
          {pathProgress.completedLessons.length === 0 && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 leading-relaxed">
              <span className="font-black text-amber-300">新手建議：</span>
              先完成「四聲入門」。唔使一次講好多字——每日 15–20 分鐘、連續幾日，進步會好明顯。用 Chrome／Safari，允許麥克風。
            </div>
          )}
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {onShareProgress && pathProgress.streak > 0 ? (
            <button
              type="button"
              onClick={onShareProgress}
              className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center active:scale-[0.98] transition"
              title="分享連續天數"
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">連續 · 分享</div>
              <div className="text-2xl font-black flex items-center justify-center gap-1 mt-1">
                <Flame className="w-5 h-5 text-orange-400" /> {pathProgress.streak}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {pathProgress.streak === 1 ? '日 · 點一下分享' : `日 · 點一下分享`}
              </div>
            </button>
          ) : (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">連續</div>
              <div className="text-2xl font-black flex items-center justify-center gap-1 mt-1">
                <Flame className="w-5 h-5 text-orange-400" /> {pathProgress.streak}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {pathProgress.streak <= 0 ? '今日開口可開波' : pathProgress.streak === 1 ? '日 · 繼續保持' : `日 · 好！`}
              </div>
            </div>
          )}
          <div
            className={`rounded-2xl border p-3 text-center ${
              pathProgress.dailyCorrect >= pathProgress.dailyGoal
                ? 'bg-emerald-400/15 border-emerald-400/40'
                : pathProgress.dailyGoal - pathProgress.dailyCorrect <= 3 && pathProgress.dailyCorrect > 0
                  ? 'bg-amber-400/10 border-amber-400/40 animate-pulse'
                  : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              {pathProgress.dailyCorrect >= pathProgress.dailyGoal
                ? '今日目標 · 達標'
                : pathProgress.dailyGoal - pathProgress.dailyCorrect <= 3 && pathProgress.dailyCorrect > 0
                  ? '今日目標 · 就快'
                  : '今日目標'}
            </div>
            <div className="text-2xl font-black mt-1">{pathProgress.dailyCorrect}/{pathProgress.dailyGoal}</div>
            <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${dailyPct}%` }} />
            </div>
            {pathProgress.dailyCorrect < pathProgress.dailyGoal &&
              pathProgress.dailyGoal - pathProgress.dailyCorrect <= 3 &&
              pathProgress.dailyCorrect > 0 && (
                <div className="text-[10px] text-amber-200 font-black mt-1">
                  仲差 {pathProgress.dailyGoal - pathProgress.dailyCorrect} 次
                </div>
              )}
            {onSetDailyGoal && (
              <div className="flex justify-center gap-1.5 mt-2">
                {[15, 20, 30].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onSetDailyGoal(g)}
                    className={`text-[11px] font-black px-2.5 py-1.5 rounded-lg border transition active:scale-95 ${
                      pathProgress.dailyGoal === g
                        ? 'bg-emerald-400/25 border-emerald-300/50 text-emerald-100'
                        : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              document.getElementById('pm-path-stages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              try {
                if (navigator.vibrate) navigator.vibrate(6);
              } catch {
                /* ignore */
              }
            }}
            className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center active:scale-[0.98] transition"
            title="跳去學習路徑"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">路徑 · 跳去</div>
            <div className="text-2xl font-black mt-1">{path.percent}%</div>
            <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-indigo-400 transition-all"
                style={{ width: `${Math.min(100, path.percent)}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {path.completed}/{path.total} 課
              {remainingMinutes > 0 ? ` · 約剩 ${remainingMinutes} 分` : ''}
            </div>
          </button>
          <button
            type="button"
            onClick={onOpenDiagnosis}
            className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center active:scale-[0.98] transition"
            title="打開發音診斷"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">累計 · 診斷</div>
            <div className="text-2xl font-black mt-1">{pathProgress.lifetimeCorrect}</div>
            <div className="text-[10px] text-slate-400 mt-1">跟讀次數 · 點開</div>
          </button>
        </section>

        {(srsInfo.due > 0 || srsInfo.struggling > 0) && (
          <section className="rounded-2xl border border-rose-400/40 bg-rose-500/15 px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-black text-rose-100 text-sm">
                有 {Math.max(srsInfo.due, srsInfo.struggling)} 項弱項要複習
              </div>
              <p className="text-[11px] text-rose-100/80 font-bold mt-0.5 leading-snug">
                約 5 分鐘 · 趁熱打鐵，唔好堆積
              </p>
            </div>
            <button
              type="button"
              onClick={onStartSrs}
              className="shrink-0 inline-flex items-center gap-1.5 bg-white text-rose-800 font-black text-sm px-3.5 py-2.5 rounded-xl active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 立即複習
            </button>
          </section>
        )}

        <section className="rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 p-5 md:p-6 shadow-xl shadow-indigo-900/40">
          <div className="text-xs font-bold text-indigo-100/80 tracking-widest uppercase mb-2 flex items-center gap-2">
            建議下一步
            {nextFollowLabel && (
              <span className="normal-case tracking-normal text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded-md">
                {nextFollowLabel}
              </span>
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-black mb-1">{nextLesson.title}</h2>
          <p className="text-sm text-indigo-100 mb-1">{nextLesson.subtitle} · 約 {nextLesson.minutes} 分鐘</p>
          {nextPrereqGaps.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] text-indigo-100/80 font-bold">建議先：</span>
              {nextPrereqGaps.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onStartLesson(g)}
                  className="text-[11px] font-black bg-white/15 hover:bg-white/25 text-white px-2 py-0.5 rounded-md underline-offset-2 hover:underline"
                >
                  {g.title}
                </button>
              ))}
            </div>
          )}
          {nextBest > 0 ? (
            <p className="text-xs text-amber-200 font-bold mb-4 tracking-widest" aria-label={`最佳 ${nextStars} 星`}>
              最佳 {'★'.repeat(nextStars)}{'☆'.repeat(3 - nextStars)} · {nextBest}%
            </p>
          ) : (
            <div className="mb-3" />
          )}
          {dailyPlan.length > 0 && (
            <div className="mb-4 rounded-2xl bg-black/15 border border-white/15 px-3 py-2 text-xs text-indigo-50">
              <div className="font-black mb-1">
                今日建議（約{' '}
                {dailyPlanMinutes +
                  (onStartDailySceneDrill ? 5 : 0) +
                  (srsInfo.due > 0 || srsInfo.struggling > 0 ? 5 : 0)}{' '}
                分鐘）
              </div>
              {(() => {
                const focus =
                  dailyPlan.find((l) => !pathProgress.completedLessons.includes(l.id)) ?? dailyPlan[0];
                if (!focus) return null;
                const focusDone = pathProgress.completedLessons.includes(focus.id);
                return (
                  <button
                    type="button"
                    onClick={() => onStartLesson(focus)}
                    className="mb-2 w-full inline-flex items-center justify-center gap-2 bg-indigo-400 text-indigo-950 font-black text-sm px-3 py-3 rounded-xl active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4" fill="currentColor" />
                    {focusDone ? `重溫 · ${focus.title}` : `開始今日建議 · ${focus.title}`}
                    <span className="text-[10px] font-bold opacity-70">· {focus.minutes} 分</span>
                  </button>
                );
              })()}
              <ol className="list-decimal pl-4 space-y-1 font-medium text-indigo-100/90">
                {(srsInfo.due > 0 || srsInfo.struggling > 0) && (
                  <li>
                    <button
                      type="button"
                      onClick={onStartSrs}
                      className="w-full text-left rounded-xl px-2 py-2.5 -mx-1 hover:bg-white/10 active:bg-white/15 active:scale-[0.99] transition"
                    >
                      <span className="font-black text-sm text-white">複習弱項</span>
                      <span className="opacity-70 text-xs font-bold">
                        {' '}
                        · {Math.max(srsInfo.due, srsInfo.struggling)} 項 · 約 5 分
                      </span>
                      <span className="ml-1 text-[10px] font-black text-rose-200/90">到期</span>
                    </button>
                  </li>
                )}
                {dailyPlan.map((l, idx) => {
                  const done = pathProgress.completedLessons.includes(l.id);
                  return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onStartLesson(l)}
                      className={`w-full text-left rounded-xl px-2 py-2.5 -mx-1 hover:bg-white/10 active:bg-white/15 active:scale-[0.99] transition ${done ? 'opacity-70' : ''}`}
                    >
                      <span className="font-black text-sm text-white">{l.title}</span>
                      <span className="opacity-70 text-xs font-bold"> · {l.minutes} 分</span>
                      {done && (
                        <span className="ml-1 text-[10px] font-black text-emerald-200/90">已完成</span>
                      )}
                      {!done &&
                        idx === 0 &&
                        dailyPlan.length > 1 &&
                        dailyPlan[1].unlockAfter?.includes(l.id) && (
                          <span className="ml-1 text-[10px] font-black text-amber-200/90">前置</span>
                        )}
                    </button>
                  </li>
                  );
                })}
                {onStartDailySceneDrill && (
                  <li>
                    <button
                      type="button"
                      onClick={onStartDailySceneDrill}
                      className="text-left hover:text-white underline-offset-2 hover:underline"
                    >
                      今日場景 · {dailySceneLabel}包
                      <span className="opacity-70"> · 約 5 分 · 盲跟讀</span>
                    </button>
                  </li>
                )}
              </ol>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {resumeLesson && onResumeLesson && (
              <button
                type="button"
                onClick={onResumeLesson}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-300 text-amber-950 font-black px-4 py-3.5 rounded-2xl hover:bg-amber-200 transition active:scale-[0.98]"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                繼續「{resumeLesson.title}」({resumeIndex + 1}/{resumeLesson.items.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => onStartLesson(nextLesson)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-black px-5 py-3.5 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition"
            >
              <Play className="w-4 h-4" fill="currentColor" /> 開始今日建議
            </button>
            <button
              type="button"
              onClick={onStartSrs}
              disabled={srsInfo.due === 0 && srsInfo.struggling === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/15 border border-white/25 font-bold px-4 py-3.5 rounded-2xl disabled:opacity-40 hover:bg-white/25 transition active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" /> 複習弱項 ({Math.max(srsInfo.due, srsInfo.struggling)})
            </button>
            {lowStarLesson && onStartLowStar && (
              <button
                type="button"
                onClick={() => onStartLowStar(lowStarLesson)}
                onPointerDown={(e) => {
                  if (!onStartSlowLesson) return;
                  const target = e.currentTarget;
                  target.dataset.slowHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.slowHold = '1';
                    onStartSlowLesson(lowStarLesson);
                    try {
                      if (navigator.vibrate) navigator.vibrate(12);
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
                  if (e.currentTarget.dataset.slowHold === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.dataset.slowHold = '0';
                  }
                }}
                onContextMenu={(e) => {
                  if (onStartSlowLesson) e.preventDefault();
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-400/20 border border-amber-300/40 font-bold px-4 py-3.5 rounded-2xl hover:bg-amber-400/30 transition text-amber-50 active:scale-[0.98]"
                title={onStartSlowLesson ? '點擊衝星 · 長按慢速重練' : '衝星重練'}
              >
                衝星：{lowStarLesson.title}
                {lowStar && (
                  <span className="text-[10px] font-black opacity-80">· {lowStar.best}%</span>
                )}
                {onStartSlowLesson && (
                  <span className="text-[10px] font-black opacity-70">· 長按慢</span>
                )}
              </button>
            )}
            {onStartMixedReview && (
              <button
                type="button"
                onClick={onStartMixedReview}
                disabled={!canStartMixedReview}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/15 border border-white/25 font-bold px-4 py-3.5 rounded-2xl disabled:opacity-40 hover:bg-white/25 transition active:scale-[0.98]"
              >
                混合複習
              </button>
            )}
            {onStartFluencyWarmup && (
              <button
                type="button"
                onClick={onStartFluencyWarmup}
                disabled={!canStartFluencyWarmup}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-400/20 border border-emerald-300/40 font-bold px-4 py-3.5 rounded-2xl disabled:opacity-40 hover:bg-emerald-400/30 transition text-emerald-50 active:scale-[0.98]"
              >
                流利熱身
              </button>
            )}
          </div>
          {(onStartSurvivalDrill || onStartSocialDrill || onStartDiningDrill || onStartTravelDrill || onStartWorkDrill || onStartDailySceneDrill) && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[10px] font-black tracking-wider uppercase text-indigo-100/70">
                  場景包 · 盲跟讀
                </div>
                <button
                  type="button"
                  className="md:hidden text-[10px] font-black text-indigo-100/80 underline underline-offset-2"
                  onClick={() => setScenePacksOpen((v) => !v)}
                >
                  {scenePacksOpen ? '收起全部' : '睇晒場景'}
                </button>
              </div>
              {onStartDailySceneDrill && (
                <button
                  type="button"
                  onClick={onStartDailySceneDrill}
                  className="mb-2 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-800 font-black px-4 py-2.5 rounded-2xl hover:bg-indigo-50 transition text-sm active:scale-[0.98]"
                >
                  今日場景 · {dailySceneLabel}
                </button>
              )}
              <div className={`grid grid-cols-2 sm:flex sm:flex-wrap gap-2 ${scenePacksOpen ? '' : 'hidden md:grid md:grid-cols-2 lg:flex'}`}>
                {onStartSurvivalDrill && (
                  <button
                    type="button"
                    onClick={onStartSurvivalDrill}
                    className={`inline-flex items-center justify-center gap-2 font-bold px-4 py-3 rounded-2xl text-sm transition active:scale-[0.98] ${
                      dailySceneKind === 'survival'
                        ? 'bg-white text-rose-800 ring-2 ring-white/40'
                        : 'bg-rose-400/20 border border-rose-300/40 hover:bg-rose-400/30 text-rose-50'
                    }`}
                  >
                    生存{dailySceneKind === 'survival' ? ' · 今日' : ''}
                  </button>
                )}
                {onStartSocialDrill && (
                  <button
                    type="button"
                    onClick={onStartSocialDrill}
                    className={`inline-flex items-center justify-center gap-2 font-bold px-4 py-3 rounded-2xl text-sm transition active:scale-[0.98] ${
                      dailySceneKind === 'social'
                        ? 'bg-white text-sky-800 ring-2 ring-white/40'
                        : 'bg-sky-400/20 border border-sky-300/40 hover:bg-sky-400/30 text-sky-50'
                    }`}
                  >
                    社交{dailySceneKind === 'social' ? ' · 今日' : ''}
                  </button>
                )}
                {onStartDiningDrill && (
                  <button
                    type="button"
                    onClick={onStartDiningDrill}
                    className={`inline-flex items-center justify-center gap-2 font-bold px-4 py-3 rounded-2xl text-sm transition active:scale-[0.98] ${
                      dailySceneKind === 'dining'
                        ? 'bg-white text-amber-900 ring-2 ring-white/40'
                        : 'bg-amber-400/20 border border-amber-300/40 hover:bg-amber-400/30 text-amber-50'
                    }`}
                  >
                    飲食{dailySceneKind === 'dining' ? ' · 今日' : ''}
                  </button>
                )}
                {onStartTravelDrill && (
                  <button
                    type="button"
                    onClick={onStartTravelDrill}
                    className={`inline-flex items-center justify-center gap-2 font-bold px-4 py-3 rounded-2xl text-sm transition active:scale-[0.98] ${
                      dailySceneKind === 'travel'
                        ? 'bg-white text-teal-900 ring-2 ring-white/40'
                        : 'bg-teal-400/20 border border-teal-300/40 hover:bg-teal-400/30 text-teal-50'
                    }`}
                  >
                    出行{dailySceneKind === 'travel' ? ' · 今日' : ''}
                  </button>
                )}
                {onStartWorkDrill && (
                  <button
                    type="button"
                    onClick={onStartWorkDrill}
                    className={`inline-flex items-center justify-center gap-2 font-bold px-4 py-3 rounded-2xl text-sm transition active:scale-[0.98] col-span-2 sm:col-span-1 ${
                      dailySceneKind === 'work'
                        ? 'bg-white text-violet-900 ring-2 ring-white/40'
                        : 'bg-violet-400/20 border border-violet-300/40 hover:bg-violet-400/30 text-violet-50'
                    }`}
                  >
                    職場{dailySceneKind === 'work' ? ' · 今日' : ''}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onStartFree}
            onPointerDown={(e) => {
              if (!onOpenCustom) return;
              const target = e.currentTarget;
              target.dataset.customHold = '0';
              const timer = window.setTimeout(() => {
                target.dataset.customHold = '1';
                onOpenCustom();
                try {
                  if (navigator.vibrate) navigator.vibrate(12);
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
              if (e.currentTarget.dataset.customHold === '1') {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.dataset.customHold = '0';
              }
            }}
            onContextMenu={(e) => {
              if (onOpenCustom) e.preventDefault();
            }}
            className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3.5 text-sm font-bold hover:bg-white/10 transition flex items-center justify-center gap-2 active:scale-[0.98]"
            title={onOpenCustom ? '點擊自由詞庫 · 長按自訂句子' : '自由詞庫'}
          >
            <BookOpen className="w-4 h-4" /> 自由詞庫{onOpenCustom ? ' · 長按自訂' : ''}
          </button>
          <button
            type="button"
            onClick={onOpenDiagnosis}
            className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3.5 text-sm font-bold hover:bg-white/10 transition active:scale-[0.98]"
          >
            發音診斷
          </button>
          {onStartWeakDrill && (
            <button
              type="button"
              onClick={onStartWeakDrill}
              disabled={!canStartWeakDrill}
              className="flex-1 rounded-2xl bg-rose-500/20 border border-rose-400/30 px-4 py-3.5 text-sm font-bold hover:bg-rose-500/30 transition disabled:opacity-40 active:scale-[0.98]"
            >
              弱項特訓
            </button>
          )}
        </section>

        {(onExportBackup || onImportBackup || onShareProgress) && (
          <section className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-sm font-bold active:bg-white/5 md:cursor-default"
              onClick={() => setDataToolsOpen((v) => !v)}
            >
              <span>進度備份／分享</span>
              <span className="text-[11px] font-black text-slate-400 md:hidden">
                {dataToolsOpen ? '收起' : '展開'}
              </span>
            </button>
            <div className={`flex flex-col sm:flex-row gap-2 px-3 pb-3 ${dataToolsOpen ? '' : 'hidden md:flex'}`}>
            {onExportBackup && (
              <button
                type="button"
                onClick={onExportBackup}
                className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-xs font-bold hover:bg-white/10 transition active:scale-[0.98]"
              >
                匯出進度備份
              </button>
            )}
            {onImportBackup && (
              <label className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-xs font-bold hover:bg-white/10 transition text-center cursor-pointer active:scale-[0.98]">
                匯入備份
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImportBackup(file);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {onShareProgress && (
              <button
                type="button"
                onClick={onShareProgress}
                className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-xs font-bold hover:bg-white/10 transition active:scale-[0.98]"
              >
                分享進度
              </button>
            )}
            </div>
          </section>
        )}

        <section id="pm-path-stages" className="space-y-4 pb-8 scroll-mt-4">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="text-xs font-black tracking-[0.18em] uppercase text-slate-400">學習路徑</h2>
            <button
              type="button"
              onClick={() => {
                const nextId = nextLesson.stageId;
                const map: Record<string, boolean> = {};
                STAGES.forEach((s) => {
                  map[s.id] = s.id === nextId;
                });
                setStageOpen(map);
              }}
              className="text-[11px] font-black text-indigo-300 underline underline-offset-2 active:opacity-70"
            >
              只開進行中
            </button>
          </div>
          {STAGES.map((stage) => {
            const lessons = lessonsForStage(stage.id);
            const doneCount = lessons.filter((l) => pathProgress.completedLessons.includes(l.id)).length;
            const stageDone = doneCount === lessons.length;
            const unlocked = isStageUnlocked(stage.id, pathProgress.completedLessons);
            const defaultOpen = stage.id === nextLesson.stageId || (!stageDone && unlocked);
            const isOpen = stageOpen[stage.id] ?? defaultOpen;

            return (
              <div key={stage.id} className={`rounded-3xl border overflow-hidden ${unlocked ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-black/20 opacity-75'}`}>
                <button
                  type="button"
                  onClick={() => {
                    const coarse =
                      typeof window !== 'undefined' &&
                      (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
                    setStageOpen((prev) => {
                      const opening = !isOpen;
                      if (coarse && opening) {
                        const map: Record<string, boolean> = {};
                        STAGES.forEach((s) => {
                          map[s.id] = s.id === stage.id;
                        });
                        return map;
                      }
                      return { ...prev, [stage.id]: opening };
                    });
                  }}
                  className={`w-full text-left bg-gradient-to-r ${stage.color} px-4 py-3 active:opacity-95`}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-black text-lg flex items-center gap-2">
                        {stage.title}
                        <span className="text-[10px] font-black opacity-80">{isOpen ? '收起' : '展開'}</span>
                      </h3>
                      <p className="text-xs text-white/85 mt-0.5">{stage.goal}</p>
                      {!unlocked && (
                        <p className="text-[11px] font-bold text-white/90 mt-1">
                          建議先完成上一關一半課程（仍可點擊提前練習）
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black">{doneCount}/{lessons.length}</div>
                      <div className="text-[10px] font-bold text-white/80">
                        {!unlocked ? '建議稍後' : stageDone ? '已完成' : '進行中'}
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-black/20 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className="h-full bg-white/90 transition-all duration-500"
                      style={{
                        width: `${lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </button>
                {isOpen && (
                <div className="p-3 space-y-2">
                  {lessons.map((lesson) => {
                    const done = pathProgress.completedLessons.includes(lesson.id);
                    const best = pathProgress.lessonBest?.[lesson.id] ?? 0;
                    const stars = best >= 90 ? 3 : best >= 75 ? 2 : best >= 60 ? 1 : 0;
                    const prereqMet = isLessonPrereqMet(lesson, pathProgress.completedLessons);
                    const prereqGaps = prereqMet
                      ? []
                      : lessonPrereqGaps(lesson, pathProgress.completedLessons).slice(0, 3);
                    const isNext = lesson.id === nextLesson.id && !done;
                    const isResume = Boolean(resumeLesson && resumeLesson.id === lesson.id && !done);
                    return (
                      <button
                        type="button"
                        key={lesson.id}
                        ref={isResume ? resumeRowRef : undefined}
                        onClick={() => {
                          if (isResume && onResumeLesson) {
                            onResumeLesson();
                            return;
                          }
                          onStartLesson(lesson);
                        }}
                        onPointerDown={(e) => {
                          if (!done || !onStartSlowLesson) return;
                          const target = e.currentTarget;
                          target.dataset.slowHold = '0';
                          const timer = window.setTimeout(() => {
                            target.dataset.slowHold = '1';
                            onStartSlowLesson(lesson);
                            try {
                              if (navigator.vibrate) navigator.vibrate(12);
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
                          if (e.currentTarget.dataset.slowHold === '1') {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.dataset.slowHold = '0';
                          }
                        }}
                        onContextMenu={(e) => {
                          if (done && onStartSlowLesson) e.preventDefault();
                        }}
                        className={`w-full text-left rounded-2xl border px-4 py-3.5 transition active:scale-[0.99] ${
                          isResume
                            ? 'border-amber-300/70 bg-amber-400/20 ring-1 ring-amber-300/40'
                            : isNext
                              ? 'border-indigo-300/60 bg-indigo-500/20 ring-1 ring-indigo-400/40'
                              : done
                                ? 'border-emerald-400/30 bg-emerald-400/10'
                                : 'border-white/10 bg-black/20 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold truncate flex items-center gap-2">
                              <span className="truncate">{lesson.title}</span>
                              {isResume && (
                                <span className="shrink-0 text-[9px] font-black tracking-wider uppercase bg-amber-400/30 text-amber-100 px-1.5 py-0.5 rounded">
                                  未完成
                                </span>
                              )}
                              {isNext && !isResume && (
                                <span className="shrink-0 text-[9px] font-black tracking-wider uppercase bg-indigo-400/30 text-indigo-100 px-1.5 py-0.5 rounded">
                                  下一課
                                </span>
                              )}
                              {lesson.kind === 'dictation' && (
                                <span className="shrink-0 text-[9px] font-black tracking-wider uppercase bg-orange-400/20 text-orange-200 px-1.5 py-0.5 rounded">聽寫</span>
                              )}
                              {lesson.kind === 'minimal_pair' && (
                                <span className="shrink-0 text-[9px] font-black tracking-wider uppercase bg-sky-400/20 text-sky-200 px-1.5 py-0.5 rounded">對比</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 truncate">{lesson.subtitle}</div>
                            {isResume && resumeLesson && (
                              <div className="mt-1.5 space-y-1">
                                <div className="text-[11px] text-amber-200 font-bold">
                                  進度 {resumeIndex + 1}/{resumeLesson.items.length} · 撳呢度繼續
                                </div>
                                <div className="h-1 bg-black/25 rounded-full overflow-hidden max-w-[12rem]">
                                  <div
                                    className="h-full bg-amber-300 transition-all"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round(
                                          ((resumeIndex + 1) / Math.max(1, resumeLesson.items.length)) * 100,
                                        ),
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                            {!done && prereqGaps.length > 0 && (
                              <div className="text-[11px] text-amber-200/90 font-bold mt-1 leading-relaxed">
                                建議先：
                                {prereqGaps.map((g, i) => (
                                  <span key={g.id}>
                                    {i > 0 ? '、' : ''}
                                    <span
                                      role="link"
                                      tabIndex={0}
                                      className="underline underline-offset-2 hover:text-white"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStartLesson(g);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          onStartLesson(g);
                                        }
                                      }}
                                    >
                                      {g.title}
                                    </span>
                                  </span>
                                ))}
                                <span className="text-amber-200/60 font-medium">（仍可提前練）</span>
                              </div>
                            )}
                            {best > 0 && (
                              <div className="text-[11px] text-amber-300/90 font-bold mt-1 tracking-widest">
                                {'★'.repeat(stars)}{'☆'.repeat(3 - stars)}
                                <span className="ml-2 text-slate-400 tracking-normal">最佳 {best}%</span>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            <div className="text-[10px] font-black tracking-wider text-slate-300">
                              {done ? (onStartSlowLesson ? '再練 · 長按慢' : '再練') : isResume ? '繼續' : `${lesson.minutes}分`}
                            </div>
                            {isResume && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartLesson(lesson);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onStartLesson(lesson);
                                  }
                                }}
                                className="text-[10px] font-black text-slate-400 underline underline-offset-2 hover:text-white active:opacity-70"
                              >
                                由頭
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}
        </section>

        <p className="text-center text-[10px] text-slate-500 font-bold tracking-wider pb-24 md:pb-2">
          Pinyin Master v1.9.9 · {curriculum.lessons} 課 · 約 {curriculum.minutes} 分 · 本地練習 · 唔會自動上傳
        </p>
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe pointer-events-none">
        <div className="mx-auto max-w-3xl px-3 pb-3 pointer-events-auto">
          <div className="rounded-2xl bg-slate-950/95 border border-white/15 shadow-2xl backdrop-blur-md overflow-hidden">
            <button
              type="button"
              disabled={!onSetDailyGoal && !(pathProgress.dailyCorrect >= pathProgress.dailyGoal && onShareProgress)}
              onClick={() => {
                if (pathProgress.dailyCorrect >= pathProgress.dailyGoal && onShareProgress) {
                  onShareProgress();
                  try {
                    if (navigator.vibrate) navigator.vibrate(8);
                  } catch {
                    /* ignore */
                  }
                  return;
                }
                if (!onSetDailyGoal) return;
                const goals = [15, 20, 30];
                const i = goals.indexOf(pathProgress.dailyGoal);
                const next = goals[(i >= 0 ? i + 1 : 0) % goals.length]!;
                onSetDailyGoal(next);
                try {
                  if (navigator.vibrate) navigator.vibrate(8);
                } catch {
                  /* ignore */
                }
              }}
              className="w-full px-3 pt-2 text-left disabled:opacity-100 active:bg-white/5"
              title={
                pathProgress.dailyCorrect >= pathProgress.dailyGoal
                  ? '撳一下分享今日達標'
                  : '撳一下切換今日目標'
              }
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-white/55">
                <span>
                  今日 {pathProgress.dailyCorrect}/{pathProgress.dailyGoal}
                  {pathProgress.dailyCorrect >= pathProgress.dailyGoal
                    ? ' · 達標 · 分享'
                    : onSetDailyGoal
                      ? ' · 撳改目標'
                      : ''}
                </span>
                <span className="tabular-nums">{Math.round(dailyPct)}%</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    pathProgress.dailyCorrect >= pathProgress.dailyGoal ? 'bg-emerald-400' : 'bg-indigo-400'
                  }`}
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
            </button>
            <div className="flex gap-2 p-2">
            {resumeLesson && onResumeLesson ? (
              <button
                type="button"
                onClick={onResumeLesson}
                onPointerDown={(e) => {
                  if (!onStartSlowLesson || !resumeLesson) return;
                  const target = e.currentTarget;
                  target.dataset.slowHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.slowHold = '1';
                    onStartSlowLesson(resumeLesson);
                    try {
                      if (navigator.vibrate) navigator.vibrate(12);
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
                  if (e.currentTarget.dataset.slowHold === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.dataset.slowHold = '0';
                  }
                }}
                onContextMenu={(e) => {
                  if (onStartSlowLesson) e.preventDefault();
                }}
                className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 bg-amber-300 text-amber-950 font-black text-sm px-3 py-3 rounded-xl active:scale-[0.98]"
                title="點擊繼續 · 長按慢速由頭練"
              >
                <Play className="w-4 h-4 shrink-0" fill="currentColor" />
                <span className="truncate min-w-0 text-left leading-tight">
                  <span className="block truncate">繼續 · {resumeLesson.title}</span>
                  <span className="block text-[10px] font-bold opacity-70">
                    第 {resumeIndex + 1}/{resumeLesson.items.length} 題
                    {onStartSlowLesson ? ' · 長按慢練' : ''}
                  </span>
                </span>
              </button>
            ) : (
              (() => {
                const focus =
                  dailyPlan.find((l) => !pathProgress.completedLessons.includes(l.id)) ?? nextLesson;
                return (
              <button
                type="button"
                onClick={() => onStartLesson(focus)}
                onPointerDown={(e) => {
                  if (!onStartSlowLesson) return;
                  const target = e.currentTarget;
                  target.dataset.slowHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.slowHold = '1';
                    onStartSlowLesson(focus);
                    try {
                      if (navigator.vibrate) navigator.vibrate(12);
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
                  if (e.currentTarget.dataset.slowHold === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.dataset.slowHold = '0';
                  }
                }}
                onContextMenu={(e) => {
                  if (onStartSlowLesson) e.preventDefault();
                }}
                className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 font-black text-sm px-3 py-3 rounded-xl active:scale-[0.98] ${
                  pathProgress.dailyCorrect >= pathProgress.dailyGoal
                    ? 'bg-emerald-400 text-emerald-950'
                    : 'bg-indigo-500 text-white'
                }`}
                title="點擊開始 · 長按慢速"
              >
                <Play className="w-4 h-4 shrink-0" fill="currentColor" />
                <span className="truncate min-w-0 text-left leading-tight">
                  <span className="block truncate">
                    {pathProgress.dailyCorrect >= pathProgress.dailyGoal
                      ? `繼續 · ${focus.title}`
                      : focus !== nextLesson
                        ? `今日 · ${focus.title}`
                        : `開始 · ${focus.title}`}
                  </span>
                  {focus !== nextLesson && (
                    <span className="block text-[10px] font-bold opacity-70">今日建議</span>
                  )}
                </span>
              </button>
                );
              })()
            )}
            <button
              type="button"
              onClick={onOpenDiagnosis}
              onPointerDown={(e) => {
                if (!onStartWeakDrill || !canStartWeakDrill) return;
                const target = e.currentTarget;
                target.dataset.weakHold = '0';
                const timer = window.setTimeout(() => {
                  target.dataset.weakHold = '1';
                  onStartWeakDrill();
                  try {
                    if (navigator.vibrate) navigator.vibrate(12);
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
                if (e.currentTarget.dataset.weakHold === '1') {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.dataset.weakHold = '0';
                }
              }}
              onContextMenu={(e) => {
                if (onStartWeakDrill && canStartWeakDrill) e.preventDefault();
              }}
              className="shrink-0 inline-flex flex-col items-center justify-center gap-0.5 bg-white/10 border border-white/20 text-white font-bold text-[10px] px-2.5 py-2 rounded-xl min-w-[3.25rem]"
              title={canStartWeakDrill && onStartWeakDrill ? '點開診斷 · 長按弱項特訓' : '診斷報告'}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>診斷</span>
            </button>
            {onStartDailySceneDrill && (
              <button
                type="button"
                onClick={onStartDailySceneDrill}
                onPointerDown={(e) => {
                  if (!onOpenCustom) return;
                  const target = e.currentTarget;
                  target.dataset.customHold = '0';
                  const timer = window.setTimeout(() => {
                    target.dataset.customHold = '1';
                    onOpenCustom();
                    try {
                      if (navigator.vibrate) navigator.vibrate(12);
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
                  if (e.currentTarget.dataset.customHold === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.dataset.customHold = '0';
                  }
                }}
                onContextMenu={(e) => {
                  if (onOpenCustom) e.preventDefault();
                }}
                className="shrink-0 inline-flex flex-col items-center justify-center gap-0.5 bg-violet-400/25 border border-violet-300/40 text-violet-100 font-bold text-[10px] px-2.5 py-2 rounded-xl min-w-[3.25rem]"
                title={onOpenCustom ? `今日場景 · 長按自訂句子` : '今日場景'}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{dailySceneLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onStartSrs}
              disabled={srsInfo.due === 0 && srsInfo.struggling === 0}
              className={`shrink-0 inline-flex flex-col items-center justify-center gap-0.5 font-bold text-[10px] px-2.5 py-2 rounded-xl disabled:opacity-40 min-w-[3.25rem] ${
                srsInfo.due > 0 || srsInfo.struggling > 0
                  ? 'bg-rose-500/90 text-white border border-rose-300/50 animate-pulse'
                  : 'bg-white/10 border border-white/20 text-white'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>弱項</span>
              <span className="opacity-70">{Math.max(srsInfo.due, srsInfo.struggling)}</span>
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
