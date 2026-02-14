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

// Intercept fetch calls globally
const originalFetch = window.fetch;
window.fetch = function (...args) {
	const [resource, config] = args;
	console.log("🔗 FETCH REQUEST:\n  URL:", String(resource), "\n  Config:", config);
	
	const startTime = Date.now();

	return originalFetch.apply(this, args).then((response) => {
		const duration = Date.now() - startTime;

		// Log error responses
		if (!response.ok) {
			addError(
				{
					message: `HTTP ${response.status}`,
					status: response.status,
				},
				{
					url: String(resource),
					method: config?.method || "GET",
					duration: `${duration}ms`,
				}
			);
		}

		return response;
	}).catch((error) => {
		const duration = Date.now() - startTime;
		
		// Log error with clear message
		const errorMessage = error.name === 'AbortError' 
			? "⚠️ FETCH ABORTED" 
			: error.message || String(error);
			
		console.error("❌ FETCH ERROR:\n  URL:\", String(resource), "\n  Error:\", errorMessage, "\n  Duration:\", duration, "ms\n  Stack:\", error.stack);
		
		addError({
			message: errorMessage,
			name: error.name,
		}, {
			url: String(resource),
			type: error.name === 'AbortError' ? "Fetch Aborted" : "Network Error",
			duration: `${duration}ms`,
		});
		throw error;
	});
};

export default {
	addError,
	getErrors,
	clearErrors,
};
