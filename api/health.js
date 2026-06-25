import { handler, send } from '../server/lib.js';

export default handler(async (_req, res) => {
  send(res, 200, { ok: true, service: 'ai-caddie-api', time: new Date().toISOString() });
});
