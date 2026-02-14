import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Hook for viewport-based parcel tile loading with caching and preloading
 */
const useTileBasedParcels = () => {
	const [visibleTiles, setVisibleTiles] = useState(new Set());
	const [tileCache, setTileCache] = useState(new Map());
	const [tilesManifest, setTilesManifest] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const manifestLoadedRef = useRef(false);

	// Load tiles manifest on mount
	useEffect(() => {
		if (manifestLoadedRef.current) return;
		manifestLoadedRef.current = true;

		const loadManifest = async () => {
			try {
				console.log("📋 Loading tiles manifest...");
				const response = await fetch("/data/tiles.json");
				if (!response.ok) throw new Error(`Failed to load manifest: ${response.status}`);
				
				const manifest = await response.json();
				console.log(`📋 Manifest loaded: ${manifest.tiles.length} tiles available`);
				console.log("🗂️ Tile grid:", manifest.grid.cols, "x", manifest.grid.rows);
				console.log("📍 Bounds:", manifest.bounds);
				
				setTilesManifest(manifest);
			} catch (err) {
				console.error("❌ Failed to load tile manifest:", err);
				setError(err.message);
			}
		};

		loadManifest();
	}, []);

	/**
	 * Determine which tiles intersect with the given viewport bounds
	 */
	const getTilesForViewport = useCallback((bounds) => {
		if (!tilesManifest) return [];

		const intersectingTiles = [];
		for (const tile of tilesManifest.tiles) {
			// Check if tile bounds intersect with viewport bounds
			const intersects = !(
				bounds.maxLng < tile.bounds.minLng ||
				bounds.minLng > tile.bounds.maxLng ||
				bounds.maxLat < tile.bounds.minLat ||
				bounds.minLat > tile.bounds.maxLat
			);

			if (intersects) {
				intersectingTiles.push(`${tile.col}_${tile.row}`);
			}
		}

		return intersectingTiles;
	}, [tilesManifest]);

	/**
	 * Get neighboring tiles for preloading (8 surrounding tiles)
	 */
	const getSurroundingTiles = useCallback((col, row) => {
		const surrounding = [];
		for (let c = col - 1; c <= col + 1; c++) {
			for (let r = row - 1; r <= row + 1; r++) {
				if (c === col && r === row) continue; // Skip the center tile
				
				// Check if tile exists in manifest
				const exists = tilesManifest?.tiles?.some(t => t.col === c && t.row === r);
				if (exists) {
					surrounding.push(`${c}_${r}`);
				}
			}
		}
		return surrounding;
	}, [tilesManifest]);

	/**
	 * Load a single tile and cache it
	 */
	const loadTile = useCallback(async (tileId) => {
		// Check cache first
		if (tileCache.has(tileId)) {
			console.log(`💾 Using cached tile: ${tileId}`);
			return tileCache.get(tileId);
		}

		const tile = tilesManifest?.tiles.find(t => `${t.col}_${t.row}` === tileId);
		if (!tile) {
			console.warn(`⚠️ Tile not found in manifest: ${tileId}`);
			return null;
		}

		try {
			console.log(`📥 Loading tile: ${tileId} (${tile.featureCount} features)`);
			const response = await fetch(`/data/tiles/${tile.file}`);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			
			const tileData = await response.json();
			
			// Cache the tile
			const newCache = new Map(tileCache);
			newCache.set(tileId, tileData);
			setTileCache(newCache);
			
			console.log(`✅ Tile cached: ${tileId}`);
			return tileData;
		} catch (err) {
			console.error(`❌ Failed to load tile ${tileId}:`, err);
			return null;
		}
	}, [tileCache, tilesManifest]);

	/**
	 * Update visible tiles based on viewport bounds
	 * Handles loading visible tiles and preloading surround tiles
	 */
	const updateVisibleTiles = useCallback(async (viewportBounds) => {
		if (!tilesManifest) return;

		setLoading(true);
		
		// Get tiles that intersect viewport
		const visibleTileIds = getTilesForViewport(viewportBounds);
		console.log(`🗺️ Viewport visible tiles: ${visibleTileIds.length} tiles`);

		// Get surrounding tiles for preloading
		let surroundingTileIds = new Set();
		for (const tileId of visibleTileIds) {
			const [col, row] = tileId.split("_").map(Number);
			const surrounding = getSurroundingTiles(col, row);
			surrounding.forEach(t => surroundingTileIds.add(t));
		}
		
		console.log(`📍 Surrounding tiles for preload: ${surroundingTileIds.size} tiles`);

		// Load visible tiles first
		const loadPromises = [];
		for (const tileId of visibleTileIds) {
			loadPromises.push(loadTile(tileId));
		}

		// Load visible tiles
		await Promise.all(loadPromises);
		setVisibleTiles(new Set(visibleTileIds));

		// Preload surrounding tiles in background
		for (const tileId of surroundingTileIds) {
			if (!tileCache.has(tileId)) {
				// Don't await - let it load in background
				loadTile(tileId);
			}
		}

		setLoading(false);
	}, [tilesManifest, getTilesForViewport, getSurroundingTiles, loadTile, tileCache]);

	/**
	 * Get combined GeoJSON from all visible cached tiles
	 */
	const getVisibleParcels = useCallback(() => {
		const allFeatures = [];

		for (const tileId of visibleTiles) {
			const tileData = tileCache.get(tileId);
			if (tileData?.features) {
				allFeatures.push(...tileData.features);
			}
		}

		if (allFeatures.length === 0) {
			console.log("⏳ No tiles loaded yet");
			return null;
		}

		console.log(`📊 Combining ${allFeatures.length} features from ${visibleTiles.size} tiles`);

		return {
			type: "FeatureCollection",
			features: allFeatures,
		};
	}, [visibleTiles, tileCache]);

	/**
	 * Clear cache to free memory
	 */
	const clearCache = useCallback(() => {
		console.log("🗑️ Clearing tile cache");
		setTileCache(new Map());
		setVisibleTiles(new Set());
	}, []);

	return {
		visibleTiles,
		tileCache,
		tilesManifest,
		loading,
		error,
		updateVisibleTiles,
		getVisibleParcels,
		clearCache,
	};
};

export default useTileBasedParcels;
