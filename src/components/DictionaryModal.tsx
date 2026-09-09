import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search, Volume2, X } from 'lucide-react';
import { getWordByIndex, parseWord } from '../data/dictionary';
import { speakHanzi } from '../lib/speak';

type Props = {
  dictionary: string[];
  globalIndex: number;
  dictPage: number;
  wordsPerPage: number;
  onClose: () => void;
  onPageChange: (page: number) => void;
  onJumpTo: (index: number) => void;
};

export function DictionaryModal({
  dictionary,
  globalIndex,
  dictPage,
  wordsPerPage,
  onClose,
  onPageChange,
  onJumpTo,
}: Props) {
  const [query, setQuery] = useState('');
  const currentRowRef = useRef<HTMLDivElement | null>(null);
  const swipeXRef = useRef<number | null>(null);
  const swipeYRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const coarse =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    if (coarse) return; // avoid popping keyboard over the list on phones
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  const filteredIndexes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const hits: number[] = [];
    for (let i = 0; i < dictionary.length; i++) {
      const w = parseWord(dictionary[i]);
      if (
        w.hanzi.includes(query.trim()) ||
        w.sim.includes(query.trim()) ||
        w.pinyin.toLowerCase().includes(q)
      ) {
        hits.push(i);
      }
    }
    return hits;
  }, [dictionary, query]);

  const isSearching = filteredIndexes !== null;
  const start = dictPage * wordsPerPage;
  const pageIndexes = isSearching
    ? filteredIndexes.slice(0, 100)
    : Array.from({ length: Math.min(wordsPerPage, dictionary.length - start) }, (_, i) => start + i);
  const maxPage = Math.max(0, Math.ceil(dictionary.length / wordsPerPage) - 1);
  const end = Math.min(start + wordsPerPage, dictionary.length);

  useEffect(() => {
    if (isSearching) return;
    currentRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [dictPage, globalIndex, isSearching]);

  return (
    <div
      className="absolute inset-0 z-50 bg-gray-900/40 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-10 pt-safe pb-safe animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dictionary-title"
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl mx-auto min-h-0 max-h-[92%] sm:max-h-full sm:flex-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sm:hidden flex flex-col items-center pt-2.5 pb-1 shrink-0"
          onTouchStart={(e) => {
            swipeYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = swipeYRef.current;
            swipeYRef.current = null;
            if (startY == null) return;
            const endY = e.changedTouches[0]?.clientY ?? startY;
            if (endY - startY > 56) onClose();
          }}
        >
          <div className="h-1 w-10 rounded-full bg-slate-200" aria-hidden />
          <p className="text-[10px] font-bold text-slate-400 mt-1">下滑關閉</p>
        </div>
        <div className="px-4 pb-3 pt-1 sm:p-6 flex justify-between items-center border-b border-gray-100 shrink-0 gap-2">
          <h2 id="dictionary-title" className="text-lg md:text-xl font-black tracking-widest text-blue-600 flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 md:w-6 md:h-6 shrink-0" /> 詞庫總覽
          </h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setQuery('');
                onPageChange(Math.floor(globalIndex / wordsPerPage));
              }}
              className="text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-2 rounded-xl active:scale-95"
            >
              目前題
            </button>
            <button type="button" onClick={onClose} className="p-2.5 bg-gray-100 rounded-full hover:bg-gray-200 transition">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 shrink-0">
          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋漢字或拼音…"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              className="flex-1 bg-transparent outline-none text-base md:text-sm font-medium text-slate-700 placeholder:text-slate-400 min-w-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 text-[11px] font-black text-slate-600 bg-slate-200/80 px-2.5 py-1.5 rounded-lg active:scale-95"
              >
                清除
              </button>
            )}
          </label>
        </div>

        {!isSearching && (
          <div className="flex items-center justify-between p-3 md:p-4 bg-gray-50 border-b border-gray-100 mt-3">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(0, dictPage - 1))}
              disabled={dictPage === 0}
              className="p-2 bg-white rounded-lg shadow-sm disabled:opacity-30 hover:bg-gray-100 transition active:scale-95"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <span className="text-xs md:text-sm font-bold text-gray-600 tracking-wider">
              {start + 1} - {end}
              <span className="text-gray-400 text-[10px] md:text-xs ml-1">/ {dictionary.length}</span>
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(maxPage, dictPage + 1))}
              disabled={dictPage >= maxPage}
              className="p-2 bg-white rounded-lg shadow-sm disabled:opacity-30 hover:bg-gray-100 transition active:scale-95"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        )}

        {isSearching && (
          <p className="px-4 pt-3 text-xs text-slate-400 font-bold">
            找到 {filteredIndexes.length} 個結果{filteredIndexes.length > 100 ? '（顯示前 100）' : ''}
          </p>
        )}
        {!isSearching && (
          <p className="px-4 pt-3 text-xs text-slate-400 font-bold">
            撳詞條跳題 · 長按詞條先聽 · 喇叭聽／長按慢聽 · 左右滑換頁
          </p>
        )}

        <div
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2"
          onTouchStart={(e) => {
            if (isSearching) return;
            swipeXRef.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (isSearching) return;
            const start = swipeXRef.current;
            swipeXRef.current = null;
            if (start == null) return;
            const end = e.changedTouches[0]?.clientX;
            if (end == null) return;
            const dx = end - start;
            if (Math.abs(dx) < 64) return;
            if (dx < 0 && dictPage < maxPage) onPageChange(dictPage + 1);
            if (dx > 0 && dictPage > 0) onPageChange(dictPage - 1);
          }}
        >
          {pageIndexes.length === 0 && (
            <div className="text-sm text-slate-400 py-6 text-center font-bold">找不到符合的詞</div>
          )}
          {pageIndexes.map((wordIdx) => {
            const w = getWordByIndex(dictionary, wordIdx);
            const isLearned = wordIdx < globalIndex;
            const isCurrent = wordIdx === globalIndex;

            return (
              <div
                key={wordIdx}
                ref={isCurrent ? currentRowRef : undefined}
                className={`w-full flex items-center gap-2 border p-2.5 md:p-3 rounded-2xl transition-all ${
                  isCurrent
                    ? 'bg-blue-50 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                    : isLearned
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-gray-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onJumpTo(wordIdx)}
                  onPointerDown={(e) => {
                    const target = e.currentTarget;
                    target.dataset.previewHold = '0';
                    const timer = window.setTimeout(() => {
                      target.dataset.previewHold = '1';
                      speakHanzi(w.hanzi, { rate: 0.65 });
                      try {
                        if (navigator.vibrate) navigator.vibrate(8);
                      } catch {
                        /* ignore */
                      }
                    }, 480);
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
                    if (e.currentTarget.dataset.previewHold === '1') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.dataset.previewHold = '0';
                    }
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="flex-1 flex items-center justify-between text-left min-w-0 active:scale-[0.99] py-1 px-1 rounded-xl"
                  title="點擊跳題 · 長按先聽"
                >
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <span className="text-[10px] md:text-xs font-mono text-gray-400 w-6 md:w-8 text-right shrink-0">
                      {wordIdx + 1}.
                    </span>
                    <span
                      className={`text-lg md:text-xl font-black truncate ${
                        isCurrent ? 'text-blue-600' : isLearned ? 'text-green-700' : 'text-gray-400'
                      }`}
                    >
                      {w.hanzi}
                    </span>
                  </div>
                  <span
                    className={`text-xs md:text-sm font-mono shrink-0 ml-2 ${
                      isCurrent ? 'text-blue-500' : isLearned ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {w.pinyin}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakHanzi(w.hanzi, { rate: 0.8 });
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const target = e.currentTarget;
                    target.dataset.slowHold = '0';
                    const timer = window.setTimeout(() => {
                      target.dataset.slowHold = '1';
                      speakHanzi(w.hanzi, { rate: 0.55 });
                      try {
                        if (navigator.vibrate) navigator.vibrate(8);
                      } catch {
                        /* ignore */
                      }
                    }, 480);
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
                  onContextMenu={(e) => e.preventDefault()}
                  className={`shrink-0 p-2.5 rounded-xl border active:scale-95 transition ${
                    isCurrent
                      ? 'bg-blue-100 border-blue-200 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200'
                  }`}
                  aria-label={`聽「${w.hanzi}」· 長按慢速`}
                  title="點按聽 · 長按慢速"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
