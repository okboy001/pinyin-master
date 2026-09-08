import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getWordByIndex } from '../data/dictionary';

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
  const start = dictPage * wordsPerPage;
  const end = Math.min(start + wordsPerPage, dictionary.length);
  const maxPage = Math.max(0, Math.ceil(dictionary.length / wordsPerPage) - 1);

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

        <div className="flex items-center justify-between p-3 md:p-4 bg-gray-50 border-b border-gray-100">
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

        <p className="px-4 pt-3 text-xs text-slate-400 font-bold">點擊詞條可跳到該詞練習</p>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
          {Array.from({ length: end - start }).map((_, idx) => {
            const wordIdx = start + idx;
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
