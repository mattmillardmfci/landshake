// Integration code for App.jsx onMove handler
// This replaces the current viewport/bounds checking logic

// ADD THIS TO THE TOP OF App.jsx (after the other imports):
import useTileBasedParcels from "./hooks/useTileBasedParcels";

// ADD THIS TO THE App() FUNCTION COMPONENT (after the useMissouriParcels hook):
const { updateVisibleTiles, getVisibleParcels, tilesManifest, error: tilesError } = useTileBasedParcels();
const [useTiles, setUseTiles] = useState(true); // Toggle between tile and full-load mode

// REPLACE THE onMove HANDLER LOGIC (around line 330-370) with:
onMove={(evt) => {
setViewState(evt.viewState);
if (evt.originalEvent) {
isUserPanning.current = true;
setFollowUserLocation(false);
}

// Try tile-based loading first if available
if (useTiles && tilesManifest && evt.viewState.zoom >= 10) {
const map = evt.target;
const bounds = map.getBounds();

    const viewportBounds = {
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
    };

    // Load tiles for current viewport + preload surrounding
    updateVisibleTiles(viewportBounds);

    // Get combined GeoJSON from all visible tiles
    const parcels = getVisibleParcels();
    if (parcels) {
      console.log(`🎯 Showing ${parcels.features.length} parcels from tiles at zoom ${evt.viewState.zoom.toFixed(1)}`);
      setVisibleParcels(parcels);
    }

} else if (!useTiles && evt.viewState.zoom >= 10 && localParcels?.features) {
// Fallback to full dataset if tiles not available
console.log(`🗺️ Using full dataset - ${localParcels.features.length} parcels`);
setVisibleParcels({
type: "FeatureCollection",
features: localParcels.features,
});
} else {
// Zoom too low, hide parcels
console.log("🗺️ Zoom < 10 - hiding parcels");
setVisibleParcels(null);
}
}}

// OPTIONAL: Add a toggle button to App.jsx (around line 556 where the location button is):
{/_ Toggle tile-based loading _/}
<button
onClick={() => setUseTiles(!useTiles)}
className="absolute bottom-24 right-6 z-20 bg-green-600 hover:bg-green-700 text-white text-xs p-2 rounded shadow-lg"
title="Toggle tile-based loading">
{useTiles ? "Tiles: ON" : "Tiles: OFF"}
</button>

// OPTIONAL: Add tile stats to debug panel (around line 610):
{/_ Tile Loading Debug _/}
{tilesManifest && (

  <div>
    <div>Tiles Manifest: {tilesManifest.tiles.length} tiles</div>
    <div>Tiles Error: {tilesError ? "❌ " + tilesError : "✅ None"}</div>
  </div>
)}
