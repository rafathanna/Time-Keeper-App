import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDrFbtxyaMvcvxMw33sEYwP9o1SkvmiMZs",
  authDomain: "time-keeper-b32c8.firebaseapp.com",
  projectId: "time-keeper-b32c8",
  storageBucket: "time-keeper-b32c8.firebasestorage.app",
  messagingSenderId: "264035347535",
  appId: "1:264035347535:web:1366b9cd2e72de87ba0e3a",
  measurementId: "G-51GDLZLW3K",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Enable offline persistence with multi-tab support
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export default app;
