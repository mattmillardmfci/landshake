import fs from "fs";
import path from "path";
import shp from "shpjs";

const workspaceRoot = process.cwd();
const zipPath = path.join(workspaceRoot, "public", "data", "CC_Parcels.zip");
const outputPath = path.join(workspaceRoot, "public", "data", "cole_parcels.geojson");

if (!fs.existsSync(zipPath)) {
	console.error("Parcel ZIP not found:", zipPath);
	process.exit(1);
}

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

console.log("Converting shapefile to GeoJSON...");
const geojson = await shp(buffer);

if (!geojson || geojson.type !== "FeatureCollection") {
	console.error("Unexpected GeoJSON format.");
	process.exit(1);
}

// shpjs already outputs in WGS84, so just normalize properties
const converted = {
	...geojson,
	features: geojson.features.map((feature) => {
		return {
			...feature,
			properties: {
				...normalizeProperties(feature.properties),
				selected: false,
			},
		};
	}),
};

fs.writeFileSync(outputPath, JSON.stringify(converted));
console.log(`✅ Wrote ${converted.features.length} features to:`, outputPath);
