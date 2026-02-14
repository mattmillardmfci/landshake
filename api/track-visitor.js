/**
 * Track Visitor API
 * Logs visitor IP addresses and metadata to Firebase
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK
if (!getApps().length) {
	initializeApp({
		credential: cert({
			projectId: process.env.FIREBASE_PROJECT_ID,
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
		}),
	});
}

const db = getFirestore();

export default async function handler(req, res) {
	// Set CORS headers
	res.setHeader("Access-Control-Allow-Credentials", true);
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
	);

	if (req.method === "OPTIONS") {
		res.status(200).end();
		return;
	}

	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		// Extract IP address from request
		const ip =
			req.headers["x-forwarded-for"]?.split(",")[0] ||
			req.headers["x-real-ip"] ||
			req.socket.remoteAddress ||
			"Unknown";

		// Get additional metadata
		const userAgent = req.headers["user-agent"] || "Unknown";
		const referrer = req.headers["referer"] || req.headers["referrer"] || "Direct";

		// Get location data if provided
		const { latitude, longitude, accuracy } = req.body || {};

		// Create visitor record
		const visitorData = {
			ip,
			userAgent,
			referrer,
			timestamp: Timestamp.now(),
			location: latitude && longitude ? { latitude, longitude, accuracy } : null,
		};

		// Save to Firestore
		const docRef = await db.collection("visitors").add(visitorData);

		console.log("Visitor tracked:", { id: docRef.id, ip, location: visitorData.location });

		return res.status(200).json({
			success: true,
			id: docRef.id,
			ip,
		});
	} catch (error) {
		console.error("Error tracking visitor:", error);
		return res.status(500).json({
			error: "Failed to track visitor",
			message: error.message,
		});
	}
}
