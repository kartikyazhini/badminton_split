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
    // Use compiled-in config for initialization and offline/static hosting compatibility
    if (localFirebaseConfig && localFirebaseConfig.apiKey) {
      const app = initializeApp(localFirebaseConfig);
      authInstance = getAuth(app);
      return authInstance;
    }

    throw new Error("Missing Firebase configuration");
  } catch (error) {
    console.error("Firebase auth initialization failed:", error);
    return null;
  }
}

export { provider, signInWithPopup, signOut, GoogleAuthProvider };
