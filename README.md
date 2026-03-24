# 🌸 名古屋・飛驒 家族旅行 App

2026年3月25日 – 3月30日 名古屋自助旅行互動行程

## ✨ 功能

- 📅 **6天完整行程** - 每日分頁，時間軸顯示
- 🗺️ **一鍵開啟 Google Maps** - 點擊任何地點直接導航
- 🚗 **路線時間卡片** - 各路段車程一目瞭然
- 📝 **即時備注** - 全家人輸入的備注即時同步
- 🤖 **AI 旅遊助理** - 拍照翻譯日文 + 問問題（Gemini）
- 📱 **可加入主畫面** - 當成 App 快捷方式使用

---

## 🚀 設定步驟（第一次使用）

### Step 1：申請 Gemini API Key（免費，1 分鐘）

1. 打開：[aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. 登入 Google 帳號
3. 點「Create API Key」
4. 複製 Key（AIza 開頭的字串）

### Step 2：建立 Firebase 專案（免費，5 分鐘）

1. 打開：[console.firebase.google.com](https://console.firebase.google.com)
2. 點「新增專案」→ 輸入名稱（例如：nagoya-trip）→ 建立
3. 左側選「建構 → Firestore Database」→「建立資料庫」→ 選「測試模式」→ 選亞洲地區
4. 回到「專案設定」（左上齒輪圖示）→「您的應用程式」→ 點「</>」新增 Web 應用程式
5. 複製 `firebaseConfig` 那段程式碼裡的 `{...}` 內容

### Step 3：在 App 裡輸入設定

1. 打開旅行 App
2. 點右上角 ⚙️ 設定
3. 貼上 Gemini Key
4. 貼上 Firebase 設定 JSON
5. 儲存 → 完成！

### Step 4：分享給家人

把網頁連結傳給家人 → 他們各自在手機上進行 Step 3 → 備注就會即時同步！

---

## 📱 加入主畫面（當 App 捷徑）

### iPhone/iPad：

1. Safari 開啟旅行網頁
2. 點底部「分享」按鈕
3. 選「加入主畫面」

### Android：

1. Chrome 開啟網頁
2. 點右上角三個點
3. 選「新增至主畫面」

---

## 🌐 部署到 GitHub Pages

```bash
cd nagoya-trip
git init
git add .
git commit -m "🌸 名古屋旅行 App"
# 在 GitHub 建立新 repo 後：
git remote add origin https://github.com/你的帳號/nagoya-trip.git
git push -u origin main
```

然後在 GitHub Repo → Settings → Pages → Source 選 `main` branch → Save

網址會是：`https://你的帳號.github.io/nagoya-trip/`
