# Pinyin Master

普通話拼音朗讀練習：系統示範、跟讀、即時評分，以及聲母／韻母／聲調錯誤統計。全程喺瀏覽器運行（Web Speech API），唔需要 API key。

語音辨識需要 **HTTPS** 同麥克風權限，建議用 Chrome、Edge 或 Safari。

## 功能

- 預設高頻詞庫（去重真實詞條，唔再假扮萬字）
- 先聽／先讀、盲讀、TTS 語速滑桿
- 自訂句子練習（獨立存檔，唔覆蓋預設進度）
- 診斷中心：正確率、錯題重練、重置進度
- 詞庫可點擊跳到指定詞

## 本機開發

需要 Node.js 18+。

```bash
npm install
npm run dev
```

瀏覽器打開 http://localhost:3000 。

## GitHub Pages

每次 push 去 `main`，GitHub Actions 會 `npm run build` 然後部署 `dist/`。

線上：https://okboy001.github.io/pinyin-master/
