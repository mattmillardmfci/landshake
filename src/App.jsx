import React, { useState, useEffect } from "react";
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
	const [searchQuery, setSearchQuery] = useState("");
	const [searchLoading, setSearchLoading] = useState(false);
	const [showSplash, setShowSplash] = useState(true);
	const [fakeParcels, setFakeParcels] = useState(null);

	const { parcels, selectedParcelData, handleMapClick, loadParcelsForBounds, isLoading, loadingParcels } =
		useMissouriParcels();

	// Generate fake parcels around a center point
	const generateFakeParcels = (centerLat, centerLng, count = 100) => {
		const features = [];
		const acreOptions = [0.5, 1, 2, 100];

		// Conversion factors: roughly 1 acre = 0.0015625 square miles
		// At Missouri latitude (~38°), 1 degree lat ≈ 69 miles, 1 degree lng ≈ 54 miles
		const acreToDegreesLat = (acres) => Math.sqrt(acres * 0.0015625) / 69;
		const acreToDegreesLng = (acres) => Math.sqrt(acres * 0.0015625) / 54;

		for (let i = 0; i < count; i++) {
			const acres = acreOptions[Math.floor(Math.random() * acreOptions.length)];
			const latOffset = (Math.random() - 0.5) * 0.05; // Spread within ~1.5 miles
			const lngOffset = (Math.random() - 0.5) * 0.05;

			const parcelLat = centerLat + latOffset;
			const parcelLng = centerLng + lngOffset;

			const latDelta = acreToDegreesLat(acres) / 2;
			const lngDelta = acreToDegreesLng(acres) / 2;

			// Create rectangular parcel
			const coordinates = [
				[
					[parcelLng - lngDelta, parcelLat - latDelta],
					[parcelLng + lngDelta, parcelLat - latDelta],
					[parcelLng + lngDelta, parcelLat + latDelta],
					[parcelLng - lngDelta, parcelLat + latDelta],
					[parcelLng - lngDelta, parcelLat - latDelta],
				],
			];

			features.push({
				type: "Feature",
				geometry: {
					type: "Polygon",
					coordinates: coordinates,
				},
				properties: {
					PARCEL_ID: `FAKE-${i + 1}`,
					OWNER: `Property Owner ${i + 1}`,
					ACRES_CALC: acres,
					ADDRESS: `${Math.floor(Math.random() * 9999)} County Road ${Math.floor(Math.random() * 999)}`,
				},
			});
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

	// Get user's current location on component mount
	useEffect(() => {
		if (navigator.geolocation) {
			console.log("Requesting user geolocation...");
			navigator.geolocation.getCurrentPosition(
				(position) => {
					const { latitude, longitude, accuracy } = position.coords;
					console.log("User location received:", { latitude, longitude });

					// Log geolocation to Firebase
					logGeolocation({ latitude, longitude, accuracy });

					// Check if location is in Missouri bounds
					const inMissouriBounds =
						longitude >= MISSOURI_BOUNDS[0][0] &&
						longitude <= MISSOURI_BOUNDS[1][0] &&
						latitude >= MISSOURI_BOUNDS[0][1] &&
						latitude <= MISSOURI_BOUNDS[1][1];

					if (inMissouriBounds) {
						// Zoom to user location - max zoom (100%)
						const newViewState = {
							latitude,
							longitude,
							zoom: 18,
						};
						setViewState(newViewState);
						setUserLocation({ latitude, longitude });
						console.log("Zoomed to user location:", newViewState);
					} else {
						console.warn("User location outside Missouri bounds");
						setLocationError("Your location appears to be outside Missouri");
					}
				},
				(error) => {
					console.warn("Geolocation error:", error);
					setLocationError("Unable to access your location. Using default map view.");
				},
			);
		}
	}, []);

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
				onMove={(evt) => setViewState(evt.viewState)}
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
								"fill-opacity": 0.2,
							}}
						/>
						<Layer
							id="fake-parcels-line"
							type="line"
							paint={{
								"line-color": "#39FF14",
								"line-width": 2,
								"line-opacity": 0.8,
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
				<div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-green-900 to-gray-800 flex flex-col items-center justify-center">
					<div className="text-center space-y-6 animate-fade-in">
						<h2
							className="text-neon-green text-4xl md:text-5xl font-bold tracking-wider uppercase"
							style={{ fontFamily: "Impact, sans-serif", textShadow: "0 0 20px rgba(57, 255, 20, 0.5)" }}>
							Where Property Lines Become
							<br />
							Permission Granted
						</h2>
						<img src="/logo.png" alt="Landshake Logo" className="w-64 h-64 mx-auto object-contain drop-shadow-2xl" />
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
