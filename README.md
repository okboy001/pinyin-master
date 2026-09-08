# Pinyin Master

普通話拼音朗讀練習：系統示範、跟讀、即時評分，以及聲母／韻母／聲調錯誤統計。全程喺瀏覽器運行（Web Speech API），唔需要 API key。

語音辨識需要 **HTTPS** 同麥克風權限，建議用 Chrome、Edge 或 Safari。

## 本機開發

需要 Node.js 18+。

```bash
npm install
npm run dev
```

瀏覽器打開 http://localhost:3000 。

## GitHub Pages

每次 push 去 `main`，GitHub Actions 會 `npm run build` 然後部署 `dist/`。

1. Repo → **Settings → Pages**
2. **Source** 選 **GitHub Actions**
3. 等 workflow 跑完之後，網站會喺：

`https://<你的帳號>.github.io/pinyin-master/`

首次啟用 Pages 之後，之後每次更新 `main` 都會自動上線。
