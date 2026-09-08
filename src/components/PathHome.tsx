import { Flame, Play, RefreshCw, Sparkles, BookOpen, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  onResumeLesson?: () => void;
  onStartSrs: () => void;
  onStartFree: () => void;
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
  onResumeLesson,
  onStartSrs,
  onStartFree,
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
      if (localStorage.getItem('pm_milestone_v17')) return;
      localStorage.setItem('pm_milestone_v17', '1');
      setMilestoneToast(true);
      const t = window.setTimeout(() => setMilestoneToast(false), 4200);
      return () => window.clearTimeout(t);
    } catch {
      /* ignore */
    }
  }, []);

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
          v1.7 · 居住證／體檢等新場景已加入 · 繼續開口
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
          <p className="text-slate-300 text-sm md:text-base max-w-xl leading-relaxed">
            跟住六關路線：四聲 → 易混淆音 → 音節 → 高頻詞 → 短句 → 對話。聽示範、跟讀、錯咗就用間隔複習返嚟。
            而家共有 {curriculum.lessons} 課（約 {curriculum.minutes} 分鐘）。
            手機用 Chrome／Safari 可「加到主畫面」，方便每日開口。
          </p>
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
          {pathProgress.dailyCorrect >= pathProgress.dailyGoal && (
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
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">連續</div>
            <div className="text-2xl font-black flex items-center justify-center gap-1 mt-1">
              <Flame className="w-5 h-5 text-orange-400" /> {pathProgress.streak}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">今日目標</div>
            <div className="text-2xl font-black mt-1">{pathProgress.dailyCorrect}/{pathProgress.dailyGoal}</div>
            <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${dailyPct}%` }} />
            </div>
            {onSetDailyGoal && (
              <div className="flex justify-center gap-1 mt-2">
                {[15, 20, 30].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onSetDailyGoal(g)}
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border transition ${
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
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">路徑</div>
            <div className="text-2xl font-black mt-1">{path.percent}%</div>
            <div className="text-[10px] text-slate-400 mt-1">
              {path.completed}/{path.total} 課
              {remainingMinutes > 0 ? ` · 約剩 ${remainingMinutes} 分` : ''}
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">累計正確</div>
            <div className="text-2xl font-black mt-1">{pathProgress.lifetimeCorrect}</div>
            <div className="text-[10px] text-slate-400 mt-1">跟讀次數</div>
          </div>
        </section>

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
              <ol className="list-decimal pl-4 space-y-1 font-medium text-indigo-100/90">
                {(srsInfo.due > 0 || srsInfo.struggling > 0) && (
                  <li>
                    <button
                      type="button"
                      onClick={onStartSrs}
                      className="text-left hover:text-white underline-offset-2 hover:underline"
                    >
                      複習弱項
                      <span className="opacity-70">
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
                      className={`text-left hover:text-white underline-offset-2 hover:underline ${done ? 'opacity-70' : ''}`}
                    >
                      {l.title}
                      <span className="opacity-70"> · {l.minutes} 分</span>
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onStartLesson(nextLesson)}
              className="inline-flex items-center gap-2 bg-white text-indigo-700 font-black px-5 py-3 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition"
            >
              <Play className="w-4 h-4" fill="currentColor" /> 開始今日建議
            </button>
            {resumeLesson && onResumeLesson && (
              <button
                type="button"
                onClick={onResumeLesson}
                className="inline-flex items-center gap-2 bg-amber-300 text-amber-950 font-black px-4 py-3 rounded-2xl hover:bg-amber-200 transition"
              >
                繼續「{resumeLesson.title}」({resumeIndex + 1}/{resumeLesson.items.length})
              </button>
            )}
            <button
              type="button"
              onClick={onStartSrs}
              disabled={srsInfo.due === 0 && srsInfo.struggling === 0}
              className="inline-flex items-center gap-2 bg-white/15 border border-white/25 font-bold px-4 py-3 rounded-2xl disabled:opacity-40 hover:bg-white/25 transition"
            >
              <RefreshCw className="w-4 h-4" /> 複習弱項 ({Math.max(srsInfo.due, srsInfo.struggling)})
            </button>
            {lowStarLesson && onStartLowStar && (
              <button
                type="button"
                onClick={() => onStartLowStar(lowStarLesson)}
                className="inline-flex items-center gap-2 bg-amber-400/20 border border-amber-300/40 font-bold px-4 py-3 rounded-2xl hover:bg-amber-400/30 transition text-amber-50"
              >
                衝星：{lowStarLesson.title}
                {lowStar && (
                  <span className="text-[10px] font-black opacity-80">· {lowStar.best}%</span>
                )}
              </button>
            )}
            {onStartMixedReview && (
              <button
                type="button"
                onClick={onStartMixedReview}
                disabled={!canStartMixedReview}
                className="inline-flex items-center gap-2 bg-white/15 border border-white/25 font-bold px-4 py-3 rounded-2xl disabled:opacity-40 hover:bg-white/25 transition"
              >
                混合複習
              </button>
            )}
            {onStartFluencyWarmup && (
              <button
                type="button"
                onClick={onStartFluencyWarmup}
                disabled={!canStartFluencyWarmup}
                className="inline-flex items-center gap-2 bg-emerald-400/20 border border-emerald-300/40 font-bold px-4 py-3 rounded-2xl disabled:opacity-40 hover:bg-emerald-400/30 transition text-emerald-50"
              >
                流利熱身
              </button>
            )}
          </div>
          {(onStartSurvivalDrill || onStartSocialDrill || onStartDiningDrill || onStartTravelDrill || onStartWorkDrill || onStartDailySceneDrill) && (
            <div className="mt-3">
              <div className="text-[10px] font-black tracking-wider uppercase text-indigo-100/70 mb-2">
                場景包 · 盲跟讀
              </div>
              {onStartDailySceneDrill && (
                <button
                  type="button"
                  onClick={onStartDailySceneDrill}
                  className="mb-2 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-800 font-black px-4 py-2.5 rounded-2xl hover:bg-indigo-50 transition text-sm"
                >
                  今日場景 · {dailySceneLabel}
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                {onStartSurvivalDrill && (
                  <button
                    type="button"
                    onClick={onStartSurvivalDrill}
                    className={`inline-flex items-center gap-2 font-bold px-4 py-2.5 rounded-2xl text-sm transition ${
                      dailySceneKind === 'survival'
                        ? 'bg-white text-rose-800'
                        : 'bg-rose-400/20 border border-rose-300/40 hover:bg-rose-400/30 text-rose-50'
                    }`}
                  >
                    生存
                  </button>
                )}
                {onStartSocialDrill && (
                  <button
                    type="button"
                    onClick={onStartSocialDrill}
                    className={`inline-flex items-center gap-2 font-bold px-4 py-2.5 rounded-2xl text-sm transition ${
                      dailySceneKind === 'social'
                        ? 'bg-white text-sky-800'
                        : 'bg-sky-400/20 border border-sky-300/40 hover:bg-sky-400/30 text-sky-50'
                    }`}
                  >
                    社交
                  </button>
                )}
                {onStartDiningDrill && (
                  <button
                    type="button"
                    onClick={onStartDiningDrill}
                    className={`inline-flex items-center gap-2 font-bold px-4 py-2.5 rounded-2xl text-sm transition ${
                      dailySceneKind === 'dining'
                        ? 'bg-white text-amber-900'
                        : 'bg-amber-400/20 border border-amber-300/40 hover:bg-amber-400/30 text-amber-50'
                    }`}
                  >
                    飲食
                  </button>
                )}
                {onStartTravelDrill && (
                  <button
                    type="button"
                    onClick={onStartTravelDrill}
                    className={`inline-flex items-center gap-2 font-bold px-4 py-2.5 rounded-2xl text-sm transition ${
                      dailySceneKind === 'travel'
                        ? 'bg-white text-teal-900'
                        : 'bg-teal-400/20 border border-teal-300/40 hover:bg-teal-400/30 text-teal-50'
                    }`}
                  >
                    出行
                  </button>
                )}
                {onStartWorkDrill && (
                  <button
                    type="button"
                    onClick={onStartWorkDrill}
                    className={`inline-flex items-center gap-2 font-bold px-4 py-2.5 rounded-2xl text-sm transition ${
                      dailySceneKind === 'work'
                        ? 'bg-white text-violet-900'
                        : 'bg-violet-400/20 border border-violet-300/40 hover:bg-violet-400/30 text-violet-50'
                    }`}
                  >
                    職場
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="flex gap-2">
          <button
            type="button"
            onClick={onStartFree}
            className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-bold hover:bg-white/10 transition flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4" /> 自由詞庫
          </button>
          <button
            type="button"
            onClick={onOpenDiagnosis}
            className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-bold hover:bg-white/10 transition"
          >
            發音診斷
          </button>
          {onStartWeakDrill && (
            <button
              type="button"
              onClick={onStartWeakDrill}
              disabled={!canStartWeakDrill}
              className="flex-1 rounded-2xl bg-rose-500/20 border border-rose-400/30 px-4 py-3 text-sm font-bold hover:bg-rose-500/30 transition disabled:opacity-40"
            >
              弱項特訓
            </button>
          )}
        </section>

        {(onExportBackup || onImportBackup) && (
          <section className="flex gap-2">
            {onExportBackup && (
              <button
                type="button"
                onClick={onExportBackup}
                className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition"
              >
                匯出進度備份
              </button>
            )}
            {onImportBackup && (
              <label className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition text-center cursor-pointer">
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
                className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/10 transition"
              >
                分享進度
              </button>
            )}
          </section>
        )}

        <section className="space-y-4 pb-8">
          {STAGES.map((stage) => {
            const lessons = lessonsForStage(stage.id);
            const doneCount = lessons.filter((l) => pathProgress.completedLessons.includes(l.id)).length;
            const stageDone = doneCount === lessons.length;
            const unlocked = isStageUnlocked(stage.id, pathProgress.completedLessons);

            return (
              <div key={stage.id} className={`rounded-3xl border overflow-hidden ${unlocked ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-black/20 opacity-75'}`}>
                <div className={`bg-gradient-to-r ${stage.color} px-4 py-3`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black text-lg">{stage.title}</h3>
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
                </div>
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
                    return (
                      <button
                        type="button"
                        key={lesson.id}
                        onClick={() => onStartLesson(lesson)}
                        className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                          isNext
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
                              {isNext && (
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
                          <div className="text-[10px] font-black tracking-wider shrink-0 text-slate-300">
                            {done ? '再練' : `${lesson.minutes}分`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <p className="text-center text-[10px] text-slate-500 font-bold tracking-wider pb-2">
          Pinyin Master v1.7.0 · {curriculum.lessons} 課 · 約 {curriculum.minutes} 分 · 本地練習 · 唔會自動上傳
        </p>
      </div>
    </div>
  );
}
