import { useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { getWordByIndex, parseWord } from '../data/dictionary';

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

  return (
    <div className="absolute inset-0 z-50 bg-gray-900/40 backdrop-blur-md flex flex-col p-4 pt-safe sm:p-10 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl flex-1 flex flex-col overflow-hidden w-full max-w-2xl mx-auto">
        <div className="p-4 md:p-6 flex justify-between items-center border-b border-gray-100">
          <h2 className="text-lg md:text-xl font-black tracking-widest text-blue-600 flex items-center gap-2">
            <BookOpen className="w-5 h-5 md:w-6 md:h-6" /> 詞庫總覽
          </h2>
          <button type="button" onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋漢字或拼音…"
              className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-400 text-xs font-bold">
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
        {!isSearching && <p className="px-4 pt-3 text-xs text-slate-400 font-bold">點擊詞條可跳到該詞練習</p>}

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
          {pageIndexes.length === 0 && (
            <div className="text-sm text-slate-400 py-6 text-center font-bold">找不到符合的詞</div>
          )}
          {pageIndexes.map((wordIdx) => {
            const w = getWordByIndex(dictionary, wordIdx);
            const isLearned = wordIdx < globalIndex;
            const isCurrent = wordIdx === globalIndex;

            return (
              <button
                type="button"
                key={wordIdx}
                onClick={() => onJumpTo(wordIdx)}
                className={`w-full flex items-center justify-between border p-3 rounded-2xl transition-all text-left ${
                  isCurrent
                    ? 'bg-blue-50 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                    : isLearned
                      ? 'bg-green-50 border-green-200 hover:border-green-300'
                      : 'bg-white border-gray-100 text-gray-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="text-[10px] md:text-xs font-mono text-gray-400 w-6 md:w-8 text-right">{wordIdx + 1}.</span>
                  <span className={`text-lg md:text-xl font-black ${isCurrent ? 'text-blue-600' : isLearned ? 'text-green-700' : 'text-gray-400'}`}>
                    {w.hanzi}
                  </span>
                </div>
                <span className={`text-xs md:text-sm font-mono ${isCurrent ? 'text-blue-500' : isLearned ? 'text-green-600' : 'text-gray-400'}`}>
                  {w.pinyin}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
