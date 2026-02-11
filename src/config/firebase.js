/**
 * Firebase Configuration - Landshake
 * Initialize Firebase and export common services
 * Email/password authentication is enabled for future login/signup features
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase config for Landshake
const firebaseConfig = {
	apiKey: "AIzaSyCFXGrVUl9aIeSfsNN3R1Z7vdFUEVWSq9U",
	authDomain: "landshake-ea1e4.firebaseapp.com",
	projectId: "landshake-ea1e4",
	storageBucket: "landshake-ea1e4.firebasestorage.app",
	messagingSenderId: "312404070498",
	appId: "1:312404070498:web:cb417e5e0927dc7c1a413b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

export default app;
