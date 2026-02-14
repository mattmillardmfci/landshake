import React, { useState, useEffect, useRef } from "react";
import Map, { Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import useMissouriParcels from "./hooks/useMissouriParcels";
import ContactCard from "./components/ContactCard";
import AdminPanel from "./components/AdminPanel";
import DebugPanel from "./components/DebugPanel";
import { geocodeAddress } from "./services/geocodingService";
import { logQuery, logGeolocation } from "./services/queryLogger";
import "./services/errorTracker"; // Initialize error tracking

// Missouri boundaries - Jefferson City center
const MISSOURI_CENTER = {
	latitude: 38.5767,
	longitude: -92.1735,
	zoom: 7,
};

// Missouri boundaries for max bounds
const MISSOURI_BOUNDS = [
	[-95.774704, 35.995683], // Southwest coordinates
	[-89.098843, 40.61364], // Northeast coordinates
];

function App() {
	const [viewState, setViewState] = useState(MISSOURI_CENTER);
	const [selectedParcel, setSelectedParcel] = useState(null);
	const [userLocation, setUserLocation] = useState(null);
	const [locationError, setLocationError] = useState(null);
	const [locationPulse, setLocationPulse] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchLoading, setSearchLoading] = useState(false);
	const [showSplash, setShowSplash] = useState(true);
	const [fakeParcels, setFakeParcels] = useState(null);
	const [followUserLocation, setFollowUserLocation] = useState(true);
	const hasCenteredOnUser = useRef(false);
	const hasLoggedGeolocation = useRef(false);
	const isUserPanning = useRef(false);
	const lastRawLocation = useRef(null);
	const smoothedDisplayLocation = useRef(null);

	const { parcels, selectedParcelData, handleMapClick, loadParcelsForBounds, isLoading, loadingParcels } =
		useMissouriParcels();

	// Generate fake parcels around a center point (no overlapping)
	const generateFakeParcels = (centerLat, centerLng, count = 100) => {
		const features = [];
		const acreOptions = [0.5, 1, 2, 100];
		const usedBounds = []; // Track used parcel boundaries to prevent overlaps

		// Conversion factors: roughly 1 acre = 0.0015625 square miles
		// At Missouri latitude (~38°), 1 degree lat ≈ 69 miles, 1 degree lng ≈ 54 miles
		const acreToDegreesLat = (acres) => Math.sqrt(acres * 0.0015625) / 69;
		const acreToDegreesLng = (acres) => Math.sqrt(acres * 0.0015625) / 54;

		// Check if parcel bounds overlap with existing parcels
		const boundsOverlap = (minLng, maxLng, minLat, maxLat) => {
			return usedBounds.some((bound) => {
				return !(maxLng < bound.minLng || minLng > bound.maxLng || maxLat < bound.minLat || minLat > bound.maxLat);
			});
		};

		let created = 0;
		let attempts = 0;
		const maxAttempts = count * 3; // Allow multiple attempts to place parcels

		while (created < count && attempts < maxAttempts) {
			attempts++;

			const acres = acreOptions[Math.floor(Math.random() * acreOptions.length)];
			const latOffset = (Math.random() - 0.5) * 0.05; // Spread within ~1.5 miles
			const lngOffset = (Math.random() - 0.5) * 0.05;

			const parcelLat = centerLat + latOffset;
			const parcelLng = centerLng + lngOffset;

			const latDelta = acreToDegreesLat(acres) / 2;
			const lngDelta = acreToDegreesLng(acres) / 2;

			const minLng = parcelLng - lngDelta;
			const maxLng = parcelLng + lngDelta;
			const minLat = parcelLat - latDelta;
			const maxLat = parcelLat + latDelta;

			// Skip if this parcel would overlap with existing parcels
			if (boundsOverlap(minLng, maxLng, minLat, maxLat)) {
				continue;
			}

			// Track this parcel's bounds
			usedBounds.push({ minLng, maxLng, minLat, maxLat });

			// Create rectangular parcel
			const coordinates = [
				[
					[minLng, minLat],
					[maxLng, minLat],
					[maxLng, maxLat],
					[minLng, maxLat],
					[minLng, minLat],
				],
			];

			features.push({
				type: "Feature",
				geometry: {
					type: "Polygon",
					coordinates: coordinates,
				},
				properties: {
					PARCEL_ID: `FAKE-${created + 1}`,
					OWNER: `Property Owner ${created + 1}`,
					ACRES_CALC: acres,
					ADDRESS: `${Math.floor(Math.random() * 9999)} County Road ${Math.floor(Math.random() * 999)}`,
					ownerInfoLocked: true, // Future premium feature: Unlock Owner Information
				},
			});

			created++;
		}

		return {
			type: "FeatureCollection",
			features: features,
		};
	};

	// Generate initial fake parcels on mount
	useEffect(() => {
		const initialParcels = generateFakeParcels(MISSOURI_CENTER.latitude, MISSOURI_CENTER.longitude, 100);
		setFakeParcels(initialParcels);
	}, []);

	// Splash screen timer
	useEffect(() => {
		const timer = setTimeout(() => setShowSplash(false), 5000);
		return () => clearTimeout(timer);
	}, []);

	// Handle admin panel location clicks
	const handleAdminLocationClick = (lat, lng, zoom = 18) => {
		console.log("Admin clicked location:", { lat, lng, zoom });
		setViewState({
			latitude: lat,
			longitude: lng,
			zoom: zoom,
		});
	};

	// Calculate distance between two coordinates in meters
	const calculateDistance = (lat1, lon1, lat2, lon2) => {
		const R = 6371e3; // Earth radius in meters
		const φ1 = (lat1 * Math.PI) / 180;
		const φ2 = (lat2 * Math.PI) / 180;
		const Δφ = ((lat2 - lat1) * Math.PI) / 180;
		const Δλ = ((lon2 - lon1) * Math.PI) / 180;

		const a =
			Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	};

	// Get user's current location on component mount
	useEffect(() => {
		if (!navigator.geolocation) {
			setLocationError("Geolocation is not supported by this browser.");
			return;
		}

		console.log("Starting user geolocation watch...");
		const watchId = navigator.geolocation.watchPosition(
			(position) => {
				const { latitude, longitude, accuracy } = position.coords;

				// Calculate distance from last position
				const distanceThreshold = accuracy > 20 ? accuracy : 10; // Use accuracy as threshold, min 10m
				let shouldUpdate = true;

				if (lastRawLocation.current) {
					const distance = calculateDistance(
						lastRawLocation.current.latitude,
						lastRawLocation.current.longitude,
						latitude,
						longitude,
					);

					// Only update if moved beyond threshold
					if (distance < distanceThreshold) {
						shouldUpdate = false;
					}
				}

				if (shouldUpdate || !lastRawLocation.current) {
					lastRawLocation.current = { latitude, longitude, accuracy };
					
					// Smooth the display position with interpolation
					if (smoothedDisplayLocation.current) {
						const smoothFactor = 0.3; // Lower = smoother but slower
						smoothedDisplayLocation.current = {
							latitude:
								smoothedDisplayLocation.current.latitude * (1 - smoothFactor) +
								latitude * smoothFactor,
							longitude:
								smoothedDisplayLocation.current.longitude * (1 - smoothFactor) +
								longitude * smoothFactor,
							accuracy,
						};
					} else {
						smoothedDisplayLocation.current = { latitude, longitude, accuracy };
					}

					setUserLocation(smoothedDisplayLocation.current);
					console.log("User location updated:", {
						latitude: smoothedDisplayLocation.current.latitude,
						longitude: smoothedDisplayLocation.current.longitude,
						accuracy,
					});
				}

				setLocationError(null);

				if (!hasLoggedGeolocation.current) {
					logGeolocation({ latitude, longitude, accuracy });
					hasLoggedGeolocation.current = true;
				}

				const inMissouriBounds =
					longitude >= MISSOURI_BOUNDS[0][0] &&
					longitude <= MISSOURI_BOUNDS[1][0] &&
					latitude >= MISSOURI_BOUNDS[0][1] &&
					latitude <= MISSOURI_BOUNDS[1][1];

				if (inMissouriBounds) {
					if (!hasCenteredOnUser.current) {
						const newParcels = generateFakeParcels(
							smoothedDisplayLocation.current?.latitude ?? latitude,
							smoothedDisplayLocation.current?.longitude ?? longitude,
							100,
						);
						setFakeParcels(newParcels);
						hasCenteredOnUser.current = true;
					}

					if (followUserLocation && !isUserPanning.current && shouldUpdate) {
						setViewState((prev) => ({
							...prev,
							latitude: smoothedDisplayLocation.current?.latitude ?? latitude,
							longitude: smoothedDisplayLocation.current?.longitude ?? longitude,
							zoom: prev.zoom < 15 ? 18 : prev.zoom,
						}));
					}
				} else if (!inMissouriBounds) {
					console.warn("User location outside Missouri bounds");
					setLocationError("Your location appears to be outside Missouri");
				}
			},
			(error) => {
				console.warn("Geolocation error:", error);
				setLocationError("Unable to access your location. Using default map view.");
			},
			{
				enableHighAccuracy: true,
				maximumAge: 0,
				timeout: 10000,
			},
		);

		return () => {
			navigator.geolocation.clearWatch(watchId);
		};
	}, []);

	useEffect(() => {
		const intervalId = setInterval(() => {
			setLocationPulse((prev) => (prev + 0.03) % 1);
		}, 60);

		return () => clearInterval(intervalId);
	}, []);

	const userLocationGeoJSON = userLocation
		? {
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						geometry: {
							type: "Point",
							coordinates: [userLocation.longitude, userLocation.latitude],
						},
						properties: {
							accuracy: userLocation.accuracy ?? null,
						},
					},
				],
			}
		: null;

	const onMapClick = async (event) => {
		console.log("App: Map clicked at:", event.lngLat);

		// Check if click is on a fake parcel
		if (fakeParcels && fakeParcels.features) {
			const clickPoint = [event.lngLat.lng, event.lngLat.lat];

			for (const feature of fakeParcels.features) {
				// Simple point-in-polygon check (for rectangular parcels)
				const coords = feature.geometry.coordinates[0];
				const minLng = Math.min(...coords.map((c) => c[0]));
				const maxLng = Math.max(...coords.map((c) => c[0]));
				const minLat = Math.min(...coords.map((c) => c[1]));
				const maxLat = Math.max(...coords.map((c) => c[1]));

				if (clickPoint[0] >= minLng && clickPoint[0] <= maxLng && clickPoint[1] >= minLat && clickPoint[1] <= maxLat) {
					console.log("Clicked on fake parcel:", feature);
					setSelectedParcel(feature);
					return;
				}
			}
		}

		// Otherwise try real parcel data
		const parcel = await handleMapClick(event);
		console.log("App: Received parcel from handleMapClick:", parcel);
		setSelectedParcel(parcel);
		console.log("App: Selected parcel state updated");
	};

	const handleAddressSearch = async (e) => {
		e.preventDefault();
		if (!searchQuery.trim()) return;

		setSearchLoading(true);
		try {
			console.log("Searching for address:", searchQuery);
			const result = await geocodeAddress(searchQuery);

			if (!result) {
				alert("Address not found. Please try a different search.");
				setSearchLoading(false);
				return;
			}

			// Zoom to the address
			const newViewState = {
				latitude: result.latitude,
				longitude: result.longitude,
				zoom: 18,
			};
			setViewState(newViewState);
			console.log("Zoomed to address:", result);

			// Generate new fake parcels around search location
			const newParcels = generateFakeParcels(result.latitude, result.longitude, 100);
			setFakeParcels(newParcels);

			// Query the parcel at this location
			const fakeEvent = {
				lngLat: {
					lng: result.longitude,
					lat: result.latitude,
				},
			};
			const parcel = await handleMapClick(fakeEvent);
			setSelectedParcel(parcel);

			// Log address search to Firebase
			await logQuery({
				lat: result.latitude,
				lng: result.longitude,
				address: result.address,
				result: parcel
					? {
							owner: parcel.properties.OWNER,
							acres: parcel.properties.ACRES_CALC,
							parcelId: parcel.properties.PARCEL_ID,
						}
					: null,
				source: "address_search",
			});
		} catch (error) {
			console.error("Error searching address:", error);
			alert("Error searching address. Please try again.");
		} finally {
			setSearchLoading(false);
		}
	};

	return (
		<div className="relative w-full h-screen">
			<Map
				{...viewState}
				onMove={(evt) => {
					setViewState(evt.viewState);
					if (evt.originalEvent) {
						isUserPanning.current = true;
						setFollowUserLocation(false);
					}
				}}
				onClick={onMapClick}
				mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
				mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
				maxBounds={MISSOURI_BOUNDS}
				minZoom={6}
				maxZoom={18}
				cursor="crosshair">
				{/* Fake Parcels */}
				{fakeParcels && fakeParcels.features && fakeParcels.features.length > 0 && (
					<Source id="fake-parcels" type="geojson" data={fakeParcels}>
						<Layer
							id="fake-parcels-fill"
							type="fill"
							paint={{
								"fill-color": "#39FF14",
								"fill-opacity": 0,
							}}
						/>
						<Layer
							id="fake-parcels-line"
							type="line"
							paint={{
								"line-color": "#39FF14",
								"line-width": 2,
								"line-opacity": 0.6,
							}}
						/>
					</Source>
				)}

				{/* User Location */}
				{userLocationGeoJSON && (
					<Source id="user-location" type="geojson" data={userLocationGeoJSON}>
						{/* Accuracy circle */}
						<Layer
							id="user-location-accuracy"
							type="circle"
							paint={{
								"circle-radius": {
									stops: [
										[0, 0],
										[20, userLocation?.accuracy || 20],
									],
									base: 2,
								},
								"circle-color": "#3B82F6",
								"circle-opacity": 0.1,
								"circle-blur": 0.3,
							}}
						/>
						{/* Pulse animation */}
						<Layer
							id="user-location-pulse"
							type="circle"
							paint={{
								"circle-radius": 12 + locationPulse * 20,
								"circle-color": "#3B82F6",
								"circle-opacity": 0.35 * (1 - locationPulse),
								"circle-blur": 0.6,
							}}
						/>
						{/* Dot */}
						<Layer
							id="user-location-dot"
							type="circle"
							paint={{
								"circle-radius": 6,
								"circle-color": "#3B82F6",
								"circle-stroke-color": "#FFFFFF",
								"circle-stroke-width": 2,
								"circle-opacity": 1,
							}}
						/>
					</Source>
				)}

				{/* Real Parcels (if any) */}
				{parcels && parcels.features && parcels.features.length > 0 && (
					<Source id="parcels" type="geojson" data={parcels}>
						<Layer
							id="parcels-fill"
							type="fill"
							paint={{
								"fill-color": "#39FF14",
								"fill-opacity": 0.2,
							}}
						/>
						<Layer
							id="parcels-line"
							type="line"
							paint={{
								"line-color": "#39FF14",
								"line-width": 4,
								"line-opacity": 1,
							}}
						/>
						<Layer
							id="parcels-line-glow"
							type="line"
							paint={{
								"line-color": "#39FF14",
								"line-width": 8,
								"line-opacity": 0.3,
								"line-blur": 4,
							}}
						/>
					</Source>
				)}
			</Map>

			{/* Splash Screen */}
			{showSplash && (
				<div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6">
					<div className="text-center space-y-8 animate-fade-in flex flex-col items-center justify-center max-w-4xl">
						<img
							src="/logo.png"
							alt="Landshake Logo"
							className="w-4/5 md:w-96 h-auto mx-auto object-contain drop-shadow-2xl"
						/>
						<div className="space-y-3">
							<h1
								className="text-neon-green text-5xl md:text-7xl font-black tracking-tight"
								style={{
									fontFamily: "Impact, Futura, sans-serif",
									textShadow: "0 0 30px rgba(57, 255, 20, 0.6), 0 0 60px rgba(57, 255, 20, 0.3)",
								}}>
								WHERE PROPERTY LINES
							</h1>
							<h1
								className="text-neon-green text-5xl md:text-7xl font-black tracking-tight"
								style={{
									fontFamily: "Impact, Futura, sans-serif",
									textShadow: "0 0 30px rgba(57, 255, 20, 0.6), 0 0 60px rgba(57, 255, 20, 0.3)",
								}}>
								BECOME PERMISSION GRANTED
							</h1>
						</div>
						<p className="text-gray-400 text-sm md:text-base tracking-widest uppercase font-light mt-6 letter-spacing">
							The landowner verification platform
						</p>
					</div>
				</div>
			)}

			{/* Header */}
			<div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-6 z-10">
				<h1 className="text-white text-3xl font-bold">Landshake</h1>
				<p className="text-gray-300 text-sm mb-4">Where Property Lines Become Permission Granted</p>

				{/* Address Search */}
				<form onSubmit={handleAddressSearch} className="max-w-md">
					<div className="flex gap-2">
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search address (e.g., 3708 N Oakland Gravel Road)"
							className="flex-1 px-4 py-2 rounded-lg bg-white/90 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-green"
							disabled={searchLoading || isLoading}
						/>
						<button
							type="submit"
							disabled={searchLoading || isLoading || !searchQuery.trim()}
							className="px-4 py-2 bg-neon-green text-black font-semibold rounded-lg hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition">
							{searchLoading ? "..." : "Search"}
						</button>
					</div>
				</form>
			</div>

			{/* Loading Indicator */}
			{isLoading && (
				<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
					<div className="bg-black/70 backdrop-blur-md rounded-xl p-6 flex flex-col items-center">
						<svg className="animate-spin h-10 w-10 text-neon-green mb-3" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						<p className="text-white font-semibold">Loading parcel data...</p>
					</div>
				</div>
			)}

			{/* Loading Parcels Indicator */}
			{loadingParcels && (
				<div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20">
					<div className="bg-black/70 backdrop-blur-md rounded-lg px-4 py-2 flex items-center gap-2">
						<svg className="animate-spin h-4 w-4 text-neon-green" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						<p className="text-white text-sm">Loading parcels...</p>
					</div>
				</div>
			)}

			{/* Re-center Location Button */}
			{userLocation && !followUserLocation && (
				<button
					onClick={() => {
						isUserPanning.current = false;
						setFollowUserLocation(true);
						setViewState((prev) => ({
							...prev,
							latitude: userLocation.latitude,
							longitude: userLocation.longitude,
							zoom: prev.zoom < 15 ? 18 : prev.zoom,
						}));
					}}
					className="absolute bottom-6 right-6 z-20 bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110"
					title="Follow my location">
					<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</button>
			)}

			{/* Contact Card Modal */}
			{selectedParcel && (
				<ContactCard
					ownerName={selectedParcel.properties?.OWNER || selectedParcel.properties?.OWNER_NAME || "Unknown Owner"}
					parcelId={selectedParcel.properties?.PARCEL_ID}
					acres={selectedParcel.properties?.ACRES_CALC}
					onClose={() => setSelectedParcel(null)}
				/>
			)}

			{/* Admin Panel */}
			<AdminPanel onLocationClick={handleAdminLocationClick} />

			{/* Debug Panel */}
			<DebugPanel
				viewState={viewState}
				selectedParcel={selectedParcel}
				userLocation={userLocation}
				isLoading={isLoading}
			/>
		</div>
	);
}

export default App;
