import { useState, useRef, useCallback, useEffect } from "react";
import { logQuery } from "../services/queryLogger";

/**
 * Custom hook to manage Missouri parcel data
 * Fetches parcel data from Boone County ArcGIS REST API on click
 */
const useMissouriParcels = () => {
	const [parcels, setParcels] = useState({
		type: "FeatureCollection",
		features: [],
	});
	const [selectedParcelData, setSelectedParcelData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [loadingParcels, setLoadingParcels] = useState(false);
	const [localParcels, setLocalParcels] = useState(null);
	const mapRef = useRef(null);
	const localParcelLoadAttempted = useRef(false);

	useEffect(() => {
		const loadLocalParcels = async () => {
			if (localParcelLoadAttempted.current) {
				return;
			}

			localParcelLoadAttempted.current = true;
			setLoadingParcels(true);
			console.log("🚀 STARTING PARCEL LOAD (NEW CODE) - Loading from /data/cole_parcels.geojson...");

			try {
				console.log("📡 Creating fetch request for parcel data...");
				const controller = new AbortController();
				const timeoutId = setTimeout(() => {
					console.error("⏰ 120 second timeout triggered, aborting fetch...");
					controller.abort();
				}, 120000); // Increased to 2 minutes for large files

				console.log("🔗 Fetch URL: /data/cole_parcels.geojson");
				const response = await fetch("/data/cole_parcels.geojson", {
					method: "GET",
					signal: controller.signal,
				});

				clearTimeout(timeoutId);
				console.log("✅ Fetch completed, response status:", response.status);

				if (!response.ok) {
					throw new Error(`Failed to load parcel dataset: ${response.status}`);
				}

				console.log("📦 Response received, parsing JSON...");
				const data = await response.json();
				const mbSize = (JSON.stringify(data).length / 1024 / 1024).toFixed(2);
				console.log("✨ JSON parsed successfully,", data.features?.length ?? 0, "features,", mbSize, "MB");

				if (!data || data.type !== "FeatureCollection") {
					throw new Error("Parcel dataset is not a FeatureCollection.");
				}

				setLocalParcels(data);
				console.log("✅ Successfully loaded Cole County parcels:", data.features?.length ?? 0, "parcels");
			} catch (error) {
				if (error.name === "AbortError") {
					console.error("⚠️ FETCH ABORTED");
					console.error("Error name:", error.name);
					console.error("Error message:", error.message);
					console.error("Reason: File too large or network timeout");
				} else {
					console.error("❌ Failed to load local parcel data:", error);
					console.error("Error:", error.message);
				}
			} finally {
				setLoadingParcels(false);
			}
		};

		loadLocalParcels();
	}, []);

	/**
	 * Load all parcels for the current map viewport
	 * DISABLED: Causes performance issues with mock data
	 * TODO: Re-enable when real parcel data source is available
	 */
	const loadParcelsForBounds = useCallback(async (map) => {
		// DISABLED - viewport loading causes too many parcels and crashes
		// Need real parcel data source before re-enabling
		console.log("[Hook] Viewport parcel loading disabled - click parcels to view");
		return;
	}, []);

	/**
	 * Handle map click to fetch parcel data from ArcGIS API
	 * Sends lat/lng to Boone County ArcGIS REST API
	 */
	const isPointInRing = (point, ring) => {
		let inside = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const xi = ring[i][0];
			const yi = ring[i][1];
			const xj = ring[j][0];
			const yj = ring[j][1];

			const intersect = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

			if (intersect) {
				inside = !inside;
			}
		}

		return inside;
	};

	const isPointInPolygon = (point, polygon) => {
		if (!polygon?.length) {
			return false;
		}

		const [outer, ...holes] = polygon;
		if (!isPointInRing(point, outer)) {
			return false;
		}

		return !holes.some((hole) => isPointInRing(point, hole));
	};

	const isPointInGeometry = (point, geometry) => {
		if (!geometry) {
			return false;
		}

		switch (geometry.type) {
			case "Polygon":
				return isPointInPolygon(point, geometry.coordinates);
			case "MultiPolygon":
				return geometry.coordinates.some((polygon) => isPointInPolygon(point, polygon));
			default:
				return false;
		}
	};

	const findParcelByCoordinates = (features, lng, lat) => {
		const point = [lng, lat];

		for (const feature of features) {
			const bbox = feature.properties?.__bbox;
			if (bbox && (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3])) {
				continue;
			}

			if (isPointInGeometry(point, feature.geometry)) {
				return feature;
			}
		}

		return null;
	};

	const handleMapClick = async (event) => {
		// Get the clicked coordinates
		const { lng, lat } = event.lngLat;

		console.log("Map clicked at:", lng, lat);

		setIsLoading(true);

		try {
			if (!localParcels?.features?.length) {
				console.warn("Local parcel dataset not loaded yet.");
				setIsLoading(false);
				return null;
			}

			const hit = findParcelByCoordinates(localParcels.features, lng, lat);
			if (!hit) {
				setSelectedParcelData(null);
				setParcels({
					type: "FeatureCollection",
					features: [],
				});
				setIsLoading(false);
				return null;
			}

			const parcelCollection = {
				type: "FeatureCollection",
				features: [hit],
			};

			setParcels(parcelCollection);
			setSelectedParcelData(hit);

			await logQuery({
				lat,
				lng,
				address: null,
				result: {
					owner: hit.properties?.OWNER || hit.properties?.OWNER_NAME,
					acres: hit.properties?.ACRES_CALC ?? hit.properties?.ACRES,
					parcelId: hit.properties?.PARCEL_ID,
				},
				source: "map_click",
			});

			setIsLoading(false);
			return hit;
		} catch (error) {
			console.error("Error searching parcel data:", error);
			setSelectedParcelData(null);
			setParcels({
				type: "FeatureCollection",
				features: [],
			});
			setIsLoading(false);
			return null;
		}
	};

	return {
		parcels,
		selectedParcelData,
		handleMapClick,
		loadParcelsForBounds,
		mapRef,
		isLoading,
		loadingParcels,
		localParcels,
	};
};

export default useMissouriParcels;
