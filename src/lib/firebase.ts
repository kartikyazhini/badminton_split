import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { FirebaseConfig } from '../types';
import { getApiUrl } from './api';
import localFirebaseConfig from '../../firebase-applet-config.json';

let authInstance: any = null;
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');

export async function getFirebaseAuth() {
  if (authInstance) return authInstance;

  try {
    // Try to use the compiled-in config first for instant initialization and offline compatibility
    if (localFirebaseConfig && localFirebaseConfig.apiKey) {
      const app = initializeApp(localFirebaseConfig);
      authInstance = getAuth(app);
      return authInstance;
    }

    // Fallback to fetching from server if the compile-time config is somehow empty
    const res = await fetch(getApiUrl('/api/config/firebase'));
    if (!res.ok) {
      throw new Error(`Failed to fetch Firebase config: ${res.statusText}`);
    }
    const config: FirebaseConfig = await res.json();
    
    if (!config || !config.apiKey) {
      throw new Error("Invalid or missing Firebase configuration on server");
    }

    const app = initializeApp(config);
    authInstance = getAuth(app);
    return authInstance;
  } catch (error) {
    console.error("Firebase auth initialization failed:", error);
    return null;
  }
}

export { provider, signInWithPopup, signOut, GoogleAuthProvider };
