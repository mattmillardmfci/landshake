/**
 * Error Tracker Service
 * Tracks HTTP errors and network failures for debugging
 */

let errors = [];
const MAX_ERRORS = 10;

export const addError = (error, context = {}) => {
	const errorEntry = {
		timestamp: new Date(),
		message: error.message || String(error),
		status: error.status,
		context,
		type: error.type || "ERROR",
	};

	errors.unshift(errorEntry);
	if (errors.length > MAX_ERRORS) {
		errors = errors.slice(0, MAX_ERRORS);
	}

	console.error("[ErrorTracker]", errorEntry);
};

export const getErrors = () => {
	return errors;
};

export const clearErrors = () => {
	errors = [];
};

// Helper to extract URL from fetch resource (string or Request object)
const getUrlFromResource = (resource) => {
	if (typeof resource === "string") return resource;
	if (resource instanceof Request) return resource.url;
	return String(resource);
};

// Intercept fetch calls globally
const originalFetch = window.fetch;
window.fetch = function (...args) {
	const [resource, config] = args;
	const url = getUrlFromResource(resource);
	console.log("🔗 FETCH REQUEST:\n  URL:", url, "\n  Config:", config);

	const startTime = Date.now();

	return originalFetch
		.apply(this, args)
		.then((response) => {
			const duration = Date.now() - startTime;

			// Log error responses
			if (!response.ok) {
				addError(
					{
						message: `HTTP ${response.status}`,
						status: response.status,
					},
					{
						url: url,
						method: config?.method || "GET",
						duration: `${duration}ms`,
					},
				);
			}

			return response;
		})
		.catch((error) => {
			const duration = Date.now() - startTime;

			// Log error with clear message
			const errorMessage =
				error.name === "AbortError" ? "⚠️ FETCH ABORTED (normal during panning)" : error.message || String(error);

			// Only log non-abort errors to reduce console noise
			if (error.name !== "AbortError") {
				console.error("❌ FETCH ERROR:\n  URL:", url, "\n  Error:", errorMessage, "\n  Duration:", duration, "ms");
			}

			addError(
				{
					message: errorMessage,
					name: error.name,
				},
				{
					url: url,
					type: error.name === "AbortError" ? "Fetch Aborted (Normal)" : "Network Error",
					duration: `${duration}ms`,
				},
			);
			throw error;
		});
};

export default {
	addError,
	getErrors,
	clearErrors,
};
