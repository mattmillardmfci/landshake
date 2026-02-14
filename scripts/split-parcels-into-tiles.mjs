/**
 * Split Cole County parcels into geographic tiles
 * Creates a grid of smaller GeoJSON files for efficient viewport-based loading
 */

import fs from "fs";
import path from "path";

const GEOJSON_PATH = "./public/data/cole_parcels.geojson";
const TILES_DIR = "./public/data/tiles";
const TILES_MANIFEST = "./public/data/tiles.json";

// Cole County bounds
const COLE_BOUNDS = {
	minLng: -92.55,
	maxLng: -91.73,
	minLat: 38.35,
	maxLat: 38.79,
};

// Create a 4x4 grid (16 tiles)
const GRID_COLS = 4;
const GRID_ROWS = 4;

function tileCoordToBbox(col, row) {
	const tileWidth = (COLE_BOUNDS.maxLng - COLE_BOUNDS.minLng) / GRID_COLS;
	const tileHeight = (COLE_BOUNDS.maxLat - COLE_BOUNDS.minLat) / GRID_ROWS;

	return {
		minLng: COLE_BOUNDS.minLng + col * tileWidth,
		maxLng: COLE_BOUNDS.minLng + (col + 1) * tileWidth,
		minLat: COLE_BOUNDS.minLat + row * tileHeight,
		maxLat: COLE_BOUNDS.minLat + (row + 1) * tileHeight,
	};
}

function pointInBbox(lat, lng, bbox) {
	return lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
}

function featureInBbox(feature, bbox) {
	const bbox_prop = feature.properties?.__bbox;
	if (!bbox_prop) return false;

	// bbox format: [minLng, minLat, maxLng, maxLat]
	return !(bbox_prop[2] < bbox.minLng || bbox_prop[0] > bbox.maxLng || bbox_prop[3] < bbox.minLat || bbox_prop[1] > bbox.maxLat);
}

async function splitParcels() {
	console.log("📂 Loading full parcel dataset...");
	const rawData = fs.readFileSync(GEOJSON_PATH, "utf-8");
	const data = JSON.parse(rawData);

	if (!data.features) {
		throw new Error("Invalid GeoJSON: missing features");
	}

	console.log(`📊 Total parcels: ${data.features.length}`);

	// Create tiles directory
	if (!fs.existsSync(TILES_DIR)) {
		fs.mkdirSync(TILES_DIR, { recursive: true });
	}

	const manifest = {
		bounds: COLE_BOUNDS,
		grid: { cols: GRID_COLS, rows: GRID_ROWS },
		tiles: [],
	};

	let totalFeaturesInTiles = 0;

	// Create each tile
	for (let row = 0; row < GRID_ROWS; row++) {
		for (let col = 0; col < GRID_COLS; col++) {
			const tileBbox = tileCoordToBbox(col, row);
			const tileFeatures = data.features.filter((feature) => featureInBbox(feature, tileBbox));

			if (tileFeatures.length === 0) {
				console.log(`  Tile [${col},${row}]: 0 parcels (skipping)`);
				continue;
			}

			const tileGeojson = {
				type: "FeatureCollection",
				features: tileFeatures,
			};

			const filename = `tile_${col}_${row}.geojson`;
			const filepath = path.join(TILES_DIR, filename);
			fs.writeFileSync(filepath, JSON.stringify(tileGeojson));

			const filesize = fs.statSync(filepath).size / 1024; // KB
			console.log(`  Tile [${col},${row}]: ${tileFeatures.length} parcels (${filesize.toFixed(0)}KB)`);

			manifest.tiles.push({
				col,
				row,
				file: filename,
				bounds: tileBbox,
				featureCount: tileFeatures.length,
			});

			totalFeaturesInTiles += tileFeatures.length;
		}
	}

	// Write manifest
	fs.writeFileSync(TILES_MANIFEST, JSON.stringify(manifest, null, 2));

	console.log(`\n✅ Tile generation complete!`);
	console.log(`  Tiles created: ${manifest.tiles.length}`);
	console.log(`  Total features in tiles: ${totalFeaturesInTiles}`);
	console.log(`  Manifest saved to: ${TILES_MANIFEST}`);
}

splitParcels().catch(console.error);
