import { handler, send, q, courseFeatures, resolveLocation } from '../server/lib.js';

export default handler(async (req, res) => {
  const { lat, lon, bbox, osmType, osmId } = await resolveLocation(req);
  const radius = parseInt(q(req, 'radius'), 10) || 1500;
  send(res, 200, await courseFeatures({ lat, lon, radius, osmType, osmId, bbox }), 6 * 3600);
});
