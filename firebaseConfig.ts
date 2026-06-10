import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Public client config for the `state-a1` Firebase project. These values are not
// secrets (they identify the project to the SDK); access is governed by the
// Firestore security rules + Auth. No Storage/Functions — the CRM runs entirely
// on Firestore + Auth to stay within the Spark (free) plan.
export const firebaseConfig = {
  apiKey: "AIzaSyCA9CA5YAR4Xq5YekeBqpXqIShb_hOK5o0",
  authDomain: "state-a1.firebaseapp.com",
  projectId: "state-a1",
  storageBucket: "state-a1.firebasestorage.app",
  messagingSenderId: "678269987849",
  appId: "1:678269987849:web:98b3eeb7c2340dfa395cd8"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
