/**
 * Track Visitor API
 * Returns visitor IP address and metadata (no Firebase dependency)
 * The client-side will write to Firebase using the standard SDK
 */

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
		// Extract IP address from request headers
		const ip =
			req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
			req.headers["x-real-ip"] ||
			req.connection?.remoteAddress ||
			req.socket?.remoteAddress ||
			"Unknown";

		// Get additional metadata
		const userAgent = req.headers["user-agent"] || "Unknown";
		const referrer = req.headers["referer"] || req.headers["referrer"] || "Direct";

		console.log("Visitor info extracted:", { ip, userAgent, referrer });

		return res.status(200).json({
			success: true,
			ip,
			userAgent,
			referrer,
		});
	} catch (error) {
		console.error("Error extracting visitor info:", error);
		return res.status(500).json({
			error: "Failed to extract visitor info",
			message: error.message,
		});
	}
}
