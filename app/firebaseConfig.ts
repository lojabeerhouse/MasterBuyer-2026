import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.API_KEY as string,
  authDomain: "beerhouse-1.firebaseapp.com",
  projectId: "beerhouse-1",
  storageBucket: "beerhouse-1.firebasestorage.app",
  messagingSenderId: "320692528197",
  appId: "1:320692528197:web:ef242c4d75bb2addbaaf2c",
  measurementId: "G-Z0DGQN3FQ0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  client_id: process.env.VITE_GOOGLE_CLIENT_ID,
  prompt: 'select_account'
});