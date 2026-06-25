import { handler, send, q, weather } from '../server/lib.js';

export default handler(async (req, res) => {
  const lat = parseFloat(q(req, 'lat')), lon = parseFloat(q(req, 'lon'));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return send(res, 400, { error: 'lat and lon are required' });
  send(res, 200, { lat, lon, ...(await weather(lat, lon)) }, 600);
});
