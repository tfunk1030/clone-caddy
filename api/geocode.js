import { handler, send, q, geocode } from '../server/lib.js';

export default handler(async (req, res) => {
  const query = (q(req, 'q') || '').toString().trim();
  if (!query) return send(res, 400, { error: 'q (query) is required' });
  const limit = Math.min(parseInt(q(req, 'limit'), 10) || 5, 20);
  send(res, 200, { query, results: await geocode(query, limit) }, 3600);
});
