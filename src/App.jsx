import React, { useState, useEffect, useRef, useCallback } from "react";
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

// Parcel data center - Cole County, Missouri (WGS84)
// Centered on Columbia, MO area with parcels
const PARCEL_CENTER = {
	latitude: 38.53,
	longitude: -92.24,
	zoom: 13.5,
};

const MIN_PARCEL_ZOOM = 13;
const MAX_PARCEL_ZOOM = 20;
const LOCATION_CACHE_KEY = "landverify:userLocation";
const LOCATION_PERMISSION_KEY = "landverify:locationPermission";

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

	// Weather data
	const [weatherData, setWeatherData] = useState(null);
	const [weatherLoading, setWeatherLoading] = useState(false);

	// Device heading (direction phone is pointing)
	const [deviceHeading, setDeviceHeading] = useState(null);

	// Bottom navigation state
	const [activeNav, setActiveNav] = useState(null); // 'debug', 'tools', 'admin'
	const [showToolsMenu, setShowToolsMenu] = useState(false);
	const [showDebugPanel, setShowDebugPanel] = useState(false);
	const [showAdminPanel, setShowAdminPanel] = useState(false);
	const [showSearchInput, setShowSearchInput] = useState(false);
	const [drawMode, setDrawMode] = useState(false);
	const [drawnPoints, setDrawnPoints] = useState([]);
	const [drawnLines, setDrawnLines] = useState([]);

	// Cached areas management
	const [cachedAreas, setCachedAreas] = useState([]);
	const [selectedAreaId, setSelectedAreaId] = useState(null);
	const areaIdRef = useRef(0); // Counter for unique area IDs

	// Pins management
	const [pins, setPins] = useState([]);
	const [selectedPinId, setSelectedPinId] = useState(null);
	const [pinMode, setPinMode] = useState(false);
	const [draggingPinId, setDraggingPinId] = useState(null);
	const pinIdRef = useRef(0); // Counter for unique pin IDs

	// Splash screen timer
	useEffect(() => {
		const timer = setTimeout(() => setShowSplash(false), 5000);
		return () => clearTimeout(timer);
	}, []);

	// Sync selectedParcelData from hook to selectedParcel state for ContactCard display
	useEffect(() => {
		setSelectedParcel(selectedParcelData);
	}, [selectedParcelData]);

	const requestInitialLocation = useCallback(() => {
		if (!navigator.geolocation) {
			return;
		}

		try {
			const permission = localStorage.getItem(LOCATION_PERMISSION_KEY);
			const cachedLocation = localStorage.getItem(LOCATION_CACHE_KEY);

			if (permission === "denied") {
				return;
			}

			if (cachedLocation) {
				const parsed = JSON.parse(cachedLocation);
				if (parsed?.latitude && parsed?.longitude) {
					setUserLocation(parsed);
					setFollowUserLocation(true);
					setViewState((prev) => ({
						...prev,
						latitude: parsed.latitude,
						longitude: parsed.longitude,
						zoom: Math.max(prev.zoom, 15),
					}));
					return;
				}
			}
		} catch (error) {
			console.warn("Failed to read cached location:", error);
		}

		navigator.geolocation.getCurrentPosition(
			(position) => {
				const { latitude, longitude, accuracy } = position.coords;
				const locationPayload = { latitude, longitude, accuracy };
				setUserLocation(locationPayload);
				setFollowUserLocation(true);
				setViewState((prev) => ({
					...prev,
					latitude,
					longitude,
					zoom: Math.max(prev.zoom, 15),
				}));

				try {
					localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(locationPayload));
					localStorage.setItem(LOCATION_PERMISSION_KEY, "granted");
				} catch (error) {
					console.warn("Failed to cache location:", error);
				}
			},
			(error) => {
				console.warn("Geolocation error:", error);
				try {
					localStorage.setItem(LOCATION_PERMISSION_KEY, "denied");
				} catch (storageError) {
					console.warn("Failed to cache location permission:", storageError);
				}
			},
			{
				enableHighAccuracy: true,
				maximumAge: 0,
				timeout: 10000,
			},
		);
	}, []);

	useEffect(() => {
		if (!showSplash) {
			requestInitialLocation();
		}
	}, [showSplash, requestInitialLocation]);

	// Log loading state changes
	// Track all state changes comprehensively
	useEffect(() => {
		console.group("📊 PARCEL STATE SNAPSHOT");
		console.log("loadingParcels:", loadingParcels);
		console.log("localParcels:", localParcels ? `${localParcels.features?.length} features` : "null");
		console.log("visibleParcels:", visibleParcels ? `${visibleParcels.features?.length} features` : "null");

		const renderCondition = visibleParcels && visibleParcels.features && visibleParcels.features.length > 0;
		console.log(
			"✔️ RENDER CONDITION (visibleParcels && visibleParcels.features && visibleParcels.features.length > 0):",
			renderCondition,
		);

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

	// Display parcels when they load - but ONLY if already zoomed in
	useEffect(() => {
		if (!localParcels?.features) {
			console.log("⏳ Waiting for parcels to load...");
			return;
		}

		console.log(`✅ DISPATCHER: ${localParcels.features.length} parcels loaded`);

		// Only auto-display if zoomed in enough
		if (viewState.zoom >= MIN_PARCEL_ZOOM && viewState.zoom <= MAX_PARCEL_ZOOM) {
			console.log("📋 Zoom in range, displaying parcels");
			setVisibleParcels({
				type: "FeatureCollection",
				features: localParcels.features,
			});
		} else {
			console.log(`📋 Zoom ${viewState.zoom.toFixed(1)} outside parcel range, hiding parcels`);
			setVisibleParcels(null);
		}
	}, [localParcels, viewState.zoom]);

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

		const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
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
							latitude: smoothedDisplayLocation.current.latitude * (1 - smoothFactor) + latitude * smoothFactor,
							longitude: smoothedDisplayLocation.current.longitude * (1 - smoothFactor) + longitude * smoothFactor,
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

					try {
						localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(smoothedDisplayLocation.current));
						localStorage.setItem(LOCATION_PERMISSION_KEY, "granted");
					} catch (error) {
						console.warn("Failed to cache location:", error);
					}

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

	// Fetch weather data when user location changes
	useEffect(() => {
		if (!userLocation) return;

		const fetchWeather = async () => {
			setWeatherLoading(true);
			try {
				const response = await fetch(
					`https://api.openweathermap.org/data/2.5/weather?lat=${userLocation.latitude}&lon=${userLocation.longitude}&appid=d5815fb72e6471090eff5462a5b00b73&units=imperial`,
				);
				const data = await response.json();
				if (data.cod === 200) {
					setWeatherData({
						temp: Math.round(data.main.temp),
						condition: data.weather[0].main,
						icon: data.weather[0].icon,
						wind: {
							speed: Math.round(data.wind.speed),
							deg: data.wind.deg || 0,
						},
					});
				}
			} catch (error) {
				console.warn("Weather fetch error:", error);
			}
			setWeatherLoading(false);
		};

		fetchWeather();
	}, [userLocation?.latitude, userLocation?.longitude]);

	// Listen to device orientation for heading
	useEffect(() => {
		if (!navigator.permissions) return;

		const handleDeviceOrientation = (event) => {
			const heading = event.alpha || 0; // 0-360 degrees
			setDeviceHeading(heading);
		};

		// Request permission for iOS 13+
		if (
			typeof DeviceOrientationEvent !== "undefined" &&
			typeof DeviceOrientationEvent.requestPermission === "function"
		) {
			DeviceOrientationEvent.requestPermission()
				.then((permissionState) => {
					if (permissionState === "granted") {
						window.addEventListener("deviceorientation", handleDeviceOrientation);
					}
				})
				.catch(console.warn);
		} else {
			// Non-iOS 13 or non-iOS devices
			window.addEventListener("deviceorientation", handleDeviceOrientation);
		}

		return () => {
			window.removeEventListener("deviceorientation", handleDeviceOrientation);
		};
	}, []);

	// Build GeoJSON for drawn points and lines
	const drawnPointsGeoJSON = {
		type: "FeatureCollection",
		features: drawnPoints.map((point) => ({
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: point,
			},
			properties: {},
		})),
	};

	const drawnLinesGeoJSON = {
		type: "FeatureCollection",
		features: drawnLines,
	};

	// Generate heading cone/sector geometry
	const getHeadingConeGeoJSON = () => {
		if (!userLocation || deviceHeading === null) return null;

		// Create a cone sector (45-degree field of view)
		const coneRadius = 0.005; // ~500m radius at zoom level
		const fov = 45; // Field of view in degrees
		const startAngle = deviceHeading - fov / 2;
		const endAngle = deviceHeading + fov / 2;

		const points = [
			[userLocation.longitude, userLocation.latitude], // Center point
		];

		// Generate arc points
		for (let angle = startAngle; angle <= endAngle; angle += 5) {
			const rad = (angle * Math.PI) / 180;
			const dx = coneRadius * Math.cos(rad);
			const dy = coneRadius * Math.sin(rad);
			points.push([userLocation.longitude + dx, userLocation.latitude + dy]);
		}

		// Close the polygon
		points.push([userLocation.longitude, userLocation.latitude]);

		return {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: {
						type: "Polygon",
						coordinates: [points],
					},
					properties: {},
				},
			],
		};
	};

	// Build proper GeoJSON for user location
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

	// Handle address search
	const handleAddressSearch = async (e) => {
		e.preventDefault();
		if (!searchQuery.trim()) return;

		setSearchLoading(true);
		try {
			const result = await geocodeAddress(searchQuery);
			if (result) {
				logQuery(searchQuery, result);
				const newViewState = {
					latitude: result.latitude,
					longitude: result.longitude,
					zoom: 18,
				};
				setViewState(newViewState);
				console.log("Zoomed to address:", result);
			}
		} catch (error) {
			console.error("Geocoding error:", error);
		} finally {
			setSearchLoading(false);
		}
	};

	// Handle draw line mode
	const handleDrawLineTool = useCallback(() => {
		setDrawMode(!drawMode);
		if (drawMode) {
			// Reset draw mode
			setDrawnPoints([]);
			setDrawnLines([]);
			setSelectedAreaId(null);
		}
		setPinMode(false);
		setShowToolsMenu(false);
	}, [drawMode]);

	// Handle drop pin mode
	const handleDropPinTool = useCallback(() => {
		setPinMode(!pinMode);
		if (pinMode) {
			// Reset pin mode
			setSelectedPinId(null);
		}
		setDrawMode(false);
		setShowToolsMenu(false);
	}, [pinMode]);

	// Distance helper function
	const getDistance = (point1, point2) => {
		const R = 6371e3; // Earth radius in meters
		const φ1 = (point1[1] * Math.PI) / 180;
		const φ2 = (point2[1] * Math.PI) / 180;
		const Δφ = ((point2[1] - point1[1]) * Math.PI) / 180;
		const Δλ = ((point2[0] - point1[0]) * Math.PI) / 180;

		const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	};

	// Handle map click for draw mode
	const handleDrawClick = useCallback(
		(event) => {
			if (!drawMode) return;

			const { lngLat } = event;
			const newPoint = [lngLat.lng, lngLat.lat];

			// Check if this point closes the polygon (connects back to starting point)
			if (drawnPoints.length >= 2) {
				const startPoint = drawnPoints[0];
				const distance = getDistance(newPoint, startPoint);

				// If within 50 meters of starting point, close the polygon (lenient snapping)
				if (distance < 50) {
					// Create polygon feature
					const polygonCoords = [...drawnPoints, startPoint]; // Close the ring
					const areaFeature = {
						type: "Feature",
						id: areaIdRef.current++,
						geometry: {
							type: "Polygon",
							coordinates: [polygonCoords],
						},
						properties: {
							color: "#FF0000",
							fillColor: "#FFFFFF",
							fillOpacity: 0,
							lineOpacity: 1,
							lineWidth: 1,
						},
					};

					// Add to cached areas
					setCachedAreas((prev) => [...prev, areaFeature]);
					setSelectedAreaId(areaFeature.id);

					// Reset draw mode
					setDrawnPoints([]);
					setDrawnLines([]);
					setDrawMode(false);
					return;
				}
			}

			// Normal case: add point and draw line
			setDrawnPoints((prev) => [...prev, newPoint]);

			if (drawnPoints.length > 0) {
				const lastPoint = drawnPoints[drawnPoints.length - 1];
				const newLine = {
					type: "Feature",
					geometry: {
						type: "LineString",
						coordinates: [lastPoint, newPoint],
					},
					properties: {
						color: "#FF0000",
						lineWidth: 1,
					},
				};
				setDrawnLines((prev) => [...prev, newLine]);
			}
		},
		[drawMode, drawnPoints],
	);

	// Handle pin dragging
	const handleMapMouseDown = useCallback(
		(e) => {
			if (!selectedPinId) return;

			// Check if clicking on the selected pin
			const features = e.target.querySourceFeatures("pins", {
				layers: ["pins-layer"],
			});

			if (features && features.length > 0 && features[0].id === selectedPinId) {
				setDraggingPinId(selectedPinId);
				e.target.getCanvas().style.cursor = "grabbing";
			}
		},
		[selectedPinId],
	);

	const handleMapMouseMove = useCallback(
		(e) => {
			if (!draggingPinId) return;

			const { lngLat } = e;
			updatePinCoordinates(draggingPinId, lngLat.lng, lngLat.lat);
		},
		[draggingPinId],
	);

	const handleMapMouseUp = useCallback(() => {
		if (draggingPinId) {
			setDraggingPinId(null);
		}
	}, [draggingPinId]);

	// Map onMove handler for zoom-gated parcel loading
	const handleMapMove = useCallback(
		(evt) => {
			setViewState(evt.viewState);
			if (evt.originalEvent) {
				isUserPanning.current = true;
				setFollowUserLocation(false);
			}

			// Use tile-based system if available and zoomed in enough (zoom 13-20)
			if (tilesManifest && evt.viewState.zoom >= MIN_PARCEL_ZOOM && evt.viewState.zoom <= MAX_PARCEL_ZOOM) {
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

				// Get combined GeoJSON of all visible tiles with viewport culling
				const parcels = getVisibleParcels(viewportBounds);
				if (parcels && parcels.features && parcels.features.length > 0) {
					console.log(
						`🎯 Tile-based display: ${parcels.features.length} parcels visible at zoom ${evt.viewState.zoom.toFixed(1)}`,
					);
					setVisibleParcels(parcels);
				} else {
					console.log("⚠️ No tiles contain data for current viewport");
					setVisibleParcels(null);
				}
			} else {
				// Outside zoom range or no tiles available - hide parcels
				if (evt.viewState.zoom < MIN_PARCEL_ZOOM || evt.viewState.zoom > MAX_PARCEL_ZOOM) {
					console.log(`◀ Zoom ${evt.viewState.zoom.toFixed(1)} outside parcel range - parcels hidden`);
				} else if (!tilesManifest) {
					console.log("📦 Tile manifest not ready yet");
				}
				setVisibleParcels(null);
			}
		},
		[tilesManifest, updateVisibleTiles, getVisibleParcels],
	);

	// Area management functions
	const updateAreaProperty = (areaId, property, value) => {
		setCachedAreas((prev) =>
			prev.map((area) =>
				area.id === areaId ? { ...area, properties: { ...area.properties, [property]: value } } : area,
			),
		);
	};

	const deleteArea = (areaId) => {
		setCachedAreas((prev) => prev.filter((area) => area.id !== areaId));
		if (selectedAreaId === areaId) {
			setSelectedAreaId(null);
		}
	};

	const selectedArea = cachedAreas.find((area) => area.id === selectedAreaId);

	// Pin management functions
	const updatePinProperty = (pinId, property, value) => {
		setPins((prev) =>
			prev.map((pin) => (pin.id === pinId ? { ...pin, properties: { ...pin.properties, [property]: value } } : pin)),
		);
	};

	const updatePinCoordinates = (pinId, lng, lat) => {
		setPins((prev) =>
			prev.map((pin) => (pin.id === pinId ? { ...pin, geometry: { type: "Point", coordinates: [lng, lat] } } : pin)),
		);
	};

	const deletePin = (pinId) => {
		setPins((prev) => prev.filter((pin) => pin.id !== pinId));
		if (selectedPinId === pinId) {
			setSelectedPinId(null);
		}
	};

	const selectedPin = pins.find((pin) => pin.id === selectedPinId);

	// Handle map clicks with area selection support
	const handleMapClickWithAreas = useCallback(
		(e) => {
			if (drawMode) {
				handleDrawClick(e);
				return;
			}

			// Handle pin placement in pin mode
			if (pinMode) {
				const { lngLat } = e;
				const newPin = {
					type: "Feature",
					id: pinIdRef.current++,
					geometry: {
						type: "Point",
						coordinates: [lngLat.lng, lngLat.lat],
					},
					properties: {
						color: "#3B82F6",
						iconType: "trail-camera", // Default icon type
						label: "Pin",
					},
				};
				setPins((prev) => [...prev, newPin]);
				setSelectedPinId(newPin.id);
				// Don't exit pin mode - keep it active to allow multiple pins or editing
				return;
			}

			// Check if clicking on a pin
			const pinFeatures = e.target.querySourceFeatures("pins", {
				layers: ["pins-layer"],
			});

			if (pinFeatures && pinFeatures.length > 0) {
				const clickedPin = pins.find((pin) => pin.id === pinFeatures[0].id);
				if (clickedPin) {
					setSelectedPinId(clickedPin.id);
					return;
				}
			}

			// Check if clicking on a cached area
			const features = e.target.querySourceFeatures("cached-areas", {
				layers: ["cached-areas-fill"],
			});

			if (features && features.length > 0) {
				const clickedArea = cachedAreas.find((area) => area.id === features[0].id);
				if (clickedArea) {
					setSelectedAreaId(clickedArea.id);
					return;
				}
			}

			// Otherwise, handle normal parcel click
			handleMapClick(e);
		},
		[drawMode, pinMode, handleDrawClick, handleMapClick, cachedAreas, pins],
	);

	return (
		<div className="relative w-full h-screen overflow-hidden bg-black">
			{/* Map */}
			<Map
				{...viewState}
				onMove={handleMapMove}
				onClick={handleMapClickWithAreas}
				onMouseDown={handleMapMouseDown}
				onMouseMove={handleMapMouseMove}
				onMouseUp={handleMapMouseUp}
				onMouseLeave={handleMapMouseUp}
				onLoad={(e) => {
					// Map is loaded - icons will render using circle approach
				}}
				mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
				mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
				minZoom={4}
				maxZoom={20}
				cursor={draggingPinId ? "grabbing" : drawMode ? "crosshair" : "pointer"}>
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
								"circle-opacity": 0.75 * (1 - locationPulse),
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

				{/* Heading/Direction Cone */}
				{getHeadingConeGeoJSON() && (
					<Source id="heading-cone" type="geojson" data={getHeadingConeGeoJSON()}>
						<Layer
							id="heading-cone-fill"
							type="fill"
							paint={{
								"fill-color": "#3B82F6",
								"fill-opacity": 0.15,
							}}
						/>
						<Layer
							id="heading-cone-line"
							type="line"
							paint={{
								"line-color": "#3B82F6",
								"line-width": 2,
								"line-opacity": 0.4,
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

				{/* Drawn Lines */}
				{drawnLines.length > 0 && (
					<Source id="drawn-lines" type="geojson" data={drawnLinesGeoJSON}>
						<Layer
							id="drawn-lines-layer"
							type="line"
							paint={{
								"line-color": ["get", "color", ["object", ["get", "properties"]]],
								"line-width": ["get", "lineWidth", ["object", ["get", "properties"]]],
								"line-opacity": 1,
							}}
						/>
					</Source>
				)}

				{/* Drawn Points */}
				{drawnPoints.length > 0 && (
					<Source id="drawn-points" type="geojson" data={drawnPointsGeoJSON}>
						<Layer
							id="drawn-points-layer"
							type="circle"
							paint={{
								"circle-radius": 6,
								"circle-color": "#FF0000",
								"circle-stroke-color": "#FFFFFF",
								"circle-stroke-width": 2,
								"circle-opacity": 1,
							}}
						/>
					</Source>
				)}
				{cachedAreas.length > 0 && (
					<Source
						id="cached-areas"
						type="geojson"
						data={{
							type: "FeatureCollection",
							features: cachedAreas,
						}}>
						{/* Area fills */}
						<Layer
							id="cached-areas-fill"
							type="fill"
							paint={{
								"fill-color": ["get", "fillColor"],
								"fill-opacity": ["get", "fillOpacity"],
							}}
						/>
						{/* Area borders */}
						<Layer
							id="cached-areas-line"
							type="line"
							paint={{
								"line-color": ["get", "color"],
								"line-width": ["get", "lineWidth"],
								"line-opacity": ["get", "lineOpacity"],
							}}
						/>
						{/* Selected area highlight */}
						{selectedAreaId !== null && (
							<Layer
								id="cached-areas-selected"
								type="line"
								filter={["==", ["id"], selectedAreaId]}
								paint={{
									"line-color": "#FFFFFF",
									"line-width": 4,
									"line-opacity": 1,
									"line-dasharray": [4, 2],
								}}
							/>
						)}
					</Source>
				)}

				{/* Pins */}
				{pins.length > 0 && (
					<Source
						id="pins"
						type="geojson"
						data={{
							type: "FeatureCollection",
							features: pins,
						}}>
						<Layer
							id="pins-layer"
							type="circle"
							paint={{
								"circle-radius": [
									"case",
									["==", ["get", "iconType"], "deer-stand"],
									14,
									12,
								],
								"circle-color": ["get", "color"],
								"circle-stroke-color": "#FFFFFF",
								"circle-stroke-width": 2,
								"circle-opacity": 0.85,
							}}
						/>
						{/* Icon type labels */}
						<Layer
							id="pins-label"
							type="symbol"
							layout={{
								"text-field": [
									"case",
									["==", ["get", "iconType"], "trail-camera"],
									"📷",
									["==", ["get", "iconType"], "buck"],
									"🦌",
									["==", ["get", "iconType"], "turkey"],
									"🦃",
									["==", ["get", "iconType"], "deer-stand"],
									"🏗",
									"📍",
								],
								"text-size": 14,
								"text-offset": [0, 0],
								"text-allow-overlap": true,
							}}
							paint={{
								"text-opacity": 1,
								"text-color": "#FFFFFF",
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
			<div className="absolute top-0 left-0 right-0 p-3 md:p-6 z-10 flex items-center gap-4">
				<img src="/logo.png" alt="Landshake" className="w-auto" style={{ height: "60px" }} />

				{/* Address Search - Hidden by default, shows on toggle */}
				{showSearchInput ? (
					<form onSubmit={handleAddressSearch} className="flex-1 flex items-center gap-1 md:gap-2">
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search address (e.g., 123 Main St)"
							className="flex-1 px-2 py-1.5 md:px-4 md:py-2 text-sm md:text-base rounded-lg bg-white/90 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-green"
							disabled={searchLoading || isLoading}
							autoFocus
						/>
						<button
							type="submit"
							disabled={searchLoading || isLoading || !searchQuery.trim()}
							className="px-2 py-1.5 md:px-4 md:py-2 text-sm md:text-base bg-neon-green text-black font-semibold rounded-lg hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition">
							{searchLoading ? "..." : "Search"}
						</button>
						<button
							type="button"
							onClick={() => setShowSearchInput(false)}
							className="px-2 py-1.5 md:px-4 md:py-2 text-sm md:text-base bg-black/80 backdrop-blur-sm border border-neon-green rounded-lg text-neon-green hover:bg-neon-green hover:text-black transition-all">
							✕
						</button>
					</form>
				) : (
					<button
						onClick={() => setShowSearchInput(true)}
						className="px-3 py-1.5 md:px-4 md:py-2 bg-black/80 backdrop-blur-sm border border-neon-green rounded-lg text-neon-green hover:bg-neon-green hover:text-black transition-all text-xl">
						🔍
					</button>
				)}
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
						<span className="text-sm text-gray-300">Loading parcels...</span>
					</div>
				</div>
			)}

			{/* Weather Widget - Top Right */}
			{weatherData && (
				<div className="absolute top-6 right-6 z-20 bg-black/70 backdrop-blur-md border border-neon-green/30 rounded-lg p-4 text-center min-w-24">
					<div className="flex flex-col items-center gap-1">
						{/* Weather Icon */}
						<div className="text-4xl">
							{weatherData.icon.includes("01")
								? "☀️"
								: weatherData.icon.includes("02")
									? "⛅"
									: weatherData.icon.includes("03") || weatherData.icon.includes("04")
										? "☁️"
										: weatherData.icon.includes("09") || weatherData.icon.includes("10")
											? "🌧️"
											: weatherData.icon.includes("11")
												? "⛈️"
												: weatherData.icon.includes("13")
													? "❄️"
													: "🌡️"}
						</div>
						{/* Temperature */}
						<div className="text-neon-green text-xl font-bold">{weatherData.temp}°F</div>
						{/* Wind Arrow */}
						<div className="text-gray-400 text-3xl" style={{ transform: `rotate(${weatherData.wind.deg}deg)` }}>
							↑
						</div>
						{/* Wind Speed */}
						<div className="text-gray-400 text-xs">{weatherData.wind.speed} mph</div>
					</div>
				</div>
			)}

			{/* Error Messages */}
			{locationError && (
				<div className="absolute top-24 left-6 right-6 md:left-12 md:right-auto md:w-80 bg-red-900/90 backdrop-blur-md rounded-lg p-4 z-10">
					<p className="text-red-100 text-sm">{locationError}</p>
				</div>
			)}

			{/* Follow Location Button */}
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

			{/* Admin Panel - Conditional Render */}
			{showAdminPanel && <AdminPanel onLocationClick={handleAdminLocationClick} />}

			{/* Debug Panel - Conditional Render */}
			{showDebugPanel && (
				<DebugPanel
					viewState={viewState}
					selectedParcel={selectedParcel}
					userLocation={userLocation}
					onClose={() => setShowDebugPanel(false)}
				/>
			)}

			{/* Bottom Navigation */}
			<div
				className="fixed left-0 right-0 z-40 px-4 py-3 space-y-2"
				style={{
					bottom: "max(0px, env(safe-area-inset-bottom, 0px))",
				}}>
				{/* Tools Menu (Secondary Nav) - Appears First */}
				{showToolsMenu && (
					<div className="bg-black/70 border border-neon-green/30 rounded-lg backdrop-blur-md p-3">
						<div className="flex gap-2 flex-wrap justify-center">
							<button
								onClick={handleDrawLineTool}
								className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
									drawMode
										? "bg-orange-500 text-black"
										: "bg-black/50 border border-orange-500/50 text-orange-400 hover:bg-orange-500/20"
								}`}>
								{drawMode ? "✓ Draw Area" : "Draw Area"}
							</button>
							<button
								onClick={handleDropPinTool}
								className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
									pinMode
										? "bg-blue-500 text-black"
										: "bg-black/50 border border-blue-500/50 text-blue-400 hover:bg-blue-500/20"
								}`}>
								{pinMode ? "✓ Drop Pin" : "Drop Pin"}
							</button>
						</div>
					</div>
				)}

				{/* Area Editing Menu - Appears if Area Selected */}
				{selectedArea && (
					<div className="bg-black/70 border border-amber-500/30 rounded-lg backdrop-blur-md p-3">
						<div className="space-y-2">
							<p className="text-xs text-amber-400 text-center font-semibold">Area Editor</p>
							<div className="flex gap-2 flex-wrap justify-center">
								{/* Line Color */}
								<div className="flex items-center gap-2">
									<label className="text-xs text-gray-400">Line:</label>
									<input
										type="color"
										value={selectedArea.properties.color}
										onChange={(e) => updateAreaProperty(selectedAreaId, "color", e.target.value)}
										className="w-8 h-8 rounded cursor-pointer"
										title="Line Color"
									/>
								</div>

								{/* Fill Color */}
								<div className="flex items-center gap-2">
									<label className="text-xs text-gray-400">Fill:</label>
									<input
										type="color"
										value={selectedArea.properties.fillColor}
										onChange={(e) => updateAreaProperty(selectedAreaId, "fillColor", e.target.value)}
										className="w-8 h-8 rounded cursor-pointer"
										title="Fill Color"
									/>
								</div>

								{/* Opacity */}
								<div className="flex items-center gap-2">
									<label className="text-xs text-gray-400">Opacity:</label>
									<input
										type="range"
										min="0"
										max="1"
										step="0.1"
										value={selectedArea.properties.fillOpacity}
										onChange={(e) => updateAreaProperty(selectedAreaId, "fillOpacity", parseFloat(e.target.value))}
										className="w-16 h-1.5 rounded cursor-pointer"
										title="Fill Opacity"
									/>
								</div>

								{/* Save & Delete Buttons */}
								<div className="flex gap-2 justify-center">
									<button
										onClick={() => {
											setSelectedAreaId(null);
											setDrawMode(false);
										}}
										className="flex-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-600/70 border border-green-500/50 text-green-100 hover:bg-green-600 transition">
										Save
									</button>
									<button
										onClick={() => deleteArea(selectedAreaId)}
										className="flex-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-600/70 border border-red-500/50 text-red-100 hover:bg-red-600 transition">
										Delete
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Pin Editing Menu - Appears if Pin Selected */}
				{selectedPin && (
					<div className="bg-black/70 border border-blue-500/30 rounded-lg backdrop-blur-md p-3">
						<div className="space-y-2">
							<p className="text-xs text-blue-400 text-center font-semibold">Pin Editor</p>
							<div className="space-y-2">
								{/* Pin Color */}
								<div className="flex items-center gap-2 justify-center">
									<label className="text-xs text-gray-400">Color:</label>
									<input
										type="color"
										value={selectedPin.properties.color}
										onChange={(e) => updatePinProperty(selectedPinId, "color", e.target.value)}
										className="w-8 h-8 rounded cursor-pointer"
										title="Pin Color"
									/>
								</div>

								{/* Icon Type Selection */}
								<div className="flex flex-wrap gap-2 justify-center">
									<p className="text-xs text-gray-400 w-full text-center">Icon Type:</p>
									<button
										onClick={() => updatePinProperty(selectedPinId, "iconType", "trail-camera")}
										className={`px-3 py-1.5 rounded-lg text-xs transition font-semibold ${
											selectedPin.properties.iconType === "trail-camera"
												? "bg-blue-500 text-black"
												: "bg-black/50 border border-blue-500/50 hover:bg-blue-500/20"
										}`}
										title="Trail Camera">
										🎥
									</button>
									<button
										onClick={() => updatePinProperty(selectedPinId, "iconType", "buck")}
										className={`px-3 py-1.5 rounded-lg text-xs transition font-semibold ${
											selectedPin.properties.iconType === "buck"
												? "bg-blue-500 text-black"
												: "bg-black/50 border border-blue-500/50 hover:bg-blue-500/20"
										}`}
										title="Buck">
										🦌
									</button>
									<button
										onClick={() => updatePinProperty(selectedPinId, "iconType", "turkey")}
										className={`px-3 py-1.5 rounded-lg text-xs transition font-semibold ${
											selectedPin.properties.iconType === "turkey"
												? "bg-blue-500 text-black"
												: "bg-black/50 border border-blue-500/50 hover:bg-blue-500/20"
										}`}
										title="Turkey">
										🦃
									</button>
									<button
										onClick={() => updatePinProperty(selectedPinId, "iconType", "deer-stand")}
										className={`px-3 py-1.5 rounded-lg text-xs transition font-semibold ${
											selectedPin.properties.iconType === "deer-stand"
												? "bg-blue-500 text-black"
												: "bg-black/50 border border-blue-500/50 hover:bg-blue-500/20"
										}`}
										title="Deer Stand">
										🏗️
									</button>
								</div>

								{/* Label / Name */}
								<div className="flex items-center gap-2 justify-center">
									<label className="text-xs text-gray-400">Label:</label>
									<input
										type="text"
										value={selectedPin.properties.label}
										onChange={(e) => updatePinProperty(selectedPinId, "label", e.target.value)}
										placeholder="Pin label"
										className="px-2 py-1 text-xs rounded bg-gray-800 border border-blue-500/30 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-24"
									/>
								</div>

								{/* Save & Delete Buttons */}
								<div className="flex gap-2 justify-center">
									<button
										onClick={() => {
											setSelectedPinId(null);
											setPinMode(false);
										}}
										className="flex-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-600/70 border border-green-500/50 text-green-100 hover:bg-green-600 transition">
										Save
									</button>
									<button
										onClick={() => deletePin(selectedPinId)}
										className="flex-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-600/70 border border-red-500/50 text-red-100 hover:bg-red-600 transition">
										Delete
									</button>
								</div>
							</div>
						</div>
					</div>
				)}
				<div className="bg-gradient-to-t from-black/90 to-transparent border-t border-neon-green/30 flex gap-4 justify-center items-center pt-3">
					{/* Debug Button */}
					<button
						onClick={() => setShowDebugPanel(!showDebugPanel)}
						className={`px-4 py-2 rounded-lg font-semibold transition ${
							showDebugPanel
								? "bg-neon-green text-black"
								: "bg-black/50 border border-neon-green/50 text-neon-green hover:bg-neon-green/20"
						}`}>
						DEBUG
					</button>

					{/* Tools Button */}
					<button
						onClick={() => {
							setShowToolsMenu(!showToolsMenu);
							setActiveNav("tools");
						}}
						className={`px-4 py-2 rounded-lg font-semibold transition ${
							activeNav === "tools"
								? "bg-neon-green text-black"
								: "bg-black/50 border border-neon-green/50 text-neon-green hover:bg-neon-green/20"
						}`}>
						TOOLS {showToolsMenu && "▼"}
					</button>

					{/* Admin Button */}
					<button
						onClick={() => setShowAdminPanel(!showAdminPanel)}
						className={`px-4 py-2 rounded-lg font-semibold transition ${
							showAdminPanel
								? "bg-neon-green text-black"
								: "bg-black/50 border border-neon-green/50 text-neon-green hover:bg-neon-green/20"
						}`}>
						ADMIN
					</button>
				</div>
			</div>
		</div>
	);
}

export default App;
