// 名古屋旅行 App 主程式
// 功能：行程顯示、備注同步（Firebase）、AI 助理（Gemini）

import { TRIP_DATA } from "./data.js";

// ── 狀態管理 ─────────────────────────────
let currentDay = 1;
let geminiKey = "";
let firebaseApp = null;
let firestoreDb = null;
let pendingImage = null; // base64 圖片字串
let saveTimers = {}; // debounce 計時器
let chatHistory = []; // 對話記憶（讓 AI 記住前幾句話）

// ── 初始化 ───────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  loadSettings();
  renderTabs();
  renderAllDays();
  switchDay(getCurrentTripDay());
  setupEventListeners();
  if (firebaseApp) initFirestore();
  registerServiceWorker();
});

// 計算今天是旅程第幾天（自動跳到對應日）
function getCurrentTripDay() {
  const today = new Date();
  const tripStart = new Date("2026-03-25");
  const diff = Math.floor((today - tripStart) / 86400000);
  if (diff >= 0 && diff < TRIP_DATA.days.length) return diff + 1;
  return 1;
}

// ── 讀取設定 ─────────────────────────────
function loadSettings() {
  geminiKey = localStorage.getItem("geminiKey") || "";
  const fbConfig = localStorage.getItem("firebaseConfig");
  if (fbConfig) {
    try {
      const config = JSON.parse(fbConfig);
      initFirebase(config);
    } catch (e) {
      console.warn("Firebase 設定格式錯誤", e);
    }
  }
}

// ── Firebase 初始化 ──────────────────────
async function initFirebase(config) {
  try {
    const { initializeApp, getApps } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    if (!getApps().length) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApps()[0];
    }
    await initFirestore();
  } catch (e) {
    console.error("Firebase 初始化失敗", e);
  }
}

async function initFirestore() {
  try {
    const { getFirestore, doc, onSnapshot, collection } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    firestoreDb = getFirestore(firebaseApp);

    // 監聽所有備注的即時更新
    const notesCol = collection(firestoreDb, "nagoya-notes");
    onSnapshot(notesCol, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified" || change.type === "added") {
          const data = change.doc.data();
          const itemId = change.doc.id;
          const textarea = document.querySelector(
            `textarea[data-id="${itemId}"]`,
          );
          if (textarea && document.activeElement !== textarea) {
            textarea.value = data.text || "";
            updateSavedLabel(itemId, "☁️ 已同步");
          }
        }
      });
    });
    console.log("✅ Firebase 即時同步已啟動");
  } catch (e) {
    console.error("Firestore 初始化失敗", e);
  }
}

// ── 渲染分頁標籤 ─────────────────────────
function renderTabs() {
  const container = document.getElementById("dayTabs");
  container.innerHTML = TRIP_DATA.days
    .map(
      (day) => `
    <button class="day-tab" data-day="${day.id}" onclick="switchDay(${day.id})">
      ${day.emoji} ${day.date}
    </button>
  `,
    )
    .join("");
}

// ── 渲染所有天的內容 ────────────────────
function renderAllDays() {
  const main = document.getElementById("appMain");
  main.innerHTML = TRIP_DATA.days.map((day) => renderDay(day)).join("");
}

function renderDay(day) {
  const itemsHtml = day.items
    .map((item, idx) => {
      // 在每個 item 之前顯示路線卡（如果有對應的路線）
      const routeHtml =
        idx < day.routes.length ? renderRoute(day.routes[idx]) : "";
      return routeHtml + renderItem(item);
    })
    .join("");

  return `
    <div class="day-view" id="day-${day.id}">
      <div class="day-hero" style="background: linear-gradient(135deg, ${day.color} 0%, ${darken(day.color)} 100%)">
        <div class="day-hero-emoji">${day.emoji}</div>
        <div class="day-hero-date">Day ${day.id} · ${day.date} ${day.weekday}</div>
        <div class="day-hero-title">${day.title}</div>
      </div>
      ${itemsHtml}
    </div>
  `;
}

function renderRoute(route) {
  const safeFrom = route.from.replace(/'/g, "\\'");
  const safeTo = route.to.replace(/'/g, "\\'");
  return `
    <div class="route-card" onclick="openNav('${safeTo}')">
      <span class="route-icon">🚗</span>
      <div class="route-info">
        <div class="route-from-to">${route.from} → ${route.to}</div>
        <div class="route-duration">⏱ ${route.duration}</div>
      </div>
      <span class="route-arrow">›</span>
    </div>
  `;
}

// iOS 開啟 App：偵測頁面切走就取消備援，避免回來後再跳網頁版
function iosOpenApp(appUrl, webFallback) {
  // 備援：若 App 沒開成功才跳網頁版
  const timer = setTimeout(() => {
    window.location.href = webFallback;
  }, 1500);

  // 頁面切走（App 開成功）→ 立刻取消備援
  const onHide = () => clearTimeout(timer);
  window.addEventListener("blur", onHide, { once: true });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) clearTimeout(timer);
    },
    { once: true },
  );

  window.location.href = appUrl;
}

// 搜尋地點
function openMap(query) {
  const encoded = encodeURIComponent(query);
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) {
    iosOpenApp(
      `comgooglemaps://?q=${encoded}`,
      `https://maps.google.com/maps?q=${encoded}`,
    );
  } else if (/Android/.test(ua)) {
    window.location.href = `intent://maps.google.com/maps?q=${encoded}#Intent;scheme=https;package=com.google.android.apps.maps;end`;
  } else {
    window.open(`https://maps.google.com/maps?q=${encoded}`, "_blank");
  }
}
window.openMap = openMap;

// 導航路線（A → B）
function openNav(to) {
  const encoded = encodeURIComponent(to);
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) {
    iosOpenApp(
      `comgooglemaps://?daddr=${encoded}&directionsmode=driving`,
      `https://maps.google.com/maps?daddr=${encoded}`,
    );
  } else if (/Android/.test(ua)) {
    window.location.href = `google.navigation:q=${encoded}`;
  } else {
    window.open(`https://maps.google.com/maps?daddr=${encoded}`, "_blank");
  }
}
window.openNav = openNav;

function renderItem(item) {
  const recBadge = item.isRecommendation
    ? '<span class="rec-badge">💡 AI 推薦</span>'
    : "";
  const savedNote = localStorage.getItem(`note_${item.id}`) || "";

  return `
    <div class="timeline-item type-${item.type}" id="item-${item.id}">
      <div class="item-header">
        <span class="item-time">${item.time}</span>
        <div class="item-emoji-wrap">${item.emoji}</div>
        <div class="item-text">
          <div class="item-title">${item.title}</div>
          <div class="item-subtitle">${item.subtitle}</div>
          ${recBadge}
        </div>
        <button class="map-btn" onclick="openMap('${item.mapQuery.replace(/'/g, "\\'")}')" title="開啟 Google Maps">🗺️</button>
      </div>
      <div class="item-notes">
        <div class="notes-label">📝 備注</div>
        <textarea
          class="notes-input"
          data-id="${item.id}"
          placeholder="隨時輸入備注，全家人都能看到..."
          oninput="handleNoteInput(event)"
          onchange="handleNoteChange(event)"
        >${savedNote}</textarea>
        <div class="notes-saved" id="saved-${item.id}">
          ${savedNote ? "✅ 已儲存" : ""}
        </div>
      </div>
    </div>
  `;
}

// ── 切換日期 ─────────────────────────────
function switchDay(dayId) {
  currentDay = dayId;

  // 更新 tab 狀態
  document.querySelectorAll(".day-tab").forEach((tab) => {
    tab.classList.toggle("active", parseInt(tab.dataset.day) === dayId);
  });

  // 切換內容顯示
  document.querySelectorAll(".day-view").forEach((view) => {
    view.classList.toggle("active", view.id === `day-${dayId}`);
  });

  // 滾動到頂部
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 讓 HTML 的 onclick 可以呼叫
window.switchDay = switchDay;

// ── 備注儲存邏輯 ─────────────────────────
function handleNoteInput(event) {
  const textarea = event.target;
  const itemId = textarea.dataset.id;

  // 自動調整高度
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";

  // 立即儲存到本機
  localStorage.setItem(`note_${itemId}`, textarea.value);
  updateSavedLabel(itemId, "💾 已儲存本機");

  // debounce 500ms 後同步到 Firebase
  clearTimeout(saveTimers[itemId]);
  saveTimers[itemId] = setTimeout(
    () => syncNoteToFirebase(itemId, textarea.value),
    500,
  );
}

function handleNoteChange(event) {
  // change 事件確保離開時也觸發儲存
  handleNoteInput(event);
}

window.handleNoteInput = handleNoteInput;
window.handleNoteChange = handleNoteChange;

async function syncNoteToFirebase(itemId, text) {
  if (!firestoreDb) return;
  try {
    const { doc, setDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(firestoreDb, "nagoya-notes", itemId), {
      text,
      updatedAt: serverTimestamp(),
    });
    updateSavedLabel(itemId, "☁️ 已雲端同步");
  } catch (e) {
    console.error("Firebase 同步失敗", e);
    updateSavedLabel(itemId, "⚠️ 同步失敗（已儲存本機）");
  }
}

function updateSavedLabel(itemId, msg) {
  const label = document.getElementById(`saved-${itemId}`);
  if (label) {
    label.textContent = msg;
    // 3 秒後淡出
    clearTimeout(label._timer);
    label._timer = setTimeout(() => {
      label.textContent = "";
    }, 3000);
  }
}

// ── AI Chat（Gemini）────────────────────
const aiModal = document.getElementById("aiModal");
const chatContainer = document.getElementById("chatContainer");

document.getElementById("aiFab").addEventListener("click", () => openAiModal());
document
  .getElementById("aiModalClose")
  .addEventListener("click", () => closeAiModal());
aiModal.addEventListener("click", (e) => {
  if (e.target === aiModal) closeAiModal();
});

function openAiModal() {
  if (!geminiKey) {
    // 顯示設定提示
    showNoKeyMessage();
  }
  aiModal.removeAttribute("hidden");
}

function closeAiModal() {
  aiModal.setAttribute("hidden", "");
  chatHistory = []; // 關閉時清空記憶，下次開啟重新開始
}

function showNoKeyMessage() {
  const existing = chatContainer.querySelector(".no-key-msg");
  if (existing) return;
  chatContainer.insertAdjacentHTML(
    "afterbegin",
    `
    <div class="no-key-msg">
      <p>🤖 還沒設定 Gemini API Key！<br>免費申請只要 1 分鐘</p>
      <button class="setup-btn" onclick="openSettingsModal()">前往設定 →</button>
    </div>
  `,
  );
}

// 圖片選擇
const imageInput = document.getElementById("imageInput");
const chatImagePreview = document.getElementById("chatImagePreview");
const previewImg = document.getElementById("previewImg");

imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImage = ev.target.result.split(",")[1]; // base64 去掉前綴
    previewImg.src = ev.target.result;
    chatImagePreview.removeAttribute("hidden");
  };
  reader.readAsDataURL(file);
});

document.getElementById("removeImgBtn").addEventListener("click", () => {
  pendingImage = null;
  imageInput.value = "";
  chatImagePreview.setAttribute("hidden", "");
});

// 發送訊息
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener("click", sendMessage);

// 自動調整輸入框高度
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + "px";
});

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text && !pendingImage) return;
  if (!geminiKey) {
    showToast("請先在設定中輸入 Groq API Key");
    return;
  }

  sendBtn.disabled = true;

  // 顯示使用者訊息
  if (pendingImage) {
    appendChat("user-img", previewImg.src);
  }
  if (text) {
    appendChat("user", text);
  }

  // 清空輸入
  chatInput.value = "";
  chatInput.style.height = "auto";
  const imgData = pendingImage;
  pendingImage = null;
  chatImagePreview.setAttribute("hidden", "");
  imageInput.value = "";

  // 顯示打字動畫
  const typingEl = appendTyping();

  try {
    const response = await callGroq(text, imgData);
    typingEl.remove();
    appendChat("ai", response);
  } catch (e) {
    typingEl.remove();
    appendChat("ai", `⚠️ 發生錯誤：${e.message}\n\n請確認 API Key 是否正確。`);
  }

  sendBtn.disabled = false;
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function callGroq(text, imageBase64) {
  // Groq 支援視覺的模型：llama-3.2-11b-vision-preview
  const model = imageBase64
    ? "llama-3.2-11b-vision-preview"
    : "llama-3.3-70b-versatile";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const systemPrompt = `你是一個親切的旅遊助理，正在協助一個台灣家庭在日本名古屋、飛驒高山一帶旅行（2026年3月25-30日）。
請用繁體中文回答。如果看到日文圖片或招牌，請翻譯並解釋。
回答要簡潔，適合手機閱讀，必要時用條列式。`;

  // 組裝訊息內容（支援圖片）
  let userContent;
  if (imageBase64) {
    userContent = [
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
      },
      { type: "text", text: text || "請翻譯這張圖片的內容，並說明重要資訊。" },
    ];
  } else {
    userContent = text;
  }

  // 把這次問題存入對話歷史
  chatHistory.push({ role: "user", content: userContent });

  // 只保留最近 20 則，避免 token 超限
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatHistory, // 帶入完整對話記憶，AI 就能記住前幾句
    ],
    temperature: 0.7,
    max_tokens: 1000,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${geminiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || "（沒有回應）";

  // AI 回覆也存入歷史，下一輪才知道自己說過什麼
  chatHistory.push({ role: "assistant", content: reply });

  return reply;
}

function appendChat(type, content) {
  const div = document.createElement("div");
  if (type === "user") {
    div.className = "chat-bubble user-bubble";
    div.textContent = content;
  } else if (type === "ai") {
    div.className = "chat-bubble ai-bubble";
    div.innerHTML = content.replace(/\n/g, "<br>");
  } else if (type === "user-img") {
    div.className = "chat-img-msg";
    div.innerHTML = `<img src="${content}" alt="使用者圖片">`;
  }
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

function appendTyping() {
  const div = document.createElement("div");
  div.className = "typing-indicator";
  div.innerHTML =
    '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

// ── 設定 Modal ───────────────────────────
const settingsModal = document.getElementById("settingsModal");

document
  .getElementById("settingsBtn")
  .addEventListener("click", openSettingsModal);
document
  .getElementById("settingsModalClose")
  .addEventListener("click", closeSettingsModal);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

function openSettingsModal() {
  // 填入現有設定
  document.getElementById("geminiKeyInput").value = geminiKey;
  const fbConfig = localStorage.getItem("firebaseConfig") || "";
  document.getElementById("firebaseConfigInput").value = fbConfig;
  document.getElementById("settingsStatus").textContent = "";
  settingsModal.removeAttribute("hidden");
  if (aiModal && !aiModal.hasAttribute("hidden")) closeAiModal();
}
window.openSettingsModal = openSettingsModal;

function closeSettingsModal() {
  settingsModal.setAttribute("hidden", "");
}

document
  .getElementById("saveSettingsBtn")
  .addEventListener("click", async () => {
    const keyVal = document.getElementById("geminiKeyInput").value.trim();
    const fbVal = document.getElementById("firebaseConfigInput").value.trim();
    const status = document.getElementById("settingsStatus");

    // 儲存 Gemini Key
    if (keyVal) {
      localStorage.setItem("geminiKey", keyVal);
      geminiKey = keyVal;
    }

    // 儲存 Firebase 設定
    if (fbVal) {
      try {
        const config = JSON.parse(fbVal);
        localStorage.setItem("firebaseConfig", JSON.stringify(config));
        await initFirebase(config);
        status.textContent = "✅ 設定已儲存！Firebase 同步已啟動";
      } catch (e) {
        status.textContent =
          "⚠️ Firebase 設定格式錯誤，請確認是否為正確的 JSON";
        return;
      }
    } else {
      status.textContent = "✅ Gemini Key 已儲存";
    }

    // 移除 no-key 提示
    const noKeyMsg = chatContainer.querySelector(".no-key-msg");
    if (noKeyMsg) noKeyMsg.remove();

    setTimeout(closeSettingsModal, 1500);
  });

document.getElementById("clearSettingsBtn").addEventListener("click", () => {
  if (confirm("確定要清除所有設定嗎？（備注資料不會刪除）")) {
    localStorage.removeItem("geminiKey");
    localStorage.removeItem("firebaseConfig");
    geminiKey = "";
    firebaseApp = null;
    firestoreDb = null;
    document.getElementById("settingsStatus").textContent = "已清除所有設定";
  }
});

// ── Toast 提示 ───────────────────────────
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.removeAttribute("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.setAttribute("hidden", ""), 2500);
}

// ── Event Listeners ──────────────────────
function setupEventListeners() {
  // 點擊空白處關閉 modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAiModal();
      closeSettingsModal();
    }
  });
}

// ── Service Worker 註冊 ──────────────────
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // GitHub Pages 子目錄需要調整路徑，靜默處理
    });
  }
}

// ── 輔助函式 ─────────────────────────────
// 將 hex 顏色加深（用於漸層）
function darken(hex) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (num >> 16) - 40);
  const g = Math.max(0, ((num >> 8) & 0xff) - 40);
  const b = Math.max(0, (num & 0xff) - 40);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
