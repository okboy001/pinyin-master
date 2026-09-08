import { FileEdit, X } from 'lucide-react';

type Props = {
  customText: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function CustomInputModal({ customText, onChange, onClose, onSubmit }: Props) {
  return (
    <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex flex-col p-4 pt-safe sm:p-10 animate-fade-in text-slate-800">
      <div className="bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden w-full max-w-xl mx-auto my-auto max-h-full">
        <div className="p-4 md:p-6 flex justify-between items-center bg-slate-50 border-b border-slate-100">
          <h2 className="text-lg md:text-xl font-black tracking-widest text-slate-800 flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-indigo-500" /> 加入自訂練習
          </h2>
          <button type="button" onClick={onClose} className="p-2 bg-slate-200 rounded-full hover:bg-slate-300 transition">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="p-4 md:p-6 flex flex-col gap-4 flex-1 overflow-y-auto">
          <p className="text-sm font-bold text-slate-500">
            貼上或輸入想練習的句子與詞語。系統會用標點拆句；自訂詞庫會獨立保存，唔會覆蓋預設進度。
          </p>
          <textarea
            className="w-full flex-1 min-h-[150px] md:min-h-[200px] border-2 border-slate-200 rounded-xl p-4 text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-400 focus:bg-white transition-all resize-none text-lg font-medium"
            placeholder="例如：我明天要去見客戶，希望能順利。今天的空氣真好..."
            value={customText}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={onSubmit}
            className="w-full py-4 text-white bg-indigo-500 hover:bg-indigo-600 active:scale-[0.98] font-bold tracking-widest rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-2"
          >
            <FileEdit className="w-5 h-5" /> 生成自訂練習任務
          </button>
        </div>
      </div>
    </div>
  );
}
