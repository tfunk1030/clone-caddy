import { handler, send, weather, carryAdjustment, resolveLocation } from '../server/lib.js';

export default handler(async (req, res) => {
  const { lat, lon, name } = await resolveLocation(req);
  const w = await weather(lat, lon);
  send(res, 200, {
    location: { name, lat, lon },
    weather: w,
    adjustment: carryAdjustment(w),
  }, 600);
});
