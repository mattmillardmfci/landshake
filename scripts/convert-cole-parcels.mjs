import fs from "fs";
import path from "path";
import shp from "shpjs";
import proj4 from "proj4";

const workspaceRoot = process.cwd();
const zipPath = path.join(workspaceRoot, "public", "data", "CC_Parcels.zip");
const outputPath = path.join(workspaceRoot, "public", "data", "cole_parcels.geojson");

if (!fs.existsSync(zipPath)) {
	console.error("Parcel ZIP not found:", zipPath);
	process.exit(1);
}

proj4.defs(
	"EPSG:102696",
	"+proj=tmerc +lat_0=35.83333333333334 +lon_0=-92.5 +k=0.9999333333333333 +x_0=1640416.666666667 +y_0=0 +datum=NAD83 +units=us-ft +no_defs",
);

const projectCoordinate = ([x, y]) => proj4("EPSG:102696", "EPSG:4326", [x, y]);

const updateBbox = (bbox, [lng, lat]) => {
	bbox[0] = Math.min(bbox[0], lng);
	bbox[1] = Math.min(bbox[1], lat);
	bbox[2] = Math.max(bbox[2], lng);
	bbox[3] = Math.max(bbox[3], lat);
};

const reprojectRing = (ring, bbox) =>
	ring.map((coordinate) => {
		const projected = projectCoordinate(coordinate);
		updateBbox(bbox, projected);
		return projected;
	});

const reprojectGeometry = (geometry) => {
	if (!geometry) {
		return { geometry: null, bbox: null };
	}

	const bbox = [Infinity, Infinity, -Infinity, -Infinity];

	switch (geometry.type) {
		case "Polygon":
			return {
				geometry: {
					...geometry,
					coordinates: geometry.coordinates.map((ring) => reprojectRing(ring, bbox)),
				},
				bbox,
			};
		case "MultiPolygon":
			return {
				geometry: {
					...geometry,
					coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => reprojectRing(ring, bbox))),
				},
				bbox,
			};
		case "Point": {
			const projected = projectCoordinate(geometry.coordinates);
			updateBbox(bbox, projected);
			return {
				geometry: { ...geometry, coordinates: projected },
				bbox,
			};
		}
		default:
			return { geometry, bbox: null };
	}
};

const normalizeProperties = (properties) => {
	const owner =
		properties?.OWNER ??
		properties?.OWNER_NAME ??
		properties?.OWNERNAME ??
		properties?.OWNERNME1 ??
		properties?.OWNER1 ??
		properties?.OWN_NAME ??
		null;

	const parcelId =
		properties?.PARCEL_ID ??
		properties?.PARCELID ??
		properties?.PIN ??
		properties?.PARCEL ??
		properties?.OBJECTID ??
		properties?.OBJECTID_1 ??
		properties?.OBJECTID_2 ??
		"N/A";

	const acres =
		properties?.ACRES_CALC ??
		properties?.ACRES ??
		properties?.ACREAGE ??
		properties?.ACRES_1 ??
		properties?.CALC_ACRE ??
		0;

	return {
		...properties,
		OWNER: owner,
		OWNER_NAME: owner,
		ACRES_CALC: acres,
		PARCEL_ID: parcelId,
	};
};

const buffer = fs.readFileSync(zipPath);

const geojson = await shp(buffer);

if (!geojson || geojson.type !== "FeatureCollection") {
	console.error("Unexpected GeoJSON format.");
	process.exit(1);
}

const converted = {
	...geojson,
	features: geojson.features.map((feature) => {
		const { geometry, bbox } = reprojectGeometry(feature.geometry);
		return {
			...feature,
			geometry,
			properties: {
				...normalizeProperties(feature.properties),
				__bbox: bbox && bbox.every((value) => Number.isFinite(value)) ? bbox : null,
				selected: false,
			},
		};
	}),
};

fs.writeFileSync(outputPath, JSON.stringify(converted));
console.log("Wrote GeoJSON:", outputPath);
