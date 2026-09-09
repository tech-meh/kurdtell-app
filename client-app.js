// KurdTell Client Application Logic with Firebase Realtime Database & WebRTC

const firebaseConfig = {
  apiKey: "AIzaSyCv-XoBKJ4ZvvSuMMt3UqnJSUSHb6NTdzY",
  authDomain: "voice-system-c7785.firebaseapp.com",
  databaseURL: "https://voice-system-c7785-default-rtdb.firebaseio.com",
  projectId: "voice-system-c7785",
  storageBucket: "voice-system-c7785.firebasestorage.app",
  messagingSenderId: "332965984577",
  appId: "1:332965984577:web:059b4c23759695127749c0",
  measurementId: "G-RQX7KLNF8J"
};

// دەستپێکردنی فایربەیس
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// گۆڕاوە سەرەکییەکان
let currentUser = null;
let currentCall = null;
let localStream = null;
let peerConnection = null;

// سێرڤەرەکانی STUN بۆ پەیوەندی ڕاستەوخۆی دەنگ
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// پەیوەستکردنی دوگمەکانی پەڕەکە
document.addEventListener("DOMContentLoaded", () => {
  // پشکنینی ئەوەی ئایا پێشتر بەکارهێنەر چۆتە ژوورەوە یان نا
  const savedUser = localStorage.getItem("kurdtell_user");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showDialerScreen();
  }

  // فۆڕمی چوونەژوورەوە
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // دوگمەکانی کیپاد
  document.querySelectorAll(".keypad-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const num = btn.getAttribute("data-key");
      const display = document.getElementById("callInput");
      if (display && num) {
        display.value += num;
      }
    });
  });

  // دوگمەی سڕینەوە لە کیپاد
  const backspaceBtn = document.getElementById("backspaceBtn");
  if (backspaceBtn) {
    backspaceBtn.addEventListener("click", () => {
      const display = document.getElementById("callInput");
      if (display) {
        display.value = display.value.slice(0, -1);
      }
    });
  }

  // دوگمەی دەرچوون
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutUser);
  }

  // دوگمەی پەیوەندیکردن
  const callBtn = document.getElementById("startCallBtn");
  if (callBtn) {
    callBtn.addEventListener("click", initiateCall);
  }

  // دوگمەی داخستنەوەی پەیوەندی
  const endCallBtn = document.getElementById("endCallBtn");
  if (endCallBtn) {
    endCallBtn.addEventListener("click", hangUpCall);
  }

  // دوگمەی وەڵامدانەوەی پەیوەندی
  const acceptCallBtn = document.getElementById("acceptCallBtn");
  if (acceptCallBtn) {
    acceptCallBtn.addEventListener("click", answerCall);
  }

  // دوگمەی ڕەتکردنەوەی پەیوەندی
  const rejectCallBtn = document.getElementById("rejectCallBtn");
  if (rejectCallBtn) {
    rejectCallBtn.addEventListener("click", hangUpCall);
  }
});

// چوونەژوورەوەی بەکارهێنەر
function handleLogin(e) {
  e.preventDefault();
  const phoneInput = document.getElementById("loginPhone").value.trim();
  const passInput = document.getElementById("loginPass").value.trim();

  if (!phoneInput || !passInput) {
    alert("تکایە هەردوو خانەکە پڕبکەرەوە");
    return;
  }

  // هێنانی زانیاری لە فایربەیس
  db.ref("users/" + phoneInput).once("value").then(snapshot => {
    const user = snapshot.val();
    if (user && user.password === passInput) {
      currentUser = {
        phone: phoneInput,
        name: user.name,
        daysRemaining: user.daysRemaining
      };
      localStorage.setItem("kurdtell_user", JSON.stringify(currentUser));
      showDialerScreen();
    } else {
      alert("ژمارەی هێڵ یان نهێنوشە هەڵەیە!");
    }
  }).catch(err => {
    alert("هەڵە لە سێرڤەر: " + err.message);
  });
}

// نیشاندانی شاشەی کیپاد و چالاککردنی گوێگرتن لە پەیوەندی
function showDialerScreen() {
  const loginSection = document.getElementById("loginSection");
  const dialerSection = document.getElementById("dialerSection");
  const userDisplay = document.getElementById("currentUserName");
  const phoneDisplay = document.getElementById("currentUserPhone");

  if (loginSection) loginSection.style.display = "none";
  if (dialerSection) dialerSection.style.display = "block";

  if (userDisplay) userDisplay.innerText = currentUser.name || "بەکارهێنەر";
  if (phoneDisplay) phoneDisplay.innerText = currentUser.phone;

  // داواکردنی مۆڵەتی مایکرۆفۆن لە پێشوەختدا
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;
  }).catch(err => {
    console.warn("مۆڵەتی مایکرۆفۆن نەدراوە: ", err);
  });

  // چاودێریکردنی پەیوەندییە هاتوەکان (Incoming Calls)
  listenForIncomingCalls();
}

// دەرچوون لە هەژمار
function logoutUser() {
  if (currentUser) {
    db.ref("calls/" + currentUser.phone).off();
  }
  localStorage.removeItem("kurdtell_user");
  currentUser = null;
  location.reload();
}

// چاودێریکردنی پەیوەندیی هاتووە لە فایربەیس
function listenForIncomingCalls() {
  db.ref("calls/" + currentUser.phone).on("value", snapshot => {
    const callData = snapshot.val();
    if (callData && callData.status === "ringing" && !currentCall) {
      currentCall = callData;
      currentCall.isCaller = false;
      showIncomingCallUI(callData.callerName, callData.callerPhone);
    } else if (callData && callData.status === "ended") {
      closeCallSession();
    }
  });
}

// نیشاندانی پەنجەرەی هاتنی تەلەفۆن (زەنگ)
function showIncomingCallUI(name, phone) {
  const incomingModal = document.getElementById("incomingCallModal");
  const callerNameText = document.getElementById("incomingCallerName");
  const callerPhoneText = document.getElementById("incomingCallerPhone");

  if (callerNameText) callerNameText.innerText = name || "نەناسراو";
  if (callerPhoneText) callerPhoneText.innerText = phone;
  if (incomingModal) incomingModal.style.display = "flex";

  playRingtone();
}

// دەستپێکردنی پەیوەندی (Caller)
function initiateCall() {
  const targetPhone = document.getElementById("callInput").value.trim();
  if (!targetPhone || targetPhone === currentUser.phone) {
    alert("تکایە ژمارەیەکی دروست بنووسە!");
    return;
  }

  // پشکنینی هەبوونی ئەو ژمارەیە لە داتابەیس
  db.ref("users/" + targetPhone).once("value").then(snapshot => {
    const targetUser = snapshot.val();
    if (!targetUser) {
      alert("ئەم ژمارەیە لە سیستەمدا تۆمار نەکراوە!");
      return;
    }

    startWebRTC(true, targetPhone);
  });
}

// بەستنەوەی WebRTC بۆ پەیوەندی دەنگی
async function startWebRTC(isCaller, targetPhone) {
  peerConnection = new RTCPeerConnection(rtcConfig);

  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      alert("مۆڵەتی مایکرۆفۆن پێویستە بۆ پەیوەندیکردن!");
      return;
    }
  }

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // گوێگرتن بۆ وەرگرتنی دەنگی کەسی بەرامبەر
  peerConnection.ontrack = event => {
    let remoteAudio = document.getElementById("remoteAudio");
    if (!remoteAudio) {
      remoteAudio = document.createElement("audio");
      remoteAudio.id = "remoteAudio";
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = event.streams[0];
  };

  const callChannelId = isCaller ? targetPhone : currentUser.phone;

  if (isCaller) {
    showInCallUI("پەیوەندی دەکرێت بە...", targetPhone);

    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        db.ref(`calls/${callChannelId}/callerCandidates`).push(event.candidate.toJSON());
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const callPayload = {
      callerPhone: currentUser.phone,
      callerName: currentUser.name,
      targetPhone: targetPhone,
      status: "ringing",
      offer: { type: offer.type, sdp: offer.sdp }
    };

    await db.ref(`calls/${callChannelId}`).set(callPayload);

    // گوێگرتن لە وەڵامی بەرامبەر (Answer)
    db.ref(`calls/${callChannelId}`).on("value", async snapshot => {
      const data = snapshot.val();
      if (data && data.answer && !peerConnection.currentRemoteDescription) {
        const answerDesc = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(answerDesc);
        showInCallUI("لە پەیوەندیدایە", targetPhone);
      }
    });

    // گواستنەوەی کاندیدەکانی کەسی وەڵامدەرەوە
    db.ref(`calls/${callChannelId}/calleeCandidates`).on("child_added", snapshot => {
      const data = snapshot.val();
      if (data) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });

  } else {
    // بۆ وەڵامدەرەوە (Callee)
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        db.ref(`calls/${callChannelId}/calleeCandidates`).push(event.candidate.toJSON());
      }
    };

    const callSnap = await db.ref(`calls/${callChannelId}`).once("value");
    const callData = callSnap.val();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await db.ref(`calls/${callChannelId}`).update({
      answer: { type: answer.type, sdp: answer.sdp },
      status: "connected"
    });

    // گواستنەوەی کاندیدەکانی کەسی پەیوەندیکەر
    db.ref(`calls/${callChannelId}/callerCandidates`).on("child_added", snapshot => {
      const data = snapshot.val();
      if (data) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });

    showInCallUI("لە پەیوەندیدایە", callData.callerPhone);
  }
}

// وەڵامدانەوەی تەلەفۆن
function answerCall() {
  stopRingtone();
  const incomingModal = document.getElementById("incomingCallModal");
  if (incomingModal) incomingModal.style.display = "none";

  startWebRTC(false, currentUser.phone);
}

// داخستنەوەی تەلەفۆن
function hangUpCall() {
  stopRingtone();
  const targetId = (currentCall && currentCall.targetPhone) ? currentCall.targetPhone : (currentUser ? currentUser.phone : null);
  if (targetId) {
    db.ref(`calls/${targetId}`).update({ status: "ended" });
    setTimeout(() => {
      db.ref(`calls/${targetId}`).remove();
    }, 1000);
  }
  closeCallSession();
}

// پاککردنەوەی دۆخی تەلەفۆن
function closeCallSession() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  currentCall = null;
  stopRingtone();

  const activeCallModal = document.getElementById("activeCallModal");
  const incomingModal = document.getElementById("incomingCallModal");
  if (activeCallModal) activeCallModal.style.display = "none";
  if (incomingModal) incomingModal.style.display = "none";
}

// پیشاندانی پەنجەرەی پەیوەندی کراوە
function showInCallUI(statusText, phone) {
  const activeCallModal = document.getElementById("activeCallModal");
  const activeStatus = document.getElementById("activeCallStatus");
  const activePhone = document.getElementById("activeCallTarget");

  if (activeStatus) activeStatus.innerText = statusText;
  if (activePhone) activePhone.innerText = phone;
  if (activeCallModal) activeCallModal.style.display = "flex";
}

// لێدانی زەنگ (دەنگ)
let ringtoneAudio = null;
function playRingtone() {
  try {
    if (!ringtoneAudio) {
      ringtoneAudio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
      ringtoneAudio.loop = true;
    }
    ringtoneAudio.play().catch(e => console.log("دەنگ دەستی پێ نەکرد: ", e));
  } catch (e) {}
}

function stopRingtone() {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
  }
}
