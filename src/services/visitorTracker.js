/**
 * Visitor Tracker Service
 * Tracks visitor IP addresses and location data
 */

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Track visitor on page load
 * @param {Object} location - Optional location data { latitude, longitude, accuracy }
 */
export async function trackVisitor(location = null) {
	try {
		// Call API to get IP address
		const response = await fetch(`${API_BASE_URL}/api/track-visitor`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(location || {}),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		console.log("Visitor info from API:", data);

		// Write to Firebase with IP address from server
		const visitorData = {
			ip: data.ip || "Unknown",
			userAgent: data.userAgent || navigator.userAgent || "Unknown",
			referrer: data.referrer || document.referrer || "Direct",
			timestamp: serverTimestamp(),
			location: location?.latitude && location?.longitude 
				? { 
					latitude: location.latitude, 
					longitude: location.longitude, 
					accuracy: location.accuracy 
				} 
				: null,
		};

		const docRef = await addDoc(collection(db, "visitors"), visitorData);
		console.log("✅ Visitor tracked in Firebase:", { id: docRef.id, ip: data.ip });

		return { ...data, firestoreId: docRef.id };
	} catch (error) {
		console.error("Failed to track visitor:", error);
		// Don't throw - tracking failures shouldn't break the app
		return null;
	}
}
