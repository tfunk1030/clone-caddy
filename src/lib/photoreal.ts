// Google Photorealistic 3D Tiles — the real cadd-ai.vercel.app green/flyover view.
//
// Same stack as the production app (deck.gl Tile3DLayer + loaders.gl over a
// Mapbox map), but keyed off the USER'S OWN Google Maps Platform key via
// VITE_GOOGLE_PHOTOREAL_API_KEY — never a hardcoded credential. When no key is
// configured the feature is unavailable and the map falls back to DEM terrain.

import { MapboxOverlay } from '@deck.gl/mapbox';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';

export const PHOTOREAL_KEY = (import.meta.env.VITE_GOOGLE_PHOTOREAL_API_KEY as string | undefined) || undefined;
export const photorealAvailable = !!PHOTOREAL_KEY;

const TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

// Create a deck.gl overlay rendering Google's photorealistic 3D mesh, interleaved
// with the Mapbox scene. `onAttribution` receives Google's required copyright
// string as tiles load. Returns null if no key is configured.
export function createPhotorealOverlay(onAttribution?: (s: string) => void): MapboxOverlay | null {
  if (!PHOTOREAL_KEY) return null;
  const credits = new Set<string>();
  const layer = new Tile3DLayer({
    id: 'google-photoreal-3d',
    data: `${TILESET_URL}?key=${PHOTOREAL_KEY}`,
    loader: Tiles3DLoader,
    loadOptions: { fetch: { mode: 'cors' } },
    onTileLoad: (tile: any) => {
      // Google requires showing per-tile data attribution.
      const c = tile?.content?.gltf?.asset?.copyright || tile?.content?.copyright;
      if (c && onAttribution) {
        String(c).split(';').map((s) => s.trim()).filter(Boolean).forEach((s) => credits.add(s));
        onAttribution(Array.from(credits).join(', '));
      }
    },
  });
  return new MapboxOverlay({ interleaved: true, layers: [layer] });
}
