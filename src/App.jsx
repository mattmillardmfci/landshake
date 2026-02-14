import React, { useState, useEffect, useRef } from "react";
import Map, { Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import useMissouriParcels from "./hooks/useMissouriParcels";
import useTileBasedParcels from "./hooks/useTileBasedParcels";
import ContactCard from "./components/ContactCard";
import AdminPanel from "./components/AdminPanel";
import DebugPanel from "./components/DebugPanel";
import { geocodeAddress } from "./services/geocodingService";
import { logQuery, logGeolocation } from "./services/queryLogger";
import { trackVisitor } from "./services/visitorTracker";
import "./services/errorTracker"; // Initialize error tracking

// Parcel data center - focused on actual loaded parcel area
// Data is clustered at -110.26, 34.509 in a ~1km area
const PARCEL_CENTER = {
	latitude: 34.509388,
	longitude: -110.26463,
	zoom: 18,
};

function App() {
	const [viewState, setViewState] = useState(PARCEL_CENTER);
	const [selectedParcel, setSelectedParcel] = useState(null);
	const [userLocation, setUserLocation] = useState(null);
	const [locationError, setLocationError] = useState(null);
	const [locationPulse, setLocationPulse] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchLoading, setSearchLoading] = useState(false);
	const [showSplash, setShowSplash] = useState(true);
	const [followUserLocation, setFollowUserLocation] = useState(false);
	const hasCenteredOnUser = useRef(false);
	const hasLoggedGeolocation = useRef(false);
	const isUserPanning = useRef(false);
	const hasTrackedVisitor = useRef(false);
	const lastRawLocation = useRef(null);
	const smoothedDisplayLocation = useRef(null);

	const { parcels, selectedParcelData, handleMapClick, loadParcelsForBounds, isLoading, loadingParcels, localParcels } =
		useMissouriParcels();

	// Tile-based parcel loading
	const { updateVisibleTiles, getVisibleParcels, tilesManifest, error: tilesError } = useTileBasedParcels();
	const [useTiles, setUseTiles] = useState(true); // Toggle between full load and tile-based

	const [visibleParcels, setVisibleParcels] = useState(null);

	// Splash screen timer
	useEffect(() => {
		const timer = setTimeout(() => setShowSplash(false), 5000);
		return () => clearTimeout(timer);
	}, []);

	// Log loading state changes
	// Track all state changes comprehensively
	useEffect(() => {
		console.group("📊 PARCEL STATE SNAPSHOT");
		console.log("loadingParcels:", loadingParcels);
		console.log("localParcels:", localParcels ? `${localParcels.features?.length} features` : "null");
		console.log("visibleParcels:", visibleParcels ? `${visibleParcels.features?.length} features` : "null");
		
		const renderCondition = visibleParcels && visibleParcels.features && visibleParcels.features.length > 0;
		console.log("✔️ RENDER CONDITION (visibleParcels && visibleParcels.features && visibleParcels.features.length > 0):", renderCondition);
		
		if (renderCondition) {
			console.log("🎨 WILL RENDER: Visible parcels layer is visible");
		} else {
			console.log("❌ WILL NOT RENDER: Check conditions above");
			if (!visibleParcels) console.log("  - visibleParcels is null/undefined");
			if (visibleParcels && !visibleParcels.features) console.log("  - visibleParcels.features is null/undefined");
			if (visibleParcels?.features?.length === 0) console.log("  - visibleParcels.features.length is 0");
		}
		console.groupEnd();
	}, [visibleParcels]);

	// Track visitor on initial load
	useEffect(() => {
		if (!hasTrackedVisitor.current) {
			trackVisitor();
			hasTrackedVisitor.current = true;
		}
	}, []);

	// Display parcels when they load
	useEffect(() => {
		if (!localParcels?.features) {
			console.log("⏳ Waiting for parcels to load...");
			return;
		}

		console.log(`✅ DISPATCHER: ${localParcels.features.length} parcels loaded, displaying them`);
		console.log("📋 Parcel data structure:", {
			type: localParcels.type,
			featureCount: localParcels.features.length,
			firstFeature: localParcels.features[0],
		});

		setVisibleParcels({
			type: "FeatureCollection",
			features: localParcels.features,
		});

		console.log("🎨 SET VISIBLE PARCELS - should show on map now");
	}, [localParcels]);

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
	// Start geolocation watch when user enables location tracking
	useEffect(() => {
		if (!followUserLocation || !navigator.geolocation) {
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

					// Center map on location if following
					if (followUserLocation) {
						setViewState((prev) => ({
							...prev,
							latitude: smoothedDisplayLocation.current.latitude,
							longitude: smoothedDisplayLocation.current.longitude,
							zoom: prev.zoom < 15 ? 18 : prev.zoom,
						}));
					}
				}

				setLocationError(null);

				if (!hasLoggedGeolocation.current) {
					logGeolocation({ latitude, longitude, accuracy });
					// Track visitor with location data
					trackVisitor({ latitude, longitude, accuracy });
					hasLoggedGeolocation.current = true;
				}

				const inParcelBounds =
					longitude >= -110.3 &&
					longitude <= -110.0 &&
					latitude >= 34.4 &&
					latitude <= 34.7;

				// Show warning if outside parcel area
				if (!inParcelBounds) {
					console.warn("User location outside parcel service area");
					setLocationError("You are outside the parcel data area");
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
	}, [followUserLocation]);

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

					// Use tile-based system if available and zoomed in
					if (tilesManifest && evt.viewState.zoom >= 10) {
						const map = evt.target;
						const bounds = map.getBounds();
						const viewportBounds = {
							minLng: bounds.getWest(),
							maxLng: bounds.getEast(),
							minLat: bounds.getSouth(),
							maxLat: bounds.getNorth(),
						};

						// Update which tiles should be loaded for current viewport
						updateVisibleTiles(viewportBounds);

						// Get combined GeoJSON of all visible tiles
						const parcels = getVisibleParcels();
						if (parcels && parcels.features && parcels.features.length > 0) {
							console.log(`🎯 Tile-based display: ${parcels.features.length} parcels visible at zoom ${evt.viewState.zoom.toFixed(1)}`);
							setVisibleParcels(parcels);
						} else {
							console.log("⚠️ No tiles contain data for current viewport");
							setVisibleParcels(null);
						}
					} else {
						// Below zoom 10 or no tiles available - hide parcels
						if (evt.viewState.zoom < 10) {
							console.log(`◀ Zoom ${evt.viewState.zoom.toFixed(1)} < 10 - parcels hidden`);
						} else if (!tilesManifest) {
							console.log("📦 Tile manifest not ready yet");
						}
						setVisibleParcels(null);
					}
				}}
				onClick={onMapClick}
				mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
				mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
				minZoom={4}
				maxZoom={18}
				cursor="crosshair">
				{/* All Visible Parcels */}
				{visibleParcels && visibleParcels.features && visibleParcels.features.length > 0 && (
					<Source id="visible-parcels" type="geojson" data={visibleParcels}>
						<Layer
							id="visible-parcels-fill"
							type="fill"
							paint={{
								"fill-color": "#39FF14",
								"fill-opacity": 0.05,
							}}
						/>
						<Layer
							id="visible-parcels-line"
							type="line"
							paint={{
								"line-color": "#39FF14",
								"line-width": 2,
								"line-opacity": 0.8,
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

				{/* Selected Parcel Highlight */}
				{parcels && parcels.features && parcels.features.length > 0 && (
					<Source id="selected-parcel" type="geojson" data={parcels}>
						<Layer
							id="selected-parcel-fill"
							type="fill"
							paint={{
								"fill-color": "#39FF14",
								"fill-opacity": 0.2,
							}}
						/>
						<Layer
							id="selected-parcel-line"
							type="line"
							paint={{
								"line-color": "#39FF14",
								"line-width": 3,
								"line-opacity": 1,
							}}
						/>
						<Layer
							id="selected-parcel-glow"
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
			<div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-3 md:p-6 z-10">
				<img src="/logo.png" alt="Landshake" className="h-10 w-auto mb-3" />

				{/* Address Search */}
				<form onSubmit={handleAddressSearch} className="max-w-md">
					<div className="flex gap-1 md:gap-2">
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search address (e.g., 123 Main St)"
							className="flex-1 px-2 py-1.5 md:px-4 md:py-2 text-sm md:text-base rounded-lg bg-white/90 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-green"
							disabled={searchLoading || isLoading}
						/>
						<button
							type="submit"
							disabled={searchLoading || isLoading || !searchQuery.trim()}
							className="px-2 py-1.5 md:px-4 md:py-2 text-sm md:text-base bg-neon-green text-black font-semibold rounded-lg hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition">
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

			{/* Mobile Debug Display */}
			<div className="absolute top-4 left-4 z-50 bg-black bg-opacity-90 text-white text-xs p-3 rounded-lg max-w-xs font-mono">
				<div className="font-bold mb-2">DEBUG INFO</div>
				<div>Loading: {loadingParcels ? "🔄" : "✅"}</div>
				<div>Local: {localParcels?.features?.length ?? 0} features</div>
				<div>Visible: {visibleParcels?.features?.length ?? 0} features</div>
				<div>Render: {visibleParcels?.features?.length > 0 ? "🎨 YES" : "❌ NO"}</div>
				<div className="mt-2 border-t border-gray-500 pt-2">
					<div>Zoom: {viewState.zoom.toFixed(1)}</div>
					<div>Lat: {viewState.latitude.toFixed(2)}</div>
					<div>Lon: {viewState.longitude.toFixed(2)}</div>
				</div>
			</div>

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
