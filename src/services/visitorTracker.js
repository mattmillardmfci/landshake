/**
 * Visitor Tracker Service
 * Tracks visitor IP addresses and location data
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Track visitor on page load
 * @param {Object} location - Optional location data { latitude, longitude, accuracy }
 */
export async function trackVisitor(location = null) {
	try {
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
		console.log("Visitor tracked:", data);
		return data;
	} catch (error) {
		console.error("Failed to track visitor:", error);
		// Don't throw - tracking failures shouldn't break the app
		return null;
	}
}
