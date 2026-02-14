import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Hook for viewport-based parcel tile loading with caching and preloading.
 */
const useTileBasedParcels = () => {
	const [visibleTiles, setVisibleTiles] = useState(new Set());
	const [tileCache, setTileCache] = useState(new Map());
	const [tilesManifest, setTilesManifest] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const manifestLoadedRef = useRef(false);
	const tileCacheRef = useRef(new Map());
	const visibleTilesRef = useRef(new Set());
	const inflightLoadsRef = useRef(new Map());

	useEffect(() => {
		if (manifestLoadedRef.current) return;
		manifestLoadedRef.current = true;

		const loadManifest = async () => {
			try {
				const response = await fetch("/data/tiles.json");
				if (!response.ok) throw new Error(`Failed to load manifest: ${response.status}`);
				const manifest = await response.json();
				setTilesManifest(manifest);
			} catch (err) {
				console.error("Failed to load tile manifest:", err);
				setError(err.message);
			}
		};

		loadManifest();
	}, []);

	const getTilesForViewport = useCallback(
		(bounds) => {
			if (!tilesManifest) return [];

			const intersectingTiles = [];
			for (const tile of tilesManifest.tiles) {
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
		},
		[tilesManifest],
	);

	const getSurroundingTiles = useCallback(
		(col, row) => {
			const surrounding = [];
			for (let c = col - 1; c <= col + 1; c++) {
				for (let r = row - 1; r <= row + 1; r++) {
					if (c === col && r === row) continue;
					const exists = tilesManifest?.tiles?.some((t) => t.col === c && t.row === r);
					if (exists) {
						surrounding.push(`${c}_${r}`);
					}
				}
			}
			return surrounding;
		},
		[tilesManifest],
	);

	const loadTile = useCallback(
		async (tileId) => {
			if (tileCacheRef.current.has(tileId)) {
				return tileCacheRef.current.get(tileId);
			}

			if (inflightLoadsRef.current.has(tileId)) {
				return inflightLoadsRef.current.get(tileId);
			}

			const tile = tilesManifest?.tiles.find((t) => `${t.col}_${t.row}` === tileId);
			if (!tile) {
				return null;
			}

			const loadPromise = (async () => {
				try {
					const response = await fetch(`/data/tiles/${tile.file}`);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const tileData = await response.json();
					tileCacheRef.current.set(tileId, tileData);
					setTileCache(new Map(tileCacheRef.current));
					return tileData;
				} catch (err) {
					console.error(`Failed to load tile ${tileId}:`, err);
					return null;
				} finally {
					inflightLoadsRef.current.delete(tileId);
				}
			})();

			inflightLoadsRef.current.set(tileId, loadPromise);
			return loadPromise;
		},
		[tilesManifest],
	);

	const updateVisibleTiles = useCallback(
		async (viewportBounds) => {
			if (!tilesManifest) return;

			const visibleTileIds = getTilesForViewport(viewportBounds);
			const nextVisibleSet = new Set(visibleTileIds);

			let hasChanges = false;
			if (visibleTilesRef.current.size !== nextVisibleSet.size) {
				hasChanges = true;
			} else {
				for (const tileId of nextVisibleSet) {
					if (!visibleTilesRef.current.has(tileId)) {
						hasChanges = true;
						break;
					}
				}
			}

			const visibleMissing = visibleTileIds.filter((tileId) => !tileCacheRef.current.has(tileId));
			if (visibleMissing.length > 0) {
				setLoading(true);
				await Promise.all(visibleMissing.map((tileId) => loadTile(tileId)));
				setLoading(false);
			}

			if (hasChanges) {
				visibleTilesRef.current = nextVisibleSet;
				setVisibleTiles(nextVisibleSet);
			}

			const surroundingTileIds = new Set();
			for (const tileId of visibleTileIds) {
				const [col, row] = tileId.split("_").map(Number);
				const surrounding = getSurroundingTiles(col, row);
				surrounding.forEach((t) => surroundingTileIds.add(t));
			}

			for (const tileId of surroundingTileIds) {
				if (!tileCacheRef.current.has(tileId)) {
					loadTile(tileId);
				}
			}
		},
		[tilesManifest, getTilesForViewport, getSurroundingTiles, loadTile],
	);

	const getVisibleParcels = useCallback(
		(viewportBounds = null) => {
			const allFeatures = [];

			for (const tileId of visibleTiles) {
				const tileData = tileCacheRef.current.get(tileId);
				if (tileData?.features) {
					allFeatures.push(...tileData.features);
				}
			}

			if (allFeatures.length === 0) {
				return null;
			}

			let filteredFeatures = allFeatures;
			if (viewportBounds) {
				filteredFeatures = allFeatures.filter((feature) => {
					const geometry = feature.geometry;
					if (!geometry || !geometry.coordinates) return false;

					const coords =
						geometry.type === "MultiPolygon" ? geometry.coordinates.flat(2) : geometry.coordinates.flat(1);

					return coords.some((coord) => {
						const [lng, lat] = coord;
						return (
							lng >= viewportBounds.minLng &&
							lng <= viewportBounds.maxLng &&
							lat >= viewportBounds.minLat &&
							lat <= viewportBounds.maxLat
						);
					});
				});
			}

			return {
				type: "FeatureCollection",
				features: filteredFeatures,
			};
		},
		[visibleTiles],
	);

	const clearCache = useCallback(() => {
		tileCacheRef.current = new Map();
		visibleTilesRef.current = new Set();
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
