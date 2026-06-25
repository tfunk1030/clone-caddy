// Mapbox access token. Provide via VITE_MAPBOX_TOKEN (set it in Vercel env or a
// local .env). Without it the map view shows a setup prompt instead of tiles.
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) || '';
export const isMapboxConfigured = Boolean(MAPBOX_TOKEN);

// CADD-AI uses a satellite-streets style for course imagery.
export const MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';
