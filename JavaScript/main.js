import { getDoc, doc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
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
        const adminDoc = await getDoc(doc(window.db, "Dashboard", "Admin"));
        if (adminDoc.exists()) {
          const correctPassword = adminDoc.data().Password;
          if (password === correctPassword) {
            alert('Access granted! Redirecting to dashboard...');
            localStorage.setItem("STP", password); // Store password
            window.location.href = 'dashboard.html'; // Redirect
          } else {
            alert('Incorrect password');
          }
        } else {
          alert('Error: Admin configuration not found.');
        }
      } catch (error) {
        console.error("Error checking dashboard password:", error);
        alert('An error occurred. Please try again.');
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

const initApp = () => {
  userBoxInstance = new UserBoxController();
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
class QuizSystem {
    constructor(element) {
        if (!element) throw new Error('Quiz element required');
        
        this.quiz = element;
        this.elements = this.cacheElements();
        
        this.state = {
            currentIndex: 0,
            quizData: [],
            userAnswers: [],
            correctCount: 0,
            timer: null,
            timeRemaining: 0,
            settings: { timer: 0, questions: 0, choices: 0 }
        };
        
        this.init();
    }

    cacheElements() {
        const querySelector = (sel) => this.quiz.querySelector(sel);
        const querySelectorAll = (sel) => this.quiz.querySelectorAll(sel);
        
        return {
            icon: querySelector('img[alt="Quiz"]'),
            options: querySelector('.quizi-opt'),
            content: querySelector('.quiz-content'),
            startBtn: querySelector('.sq-btn'),
            timerDisplay: querySelector('#qi-timer'),
            timerInput: document.getElementById('q-timer'),
            quizInput: document.getElementById('q-quiz'),
            choicesInput: document.getElementById('q-choices'),
            questionArea: querySelector('.quiz-question'),
            navigation: querySelector('.quiz-navigation'),
            prevBtn: querySelector('.prev-question'),
            nextBtn: querySelector('.next-question'),
            resultArea: querySelector('.DNF'),
            resultScore: querySelector('#q-result'),
            resultSection: querySelector('.result-sect'),
            closeBtns: querySelectorAll('.close-btn, .close-btn-2')
        };
    }

    init() {
        this.setupInputs();
        this.attachEvents();
        this.originalTimerText = this.elements.timerDisplay?.textContent || 'Quiz';
    }

    setupInputs() {
        [this.elements.timerInput, this.elements.quizInput, this.elements.choicesInput].forEach(input => {
            if (!input) return;
            const [min, max] = (input.getAttribute('mm') || '0,100').split(',').map(Number);
            
            input.addEventListener('input', e => {
                e.target.value = e.target.value.replace(/\D/g, '');
                const val = parseInt(e.target.value) || 0;
                if (val && val < min) e.target.value = min;
                if (val && val > max) e.target.value = max;
            });
            
            input.addEventListener('blur', e => {
                const val = parseInt(e.target.value) || min;
                e.target.value = Math.max(min, Math.min(max, val));
            });
        });
    }

    attachEvents() {
        this.quiz.addEventListener('click', () => this.openQuiz());
        this.elements.startBtn?.addEventListener('click', e => this.startQuiz(e));
        this.elements.prevBtn?.addEventListener('click', e => this.handlePrevious(e));
        this.elements.nextBtn?.addEventListener('click', e => this.handleNext(e));
        this.elements.closeBtns.forEach(btn => btn.addEventListener('click', e => this.closeQuiz(e)));
        this.setupResultSection();
    }

    setupResultSection() {
        const rs = this.elements.resultSection;
        if (!rs) return;
        
        const icon = rs.querySelector('img[alt="Results"]');
        const align = rs.querySelector('p.align');
        let container = rs.querySelector('.flex.col[style*="gap: 10px"]');
        if (!container) container = rs.querySelector('.w-\\[100\\%\\].flex.col.gap-\\[10px\\]');
        
        rs.addEventListener('click', e => {
            if (!rs.classList.contains('r-opened')) {
                e.stopPropagation();
                rs.classList.add('r-opened');
                icon?.classList.add('off');
                align?.classList.remove('off');
                container?.classList.remove('off');
                this.elements.resultArea?.classList.add('off');
            }
        });
        
        document.addEventListener('click', e => {
            if (!rs.contains(e.target) && rs.classList.contains('r-opened')) {
                rs.classList.remove('r-opened');
                icon?.classList.remove('off');
                align?.classList.add('off');
                container?.classList.add('off');
                this.elements.resultArea?.classList.remove('off');
            }
        });
    }

    showResultSection() {
        const rs = this.elements.resultSection;
        if (!rs) return;
        
        rs.classList.remove('off');
        
        const icon = rs.querySelector('img[alt="Results"]');
        const align = rs.querySelector('p.align');
        let container = rs.querySelector('.flex.col[style*="gap: 10px"]');
        if (!container) container = rs.querySelector('.w-\\[100\\%\\].flex.col.gap-\\[10px\\]');
        
        rs.classList.remove('r-opened');
        icon?.classList.remove('off');
        align?.classList.add('off');
        container?.classList.add('off');
        
        this.populateResults();
    }

    openQuiz() {
        if (this.quiz.classList.contains('q-opened')) return;
        
        this.elements.icon?.classList.add('off');
        this.quiz.classList.add('q-opened');
        this.elements.options?.classList.remove('off');
        ['.close-btn', '#qi-timer', '.quiz-control'].forEach(sel => 
            this.quiz.querySelector(sel)?.classList.remove('off')
        );
    }

    async startQuiz(e) {
        e.stopPropagation();
        
        const settings = {
            timer: parseInt(this.elements.timerInput?.value) || 0,
            questions: parseInt(this.elements.quizInput?.value) || 0,
            choices: parseInt(this.elements.choicesInput?.value) || 0
        };
        
        if (!settings.timer || !settings.questions || !settings.choices) {
            return alert('Please fill in all quiz settings!');
        }
        
        const selectedPDFs = this.getSelectedPDFs();
        if (!selectedPDFs.length) {
            return alert('Please select at least one PDF from the quiz control!');
        }
        
        const originalText = this.elements.startBtn.textContent;
        this.elements.startBtn.textContent = 'Loading...';
        this.elements.startBtn.disabled = true;
        
        try {
            const quizData = await this.fetchQuizzesFromFirestore(selectedPDFs);
            
            if (!quizData.length) {
                alert('No quiz questions found for selected PDFs!');
                this.elements.startBtn.textContent = originalText;
                this.elements.startBtn.disabled = false;
                return;
            }
            
            this.state.settings = settings;
            this.state.userAnswers = [];
            this.state.correctCount = 0;
            this.state.currentIndex = 0;
            this.state.quizData = quizData.slice(0, settings.questions);
            
            this.animateTimerText(`${settings.timer}:00`);
            this.elements.content?.setAttribute('q-timer', settings.timer);
            this.elements.content?.setAttribute('q-quiz', settings.questions);
            this.elements.content?.setAttribute('q-choices', settings.choices);
            
            this.elements.startBtn.textContent = originalText;
            this.elements.startBtn.disabled = false;
            
            this.elements.options?.classList.add('off');
            setTimeout(() => {
                this.elements.content?.classList.remove('off');
                this.renderQuestion();
                setTimeout(() => this.startTimer(), 1000);
            }, 300);

            // Increment quiz times for the user
            this.incrementQuizTimes();
            
        } catch (error) {
            console.error('Error fetching quizzes:', error);
            alert('Error loading quizzes: ' + error.message);
            this.elements.startBtn.textContent = originalText;
            this.elements.startBtn.disabled = false;
        }
    }
    
    getSelectedPDFs() {
        const quizControl = document.querySelector('.quiz-control');
        if (!quizControl) return [];
        
        const checkedInputs = quizControl.querySelectorAll('.pdf-choice input[type="checkbox"]:checked');
        const selected = [];
        
        checkedInputs.forEach(input => {
            const choice = input.closest('.pdf-choice');
            const pdfName = choice?.querySelector('.text-1')?.textContent.trim();
            if (pdfName) {
                const parts = pdfName.split(' - ');
                if (parts.length === 2) {
                    selected.push({
                        lectureName: parts[0].trim(),
                        lectureNumber: parts[1].trim(),
                        fullName: pdfName
                    });
                }
            }
        });
        
        return selected;
    }
    
    async fetchQuizzesFromFirestore(selectedPDFs) {
        if (!window.firestoreReady) {
            throw new Error('Firebase is not initialized yet. Please wait...');
        }
        
        const allQuizzes = [];
        
        for (const pdf of selectedPDFs) {
            try {
                const docSnap = await window.getQuizDoc(pdf.lectureName);
                
                if (docSnap && docSnap.exists()) {
                    const data = docSnap.data();
                    const lectureData = data[pdf.lectureNumber];
                    
                    if (lectureData && lectureData.quiz && Array.isArray(lectureData.quiz)) {
                        const shuffledLectureQuizzes = lectureData.quiz.sort(() => Math.random() - 0.5);

                        shuffledLectureQuizzes.forEach((quizItem, index) => {
                            if (quizItem.question && quizItem.choices && quizItem.correct_answer) {
                                const choices = quizItem.choices.map(choice => ({
                                    text: choice,
                                    correct: choice === quizItem.correct_answer
                                }));

                                allQuizzes.push({
                                    id: `L${pdf.lectureNumber}-Q${index + 1}`,
                                    question: quizItem.question,
                                    choices: choices,
                                    explanation: quizItem.explanation || ''
                                });
                            }
                        });
                    }
                } else {
                    console.warn(`No document found for lecture: ${pdf.lectureName}`);
                }
            } catch (error) {
                console.error(`Error fetching quiz for ${pdf.fullName}:`, error);
            }
        }
        
        if (allQuizzes.length === 0) {
            console.warn('No quizzes found in Firestore for selected PDFs');
        }
        
        return allQuizzes.sort(() => Math.random() - 0.5);
    }

    renderQuestion() {
        const quiz = this.state.quizData[this.state.currentIndex];
        if (!quiz) return;
        
        const { choices: numChoices } = this.state.settings;
        const correct = quiz.choices.find(c => c.correct);
        const wrong = quiz.choices.filter(c => !c.correct);
        
        let selected = correct ? [correct, ...wrong.slice(0, numChoices - 1)] : quiz.choices.slice(0, numChoices);
        selected.sort(() => Math.random() - 0.5);
        
        const questionEl = this.elements.questionArea?.querySelector('p.text-2, p');
        if (questionEl) {
            questionEl.textContent = quiz.question;
            questionEl.style.direction = isArabic(quiz.question) ? 'rtl' : 'ltr';
        }
        
        const oldChoices = this.elements.content?.querySelector('.quiz-choices');
        if (oldChoices) {
            oldChoices.classList.add('off');
            setTimeout(() => oldChoices.remove(), 300);
        }
        
        const container = document.createElement('div');
        container.className = 'quiz-choices w-[100%] flex col gap-[10px] off';
        container.setAttribute('qoc', `${quiz.question}, ${correct?.text || ''}`);
        
        selected.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'quiz-choice w-[100%] flex center text';
            btn.textContent = choice.text;
            btn.style.direction = isArabic(choice.text) ? 'rtl' : 'ltr';
            btn.dataset.correct = choice.correct;
            btn.addEventListener('click', e => this.selectChoice(e, choice));
            container.appendChild(btn);
        });
        
        this.elements.questionArea?.appendChild(container);
        setTimeout(() => container.classList.remove('off'), 50);
        
        this.restoreSelection();
        this.updateNavigation();
    }

    selectChoice(e, choice) {
        e.stopPropagation();
        
        this.elements.content?.querySelectorAll('.quiz-choice').forEach(c => c.classList.remove('selected'));
        e.target.classList.add('selected');
        
        this.state.userAnswers[this.state.currentIndex] = {
            selected: choice.text,
            correct: choice.correct
        };
        
        this.elements.nextBtn?.classList.remove('disabled');
        if (this.elements.nextBtn) this.elements.nextBtn.disabled = false;
    }

    restoreSelection() {
        const answer = this.state.userAnswers[this.state.currentIndex];
        if (!answer?.selected) return;
        
        const buttons = this.elements.content?.querySelectorAll('.quiz-choice') || [];
        const match = Array.from(buttons).find(b => b.textContent === answer.selected);
        if (match) {
            buttons.forEach(b => b.classList.remove('selected'));
            match.classList.add('selected');
        }
    }

    updateNavigation() {
        const { currentIndex } = this.state;
        const total = this.state.quizData.length;
        
        if (this.elements.prevBtn) {
            this.elements.prevBtn.textContent = currentIndex === 0 ? 'Cancel' : 'Previous';
        }
        
        if (this.elements.nextBtn) {
            this.elements.nextBtn.textContent = currentIndex === total - 1 ? 'Finish' : 'Next';
            this.elements.nextBtn.disabled = false;
            this.elements.nextBtn.classList.remove('disabled');
        }
    }

    handlePrevious(e) {
        e.stopPropagation();
        
        if (this.state.currentIndex === 0) {
            this.reset();
        } else {
            this.state.currentIndex--;
            this.renderQuestion();
        }
    }

    handleNext(e) {
        e.stopPropagation();
        
        if (!this.state.userAnswers[this.state.currentIndex]?.selected) {
            this.state.userAnswers[this.state.currentIndex] = { selected: 'لم يتم الاجابة', correct: false };
        }
        
        if (this.state.currentIndex < this.state.quizData.length - 1) {
            this.state.currentIndex++;
            this.renderQuestion();
        } else {
            this.finishQuiz();
        }
    }

    startTimer() {
        if (this.state.timer) clearInterval(this.state.timer);

        this.state.timeRemaining = this.state.settings.timer * 60;

        const update = () => {
            const m = Math.floor(this.state.timeRemaining / 60);
            const s = this.state.timeRemaining % 60;
            if (this.elements.timerDisplay) {
                this.elements.timerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
            }
        };

        update();

        this.state.timer = setInterval(() => {
            this.state.timeRemaining--;
            update();

            if (this.state.timeRemaining <= 0) {
                clearInterval(this.state.timer);
                this.state.timer = null;
                this.finishQuiz();
            }
        }, 1000);
    }

    async incrementQuizTimes() {
        const userNumber = localStorage.getItem("Number");
        if (!userNumber) return;

        await window.incrementQuizTimes(userNumber);
    }

    animateTimerText(target, duration = 1000) {
        if (!this.elements.timerDisplay) return;
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:';
        const steps = 20;
        let step = 0;
        
        const interval = setInterval(() => {
            if (step >= steps) {
                this.elements.timerDisplay.textContent = target;
                clearInterval(interval);
                return;
            }
            
            const progress = step / steps;
            let text = '';
            
            for (let i = 0; i < target.length; i++) {
                text += Math.random() < progress ? target[i] : chars[Math.floor(Math.random() * chars.length)];
            }
            
            this.elements.timerDisplay.textContent = text;
            step++;
        }, duration / steps);
    }

    finishQuiz() {
        if (this.state.timer) {
            clearInterval(this.state.timer);
            this.state.timer = null;
        }
        
        for (let i = 0; i < this.state.quizData.length; i++) {
            if (!this.state.userAnswers[i]) {
                this.state.userAnswers[i] = { selected: null, correct: false };
            }
        }
        
        this.state.correctCount = this.state.userAnswers.filter(a => a?.correct).length;
        
        this.elements.questionArea?.classList.add('off');
        this.elements.navigation?.classList.add('off');
        this.elements.resultArea?.classList.remove('off');
        
        if (this.elements.resultScore) {
            this.elements.resultScore.textContent = this.state.correctCount;
        }
        
        const resultText = this.elements.resultArea?.querySelector('p.text');
        if (resultText) {
            resultText.textContent = `${this.state.correctCount} out of ${this.state.quizData.length}`;
        }
        
        this.showResultSection();
    }

    populateResults() {
        const rs = this.elements.resultSection;
        if (!rs) return;

        let container = rs.querySelector('.flex.col[style*="gap: 10px"]');
        if (!container) container = rs.querySelector('.w-\\[100\\%\\].flex.col.gap-\\[10px\\]');
        if (!container) {
            container = document.createElement('div');
            container.className = 'flex col';
            container.style.cssText = 'width: 100%; gap: 10px;';
            rs.appendChild(container);
        }

        container.innerHTML = '';

        this.state.quizData.forEach((quiz, i) => {
            const answer = this.state.userAnswers[i];
            const selected = answer?.selected || 'لم تجب';
            const isCorrect = answer?.correct || false;
            const correctAnswer = quiz.choices.find(c => c.correct)?.text || '';

            const box = document.createElement('div');
            box.className = 'result-box flex col';
            box.style.cssText = `
                gap: 5px;
                padding: 10px;
                border: 2px solid ${isCorrect ? '#00c853' : '#d50000'};
                border-radius: 8px;
                background: ${isCorrect ? 'rgba(0,200,83,0.1)' : 'rgba(213,0,0,0.1)'};
            `;

            const questionDir = isArabic(quiz.question) ? 'rtl' : 'ltr';
            const answerDir = isArabic(selected) ? 'rtl' : 'ltr';
            const correctDir = isArabic(correctAnswer) ? 'rtl' : 'ltr';

            box.innerHTML = `
                <p class="text-2" style="direction: ${questionDir};">Question ${i + 1}: ${quiz.question}</p>
                <hr>
                <p class="text" style="direction: ${answerDir};">إجابتك: <span>${selected}</span></p>
                <p class="text-1" style="opacity: 0.4; direction: ${correctDir};">
                    ${isCorrect ? 'انت صح!' : `خطأ! الإجابة الصحيحة: <strong>${correctAnswer}</strong>`}
                </p>
            `;

            container.appendChild(box);
        });
    }

    reset() {
        if (this.state.timer) {
            clearInterval(this.state.timer);
            this.state.timer = null;
        }
        
        if (this.elements.timerDisplay) {
            this.elements.timerDisplay.textContent = this.originalTimerText;
        }
        
        this.state.currentIndex = 0;
        this.state.quizData = [];
        this.state.userAnswers = [];
        this.state.correctCount = 0;
        this.state.timeRemaining = 0;
        
        this.elements.content?.querySelectorAll('.quiz-choices').forEach(c => c.remove());
        
        const questionEl = this.elements.questionArea?.querySelector('p.text-2, p');
        if (questionEl) questionEl.textContent = 'Question Here';
        
        this.elements.questionArea?.classList.remove('off');
        this.elements.navigation?.classList.remove('off');
        this.elements.resultArea?.classList.add('off');
        
        const rs = this.elements.resultSection;
        if (rs) {
            rs.classList.add('off');
            rs.classList.remove('r-opened');
            
            const icon = rs.querySelector('img[alt="Results"]');
            const align = rs.querySelector('p.align');
            let container = rs.querySelector('.flex.col[style*="gap: 10px"]');
            if (!container) container = rs.querySelector('.w-\\[100\\%\\].flex.col.gap-\\[10px\\]');
            
            icon?.classList.remove('off');
            align?.classList.add('off');
            container?.classList.add('off');
        }
        
        this.elements.content?.classList.add('off');
        this.elements.options?.classList.remove('off');
        
        if (this.elements.prevBtn) this.elements.prevBtn.textContent = 'Previous';
        if (this.elements.nextBtn) {
            this.elements.nextBtn.textContent = 'Next';
            this.elements.nextBtn.disabled = false;
        }
    }

    closeQuiz(e) {
        e.stopPropagation();
        
        this.reset();
        
        this.elements.options?.classList.add('off');
        this.elements.content?.classList.add('off');
        ['.close-btn', '#qi-timer', '.quiz-control'].forEach(sel => 
            this.quiz.querySelector(sel)?.classList.add('off')
        );
        
        this.quiz.classList.remove('q-opened');
        
        setTimeout(() => this.elements.icon?.classList.remove('off'), 200);
    }
}

// =====================================
// Quiz Control (PDF Selection)
// =====================================
class QuizControl {
    constructor(element) {
        if (!element) return;
        
        this.control = element;
        this.elements = {
            icon: element.querySelector('img[alt="PDF"]'),
            text: element.querySelector('p.align'),
            slider: element.querySelector('.slider-outlaw'),
            pdfSelect: element.querySelector('.pdf-selecting-for-quiz')
        };
        
        this.init();
    }

    init() {
        this.attachEvents();
        this.populatePDFs();
    }

    attachEvents() {
        this.control.addEventListener('click', e => this.open(e));
        
        document.addEventListener('click', e => {
            if (!this.control.contains(e.target) && this.control.classList.contains('pdfq-opened')) {
                this.close();
            }
        });
        
        this.elements.slider?.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => this.selectLecture(btn));
        });
    }

    open(e) {
        if (this.control.classList.contains('pdfq-opened')) return;
        
        e.stopPropagation();
        this.elements.icon?.classList.add('off');
        this.control.classList.add('pdfq-opened');
        [this.elements.text, this.elements.slider, this.elements.pdfSelect].forEach(el => el?.classList.remove('off'));
        
        const activeBtn = this.elements.slider?.querySelector('button.active');
        if (activeBtn) this.populatePDFs(activeBtn.textContent.trim());
    }

    close() {
        [this.elements.text, this.elements.slider, this.elements.pdfSelect].forEach(el => el?.classList.add('off'));
        this.control.classList.remove('pdfq-opened');
        this.elements.icon?.classList.remove('off');
    }

    selectLecture(btn) {
        this.elements.slider?.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.populatePDFs(btn.textContent.trim());
    }

    populatePDFs(lectureName) {
        if (!this.elements.pdfSelect || !lectureName) return;
        
        this.elements.pdfSelect.innerHTML = '';
        this.elements.pdfSelect.setAttribute('data-lecture', lectureName);
        
        const matching = [];
        for (const week in window.pdfCache || {}) {
            (window.pdfCache[week] || []).forEach(pdf => {
                const display = pdf.name.replace('.pdf', '');
                if (display.startsWith(lectureName)) {
                    matching.push({ ...pdf, displayName: display });
                }
            });
        }
        
        matching.forEach(pdf => {
            const choice = document.createElement('div');
            choice.className = 'pdf-choice';
            choice.innerHTML = `
                <img src="Assets/icon/pdf.png" alt="PDF" width="28" height="28">
                <p class="text-1">${pdf.displayName}</p>
                <div class="checkBox">
                    <input type="checkbox" data-url="${pdf.url}">
                </div>
            `;
            
            choice.addEventListener('click', () => {
                const checkbox = choice.querySelector('input');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    choice.classList.toggle('active', checkbox.checked);
                }
            });
            
            this.elements.pdfSelect.appendChild(choice);
        });
    }
}

// =====================================
// Initialize Quiz Systems
// =====================================
document.addEventListener('DOMContentLoaded', () => {
    const quizEl = document.querySelector('.quizi');
    const controlEl = document.querySelector('.quiz-control');
    
    if (quizEl) new QuizSystem(quizEl);
    if (controlEl) new QuizControl(controlEl);
});