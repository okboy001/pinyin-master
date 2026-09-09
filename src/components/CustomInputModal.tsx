import { ClipboardPaste, FileEdit, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { speakHanzi } from '../lib/speak';

type Props = {
  customText: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const EXAMPLES = [
  '你好，请问地铁站怎么走？',
  '我明天要去见客户。',
  '这个多少钱？可以便宜一点吗？',
  '我想预约明天下午三点。',
  '麻烦给我一杯美式，少冰。',
  '请问洗手间在哪里？',
];

function splitChunks(text: string): string[] {
  return text
    .split(/[\n。！？.!?；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CustomInputModal({ customText, onChange, onClose, onSubmit }: Props) {
  const chunkList = splitChunks(customText);
  const chunks = chunkList.length;
  const chars = [...customText.replace(/\s/g, '')].length;
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const swipeYRef = useRef<number | null>(null);
  const previewHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewHoldTriggeredRef = useRef(false);
  const autoPreviewDoneRef = useRef(false);

  useEffect(() => {
    if (autoPreviewDoneRef.current) return;
    if (chunks >= 1 && customText.trim().length >= 4) {
      setPreviewOpen(true);
      autoPreviewDoneRef.current = true;
    }
  }, [chunks, customText]);

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setPasteHint('此瀏覽器唔支援貼上 · 請長按輸入框貼上');
        window.setTimeout(() => setPasteHint(null), 2800);
        return;
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setPasteHint('剪貼簿係空嘅');
        window.setTimeout(() => setPasteHint(null), 2000);
        return;
      }
      onChange(customText.trim() ? `${customText.trim()}\n${text}` : text);
      setPasteHint('已貼上');
      window.setTimeout(() => setPasteHint(null), 1600);
    } catch {
      setPasteHint('貼上失敗 · 請長按輸入框貼上');
      window.setTimeout(() => setPasteHint(null), 2800);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-10 pt-safe pb-safe animate-fade-in text-slate-800"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-input-title"
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden w-full max-w-xl mx-auto max-h-[92%] sm:max-h-full sm:my-auto"
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
            const dy = endY - startY;
            if (dy > 56) {
              onClose();
              return;
            }
            if (dy < -48 && chunks > 0) {
              try {
                if (navigator.vibrate) navigator.vibrate(10);
              } catch {
                /* ignore */
              }
              onSubmit();
            }
          }}
        >
          <div className="h-1 w-10 rounded-full bg-slate-200" aria-hidden />
          <p className="text-[10px] font-bold text-slate-400 mt-1">
            {chunks > 0 ? '上滑生成 · 下滑關閉' : '下滑關閉'}
          </p>
        </div>
        <div className="px-4 pb-3 pt-1 sm:p-6 flex justify-between items-center bg-slate-50 sm:bg-slate-50 border-b border-slate-100 shrink-0">
          <h2 id="custom-input-title" className="text-lg md:text-xl font-black tracking-widest text-slate-800 flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-indigo-500" /> 加入自訂練習
          </h2>
          <button type="button" onClick={onClose} className="p-2.5 bg-slate-200 rounded-full hover:bg-slate-300 transition">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="p-4 md:p-6 flex flex-col gap-4 flex-1 overflow-y-auto min-h-0 pb-safe">
          <p className="text-sm font-bold text-slate-500">
            貼上或輸入想練習的句子。系統會用標點拆句；自訂詞庫獨立保存。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              className="text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl active:scale-95 inline-flex items-center gap-1"
            >
              <ClipboardPaste className="w-3.5 h-3.5" /> 貼上剪貼簿
            </button>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onChange(customText.trim() ? `${customText.trim()}\n${ex}` : ex)}
                className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1.5 rounded-xl active:scale-95 text-left leading-snug max-w-full"
              >
                + {ex}
              </button>
            ))}
          </div>
          {pasteHint && (
            <p className="text-[11px] font-black text-emerald-700 -mt-2">{pasteHint}</p>
          )}
          <textarea
            className="w-full flex-1 min-h-[140px] md:min-h-[200px] border-2 border-slate-200 rounded-xl p-4 text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all resize-none text-base font-medium"
            placeholder="例如：我明天要去見客戶…"
            value={customText}
            onChange={(e) => onChange(e.target.value)}
            enterKeyHint="done"
          />
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-400">
            <span>
              {chunks > 0 ? `約 ${chunks} 句／詞` : '尚未輸入'}
              {chars > 0 ? ` · ${chars} 字` : ''}
            </span>
            <div className="flex items-center gap-2">
              {chunks > 0 && (
                <button
                  type="button"
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="text-indigo-500 underline underline-offset-2 active:opacity-70"
                >
                  {previewOpen ? '收起預覽' : '預覽題目'}
                </button>
              )}
              {customText.trim() && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="text-slate-500 underline underline-offset-2 active:opacity-70"
                >
                  清空
                </button>
              )}
            </div>
          </div>
          {previewOpen && chunkList.length > 0 && (
            <ul className="max-h-40 overflow-y-auto space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              {chunkList.slice(0, 20).map((c, i) => (
                <li key={`${i}-${c.slice(0, 12)}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewHoldTriggeredRef.current) {
                        previewHoldTriggeredRef.current = false;
                        return;
                      }
                      speakHanzi(c, { rate: 0.8 });
                      try {
                        if (navigator.vibrate) navigator.vibrate(6);
                      } catch {
                        /* ignore */
                      }
                    }}
                    onPointerDown={() => {
                      previewHoldTriggeredRef.current = false;
                      if (previewHoldRef.current) clearTimeout(previewHoldRef.current);
                      previewHoldRef.current = setTimeout(() => {
                        previewHoldTriggeredRef.current = true;
                        speakHanzi(c, { rate: 0.55 });
                        try {
                          if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
                        } catch {
                          /* ignore */
                        }
                      }, 450);
                    }}
                    onPointerUp={() => {
                      if (previewHoldRef.current) {
                        clearTimeout(previewHoldRef.current);
                        previewHoldRef.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      if (previewHoldRef.current) {
                        clearTimeout(previewHoldRef.current);
                        previewHoldRef.current = null;
                      }
                    }}
                    onPointerCancel={() => {
                      if (previewHoldRef.current) {
                        clearTimeout(previewHoldRef.current);
                        previewHoldRef.current = null;
                      }
                    }}
                    className="w-full text-[12px] font-bold text-slate-700 flex gap-2 leading-snug items-start text-left rounded-lg px-1.5 py-1.5 active:bg-indigo-50 active:scale-[0.99]"
                    title="點聽 · 長按極慢"
                  >
                    <span className="text-slate-400 tabular-nums shrink-0 w-5 text-right pt-0.5">{i + 1}.</span>
                    <span className="min-w-0 break-words flex-1">{c}</span>
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  </button>
                </li>
              ))}
              {chunkList.length > 20 && (
                <li className="text-[11px] font-bold text-slate-400 pl-7">…仲有 {chunkList.length - 20} 題</li>
              )}
            </ul>
          )}
          {previewOpen && chunkList.length > 0 && (
            <p className="text-[10px] font-bold text-slate-400 -mt-2">預覽可撳喇叭試聽再生成</p>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={!customText.trim()}
            className="w-full py-4 text-white bg-indigo-500 hover:bg-indigo-600 active:scale-[0.98] font-bold tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 disabled:opacity-40"
          >
            <FileEdit className="w-5 h-5" />
            {chunks > 0 ? `生成 ${chunks} 題練習` : '生成自訂練習任務'}
          </button>
        </div>
      </div>
    </div>
  );
}
