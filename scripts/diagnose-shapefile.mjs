import fs from "fs";
import path from "path";
import shp from "shpjs";

const workspaceRoot = process.cwd();
const zipPath = path.join(workspaceRoot, "public", "data", "CC_Parcels.zip");

console.log("Reading shapefile from:", zipPath);

const buffer = fs.readFileSync(zipPath);
const geojson = await shp(buffer);

if (geojson && geojson.features.length > 0) {
	const f = geojson.features[0];
	console.log("\nFirst feature:");
	console.log("Geometry type:", f.geometry.type);

	if (f.geometry.bbox) {
		console.log("Feature bbox:", f.geometry.bbox);
	}

	if (f.geometry.coordinates && f.geometry.coordinates[0]) {
		console.log("First 3 coordinates from first ring:");
		console.log(f.geometry.coordinates[0].slice(0, 3));

		// Check bounds
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		f.geometry.coordinates[0].forEach((c) => {
			minX = Math.min(minX, c[0]);
			maxX = Math.max(maxX, c[0]);
			minY = Math.min(minY, c[1]);
			maxY = Math.max(maxY, c[1]);
		});
		console.log(
			"Feature bounds - X:",
			minX.toFixed(2),
			"to",
			maxX.toFixed(2),
			"Y:",
			minY.toFixed(2),
			"to",
			maxY.toFixed(2),
		);
	}

	// Check all features to understand data range
	let globalMinX = Infinity,
		globalMaxX = -Infinity,
		globalMinY = Infinity,
		globalMaxY = -Infinity;
	geojson.features.forEach((feat) => {
		if (feat.geometry && feat.geometry.coordinates) {
			const coords = feat.geometry.type === "Polygon" ? feat.geometry.coordinates[0] : [];
			coords.forEach((c) => {
				globalMinX = Math.min(globalMinX, c[0]);
				globalMaxX = Math.max(globalMaxX, c[0]);
				globalMinY = Math.min(globalMinY, c[1]);
				globalMaxY = Math.max(globalMaxY, c[1]);
			});
		}
	});

	console.log("\nAll features bounds:");
	console.log("X range:", globalMinX.toFixed(0), "to", globalMaxX.toFixed(0));
	console.log("Y range:", globalMinY.toFixed(0), "to", globalMaxY.toFixed(0));
	console.log("Total features:", geojson.features.length);

	// Figure out what coordinate system this is
	const rangeX = globalMaxX - globalMinX;
	const rangeY = globalMaxY - globalMinY;
	console.log("\nCoordinate system analysis:");
	console.log("X range magnitude:", rangeX.toFixed(0));
	console.log("Y range magnitude:", rangeY.toFixed(0));

	if (rangeX > 10000 && rangeY > 10000) {
		console.log("→ Likely in feet/meters (State Plane or projected CRS)");
	} else if (rangeX < 1 && rangeY < 1) {
		console.log("→ Likely in degrees (WGS84)");
	}
}
