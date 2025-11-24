import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ============================================
// FIREBASE CONFIG & INIT
// ============================================
export const firebaseConfig = {
  apiKey: "AIzaSyCPg-DCTI8xn4oSWrr0D8teFV79vpBkcts",
  authDomain: "state-a1.firebaseapp.com",
  projectId: "state-a1",
  storageBucket: "state-a1.firebasestorage.app",
  messagingSenderId: "678269987849",
  appId: "1:678269987849:web:98b3eeb7c2340dfa395cd8"
};

// Initialize the app once and export the instances
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);