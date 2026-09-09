const SERVER_URL = "wss://voice-server-production-4376.up.railway.app";
const OWNER_NUM = "000000";

const firebaseConfig = {
  apiKey: "AIzaSyCv-XoBKJ4ZvvSuMMt3UqnJSUSHb6NTdzY",
  authDomain: "voice-system-c7785.firebaseapp.com",
  databaseURL: "https://voice-system-c7785-default-rtdb.firebaseio.com",
  projectId: "voice-system-c7785",
  storageBucket: "voice-system-c7785.firebasestorage.app",
  messagingSenderId: "332965984577",
  appId: "1:332965984577:web:c0853441191063407749c0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentClient = JSON.parse(localStorage.getItem("kurdtell_client_session")) || null;
let savedContacts = JSON.parse(localStorage.getItem("kurdtell_contacts")) || [];
let blockedList = JSON.parse(localStorage.getItem("kurdtell_blocked")) || [];
let currentLang = localStorage.getItem("kurdtell_lang") || "ckb";

let cSocket, cPeer, cStream, cTimer, cSec = 0;
let pendingOffer = null, pendingCaller = null;
const rtcCfg = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const $ = (id) => document.getElementById(id);

const translations = {
  ckb: {
    loginSub: "تکایە بە ژمارەی هێڵ و نهێنوشەکەت بچۆ ژوورەوە",
    loginBtn: "چوونەژوورەوە 🚀",
    statusActive: "چالاکە",
    remDays: "ڕۆژی ماوە:",
    tabDialer: "ژمارە لێدان",
    tabContacts: "ناوەکان 👥",
    callBtn: "پەیوەندی 📞",
    endCallBtn: "داخستنەوە 📴",
    addContactBtn: "زیادکردنی ناو ➕",
    incomingCall: "پەیوەندی نوێ لە لایەن:",
    acceptBtn: "وەڵامدانەوە 📞",
    rejectBtn: "ڕەتکردنەوە 📴",
    settingsTitle: "ڕێکخستنەکان ⚙️",
    accountLabel: "هەژماری بەکارهێنەر 👤",
    userName: "ناو:",
    languageLabel: "زمان / Language / اللغة 🌐",
    supportLabel: "پشتیوانی و یارمەتی 📞",
    supportBtn: "پەیوەندی کردن بە تیمی KurdTell",
    themeLabel: "ڕووکاری بینین 💡",
    themeBtn: "گۆڕینی دۆخ (تاریک / ڕووناک)",
    blockLabel: "ژمارە بلۆککراوەکان 🚫",
    logoutBtn: "چوونەدەرەوە لەم هێڵە 🚪"
  },
  ar: {
    loginSub: "يرجى تسجيل الدخول برقم الخط وكلمة المرور",
    loginBtn: "تسجيل الدخول 🚀",
    statusActive: "نشط",
    remDays: "الأيام المتبقية:",
    tabDialer: "لوحة الاتصال",
    tabContacts: "جهات الاتصال 👥",
    callBtn: "اتصال 📞",
    endCallBtn: "إنهاء المكالمة 📴",
    addContactBtn: "إضافة اسم ➕",
    incomingCall: "مكالمة واردة من:",
    acceptBtn: "رد 📞",
    rejectBtn: "رفض 📴",
    settingsTitle: "الإعدادات ⚙️",
    accountLabel: "حساب المستخدم 👤",
    userName: "الاسم:",
    languageLabel: "اللغة / Language / زمان 🌐",
    supportLabel: "الدعم والمساعدة 📞",
    supportBtn: "الاتصال بفريق KurdTell",
    themeLabel: "المظهر 💡",
    themeBtn: "تغيير الوضع (داكن / فاتح)",
    blockLabel: "الأرقام المحظورة 🚫",
    logoutBtn: "تسجيل الخروج من هذا الخط 🚪"
  },
  en: {
    loginSub: "Please log in with your line number and password",
    loginBtn: "Log In 🚀",
    statusActive: "Active",
    remDays: "Remaining Days:",
    tabDialer: "Keypad",
    tabContacts: "Contacts 👥",
    callBtn: "Call 📞",
    endCallBtn: "End Call 📴",
    addContactBtn: "Add Contact ➕",
    incomingCall: "Incoming call from:",
    acceptBtn: "Answer 📞",
    rejectBtn: "Decline 📴",
    settingsTitle: "Settings ⚙️",
    accountLabel: "User Account 👤",
    userName: "Name:",
    languageLabel: "Language / زمان / اللغة 🌐",
    supportLabel: "Support & Help 📞",
    supportBtn: "Call KurdTell Team",
    themeLabel: "Theme 💡",
    themeBtn: "Toggle Theme (Dark / Light)",
    blockLabel: "Blocked Numbers 🚫",
    logoutBtn: "Sign Out 🚪"
  }
};

function initApp() {
  applyLanguage(currentLang);
  $("langSelect").value = currentLang;
  listenToLogo();
  renderContacts();
  renderBlocklist();

  if (currentClient && currentClient.phone) {
    verifyAndAutoLogin(currentClient.phone);
  } else {
    showLoginView();
  }
}

function changeAppLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("kurdtell_lang", lang);
  applyLanguage(lang);
}

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "en") ? "ltr" : "rtl";
  document.body.style.direction = (lang === "en") ? "ltr" : "rtl";

  const t = translations[lang] || translations.ckb;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.innerText = t[key];
  });
}

function listenToLogo() {
  db.ref("appSettings/logoUrl").on("value", (snap) => {
    const url = snap.val();
    if (url) {
      $("loginLogoPreview").src = url;
      $("loginLogoPreview").style.display = "inline-block";
      $("mainAppLogo").src = url;
      $("mainAppLogo").style.display = "inline-block";
    }
  });
}

function showLoginView() {
  $("clientLoginScreen").style.display = "flex";
  $("clientMainApp").style.display = "none";
}

function showMainApp() {
  $("clientLoginScreen").style.display = "none";
  $("clientMainApp").style.display = "block";
  $("clientDisplayFullName").innerText = currentClient.fullName;
  $("clientDisplayNumber").innerText = `${currentClient.phone}`;
  $("drawerClientName").innerText = currentClient.fullName;
  updateClientStatusUI();
  connectWebSocket();
}

function updateClientStatusUI() {
  const rem = Math.ceil((new Date(currentClient.expireDate) - Date.now()) / 86400000);
  $("remDaysText").innerText = rem > 0 ? `${rem}` : "0";
  const badge = $("lineStatusBadge");
  if (currentClient.status === "active" && rem > 0) {
    badge.innerText = translations[currentLang].statusActive;
    badge.className = "status-pill active";
  } else {
    badge.innerText = "!";
    badge.className = "status-pill paused";
  }
}

function toggleClientDrawer(o) {
  $("clientSettingsDrawer").classList.toggle("open", o);
  $("clientDrawerOverlay").style.display = o ? "block" : "none";
}

function toggleClientTheme() {
  const isLight = document.body.getAttribute("data-theme") === "light";
  document.body.setAttribute("data-theme", isLight ? "dark" : "light");
}

function callSupportTeam() {
  toggleClientDrawer(false);
  switchClientTab('dialer');
  $("dialInput").value = OWNER_NUM;
  startOutgoingCall();
}

function switchClientTab(tab) {
  if (tab === 'dialer') {
    $("dialerSection").style.display = "block";
    $("contactsSection").style.display = "none";
    $("tabDialerBtn").classList.add("active");
    $("tabContactsBtn").classList.remove("active");
  } else {
    $("dialerSection").style.display = "none";
    $("contactsSection").style.display = "block";
    $("tabDialerBtn").classList.remove("active");
    $("tabContactsBtn").classList.add("active");
  }
}

function addNewContact() {
  const name = $("newContactName").value.trim();
  const phone = $("newContactNumber").value.trim();

  if (!name || phone.length !== 6) {
    return alert("تکایە ناو بنووسە لەگەڵ ژمارەی ٦ ڕەقەمی!");
  }

  savedContacts.push({ name, phone });
  localStorage.setItem("kurdtell_contacts", JSON.stringify(savedContacts));
  $("newContactName").value = "";
  $("newContactNumber").value = "";
  renderContacts();
}

function promptSaveCurrentDial() {
  const num = $("dialInput").value.trim();
  if (num.length !== 6) return alert("سەرەتا ژمارەیەکی ٦ ڕەقەمی بنووسە!");
  const name = prompt("ناوی کەسەکە بنووسە بۆ تۆمارکردن:");
  if (name) {
    savedContacts.push({ name: name.trim(), phone: num });
    localStorage.setItem("kurdtell_contacts", JSON.stringify(savedContacts));
    renderContacts();
    alert("ناو بە سەرکەوتوویی تۆمارکرا ✅");
  }
}

function deleteContact(index) {
  savedContacts.splice(index, 1);
  localStorage.setItem("kurdtell_contacts", JSON.stringify(savedContacts));
  renderContacts();
}

function callFromContact(num) {
  switchClientTab('dialer');
  $("dialInput").value = num;
  startOutgoingCall();
}

function renderContacts() {
  const list = $("contactsList");
  if (!list) return;
  list.innerHTML = "";
  if (savedContacts.length === 0) {
    list.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:10px;">هیچ ناوێک تۆمار نەکراوە</div>`;
    return;
  }
  savedContacts.forEach((c, idx) => {
    list.innerHTML += `
      <div class="contact-item-row">
        <div class="contact-details">
          <h4>${c.name}</h4>
          <span>${c.phone}</span>
        </div>
        <div class="contact-actions">
          <button class="btn-quick-call" onclick="callFromContact('${c.phone}')">📞</button>
          <button class="btn-del-contact" onclick="deleteContact(${idx})">🗑️</button>
        </div>
      </div>
    `;
  });
}

function addNumberToBlocklist() {
  const num = $("blockInputNumber").value.trim();
  if (num.length !== 6) return alert("ژمارەی هێڵ دەبێت ٦ ڕەقەم بێت!");
  if (!blockedList.includes(num)) {
    blockedList.push(num);
    localStorage.setItem("kurdtell_blocked", JSON.stringify(blockedList));
    $("blockInputNumber").value = "";
    renderBlocklist();
  }
}

function removeBlockedNumber(num) {
  blockedList = blockedList.filter(n => n !== num);
  localStorage.setItem("kurdtell_blocked", JSON.stringify(blockedList));
  renderBlocklist();
}

function renderBlocklist() {
  const box = $("blockedNumbersList");
  if (!box) return;
  box.innerHTML = "";
  blockedList.forEach(num => {
    box.innerHTML += `
      <span class="blocked-tag">
        ${num}
        <button onclick="removeBlockedNumber('${num}')">✕</button>
      </span>
    `;
  });
}

function loginClient() {
  const phone = $("loginPhone").value.trim();
  const pass = $("loginPass").value.trim();
  const errBox = $("loginErrorMsg");

  if (!phone || !pass) {
    errBox.innerText = "تکایە هەردوو خانەکە پڕبکەرەوە!";
    errBox.style.display = "block";
    return;
  }

  db.ref("clients/" + phone).once("value").then((snap) => {
    const data = snap.val();
    if (!data) {
      errBox.innerText = "ئەم ژمارەی هێڵە بوونی نییە!";
      errBox.style.display = "block";
      return;
    }
    if (data.pass !== pass) {
      errBox.innerText = "وشەی نهێنی هەڵەیە!";
      errBox.style.display = "block";
      return;
    }
    const rem = Math.ceil((new Date(data.expireDate) - Date.now()) / 86400000);
    if (rem <= 0 || data.status !== "active") {
      errBox.innerText = "ئەم هێڵە وەستێنراوە یان بەسەرچووە!";
      errBox.style.display = "block";
      return;
    }
    currentClient = data;
    localStorage.setItem("kurdtell_client_session", JSON.stringify(data));
    errBox.style.display = "none";
    showMainApp();
  }).catch((err) => {
    errBox.innerText = "هەڵە: " + err.message;
    errBox.style.display = "block";
  });
}

function verifyAndAutoLogin(phone) {
  db.ref("clients/" + phone).on("value", (snap) => {
    const data = snap.val();
    if (data) {
      currentClient = data;
      localStorage.setItem("kurdtell_client_session", JSON.stringify(data));
      showMainApp();
    } else {
      logoutClient();
    }
  });
}

function logoutClient() {
  localStorage.removeItem("kurdtell_client_session");
  currentClient = null;
  if (cSocket) cSocket.close();
  location.reload();
}

function appendDialDigit(d) {
  const input = $("dialInput");
  if (input.value.length < 6) input.value += d;
}

function deleteDialDigit() {
  const input = $("dialInput");
  input.value = input.value.slice(0, -1);
}

function clearDialPad() {
  $("dialInput").value = "";
}

function connectWebSocket() {
  cSocket = new WebSocket(SERVER_URL);

  cSocket.onopen = () => {
    cSocket.send(JSON.stringify({ type: "register", id: currentClient.phone }));
  };

  cSocket.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };

  cSocket.onmessage = async (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "offer") {
      if (blockedList.includes(msg.from)) {
        cSocket.send(JSON.stringify({ type: "hangup", to: msg.from }));
        return;
      }

      pendingOffer = msg.offer;
      pendingCaller = msg.from;
      
      const found = savedContacts.find(c => c.phone === msg.from);
      let showName = (msg.from === OWNER_NUM) ? "تیمی KurdTell" : msg.from;
      if (found) showName = `${found.name} (${msg.from})`;

      $("incomingCallerNum").innerText = showName;
      $("incomingCallModal").style.display = "block";
    } else if (msg.type === "answer" && cPeer) {
      await cPeer.setRemoteDescription(new RTCSessionDescription(msg.answer));
    } else if (msg.type === "candidate" && cPeer) {
      await cPeer.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } else if (msg.type === "hangup") {
      resetCallUI();
    }
  };
}

async function startOutgoingCall() {
  const target = $("dialInput").value.trim();
  if (!target) return alert("تکایە سەرەتا ژمارەیەک بنووسە!");
  if (target === currentClient.phone) return alert("ناتوانیت پەیوەندی بە ژمارەی خۆتەوە بکەیت!");

  const rem = Math.ceil((new Date(currentClient.expireDate) - Date.now()) / 86400000);
  if (rem <= 0 || currentClient.status !== "active") {
    return alert("هێڵەکەت ناچالاکە یان ماوەکەی تەواو بووە!");
  }

  if (!cStream) cStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  cPeer = new RTCPeerConnection(rtcCfg);
  cStream.getTracks().forEach(t => cPeer.addTrack(t, cStream));

  cPeer.ontrack = (e) => $("clientRemoteAudio").srcObject = e.streams[0];
  cPeer.onicecandidate = (e) => {
    if (e.candidate) cSocket.send(JSON.stringify({ type: "candidate", candidate: e.candidate, to: target }));
  };

  const offer = await cPeer.createOffer();
  await cPeer.setLocalDescription(offer);
  cSocket.send(JSON.stringify({ type: "offer", offer: offer, to: target, from: currentClient.phone }));

  setInCallUI(true);
}

async function acceptIncomingCall() {
  if (!pendingOffer || !pendingCaller) return;
  if (!cStream) cStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  cPeer = new RTCPeerConnection(rtcCfg);
  cStream.getTracks().forEach(t => cPeer.addTrack(t, cStream));

  cPeer.ontrack = (e) => $("clientRemoteAudio").srcObject = e.streams[0];
  cPeer.onicecandidate = (e) => {
    if (e.candidate) cSocket.send(JSON.stringify({ type: "candidate", candidate: e.candidate, to: pendingCaller }));
  };

  await cPeer.setRemoteDescription(new RTCSessionDescription(pendingOffer));
  const ans = await cPeer.createAnswer();
  await cPeer.setLocalDescription(ans);
  cSocket.send(JSON.stringify({ type: "answer", answer: ans, to: pendingCaller }));

  $("incomingCallModal").style.display = "none";
  setInCallUI(true);
}

function rejectIncomingCall() {
  if (cSocket && pendingCaller) {
    cSocket.send(JSON.stringify({ type: "hangup", to: pendingCaller }));
  }
  resetCallUI();
}

function hangUpCurrentCall() {
  const target = $("dialInput").value.trim() || pendingCaller;
  if (cSocket && target) {
    cSocket.send(JSON.stringify({ type: "hangup", to: target }));
  }
  resetCallUI();
}

function setInCallUI(inCall) {
  $("btnStartCall").style.display = inCall ? "none" : "block";
  $("btnEndCall").style.display = inCall ? "block" : "none";
  if (inCall) startTimer();
  else resetCallUI();
}

function startTimer() {
  cSec = 0;
  $("callTimerBox").style.display = "block";
  $("callTimerBox").innerText = "00:00";
  clearInterval(cTimer);
  cTimer = setInterval(() => {
    cSec++;
    $("callTimerBox").innerText = `${String(Math.floor(cSec/60)).padStart(2,'0')}:${String(cSec%60).padStart(2,'0')}`;
  }, 1000);
}

function resetCallUI() {
  clearInterval(cTimer);
  cSec = 0;
  $("callTimerBox").style.display = "none";
  $("incomingCallModal").style.display = "none";
  $("btnStartCall").style.display = "block";
  $("btnEndCall").style.display = "none";
  pendingOffer = pendingCaller = null;
  if (cPeer) {
    cPeer.close();
    cPeer = null;
  }
}

window.onload = initApp;
