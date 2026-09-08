# Pinyin Master

由完全唔識國語，練到講得出口。瀏覽器內聽示範、跟讀、評分；有六關學習路徑、間隔複習（SRS）、弱項特訓同進度備份。唔需要 API key。

語音辨識需要 **HTTPS** 同麥克風，建議 Chrome / Edge / Safari。手機可「加到主畫面」離線打開殼層。

## 學習路徑

1. 四聲（含輕聲、儿化、變調）
2. 聲母韻母（最小對立：zh/z、n/l、ü…）
3. 音節與數字價錢
4. 高頻詞（飲食、時間、場所…）
5. 短句（點餐、問路、寒暄、邀約…）
6. 對話流利（餐廳、機場、辦公室…）

另有混合複習、衝星重練、自由詞庫、自訂句子、匯出／匯入備份。

## 本機開發

```bash
npm install
npm run dev
```

打開 http://localhost:3000 。

```bash
npm run build   # 產出 dist/
npm run lint
npm run test:scoring
```

暫時以本機迭代為主；需要時再手動部署 GitHub Pages。
