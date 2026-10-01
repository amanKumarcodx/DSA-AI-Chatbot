// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDDt1CYLSD40wzEtVk1uhip_CVwlnqjpVk",
  authDomain: "agentx-8b840.firebaseapp.com",
  projectId: "agentx-8b840",
  storageBucket: "agentx-8b840.firebasestorage.app",
  messagingSenderId: "90436665769",
  appId: "1:90436665769:web:96365fcdc96b88567ac4b8",
  measurementId: "G-KV91RDWZ7K"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);