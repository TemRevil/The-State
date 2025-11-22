import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, collection, onSnapshot, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getStorage, ref, listAll, getMetadata, getDownloadURL, uploadBytes, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";


const config = {
  apiKey: "AIzaSyCPg-DCTI8xn4oSWrr0D8teFV79vpBkcts",
  authDomain: "state-a1.firebaseapp.com",
  projectId: "state-a1",
  storageBucket: "state-a1.firebasestorage.app",
  messagingSenderId: "678269987849",
  appId: "1:678269987849:web:98b3eeb7c2340dfa395cd8"
};

const app = initializeApp(config);
const db = getFirestore(app);
window.db = db;
const storage = getStorage(app);

// Expose storage globally for clipboard monitor and other features
window.storage = storage;
window.firebaseStorage = storage;

// Set Firebase ready flag
window.firestoreReady = true;

// Global Firestore functions for quiz system
window.getQuizDoc = async (lectureName) => {
    return await safeGetDoc(doc(db, "quizi", lectureName));
};

// Usage limits - Firebase Free Tier Maximums
const limits = {
  // Firestore limits
  reads: 50000,      // 50,000 reads per day
  writes: 20000,     // 20,000 writes per day
  deletes: 20000,    // 20,000 deletes per day
  storageGB: 1,      // 1 GB stored data

  // Cloud Storage limits
  downloadsMB: 1024, // 1 GB downloads per day
  uploads: 20000,    // 20,000 upload operations per day
  downloadOps: 50000 // 50,000 download operations per day
};

const counters = {
  reads: 0,
  writes: 0,
  deletes: 0,
  storageGB: 0,
  downloadsMB: 0,
  uploads: 0,
  downloadOps: 0
};

const overLimit = (type, amt = 1) => {
  counters[type] += amt;
  if (counters[type] > limits[type]) {
    pauseFirebase(`${type} limit exceeded (${counters[type]}/${limits[type]})`);
    return true;
  }
  return false;
};

const pauseFirebase = (reason) => {
  document.body.innerHTML = `<div style="padding:2em;text-align:center;"><h2>Usage limit reached</h2><p>${reason}</p><p>Please try again later.</p></div>`;
};

// Reset counters daily at midnight
const resetCountersDaily = () => {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const timeUntilMidnight = midnight - now;

  setTimeout(() => {
    // Reset all counters
    Object.keys(counters).forEach(key => counters[key] = 0);
    console.log('Firebase usage counters reset for the new day');

    // Schedule next reset
    resetCountersDaily();
  }, timeUntilMidnight);
};

// Start the daily reset cycle
resetCountersDaily();

// Function to get current usage status
window.getFirebaseUsage = () => {
  const usage = {};
  Object.keys(limits).forEach(key => {
    usage[key] = {
      current: counters[key],
      limit: limits[key],
      remaining: Math.max(0, limits[key] - counters[key]),
      percentage: Math.min(100, (counters[key] / limits[key]) * 100)
    };
  });
  return usage;
};

// Safe wrappers for Firestore and Storage
async function safeGetDoc(r) { if (overLimit("reads")) return null; return await getDoc(r); }
async function safeGetDocs(r) { if (overLimit("reads")) return null; return await getDocs(r); }
async function safeSetDoc(r, d) { if (overLimit("writes")) return; return await setDoc(r, d); }
async function safeUpdateDoc(r, d) { if (overLimit("writes")) return; return await updateDoc(r, d); }
async function safeDeleteDoc(r) { if (overLimit("deletes")) return; return await deleteDoc(r); }
window.safeDeleteDoc = safeDeleteDoc;
async function safeGetDownloadURL(r, sz = 0.25) {
  if (overLimit("downloadsMB", sz) || overLimit("downloadOps")) return null;
  return await getDownloadURL(r);
}
async function safeUploadBytes(r, d) { if (overLimit("uploads")) return; return await uploadBytes(r, d); }
async function safeDeleteObject(r) { if (overLimit("deletes")) return; return await deleteObject(r); }
async function safeListAll(r) { if (overLimit("reads")) return null; return await listAll(r); }
async function safeGetMetadata(r) { if (overLimit("reads")) return null; return await getMetadata(r); }

// Expose safe wrapper functions globally
window.safeListAll = safeListAll;
window.safeGetMetadata = safeGetMetadata;
window.safeUploadBytes = safeUploadBytes;
window.safeDeleteObject = safeDeleteObject;
window.safeGetDownloadURL = safeGetDownloadURL;

// --- The rest of your code remains exactly the same ---
const getDeviceName = async () => {
  let n = localStorage.getItem("DeviceName");
  if (n) return n;
  if (navigator.userAgentData?.getHighEntropyValues) {
    try {
      const i = await navigator.userAgentData.getHighEntropyValues(["model"]);
      if (i.model?.length && i.model !== "Unknown") {
        localStorage.setItem("DeviceName", i.model);
        return i.model;
      }
    } catch {}
  }
  const ua = navigator.userAgent;
  const m = ua.match(/Android\s[\d.]+;\s([^)]+)/i);
  if (m) { n = m[1].trim(); localStorage.setItem("DeviceName", n); return n; }
  const f = [[/iphone/i, "iPhone"], [/ipad/i, "iPad"], [/windows/i, "Windows PC"], [/macintosh/i, "MacBook"], [/linux/i, "Linux Device"]];
  for (const [r, nm] of f) { if (r.test(ua)) { localStorage.setItem("DeviceName", nm); return nm; } }
  n = prompt("Enter device name:") || "Unknown";
  localStorage.setItem("DeviceName", n);
  return n;
};

const genCode = () => Array.from({ length: 5 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join("");
const fmtDate = () => new Date().toLocaleDateString("en-GB");
const fmtTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
const decodeNum = (k) => { let r = ""; for (let i = 10; i < k.length && r.length < 11; i += 2) if (/\d/.test(k[i])) r += k[i]; return r; };

const $ = (s) => document.querySelector(s);
const els = {
  login: $(".login"), blocked: $(".blocked-view"), numIn: $(".login input:not(#api-key-input):not(#name-input)"),
  apiIn: $("#api-key-input"), apiGrp: $("#api-key-input")?.closest(".input-group"),
  nameIn: $("#name-input"), nameGrp: $("#name-input")?.closest(".input-group"),
  copyBtn: $("#copy-api-btn"), createBtn: $("#create-btn"), loginBtn: $("#login"), loginActs: $(".login-actions"),
  remMe: $("#remember-me"), header: $(".header"), main: $(".main-content"), quizi: $(".quizi")
};

const toggleView = (show) => ["blocked", "login", "header", "main", "quizi"].forEach(v => els[v]?.classList.toggle("off", !show.includes(v)));
const showBlocked = () => toggleView(["blocked"]);
const showApp = () => toggleView(["header", "main", "quizi"]);
const showLogin = () => toggleView(["login"]);
window.showApp = showApp;
window.showLogin = showLogin;
window.showBlocked = showBlocked;

const toggleApiGrp = (show, val = "") => {
  if (els.apiIn) els.apiIn.value = val;
  els.apiGrp?.classList.toggle("off", !show);
  els.loginActs?.classList.toggle("off", !show);
  const rt = els.remMe?.closest('.remember-toggle');
  if (rt) rt.classList.toggle("off", !els.apiIn?.value.trim());
};

const toggleNameGrp = (show) => {
  els.nameGrp?.classList.toggle("off", !show);
  const rt = els.remMe?.closest('.remember-toggle');
  if (rt) rt.classList.toggle("off", !show);
};

const toggleLoginBtn = () => {
  const v = !els.apiGrp?.classList.contains("off") && (els.apiIn?.value.trim().length || 0) >= 68;
  els.loginBtn?.classList.toggle("off", !v);
};

const checkNum = async (n) => {
  const s = await safeGetDoc(doc(db, "Numbers", n));
  if (!s || !s.exists()) return null;
  const k = config.apiKey;
  return k.slice(0, 10) + k.slice(10).split("").reduce((a, c, i) => a + (n[i % n.length] || "") + c, "");
};

const recordSnitch = async (l, s) => {
  const c = collection(db, "Snitches");
  const d = await safeGetDocs(c);
  if (!d) return false;
  if (d.docs.some(doc => doc.data()["The Login Number"] === l)) return false;
  await safeSetDoc(doc(c, `Match ${d.size + 1}`), { "The Login Number": l, "The Snitch": s, "Snitched Date": fmtDate(), "Snitched Time": fmtTime() });
  await safeSetDoc(doc(db, "Blocked", l), { "Blocked Date": fmtDate(), "Blocked Time": fmtTime(), "Reason": "tried to snitch" });
  return true;
};

const isBlocked = async (n) => {
  try {
    if ((await safeGetDoc(doc(db, "Blocked", n)))?.exists()) return true;
    const d = await safeGetDocs(collection(db, "Snitches"));
    return d ? d.docs.some(doc => doc.data()["The Login Number"] === n) : false;
  } catch (e) { console.error("Block check error:", e); return false; }
};
window.isBlocked = isBlocked;

const logDevice = async (n, d, c) => {
  const r = doc(db, "Numbers", n);
  const s = await safeGetDoc(r);
  if (!s || !s.exists()) throw new Error("No user record");
  const data = s.data();
  const dev = data?.Devices || {};
  const al = dev["Devices Allowed"] || 1;
  const dm = dev["Devices Name"] || {};
  const ar = dev.Archived || {};
  const lg = Object.values(dm);
  if (!lg.includes(d) && lg.length >= al) throw new Error("Too many devices");
  ar[Object.keys(ar).length + 1] = { Code: c, Date: fmtDate(), Time: fmtTime() };
  if (!lg.includes(d)) dm[Object.keys(dm).length + 1] = d;
  await safeUpdateDoc(r, { Devices: { "Devices Allowed": al, "Devices Name": dm, Archived: ar } });
};

const saveRemMe = (s) => localStorage.setItem("RememberMe", s.toString());
const clearData = async () => {
  const n = localStorage.getItem("Number");
  if (!n || !(await isBlocked(n))) localStorage.removeItem("Number");
  localStorage.removeItem("DeviceName");
  localStorage.removeItem("Code");
  localStorage.removeItem("Name");
};
window.clearData = clearData;
const isRemMe = () => localStorage.getItem("RememberMe") === "true";
window.isRemMe = isRemMe;

const watchStorage = () => {
  let l = localStorage.getItem("Number");
  window.addEventListener("storage", async (e) => {
    if (e.key === "Number" && e.newValue && await isBlocked(e.newValue)) showBlocked();
    if (e.key === "RememberMe" && e.newValue === "false") { await clearData(); showLogin(); }
  });
  setInterval(async () => {
    const c = localStorage.getItem("Number");
    if (c !== l) { l = c; if (c && await isBlocked(c)) showBlocked(); }
  }, 1000);
};
window.watchStorage = watchStorage;

const watchFirestore = () => {
  const n = localStorage.getItem("Number");
  if (!n) return;
  onSnapshot(doc(db, "Blocked", n), s => { if (s.exists()) showBlocked(); });
  onSnapshot(collection(db, "Snitches"), s => { if (s.docs.some(d => d.data()["The Login Number"] === n)) showBlocked(); });
  
  // Watch for Download permission changes
  onSnapshot(doc(db, "Numbers", n), async (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      const currentPermission = window.hasDownloadPermission || false;
      const newPermission = data["PDF-Down"] === true;
      
      // Only reload if permission actually changed
      if (currentPermission !== newPermission) {
        window.hasDownloadPermission = newPermission;
        
        // Close PDF viewer if open
        const viewer = document.querySelector('.pdf-viewer');
        if (viewer) {
          viewer.classList.add('off');
          const iframe = viewer.querySelector('.pdf-frame');
          if (iframe) iframe.src = '';
        }
        
        // Clear all existing PDF content from the page
        const aside = $('.aside');
        const content = $('.content');
        if (aside) {
          aside.querySelectorAll('.align:not(.weekly-aside)').forEach(el => el.remove());
        }
        if (content) content.innerHTML = '';
        
        // Clear cache
        window.pdfCache = {};
        
        // Reload with new permissions (like fresh page load)
        await loadWeeks();
      }
    }
  });
};
window.watchFirestore = watchFirestore;

window.pdfCache = {};

/**
 * Check if user has download/controls permission from Firestore
 * Returns true if Download field is true, false otherwise
 */
window.checkDownloadPermission = async () => {
  const num = localStorage.getItem("Number");
  if (!num) return false;

  try {
    const userDoc = await safeGetDoc(doc(db, "Numbers", num));
    if (userDoc?.exists()) {
      const data = userDoc.data();
      return data["PDF-Down"] === true;
    }
  } catch (e) {
    console.error("Error checking download permission:", e);
  }

  return false;
};

window.incrementQuizTimes = async (userNumber) => {
  if (!userNumber) return;

  try {
    const userDoc = await safeGetDoc(doc(db, "Numbers", userNumber));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const currentTimes = data["Quizi-Times"] || 0;
      await safeUpdateDoc(doc(db, "Numbers", userNumber), {
        "Quizi-Times": currentTimes + 1
      });
    }
  } catch (error) {
    console.error("Error incrementing quiz times:", error);
  }
};

async function loadWeeks() {
  // This function should only run on the main page, not the dashboard.
  if (document.body.dataset.page === 'dashboard') return;

  try {
    window.showLoader?.();

    // Check download permission once at the start
    const hasDownloadPermission = await window.checkDownloadPermission();
    window.hasDownloadPermission = hasDownloadPermission;

    const res = await safeListAll(ref(storage, '/'));
    const weeks = res.prefixes.filter(p => p.name.startsWith('Week ')).sort((a, b) => parseInt(a.name.split(' ')[1]) - parseInt(b.name.split(' ')[1]));
    for (const w of weeks) {
      const wn = w.name.split(' ')[1];
      if (!window.pdfCache[wn]) {
        const r = await safeListAll(w);
        const pdfs = [];
        for (const i of r.items) {
          const m = await safeGetMetadata(i);
          const u = await safeGetDownloadURL(i, m.size / (1024*1024));
          if (!u) continue;

          // Apply controls based on Firestore permission
          const securedUrl = hasDownloadPermission 
            ? `${u}#zoom=fit`
            : `${u}#toolbar=0&navpanes=0&zoom=fit`;

          pdfs.push({ name: i.name, url: securedUrl, date: new Date(m.timeCreated).toLocaleDateString('en-GB'), size: (m.size / (1024 * 1024)).toFixed(2) + 'mb' });
        }
        window.pdfCache[wn] = pdfs;
      }
    }
    const aside = $('.aside');
    const content = $('.content');
    if (aside) {
      // Remove existing week divs but keep the button
      aside.querySelectorAll('.align:not(.weekly-aside)').forEach(el => el.remove());
      weeks.forEach((w, i) => {
        const d = document.createElement('div');
        d.className = 'align' + (i === 0 ? ' active' : '');
        d.textContent = `الأسبوع ${w.name.split(' ')[1]}`;
        d.dataset.week = w.name.split(' ')[1];
        aside.appendChild(d);
      });
    }
    for (const w of weeks) {
      const wn = w.name.split(' ')[1];
      await loadWeekPDFs(wn);
    }
    // Don't show first week automatically, let user select
    window.hideLoader?.();
    aside?.addEventListener('click', async (e) => {
      if (e.target.classList.contains('align') && !e.target.classList.contains('weekly-aside')) {
        const wn = e.target.dataset.week;
        aside.querySelectorAll('.align').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.week-container').forEach(c => c.classList.add('off'));
        const activeContainer = content.querySelector(`.week-container[data-week="${wn}"]`);
        if (activeContainer) activeContainer.classList.remove('off');
        // Close dropdown on mobile after selection
        if (window.innerWidth <= 525) {
          aside.classList.remove('aside-open');
        }
      }
    });

    // Toggle aside on button click for responsive
    const weeklyBtn = aside.querySelector('.weekly-aside');
    if (weeklyBtn) {
      weeklyBtn.addEventListener('click', () => {
        if (window.innerWidth <= 525) {
          aside.classList.toggle('aside-open');
        }
      });
    }
  } catch (e) {
    console.error('Error loading weeks:', e);
    window.hideLoader?.();
  }
}

async function loadWeekPDFs(wn) {
  const content = $('.content');
  if (!content || !window.pdfCache[wn]) return;
  let weekContainer = content.querySelector(`.week-container[data-week="${wn}"]`);
  if (!weekContainer) {
    weekContainer = document.createElement('div');
    weekContainer.className = 'week-container off';
    weekContainer.dataset.week = wn;
    content.appendChild(weekContainer);
  }
  const pdfs = window.pdfCache[wn];
  const boxes = weekContainer.querySelectorAll('.pdf-box');
  const names = new Set(Array.from(boxes).map(b => b.dataset.name));
  for (const p of pdfs) {
    if (!names.has(p.name)) {
      const displayName = p.name.replace('.pdf', '');
      const b = document.createElement('div');
      b.className = 'pdf-box';
      b.dataset.name = displayName;
      b.dataset.lectLocate = p.url;
      b.dataset.date = p.date;
      b.dataset.size = p.size;
      b.innerHTML = `<div class="pdf-right"><div class="pdf-icon"><img src="Assets/icon/pdf.png" alt="PDF"></div><p class="text">${displayName}</p></div><div class="pdf-left" style="opacity: 0.4;"><p class="text-1">${p.date}</p><p class="text-1">${p.size}</p></div>`;
      weekContainer.appendChild(b);
    }
  }
}

window.loadWeeks = loadWeeks;
window.logout = async () => { await clearData(); showLogin(); };

async function initializeShotsViewer() {
    const shotsContainer = document.getElementById('shot-display-area');
    if (!shotsContainer) return; // Don't run if the element doesn't exist

    const emptyState = document.getElementById('shots-empty-state');
    const shotImage = document.getElementById('shot-image');
    const shotUserName = document.getElementById('shot-user-name');
    const shotUserNumber = document.getElementById('shot-user-number');
    const skipBtn = document.getElementById('shot-skip-btn');
    const deleteBtn = document.getElementById('shot-delete-btn');
    const blockBtn = document.getElementById('shot-block-btn');
    const refreshBtn = document.getElementById('shots-refresh-btn');
    const prevBtn = document.getElementById('shot-prev-btn');
    const nextBtn = document.getElementById('shot-next-btn');
    const counterDisplay = document.getElementById('shot-counter');

    // Confirmation Modal Elements
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmationTitle = document.getElementById('confirmation-title');
    const confirmationMessage = document.getElementById('confirmation-message');
    const confirmationConfirmBtn = document.getElementById('confirmation-confirm-btn');
    const confirmationCancelBtn = document.getElementById('confirmation-cancel-btn');

    let currentShotIndex = 0;
    let shots = [];

    async function fetchShots() {
        window.showLoader?.();
        try {
            const shotsRef = ref(storage, 'Captured-Shots');
            const res = await safeListAll(shotsRef);
            shots = res.items;
            currentShotIndex = 0;
            if (shots.length > 0) {
                shotsContainer.classList.remove('off');
                emptyState.classList.add('off');
                await displayShot(currentShotIndex);
            } else {
                shotsContainer.classList.add('off');
                emptyState.classList.remove('off');
            }
        } catch (error) {
            shots = [];
            console.error("Error fetching shots:", error);
            shotsContainer.classList.add('off');
            emptyState.classList.remove('off');
        } finally {
            window.hideLoader?.();
        }
    }

    async function displayShot(index) {
        if (shots.length === 0 || index < 0 || index >= shots.length) {
            shotsContainer.classList.add('off');
            emptyState.classList.remove('off');
            shotImage.classList.add('off');
            counterDisplay.textContent = "0 / 0";
            return;
        }

        shotsContainer.classList.remove('off');
        emptyState.classList.add('off');
        window.showLoader?.();
        const shotRef = shots[index];
        const url = await safeGetDownloadURL(shotRef);
        shotImage.src = url;
        shotImage.classList.remove('off');

        const parts = shotRef.name.split('-');
        const userNumber = parts.length > 1 ? parts[1] : 'N/A';
        shotUserNumber.textContent = userNumber;

        if (userNumber !== 'N/A') {
            const userDoc = await getDoc(doc(db, "Numbers", userNumber));
            shotUserName.textContent = userDoc.exists() ? userDoc.data().Name || 'Unknown' : 'Unknown';
        } else {
            shotUserName.textContent = 'Unknown';
        }
        window.hideLoader?.();
        updateCounter();
        updateNavButtons();
    }

    function updateCounter() {
        counterDisplay.textContent = `${currentShotIndex + 1} / ${shots.length}`;
    }

    function updateNavButtons() {
        prevBtn.disabled = currentShotIndex === 0;
        nextBtn.disabled = currentShotIndex >= shots.length - 1;
    }

    prevBtn.addEventListener('click', () => {
        if (currentShotIndex > 0) {
            currentShotIndex--;
            displayShot(currentShotIndex);
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentShotIndex < shots.length - 1) {
            currentShotIndex++;
            displayShot(currentShotIndex);
        }
    });

    skipBtn.addEventListener('click', () => {
        // Just move to the next image if available
        if (currentShotIndex < shots.length - 1) {
            currentShotIndex++;
            displayShot(currentShotIndex);
        }
    });

    deleteBtn.addEventListener('click', async () => {
        if (currentShotIndex >= shots.length) return;

        showConfirmationModal(
            'Delete Image',
            'Are you sure you want to permanently delete this image? This action cannot be undone.',
            'modal-btn-danger',
            async () => {
                const shotRef = shots[currentShotIndex];
                window.showLoader?.();
                try {
                    await safeDeleteObject(shotRef);
                    shots.splice(currentShotIndex, 1); // Remove from local array

                    if (currentShotIndex >= shots.length) {
                        currentShotIndex = Math.max(0, shots.length - 1);
                    }
                    await displayShot(currentShotIndex);
                } catch (error) {
                    console.error("Error deleting shot:", error);
                } finally {
                    window.hideLoader?.();
                }
            }
        );
    });

    blockBtn.addEventListener('click', async () => {
        if (currentShotIndex >= shots.length) return;
        const shotRef = shots[currentShotIndex];
        const userNumber = shotRef.name.split('-')[1];
        if (!userNumber || userNumber === 'N/A') {
            return alert("Cannot block user: Number not found in filename.");
        }

        showConfirmationModal(
            'Block User',
            `Are you sure you want to block user ${userNumber}? This will move them to the blocked list. The image will NOT be deleted.`,
            'modal-btn-warning',
            async () => {
                window.showLoader?.();
                try {
                    // 1. Add user to the "Blocked" collection
                    const userDoc = await getDoc(doc(db, "Numbers", userNumber));
                    const userName = userDoc.exists() ? userDoc.data().Name || 'Unknown' : 'Unknown';

                    await setDoc(doc(db, "Blocked", userNumber), {
                        "Blocked Date": new Date().toLocaleDateString('en-GB'),
                        "Blocked Time": new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
                        "Reason": "Blocked from captured shot review.",
                        "Name": userName
                    });

                    // 2. Delete the user from the "Numbers" collection
                    await safeDeleteDoc(doc(db, "Numbers", userNumber));

                    // 3. UI Update: Just show a confirmation. The image remains.
                    alert(`User ${userNumber} has been blocked.`);

                } catch (error) {
                    console.error("Error blocking user:", error);
                    alert("Failed to block user. See console for details.");
                } finally {
                    window.hideLoader?.();
                }
            }
        );
    });

    refreshBtn.addEventListener('click', fetchShots);

    // Initial load
    fetchShots();
}
function showConfirmationModal(title, message, confirmClass, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    const modalTitle = document.getElementById('confirmation-title');
    const modalMessage = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirmation-confirm-btn');
    const cancelBtn = document.getElementById('confirmation-cancel-btn');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // Reset and apply new class for the confirm button
    confirmBtn.className = 'modal-btn';
    confirmBtn.classList.add(confirmClass);

    const confirmHandler = () => {
        onConfirm();
        modal.classList.add('off');
    };

    confirmBtn.onclick = confirmHandler;
    cancelBtn.onclick = () => modal.classList.add('off');

    modal.classList.remove('off');
}

// Export continuation function for permissions system
window.continueAppInit = async () => {
  try {
    const remMe = isRemMe();
    if (!remMe) await clearData();
    
    const num = localStorage.getItem("Number");
    if (num && await isBlocked(num)) { 
      showBlocked(); 
      watchStorage(); 
      watchFirestore(); 
      return; 
    }
    
    if (remMe && num && localStorage.getItem("Code")) {
      showApp();
      window.loadWeeks();
      watchStorage();
      watchFirestore();
      
      // Start clipboard monitoring when app loads
      if (window.clipboardMonitor) {
        window.clipboardMonitor.start();
      }

      els.remMe?.addEventListener("change", async (e) => {
        saveRemMe(e.target.checked);
        if (!e.target.checked) { await clearData(); showLogin(); }
      });
      return;
    }
    
    const loginScreen = document.querySelector('.login');
    loginScreen?.classList.remove('off');
  } catch (e) {
    console.error("Continue init error:", e);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page === 'dashboard') {
    initializeShotsViewer();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  // Page-specific initializers
  if (document.body.dataset.page === 'dashboard') {
    initializeShotsViewer();
    return; // Don't run the rest of the login logic on the dashboard
  }

  try {
    // Check actual browser permissions
    const permissions = {
      notifications: 'Notification' in window && Notification.permission === 'granted',
      clipboard: false
    };

    // Check clipboard permission asynchronously
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'clipboard-read' });
        permissions.clipboard = result.state === 'granted';
      } else {
        // Fallback: try to read clipboard
        try {
          await navigator.clipboard.readText();
          permissions.clipboard = true;
        } catch {
          permissions.clipboard = false;
        }
      }
    } catch {
      permissions.clipboard = false;
    }

    const checkPermissions = () => permissions.notifications && permissions.clipboard;

    const showPermissions = () => {
      document.querySelector('.permissions')?.classList.remove('off');
      document.querySelector('.login')?.classList.add('off');
    };

    const hidePermissions = () => {
      document.querySelector('.permissions')?.classList.add('off');
      document.querySelector('.login')?.classList.remove('off');
    };

    const updatePermButtons = () => {
      const notifBtn = document.getElementById('notif-btn');
      const clipBtn = document.getElementById('clip-btn');
      const nextBtn = document.getElementById('next-btn');

      if (notifBtn) {
        notifBtn.textContent = permissions.notifications ? 'Allowed' : 'Allow';
        notifBtn.classList.toggle('allowed', permissions.notifications);
      }

      if (clipBtn) {
        clipBtn.textContent = permissions.clipboard ? 'Allowed' : 'Allow';
        clipBtn.classList.toggle('allowed', permissions.clipboard);
      }

      if (nextBtn) {
        const both = checkPermissions();
        nextBtn.classList.toggle('off', !both);
        nextBtn.disabled = !both;
      }
    };

    if (!checkPermissions()) {
      showPermissions();
      updatePermButtons();

      document.getElementById('notif-btn')?.addEventListener('click', async () => {
        if (!('Notification' in window)) {
          alert('Notifications not supported');
          return;
        }
        try {
          const perm = await Notification.requestPermission();
          permissions.notifications = perm === 'granted';
          updatePermButtons();
        } catch (e) { console.error('Notification error:', e); }
      });

      document.getElementById('clip-btn')?.addEventListener('click', async () => {
        if (!navigator.clipboard) {
          alert('Clipboard not supported');
          return;
        }
        try {
          await navigator.clipboard.readText();
          permissions.clipboard = true;
          updatePermButtons();
        } catch (e) {
          permissions.clipboard = true;
          updatePermButtons();
        }
      });

      document.getElementById('next-btn')?.addEventListener('click', async () => {
        const remMe = isRemMe();
        const num = localStorage.getItem("Number");
        const code = localStorage.getItem("Code");
        if (remMe && num && code && !(await isBlocked(num))) {
          showApp();
          window.loadWeeks();
          watchStorage();
          watchFirestore();          

          // Start clipboard monitoring
          if (window.clipboardMonitor) {
            window.clipboardMonitor.start();
          }

          els.remMe?.addEventListener("change", async (e) => {
            saveRemMe(e.target.checked);
            if (!e.target.checked) { await clearData(); showLogin(); }
          });
        } else {
          hidePermissions();
        }
      });

      return;
    }

    const remMe = isRemMe();
    if (!remMe) await clearData();
    const num = localStorage.getItem("Number");
    if (num && await isBlocked(num)) { showBlocked(); watchStorage(); watchFirestore(); return; }
    if (remMe && num && localStorage.getItem("Code")) {
      showApp();
      window.loadWeeks();
      watchStorage();
      watchFirestore();      

      // Start clipboard monitoring
      if (window.clipboardMonitor) {
        window.clipboardMonitor.start();
      }

      els.remMe?.addEventListener("change", async (e) => {
        saveRemMe(e.target.checked);
        if (!e.target.checked) { await clearData(); showLogin(); }
      });
      return;
    }
    showLogin();
    watchStorage();
    if (els.remMe) els.remMe.checked = remMe;
    els.remMe?.addEventListener("change", async (e) => {
      saveRemMe(e.target.checked);
      if (!e.target.checked) await clearData();
    });
    const numIn = els.numIn;
    if (numIn) {
      numIn.maxLength = 11;
      numIn.pattern = "[0-9]{11}";
      numIn.inputMode = "numeric";
      numIn.addEventListener("keypress", e => { if (!/[0-9]/.test(e.key)) e.preventDefault(); });
      numIn.addEventListener("paste", e => { if (!/^\d*$/.test(e.clipboardData?.getData("text"))) e.preventDefault(); });
    }
    els.copyBtn?.addEventListener("click", async () => {
      if (!els.apiIn?.value) return;
      try { await navigator.clipboard.writeText(els.apiIn.value); } catch {}
    });
    const handleCreate = async () => {
      if (!els.nameIn || !numIn) return;
      const name = els.nameIn.value.trim();
      const number = numIn.value.trim();
      if (!name || !number) return;
      try {
        await safeUpdateDoc(doc(db, "Numbers", number), { Name: name });
        const remC = els.remMe?.checked ?? true;
        if (remC) localStorage.setItem("Name", name);
        showApp();
        window.loadWeeks();
        watchFirestore();
        window.updateUserBox();
        toggleNameGrp(false);
        
        // Start clipboard monitoring
        if (window.clipboardMonitor) {
          window.clipboardMonitor.start();
        }
        
        els.remMe?.addEventListener("change", async (e) => {
          saveRemMe(e.target.checked);
          if (!e.target.checked) { await clearData(); showLogin(); }
        });
      } catch (e) { console.error("Create error:", e); }
    };
    els.createBtn?.addEventListener("click", handleCreate);
    els.nameIn?.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(), handleCreate(); });
    els.apiIn?.addEventListener("input", toggleLoginBtn);
    const handleCheck = async () => {
      if (!numIn) return;
      const v = numIn.value.trim();
      if (v.length !== 11 || !/^\d{11}$/.test(v)) { toggleApiGrp(false); return; }
      try {
        const k = await checkNum(v);
        if (els.apiIn) els.apiIn.readOnly = !!k;
        toggleApiGrp(true, k || "");
      } catch { if (els.apiIn) els.apiIn.readOnly = false; toggleApiGrp(true, ""); }
    };
    numIn?.addEventListener("input", async () => { if (numIn.value.trim().length === 11) await handleCheck(); else toggleApiGrp(false); });
    numIn?.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(), handleCheck(); });
    els.loginBtn?.addEventListener("click", async () => {
      if (!numIn || !els.apiIn) return;
      const inNum = numIn.value.trim();
      const apiV = els.apiIn.value.trim();
      const remC = els.remMe?.checked ?? true;
      saveRemMe(remC);
      if (remC) localStorage.setItem("Number", inNum);
      if (!inNum || !apiV || !apiV.startsWith("AIzaSyCPg-")) return;
      const dec = decodeNum(apiV);
      if (dec !== inNum) {
        localStorage.setItem("Number", inNum);
        try {
          const rec = await recordSnitch(inNum, dec);
          if (rec) showBlocked(), watchStorage(), watchFirestore();
          else showBlocked(), watchStorage(), watchFirestore();
        } catch (e) { console.error("Snitch error:", e); }
        return;
      }
      try {
        const dev = await getDeviceName();
        const code = genCode();
        if (remC) localStorage.setItem("Code", code);
        await logDevice(inNum, dev, code);
        try {
          const ds = await safeGetDoc(doc(db, "Numbers", inNum));
          if (ds?.exists()) {
            const name = ds.data().Name;
            if (name && name !== "Unknown") {
              if (remC) localStorage.setItem("Name", name);
              showApp();
              window.loadWeeks();
              watchFirestore();              
              window.updateUserBox();

              // Start clipboard monitoring
              if (window.clipboardMonitor) {
                window.clipboardMonitor.start();
              }

              els.remMe?.addEventListener("change", async (e) => {
                saveRemMe(e.target.checked);
                if (!e.target.checked) { await clearData(); showLogin(); }
              });
            } else {
              toggleNameGrp(true);
              toggleApiGrp(false);
              showLogin();
            }
          }
        } catch {
          showApp();
          window.loadWeeks();
          watchFirestore();          
          window.updateUserBox();

          // Start clipboard monitoring
          if (window.clipboardMonitor) {
            window.clipboardMonitor.start();
          }
        }
      } catch (e) { console.warn(e.message); }
    });
  } catch (e) { console.error("Init error:", e); }
});