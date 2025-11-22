import { getFirestore, doc, getDoc, getDocs, collection, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import {
  getStorage, ref, listAll, getDownloadURL, deleteObject, uploadBytes
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js"; // Added import

const db = getFirestore();
const auth = getAuth(); // Initialize Auth

const storage = getStorage();
// =====================================
// 1. ICONS & STATE
// =====================================

// --- Options Menu Position Fix ---
// This function repositions the options menu if it would overflow the viewport.
function adjustMenuPosition(menuElement, buttonElement) {
  if (!menuElement || !buttonElement) return;

  const menuRect = menuElement.getBoundingClientRect();
  const btnRect = buttonElement.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  let top = btnRect.bottom + 5; // 5px gap
  let left = btnRect.left;

  // Check vertical overflow
  if (top + menuRect.height > viewportHeight) {
    // Not enough space below, try to open upwards
    if (btnRect.top - menuRect.height - 5 > 0) {
      top = btnRect.top - menuRect.height - 5;
    }
  }

  // Check horizontal overflow
  if (left + menuRect.width > viewportWidth) {
    left = btnRect.right - menuRect.width;
  }
  
  // check left overflow
  if (left < 0) {
    left = 5;
  }

  menuElement.style.top = `${top}px`;
  menuElement.style.left = `${left}px`;
}
const icons = {
  settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  block: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>',
  unlock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/></svg>',
  quiz: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>',
  pdf: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h2v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  file: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  download: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'
};

const state = {
  view: 'numbers',
  numbers: [],
  originalNumbers: [],
  isNameSorted: false,
  isQuizTimesSorted: false,
  blocked: [],
  snitches: [],
  files: [],
  selectedFiles: [],
  currentPath: '',
  pathHistory: [],
  fileCache: null,
  currentView: 'table'
};

// =====================================
// 2. INITIALIZATION
// =====================================
async function loadAllData() {
  // Load global settings once
  let globalSettings = { quizEnabled: true, pdfEnabled: true };
  try {
    const settingsDoc = await getDoc(doc(db, "Dashboard", "Settings"));
    if (settingsDoc.exists()) {
      const d = settingsDoc.data();
      globalSettings.quizEnabled = d["Quiz-Enabled"] !== false;
      globalSettings.pdfEnabled = d["PDF-Down"] !== false;
    }
  } catch(e) {
    console.log("Using default global settings");
  }

  onSnapshot(collection(db, "Blocked"), (blockedSnap) => {
    const blockedSet = new Set();
    state.blocked = [];
    blockedSnap.forEach(doc => {
      blockedSet.add(doc.id);
      const d = doc.data();
      state.blocked.push({
        id: doc.id,
        number: doc.id,
        name: d.Name || 'Unknown',
        reason: d.Reason || 'Unknown',
        date: d["Blocked Date"] || '',
        time: d["Blocked Time"] || ''
      });
    });

    onSnapshot(collection(db, "Numbers"), (numbersSnap) => {
      state.numbers = [];
      numbersSnap.forEach(doc => {
        if (!blockedSet.has(doc.id)) {
          const d = doc.data();
          const hasQuiz = d.hasOwnProperty("Quiz-Enabled");
          const hasPdf = d.hasOwnProperty("PDF-Down");
          state.numbers.push({
            id: doc.id,
            number: doc.id,
            name: d.Name || 'Unknown',
            quizTimes: d["Quizi-Times"] || 0,
            quizEnabled: hasQuiz ? d["Quiz-Enabled"] : globalSettings.quizEnabled,
            pdfDown: hasPdf ? d["PDF-Down"] : globalSettings.pdfEnabled
          });
        }
      });
      state.originalNumbers = [...state.numbers]; // Update original numbers as well
      
      onSnapshot(collection(db, "Snitches"), (snitchesSnap) => {
        state.snitches = [];
        snitchesSnap.forEach(doc => {
          const d = doc.data();
          const findName = (num) => state.numbers.find(n => n.number === num)?.name || d.Name || 'Unknown';
          state.snitches.push({
            id: doc.id,
            loginNumber: d["The Login Number"] || 'N/A',
            snitchNumber: d["The Snitch"] || 'N/A',
            snitchName: findName(d["The Snitch"]),
            date: d["Snitched Date"] || '',
            time: d["Snitched Time"] || ''
          });
        });
        renderAll();
      });
    });
  });
}

async function loadAdminProfile() {
  try {
    const docSnap = await getDoc(doc(db, "Dashboard", "Admin"));
    if (docSnap.exists()) {
      document.getElementById('admin-name').innerText = docSnap.data().Name || "Admin";
    }
  } catch (e) {}
}

async function initDashboard() {
  await loadAllData();
  await loadAdminProfile();
}

async function applyGlobalSettings(quizEnabled, pdfEnabled) {
  const batch = [];
  state.numbers.forEach(num => {
    const updateData = {};
    if (num.quizEnabled !== quizEnabled) {
      updateData["Quiz-Enabled"] = quizEnabled;
      num.quizEnabled = quizEnabled;
    }
    if (num.pdfDown !== pdfEnabled) {
      updateData["PDF-Down"] = pdfEnabled;
      num.pdfDown = pdfEnabled;
    }
    if (Object.keys(updateData).length > 0) {
      batch.push(updateDoc(doc(db, "Numbers", num.number), updateData));
    }
  });

  if (batch.length > 0) {
    await Promise.all(batch);
    renderNumbersTable();
  }
}

// =====================================
// 3. RENDER LOGIC
// =====================================
function renderAll() {
  renderNumbersTable();
  renderBlockedTable();
  renderSnitchesTable();
}

function renderNumbersTable() {
  const tbody = document.getElementById('numbers-tbody');
  const empty = document.querySelector('#numbers-table .empty-state');
  tbody.innerHTML = '';

  if (state.numbers.length === 0) {
    empty.classList.remove('off');
    return;
  }
  empty.classList.add('off');

  state.numbers.forEach(item => {
    const row = document.createElement('tr');

    const quizBadge = `<span class="quiz-badge ${item.quizEnabled ? 'on' : 'off'}">${item.quizEnabled ? 'ON' : 'OFF'}</span>`;
    const pdfBadge = `<span class="quiz-badge ${item.pdfDown ? 'on' : 'off'}">${item.pdfDown ? 'Allowed' : 'Blocked'}</span>`;

    row.innerHTML = `
      <td class="number-cell">${item.number}</td>
      <td>${item.name}</td>
      <td><span class="quiz-badge">${item.quizTimes}x</span></td>
      <td>${quizBadge}</td>
      <td>${pdfBadge}</td>
      <td><button class="options-btn">${icons.settings}<span>Options</span></button></td>
      <td class="details-col"><button class="details-btn">Details</button></td>
    `;
    row.querySelector('.number-cell').onclick = () => openDetailsModal(item);
    row.querySelector('.options-btn').onclick = function(e) {
      e.stopPropagation();
      openNumberOptions(item, this);
    };
    row.querySelector('.details-btn').onclick = (e) => {
      e.stopPropagation();
      openDetailsModal(item);
    };
    tbody.appendChild(row);
  });
}

function renderBlockedTable() {
  const tbody = document.getElementById('blocked-tbody');
  const empty = document.querySelector('#blocked-table .empty-state');
  tbody.innerHTML = '';

  if (state.blocked.length === 0) {
    empty.classList.remove('off');
    return;
  }
  empty.classList.add('off');

  state.blocked.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.number}</td>
      <td>${item.name}</td>
      <td><span class="reason-badge">${item.reason}</span></td>
      <td><div class="datetime-info"><span>${item.date}</span><span>${item.time}</span></div></td>
      <td><button class="options-btn">${icons.settings}<span>Options</span></button></td>
    `;
    row.querySelector('.options-btn').onclick = function(e) {
      e.stopPropagation();
      openBlockedOptions(item, this);
    };
    tbody.appendChild(row);
  });
}

function renderSnitchesTable() {
  const tbody = document.getElementById('snitches-tbody');
  const empty = document.querySelector('#snitches-table .empty-state');
  tbody.innerHTML = '';

  if (state.snitches.length === 0) {
    empty.classList.remove('off');
    return;
  }
  empty.classList.add('off');

  state.snitches.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.loginNumber}</td>
      <td>${item.snitchNumber}</td>
      <td>${item.snitchName}</td>
      <td><div class="datetime-info"><span>${item.date}</span><span>${item.time}</span></div></td>
      <td><button class="options-btn">${icons.settings}<span>Options</span></button></td>
    `;
    row.querySelector('.options-btn').onclick = function(e) {
      e.stopPropagation();
      openSnitchOptions(item, this);
    };
    tbody.appendChild(row);
  });
}

// =====================================
// 4. OPTION ACTIONS
// =====================================
function openNumberOptions(item, btn) {
  const existingDropdown = document.querySelector('.options-dropdown');

  if (existingDropdown) {
    existingDropdown.remove();
    if (existingDropdown.dataset.itemId === item.id) return;
  }

  const dropdown = createElement('div', ['options-dropdown'], { 'data-item-id': item.id }, [
    (() => {
      const btn = createElement('button', ['dropdown-item', 'warning'], {
        innerHTML: icons.block + '<span>Block Number</span>'
      });
      btn.addEventListener('click', () => {
        dropdown.remove();
        handleBlock(item);
      });
      return btn;
    })(),
    (() => {
      const btn = createElement('button', ['dropdown-item', 'info'], {
        innerHTML: icons.quiz + `<span>Quiz: ${item.quizEnabled ? 'Turn OFF' : 'Turn ON'}</span>`
      });
      btn.addEventListener('click', () => {
        dropdown.remove();
        handleToggleQuiz(item);
      });
      return btn;
    })(),
    (() => {
      const btn = createElement('button', ['dropdown-item', 'info'], {
        innerHTML: icons.pdf + `<span>PDF: ${item.pdfDown ? 'Turn OFF' : 'Turn ON'}</span>`
      });
      btn.addEventListener('click', () => {
        dropdown.remove();
        handleTogglePdf(item);
      });
      return btn;
    })(),
    createElement('div', ['dropdown-separator']),
    (() => {
      const btn = createElement('button', ['dropdown-item', 'danger'], {
        innerHTML: icons.trash + '<span>Delete Number</span>'
      });
      btn.addEventListener('click', () => {
        dropdown.remove();
        handleDeleteNumber(item);
      });
      return btn;
    })()
  ]);

  document.body.appendChild(dropdown);
  dropdown.style.position = 'fixed';
  
  setTimeout(() => {
    dropdown.classList.add('active');
    adjustMenuPosition(dropdown, btn);
  }, 10);

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('active');
      setTimeout(() => dropdown.remove(), 250);
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}

async function handleBlock(item) {
  if (!confirm(`Block ${item.name}?`)) return;

  const now = new Date();
  const blockData = {
    "Blocked Date": now.toLocaleDateString('en-GB'),
    "Blocked Time": now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12:true}),
    "Reason": "Blocked by Admin",
    "Name": item.name
  };

  // UI Updates (Optimistic)
  state.numbers = state.numbers.filter(n => n.number !== item.number);
  state.blocked.push({ ...blockData, id: item.number, number: item.number, reason: blockData.Reason, date: blockData["Blocked Date"], time: blockData["Blocked Time"] });
  renderAll();

  // DB Updates
  try {
    await setDoc(doc(db, "Blocked", item.number), blockData);
    await window.safeDeleteDoc(doc(db, "Numbers", item.number));
  } catch(e) { console.error(e); alert("Error blocking number"); }
}

async function handleToggleQuiz(item) {
  const newVal = !item.quizEnabled;
  item.quizEnabled = newVal;
  renderNumbersTable(); // Immediate Update
  await updateDoc(doc(db, "Numbers", item.number), { "Quiz-Enabled": newVal });
}

async function handleTogglePdf(item) {
  const newVal = !item.pdfDown;
  item.pdfDown = newVal;
  renderNumbersTable(); // Immediate Update
  await updateDoc(doc(db, "Numbers", item.number), { "PDF-Down": newVal });
}

async function handleDeleteNumber(item) {
  if (!confirm(`Delete ${item.number}?`)) return;
  state.numbers = state.numbers.filter(n => n.number !== item.number);
  renderNumbersTable();
  await window.safeDeleteDoc(doc(db, "Numbers", item.number));
}

function openBlockedOptions(item, btn) {
  const existingDropdown = document.querySelector('.options-dropdown');

  if (existingDropdown) {
    existingDropdown.remove();
    if (existingDropdown.dataset.itemId === item.id) return;
  }

  const dropdown = createElement('div', ['options-dropdown'], { 'data-item-id': item.id }, [
    (() => {
      const btn = createElement('button', ['dropdown-item', 'success'], {
        innerHTML: icons.unlock + '<span>Unblock Number</span>'
      });
      btn.addEventListener('click', async () => {
        dropdown.remove();
        if (!confirm(`Unblock ${item.name || item.number}?`)) return;
        try {
          // Add back to Numbers collection with default values
          await setDoc(doc(db, "Numbers", item.number), {
            "Name": item.name || 'Unknown',
            "PDF-Down": true,
            "Quiz-Enabled": true,
            "Quizi-Times": 0,
            "Devices": { "Devices Allowed": 1 }
          });

          // Remove from Blocked collection
          await window.safeDeleteDoc(doc(db, "Blocked", item.number));

          // Refresh the UI
          await loadAllData();
          renderAll();
        } catch (error) {
          console.error("Error unblocking number:", error);
          alert("Failed to unblock user. See console for details.");
        }
      });
      return btn;
    })(),
    createElement('div', ['dropdown-separator']),
    (() => {
      const btn = createElement('button', ['dropdown-item', 'danger'], {
        innerHTML: icons.trash + '<span>Delete Record</span>'
      });
      btn.addEventListener('click', async () => {
        dropdown.remove();
        if(!confirm('Delete?')) return;
        state.blocked = state.blocked.filter(b => b.number !== item.number);
        renderBlockedTable();
        await window.safeDeleteDoc(doc(db, "Blocked", item.number));
      });
      return btn;
    })()
  ]);

  document.body.appendChild(dropdown);
  dropdown.style.position = 'fixed';

  setTimeout(() => {
    dropdown.classList.add('active');
    adjustMenuPosition(dropdown, btn);
  }, 10);

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('active');
      setTimeout(() => dropdown.remove(), 250);
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}

function openSnitchOptions(item, btn) {
  const existingDropdown = document.querySelector('.options-dropdown');

  if (existingDropdown) {
    existingDropdown.remove();
    if (existingDropdown.dataset.itemId === item.id) return;
  }

  const dropdown = createElement('div', ['options-dropdown'], { 'data-item-id': item.id }, [
    (() => {
      const btn = createElement('button', ['dropdown-item', 'warning'], {
        innerHTML: icons.block + '<span>Block Snitch Number</span>'
      });
      btn.addEventListener('click', () => {
        dropdown.remove();
        handleBlockSnitch(item.snitchNumber, item);
      });
      return btn;
    })(),
    createElement('div', ['dropdown-separator']),
    (() => {
      const btn = createElement('button', ['dropdown-item', 'danger'], {
        innerHTML: icons.trash + '<span>Delete Record</span>'
      });
      btn.addEventListener('click', async () => {
        dropdown.remove();
        if(!confirm('Delete?')) return;
        state.snitches = state.snitches.filter(s => s.id !== item.id);
        renderSnitchesTable();
        await window.safeDeleteDoc(doc(db, "Snitches", item.id));
      });
      return btn;
    })()
  ]);

  document.body.appendChild(dropdown);
  dropdown.style.position = 'fixed';

  setTimeout(() => {
    dropdown.classList.add('active');
    adjustMenuPosition(dropdown, btn);
  }, 10);

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.classList.remove('active');
      setTimeout(() => dropdown.remove(), 250);
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}

async function handleBlockSnitch(snitchNumber, item) {
  if (!confirm(`Are you sure you want to block ${snitchNumber}?`)) return;

  try {
    const now = new Date();
    const docData = {
      "Blocked Date": now.toLocaleDateString('en-GB'),
      "Blocked Time": now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      "Reason": "Snitched on " + item.loginNumber
    };

    // Try to get the name from Numbers collection
    try {
      const numberDoc = await getDoc(doc(db, "Numbers", snitchNumber));
      if (numberDoc.exists() && numberDoc.data().Name) {
        docData.Name = numberDoc.data().Name;
      }
    } catch (e) {
      console.log('Could not fetch name for snitch');
    }

    await setDoc(doc(db, "Blocked", snitchNumber), docData);

    state.blocked.push({ ...docData, id: snitchNumber, number: snitchNumber, reason: docData.Reason, date: docData["Blocked Date"], time: docData["Blocked Time"] });
    state.numbers = state.numbers.filter(n => n.number !== snitchNumber);
    renderAll();
  } catch (error) {
    console.error('Error blocking snitch:', error);
    alert('Failed to block number. Please try again.');
  }
}

// =====================================
// 5. MODAL LOGIC
// =====================================
function openAddModal() {
  const modal = document.getElementById('add-number-modal');
  modal.classList.remove('off');
}

function setupAddModalListeners() {
  const modal = document.getElementById('add-number-modal');

  const btnCancel = document.getElementById('btn-cancel-add');
  const btnSubmit = document.getElementById('btn-submit-add');

  // Enter key to submit
  document.getElementById('inp-number').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSubmit.click();
    }
  });

  btnCancel.onclick = () => modal.classList.add('off');

  btnSubmit.onclick = async () => {
    const number = document.getElementById('inp-number').value.trim();
    const pdf = document.getElementById('inp-pdf').value === 'true';

    if (!number) {
      alert('Please enter a phone number!');
      return;
    }

    if (number.length !== 11 || !/^\d{11}$/.test(number)) {
      alert('Please enter a valid 11-digit phone number!');
      return;
    }

    try {
      await setDoc(doc(db, "Numbers", number), {
        "PDF-Down": pdf,
        "Quiz-Enabled": true,
        "Quizi-Times": 0,
        "Devices": {"Devices Allowed": 1}
      });

      state.numbers.push({ id: number, number: number, name: '', quizTimes: 0, quizEnabled: true, pdfDown: pdf });
      renderNumbersTable();
      modal.classList.add('off');
    } catch (error) {
      console.error('Error adding number:', error);
      alert('Failed to add number. Please try again.');
    }
  };
}

// =====================================
// 6. ADMIN MODAL LOGIC
// =====================================
async function openAdminModal() {
  const modal = document.getElementById('admin-settings-modal');

  // Reset/Pre-fill Inputs
  document.getElementById('adm-name').value = document.getElementById('admin-name').innerText;
  document.getElementById('adm-pass').value = '';
  document.getElementById('adm-pass-confirm').value = '';

  // Fetch current Global Settings from Firebase
  try {
    const docSnap = await getDoc(doc(db, "Dashboard", "Settings"));
    const settings = docSnap.exists() ? docSnap.data() : { "Quiz-Enabled": true, "PDF-Down": true };

    const quizToggle = document.getElementById('global-quiz-toggle');
    const pdfToggle = document.getElementById('global-pdf-toggle');

    quizToggle.checked = settings["Quiz-Enabled"];
    pdfToggle.checked = settings["PDF-Down"];

    document.getElementById('lbl-quiz-toggle').textContent = settings["Quiz-Enabled"] ? 'Enabled' : 'Disabled';
    document.getElementById('lbl-pdf-toggle').textContent = settings["PDF-Down"] ? 'Enabled' : 'Disabled';
  } catch(e) {
    console.log("Settings load error", e);
  }

  modal.classList.remove('off');
}
function setupAdminModalListeners() {
  const modal = document.getElementById('admin-settings-modal');

  // Buttons
  const btnCancel = document.getElementById('btn-cancel-settings');
  const btnSave = document.getElementById('btn-save-settings');

  // Toggles
  const quizToggle = document.getElementById('global-quiz-toggle');
  const pdfToggle = document.getElementById('global-pdf-toggle');

  // Label Updates
  quizToggle.onchange = () => document.getElementById('lbl-quiz-toggle').textContent = quizToggle.checked ? 'Enabled' : 'Disabled';
  pdfToggle.onchange = () => document.getElementById('lbl-pdf-toggle').textContent = pdfToggle.checked ? 'Enabled' : 'Disabled';

  // Close Action
  btnCancel.onclick = () => modal.classList.add('off');

  // Save Action
  btnSave.onclick = async () => {
    const newName = document.getElementById('adm-name').value.trim();
    const newPass = document.getElementById('adm-pass').value;
    const confPass = document.getElementById('adm-pass-confirm').value;

    if(!newName) return alert("Name cannot be empty");
    if(newPass && newPass !== confPass) return alert("Passwords do not match");

    try {
      // Update Admin Profile
      const updateData = { Name: newName };
      if(newPass) updateData.Password = newPass;
      await updateDoc(doc(db, "Dashboard", "Admin"), updateData);
      document.getElementById('admin-name').innerText = newName;

      // Update Global Settings
      await setDoc(doc(db, "Dashboard", "Settings"), {
        "Quiz-Enabled": quizToggle.checked,
        "PDF-Down": pdfToggle.checked
      });

      // Apply Globals to Local State (and Firebase)
      await applyGlobalSettings(quizToggle.checked, pdfToggle.checked);

      alert("Settings updated successfully");
      modal.classList.add('off');
    } catch(e) {
      console.error(e);
      alert("Failed to update settings");
    }
  };
}

// =====================================
// 6. DROPDOWN UI
// =====================================
function createElement(tag, classes = [], attributes = {}, children = []) {
  const element = document.createElement(tag);

  if (classes.length) {
    element.classList.add(...classes);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'textContent') {
      element.textContent = value;
    } else if (key === 'innerHTML') {
      element.innerHTML = value;
    } else {
      element.setAttribute(key, value);
    }
  });

  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child) {
      element.appendChild(child);
    }
  });

  return element;
}

// =====================================
// 7. STARTUP
// =====================================

document.addEventListener('DOMContentLoaded', () => {
  // Firebase Auth State Listener
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in, proceed with dashboard initialization
      if(db) initDashboard();
      console.log("User is signed in:", user.uid);
      // You might want to store the UID globally or in state if needed elsewhere
      state.currentUserUid = user.uid; 
    } else {
      // No user is signed in, redirect to login page
      console.log("No user signed in, redirecting to index.html");
      window.location.href = 'index.html';
    }
  });

  // Tab Listeners
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.table-container').forEach(c => c.classList.add('off'));
      document.getElementById(`${tab.dataset.tab}-table`).classList.remove('off');
    };
  });
      // Aside Navigation Listeners
      document.querySelectorAll('.aside-link').forEach(link => {
        link.onclick = (e) => {
          e.preventDefault();
          const contentId = link.dataset.content;

          // Update active link
          document.querySelectorAll('.aside-link').forEach(l => l.classList.remove('active'));
          link.classList.add('active');

          // Update active content section
          document.querySelectorAll('.content-section').forEach(c => c.classList.remove('active'));
          document.getElementById(`${contentId}-content`).classList.add('active');
        };
      });

  // Buttons
  document.getElementById('add-number-btn').onclick = () => openAddModal();

  document.getElementById('admin-settings-btn').onclick = openAdminModal;

  document.getElementById('logout-btn').onclick = () => {
    if(confirm("Logout?")) {
      signOut(auth).then(() => {
        localStorage.removeItem("STP"); // Remove any legacy token
        window.location.href = 'index.html';
      }).catch((error) => {
        console.error("Error signing out:", error);
        alert("Failed to logout. Please try again.");
      });
    }
  };

  // Setup modal listeners
  setupAdminModalListeners();
  setupAddModalListeners();

  // Sorting listeners
  document.getElementById('sort-by-name').addEventListener('click', () => {
    if (state.isNameSorted) {
      state.numbers = [...state.originalNumbers];
      state.isNameSorted = false;
    } else {
      state.numbers.sort((a, b) => a.name.localeCompare(b.name));
      state.isNameSorted = true;
    }
    state.isQuizTimesSorted = false;
    renderNumbersTable();
  });

  document.getElementById('sort-by-quiz-times').addEventListener('click', () => {
    if (state.isQuizTimesSorted) {
      state.numbers = [...state.originalNumbers];
      state.isQuizTimesSorted = false;
    } else {
      state.numbers.sort((a, b) => b.quizTimes - a.quizTimes);
      state.isQuizTimesSorted = true;
    }
    state.isNameSorted = false;
    renderNumbersTable();
  });

  // Boot (removed from here, now handled by onAuthStateChanged)

  // Set initial view buttons
  if (state.currentView === 'grid') {
    document.getElementById('grid-view-btn').classList.add('active');
    document.getElementById('table-view-btn').classList.remove('active');
  } else {
    document.getElementById('table-view-btn').classList.add('active');
    document.getElementById('grid-view-btn').classList.remove('active');
  }
  document.getElementById('back-btn').onclick = navigateBack;

  // Set initial view for file explorer
  state.currentView = 'table';
  document.querySelector('.aside-link[data-content="files"]').addEventListener('click', () => {
    if (!state.fileCache) {
      initFileManagement();
    } else {
      renderFileExplorer();
    }
  });
});


// Export functions for external use

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape key to close modals and dropdowns
  if (e.key === 'Escape') {
    const overlay = document.querySelector('.modal-overlay:not(.off)');
    if (overlay) overlay.classList.add('off');
    const dropdown = document.querySelector('.options-dropdown');
    if (dropdown) {
      dropdown.classList.remove('active');
      setTimeout(() => dropdown.remove(), 250);
    }
  }

  // Ctrl/Cmd + 1/2/3 to switch views
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.key === '1') {
      e.preventDefault();
      switchView('numbers');
    } else if (e.key === '2') {
      e.preventDefault();
      switchView('blocked');
    } else if (e.key === '3') {
      e.preventDefault();
      switchView('snitches');
    }
  }

  // Ctrl/Cmd + N to add new number (only in numbers view)
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && state.view === 'numbers') {
    e.preventDefault();
    openAddModal();
  }
});



// Search/Filter functionality
window.dashboardSearch = (query) => {
  const searchLower = query.toLowerCase().trim();

  if (!searchLower) {
    renderAll();
    return;
  }

  const currentView = state.view;
  const originalData = state[currentView];

  let filteredData = [];

  if (currentView === 'numbers') {
    filteredData = originalData.filter(item =>
      item.number.includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower)
    );
  } else if (currentView === 'blocked') {
    filteredData = originalData.filter(item =>
      item.number.includes(searchLower) ||
      item.reason.toLowerCase().includes(searchLower)
    );
  } else if (currentView === 'snitches') {
    filteredData = originalData.filter(item =>
      item.loginNumber.includes(searchLower) ||
      item.snitchNumber.includes(searchLower)
    );
  }

  // Temporarily replace data with filtered results
  const backup = state[currentView];
  state[currentView] = filteredData;
  renderAll();
  state[currentView] = backup;
};

// Stats calculation
window.getDashboardStats = () => {
  return {
    totalNumbers: state.numbers.length,
    totalBlocked: state.blocked.length,
    totalSnitches: state.snitches.length,
    quizEnabled: state.numbers.filter(n => n.quizEnabled).length,
    quizDisabled: state.numbers.filter(n => !n.quizEnabled).length,
    totalQuizTimes: state.numbers.reduce((sum, n) => sum + n.quizTimes, 0),
    averageQuizTimes: state.numbers.length > 0
      ? (state.numbers.reduce((sum, n) => sum + n.quizTimes, 0) / state.numbers.length).toFixed(2)
      : 0
  };
};

// Export all data as JSON
window.exportDashboardData = () => {
  const dataToExport = {
    exportDate: new Date().toISOString(),
    numbers: state.numbers,
    blocked: state.blocked,
    snitches: state.snitches,
    stats: window.getDashboardStats()
  };

  const jsonStr = JSON.stringify(dataToExport, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Log dashboard activity
window.logDashboardActivity = (action, details) => {
  const log = {
    timestamp: new Date().toISOString(),
    action,
    details,
    user: state.userData.name
  };

  console.log('Dashboard Activity:', log);

  // Could be extended to save to Firebase
  // await setDoc(doc(db, "ActivityLogs", Date.now().toString()), log);
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  // Cleanup code if needed
});

// =====================================
// 8. FILE MANAGEMENT LOGIC
// =====================================

async function initFileManagement() {
  await cacheAllFiles();
  navigateTo(''); // Start at the root
}

async function cacheAllFiles() {
  state.fileCache = {};
  const rootRef = ref(storage);
  
  async function recursiveList(folderRef) {
    const res = await safeListAll(folderRef);
    const files = [];
    for (const itemRef of res.items) {
      if (itemRef.name === '.placeholder') continue;
      const url = await safeGetDownloadURL(itemRef);
      files.push({ name: itemRef.name, fullPath: itemRef.fullPath, url: url, type: 'file' });
    }
    state.fileCache[folderRef.fullPath] = { files: files, folders: res.prefixes.map(p => p.fullPath) };

    for (const subFolderRef of res.prefixes) {
      await recursiveList(subFolderRef);
    }
  }

  await recursiveList(rootRef);
}

async function navigateTo(path) {
  if (state.currentPath !== path) {
    state.pathHistory.push(state.currentPath);
  }
  state.currentPath = path;
  renderFileExplorer();
}

function navigateBack() {
  if (state.pathHistory.length > 0) {
    state.currentPath = state.pathHistory.pop();
    renderFileExplorer();
  }
}

function updateBreadcrumbs() {
  const breadcrumbsContainer = document.getElementById('breadcrumbs');
  breadcrumbsContainer.innerHTML = '';
  const parts = state.currentPath ? state.currentPath.split('/') : [];

  const rootCrumb = createElement('span', ['breadcrumb-item'], { textContent: 'Root' });
  rootCrumb.onclick = () => navigateTo('');
  breadcrumbsContainer.appendChild(rootCrumb);

  let currentPath = '';
  parts.forEach(part => {
    currentPath += (currentPath ? '/' : '') + part;
    const separator = createElement('span', ['breadcrumb-separator'], { textContent: '/' });
    const crumb = createElement('span', ['breadcrumb-item'], { textContent: part });
    const path = currentPath; // Capture path for the closure
    crumb.onclick = () => navigateTo(path);
    breadcrumbsContainer.appendChild(separator);
    breadcrumbsContainer.appendChild(crumb);
  });

  document.getElementById('back-btn').disabled = state.pathHistory.length === 0;
}

async function renderFileExplorer() {
  const filesContainer = document.getElementById('files-container');
  const emptyState = document.getElementById('files-empty-state');
  filesContainer.innerHTML = '';
  state.files = [];
  state.selectedFiles = [];
  updateBulkActionsBar();
  updateBreadcrumbs();

  if (state.currentView === 'grid') {
    filesContainer.className = 'files-grid';
    renderGridView(filesContainer, emptyState);
  } else {
    filesContainer.className = '';
    renderTableView(filesContainer, emptyState);
  }
}

function renderGridView(filesGrid, emptyState) {
  const currentPath = state.currentPath || '';
  const cacheEntry = state.fileCache[currentPath];

  if (!cacheEntry || (cacheEntry.folders.length === 0 && cacheEntry.files.length === 0)) {
    emptyState.classList.remove('off');
    return;
  }
  emptyState.classList.add('off');

  cacheEntry.folders.forEach(folderPath => {
    const folderName = folderPath.split('/').pop();
    filesGrid.appendChild(createFolderCard(folderName));
  });

  cacheEntry.files.forEach(file => {
    filesGrid.appendChild(createFileCard(file.name, file.fullPath, file.url));
  });
}

function renderTableView(filesGrid, emptyState) {
  const currentPath = state.currentPath || '';
  const cacheEntry = state.fileCache[currentPath];

  if (!cacheEntry || (cacheEntry.folders.length === 0 && cacheEntry.files.length === 0)) {
    emptyState.classList.remove('off');
    return;
  }
  emptyState.classList.add('off');

  const table = createElement('table', ['files-table']);
  table.innerHTML = `
    <thead>
      <tr>
        <th><input type="checkbox" id="select-all-checkbox"></th>
        <th>Name</th>
        <th></th>
      </tr>
    </thead>
  `;
  const tbody = createElement('tbody');

  cacheEntry.folders.forEach(folderPath => {
    const folderName = folderPath.split('/').pop();
    const row = createElement('tr', ['folder']);
    row.innerHTML = `
      <td><input type="checkbox" data-path="${folderPath}/.placeholder"></td>
      <td class="file-name-cell">
        <svg class="file-icon-small" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4H4c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <span>${folderName}</span>
      </td>
      <td></td>
    `;
    const checkbox = row.querySelector('input[type="checkbox"]');
    const path = checkbox.getAttribute('data-path');
    checkbox.checked = state.selectedFiles.includes(path);
    checkbox.onchange = (e) => {
      if (e.target.checked) {
        state.selectedFiles.push(path);
      } else {
        state.selectedFiles = state.selectedFiles.filter(p => p !== path);
      }
      updateBulkActionsBar();
      // Update select-all
      const allCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
      const selectAllCheckbox = document.getElementById('select-all-checkbox');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
      }
    };
    row.onclick = (e) => {
      if (e.target === checkbox || e.target.closest('input')) return; // Don't navigate if clicking checkbox
      const newPath = state.currentPath ? `${state.currentPath}/${folderName}` : folderName;
      navigateTo(newPath);
    };
    tbody.appendChild(row);
  });

  cacheEntry.files.forEach(file => {
    const row = createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" data-path="${file.fullPath}"></td>
      <td class="file-name-cell">
        <svg class="file-icon-small" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        <span>${file.name}</span>
      </td>
      <td>
        <div class="file-actions-cell">
          <button class="file-action-btn download">
            ${icons.download}
          </button>
          <button class="file-action-btn delete">
            ${icons.trash}
          </button>
        </div>
      </td>
    `;
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.checked = state.selectedFiles.includes(file.fullPath);
    checkbox.onchange = (e) => {
      if (e.target.checked) {
        state.selectedFiles.push(file.fullPath);
      } else {
        state.selectedFiles = state.selectedFiles.filter(p => p !== file.fullPath);
      }
      updateBulkActionsBar();
      // Update select-all
      const allCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
      const selectAllCheckbox = document.getElementById('select-all-checkbox');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
      }
    };
    row.querySelector('.download').onclick = () => window.open(file.url, '_blank');
    row.querySelector('.delete').onclick = () => handleDeleteFile(file.fullPath);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  filesGrid.appendChild(table);

  // Set initial select-all state
  const allCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
    selectAllCheckbox.onchange = (e) => {
      const checkboxes = table.querySelectorAll('tbody input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const path = cb.getAttribute('data-path');
        if (e.target.checked) {
          if (!state.selectedFiles.includes(path)) state.selectedFiles.push(path);
        } else {
          state.selectedFiles = state.selectedFiles.filter(p => p !== path);
        }
      });
      updateBulkActionsBar();
    };
  }
}

function createFolderCard(name) {
  const card = createElement('div', ['file-card', 'folder'], { 'data-path': name });
  card.innerHTML = `
    <div class="file-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4H4c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
    </div>
    <div class="file-info">
      <span class="file-name">${name}</span>
    </div>
  `;
  card.onclick = () => {
    const newPath = state.currentPath ? `${state.currentPath}/${name}` : name;
    navigateTo(newPath);
  };
  return card;
}

function setupFileExplorerEventListeners() {
  document.getElementById('back-btn').onclick = navigateBack;
  document.getElementById('refresh-btn').onclick = () => {
    cacheAllFiles().then(() => renderFileExplorer());
  };
  document.getElementById('grid-view-btn').onclick = () => {
    state.currentView = 'grid';
    document.getElementById('grid-view-btn').classList.add('active');
    document.getElementById('table-view-btn').classList.remove('active');
    renderFileExplorer();
  };
  document.getElementById('table-view-btn').onclick = () => {
    state.currentView = 'table';
    document.getElementById('table-view-btn').classList.add('active');
    document.getElementById('grid-view-btn').classList.remove('active');
    renderFileExplorer();
  };
  document.getElementById('bulk-delete-btn').onclick = handleBulkDelete;
  document.getElementById('upload-btn').onclick = openUploadModal;
  setupUploadModalListeners();

  document.querySelector('.aside-link[data-content="files"]').addEventListener('click', () => {
    if (!state.fileCache) {
      initFileManagement();
    } else {
      renderFileExplorer();
    }
    // Auto click table view
    document.getElementById('table-view-btn').click();
  });
}

function createFileCard(name, fullPath, url) {
  const card = createElement('div', ['file-card'], { 'data-path': fullPath });

  const checkbox = createElement('input', [], { type: 'checkbox' });
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    if (e.target.checked) {
      state.selectedFiles.push(fullPath);
      card.classList.add('selected');
    } else {
      state.selectedFiles = state.selectedFiles.filter(p => p !== fullPath);
      card.classList.remove('selected');
    }
    updateBulkActionsBar();
  });

  const downloadBtn = createElement('button', ['file-action-btn', 'download']);
  downloadBtn.innerHTML = icons.download;
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(url, '_blank');
  });

  const deleteBtn = createElement('button', ['file-action-btn', 'delete']);
  deleteBtn.innerHTML = icons.trash;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteFile(fullPath);
  });

  card.append(
    createElement('div', ['file-checkbox'], {}, [checkbox]),
    createElement('div', ['file-icon'], {}, [createElement('div', [], { innerHTML: icons.file })]),
    createElement('div', ['file-info'], {}, [
      createElement('span', ['file-name'], { textContent: name })
    ]),
    createElement('div', ['file-actions'], {}, [downloadBtn, deleteBtn])
  );

  card.addEventListener('click', () => {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
  });

  return card;
}

function updateBulkActionsBar() {
  const bar = document.getElementById('bulk-actions-bar');
  const count = document.getElementById('selected-count');

  if (state.selectedFiles.length > 0) {
    bar.classList.remove('off');
    count.textContent = `${state.selectedFiles.length} selected`;
  } else {
    bar.classList.add('off');
  }
}

async function handleDeleteFile(filePath) {
  if (!confirm(`Are you sure you want to delete "${filePath}"?`)) return;

  try {
    const fileRef = ref(storage, filePath);
    await safeDeleteObject(fileRef);

    // Refresh the view
    renderFileExplorer();
  } catch (error) {
    console.error("Error deleting file:", error);
    alert("Failed to delete file. See console for details.");
  }
}

async function handleBulkDelete() {
  if (state.selectedFiles.length === 0) return;
  if (!confirm(`Are you sure you want to delete ${state.selectedFiles.length} items?`)) return;

  for (const path of state.selectedFiles) {
    if (path.endsWith('/.placeholder')) {
      // Delete folder recursively
      const folderPath = path.slice(0, -12); // remove /.placeholder
      await deleteFolderRecursively(folderPath);
    } else {
      // Delete file
      try {
        await safeDeleteObject(ref(storage, path));
        console.log(`Deleted file: ${path}`);
      } catch (error) {
        console.error(`Failed to delete file ${path}:`, error);
      }
    }
  }

  state.selectedFiles = [];

  // Refresh the view
  cacheAllFiles().then(() => renderFileExplorer());
}

async function deleteFolderRecursively(folderPath) {
  const folderRef = ref(storage, folderPath);
  const res = await safeListAll(folderRef);

  // Delete all items
  const deletePromises = res.items.map(item => safeDeleteObject(item).catch(e => console.log(`Failed to delete ${item.fullPath}:`, e)));
  const subFolderPromises = res.prefixes.map(prefix => deleteFolderRecursively(prefix.fullPath));
  
  await Promise.all([...deletePromises, ...subFolderPromises]);
  console.log(`Deleted folder: ${folderPath}`);
}

// =====================================
// 9. UPLOAD MODAL LOGIC
// =====================================

function openUploadModal() {
  const modal = document.getElementById('upload-file-modal');
  modal.classList.remove('off');
}

function setupUploadModalListeners() {
  const modal = document.getElementById('upload-file-modal');
  const btnCancel = document.getElementById('btn-cancel-upload');
  const btnSubmit = document.getElementById('btn-submit-upload');

  btnCancel.onclick = () => modal.classList.add('off');

  btnSubmit.onclick = async () => {
    const fileInput = document.getElementById('inp-file');
    const file = fileInput.files[0];

    if (!file) {
      alert('Please select a file.');
      return;
    }

    const fileName = file.name;
    const filePath = state.currentPath ? `${state.currentPath}/${fileName}` : fileName;
    const fileRef = ref(storage, filePath);

    try {
      await safeUploadBytes(fileRef, file);
      alert('File uploaded successfully!');
      modal.classList.add('off');
      fileInput.value = ''; // Reset input
      cacheAllFiles().then(() => renderFileExplorer());
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. See console for details.');
    }
  };
}

document.getElementById('upload-btn').onclick = openUploadModal;
setupUploadModalListeners();

function openNewFolderModal() {
  const modal = document.getElementById('new-folder-modal');
  modal.classList.remove('off');
}

function setupNewFolderModalListeners() {
  const modal = document.getElementById('new-folder-modal');
  const btnCancel = document.getElementById('btn-cancel-folder');
  const btnSubmit = document.getElementById('btn-submit-folder');

  btnCancel.onclick = () => modal.classList.add('off');

  btnSubmit.onclick = async () => {
    const folderName = document.getElementById('inp-folder-name').value.trim();

    if (!folderName) {
      alert('Please enter a folder name.');
      return;
    }

    const placeholderPath = state.currentPath ? `${state.currentPath}/${folderName}/.placeholder` : `${folderName}/.placeholder`;
    const placeholderRef = ref(storage, placeholderPath);

    try {
      await safeUploadBytes(placeholderRef, new Blob(['']), { contentType: 'text/plain' });
      alert('Folder created successfully!');
      modal.classList.add('off');
      document.getElementById('inp-folder-name').value = ''; // Reset input
      cacheAllFiles().then(() => renderFileExplorer());
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder. See console for details.');
    }
  };
}

setupNewFolderModalListeners();

function openDetailsModal(item) {
  if (window.innerWidth >= 768) return; // Only open on mobile
  const modal = document.getElementById('details-modal');
  const content = document.getElementById('details-content');
  content.innerHTML = `
    <div class="details-grid">
      <div class="detail-row">
        <span class="detail-label">Number:</span>
        <span class="detail-value">${item.number}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Name:</span>
        <span class="detail-value">${item.name}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Quiz Times:</span>
        <span class="detail-value">${item.quizTimes}x</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Quiz Status:</span>
        <span class="detail-value">${item.quizEnabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">PDF Status:</span>
        <span class="detail-value">${item.pdfDown ? 'Allowed' : 'Blocked'}</span>
      </div>
    </div>
  `;
  modal.classList.remove('off');
}

document.getElementById('btn-close-details').onclick = () => {
  document.getElementById('details-modal').classList.add('off');
};

document.getElementById('new-folder-btn').onclick = () => openNewFolderModal();

document.addEventListener('DOMContentLoaded', () => {
    // Add event listener for bulk delete button
    document.getElementById('bulk-delete-btn').onclick = handleBulkDelete;

    // Initialize file management when the files tab is clicked
    document.querySelector('.aside-link[data-content="files"]').addEventListener('click', () => {
        if (!state.fileCache) { // Only init once
            initFileManagement();
        }
    });

    // Setup file explorer view buttons
    setupFileExplorerEventListeners();
});
