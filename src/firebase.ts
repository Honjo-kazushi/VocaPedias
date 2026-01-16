import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDWMUflknVOfbO8Jx4c-ZEyIraEkEqGR6o",
  authDomain: "tossaspeak.firebaseapp.com",
  projectId: "tossaspeak",
  storageBucket: "tossaspeak.firebasestorage.app",
  messagingSenderId: "106825316200",
  appId: "1:106825316200:web:81500de06f9069d51a48dd",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
