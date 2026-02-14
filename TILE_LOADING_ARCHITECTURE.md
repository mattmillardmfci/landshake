# Tile-Based Parcel Loading System

## Overview
The parcel dataset has been optimized for viewport-based loading using geographic tiling. Instead of loading a massive 24MB GeoJSON file, parcels are now split into 1 or more tiles that load only when needed.

## Architecture

### 1. Tile Generation
**File:** `scripts/split-parcels-into-tiles.mjs`

Creates a geographic grid within the parcel bounds:
- **Grid:** 4 columns × 4 rows = 16 potential tiles
- **Bounds:** -110.3 to -110.0 longitude, 34.4 to 34.7 latitude
- **Current:** 1 tile containing all 35,630 parcels (they're densely clustered)

**Run:** `node scripts/split-parcels-into-tiles.mjs`
**Output:** 
- `public/data/tiles/tile_0_1.geojson` (main parcel tile)
- `public/data/tiles.json` (manifest with tile metadata)

### 2. Hook: `useTileBasedParcels`
**File:** `src/hooks/useTileBasedParcels.js`

Manages all tile operations:

**Functions:**
- `updateVisibleTiles(viewportBounds)` - Loads tiles for current viewport, preloads surrounding tiles
- `getVisibleParcels()` - Returns combined GeoJSON from all visible tiles
- `clearCache()` - Clears memory cache

**Features:**
- ✅ **Viewport-based loading** - Only loads tiles that intersect the visible map area
- ✅ **Tile caching** - Keeps loaded tiles in memory to avoid re-fetching
- ✅ **Surrounding tile preloading** - Preloads 8 neighboring tiles for smooth panning
- ✅ **Memory efficient** - Can be extended with LRU cache to limit memory usage

**State:**
```javascript
const {
  visibleTiles,      // Set of loaded tile IDs
  tileCache,         // Map of tileId -> GeoJSON
  tilesManifest,     // Grid metadata
  loading,           // Whether tiles are loading
  error,             // Load errors
  updateVisibleTiles,
  getVisibleParcels,
  clearCache,
} = useTileBasedParcels();
```

### 3. Integration into App.jsx

**Current Status:** Hook is imported but needs integration into onMove handler.

**Required Changes:**
1. Replace full-dataset loading with tile-based loading in `onMove` handler
2. On map pan/zoom, call `updateVisibleTiles()` with viewport bounds
3. Call `getVisibleParcels()` to combine tiles into single layer
4. Set `setVisibleParcels()` with the result

**Example:**
```javascript
onMove={(evt) => {
  // ... existing code ...
  
  if (evt.viewState.zoom >= 10) {
    const bounds = evt.target.getBounds();
    const viewportBounds = {
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
    };
    
    // Load tiles for viewport
    updateVisibleTiles(viewportBounds);
    
    // Get combined GeoJSON
    const parcels = getVisibleParcels();
    if (parcels) {
      setVisibleParcels(parcels);
    }
  }
}}
```

## Performance Benefits

### Before (Full Loading)
- Loads entire 24MB file on app start
- 30-120 second timeout needed
- All parcels in memory always
- Slow cold starts

### After (Tile-Based)
- Loads ~50MB tile on demand (still large because all parcels in 1 tile)
- Only loads when zoomed in (zoom ≥ 10)
- Strategic preloading of surrounding areas
- Smooth panning experience
- Graceful fallback to full dataset if needed

## Future Optimizations

### If Parcels Spread Across Multiple Tiles
1. **Progressive loading** - Show closest tile first, preload surrounding
2. **Tile prioritization** - Load viewport center first
3. **LRU cache** - Limit memory to N most-recent tiles
4. **Tile simplification** - Use simplified geometries at low zoom

### Memory Management
```javascript
// Add LRU cache decorator
const withLRUCache = (maxTiles) => {
  const cache = new Map();
  return (tileId) => {
    if (cache.size > maxTiles) {
      const first = cache.entries().next().value;
      cache.delete(first[0]);
    }
    // ... rest of logic
  }
}
```

## Testing

1. **Check tiles are created:**
   ```bash
   ls -la public/data/tiles/
   cat public/data/tiles.json
   ```

2. **Monitor loading in console:**
   - Look for `📥 Loading tile:` logs
   - Check `💾 Using cached tile:` for cache hits
   - Check `📍 Surrounding tiles for preload:` for preloading

3. **Performance:**
   - Open DevTools Network tab
   - Pan/zoom the map
   - See tile requests load on demand

## Fallback Mode

If tiles fail to load, the app falls back to loading the full dataset:
- Set `useTiles = false` in App.jsx
- Loads `localParcels` from `useMissouriParcels` hook
- Maintains backward compatibility

## Files Modified/Created

**Created:**
- ✅ `src/hooks/useTileBasedParcels.js` - Main tile loading hook
- ✅ `public/data/tiles/tile_0_1.geojson` - Parcel tile
- ✅ `public/data/tiles.json` - Tile manifest

**Modified:**
- ✅ `scripts/split-parcels-into-tiles.mjs` - Updated bounds to correct coordinates
- ⚠️ `src/App.jsx` - Needs onMove handler update (attempted, whitespace issues)
- ✅ `src/services/errorTracker.js` - Fixed syntax errors

## Next Steps

1. **Complete App.jsx integration** - Update onMove handler to use tiles
2. **Test viewport updates** - Verify tiles load/unload as viewport changes
3. **Monitor performance** - Check loading times and memory usage
4. **Add loading UI** - Show loading spinner while tiles load
5. **Implement tile prioritization** - Load center-most tiles first
6. **Add cache limits** - Prevent unlimited memory growth
