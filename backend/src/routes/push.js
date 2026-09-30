import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { registerPushDevice, unregisterPushDevice } from '../services/pushService.js';

// Push registration for the traveler and supplier apps (ADR 053). Drivers register
// through /api/driver-account/push-token with their driver session.
const router = express.Router();
const token = z.string().trim().min(20).max(4096);
router.use(rateLimit({ windowMs: 15 * 60000, max: 60, standardHeaders: true, legacyHeaders: false }));

router.post('/devices', authenticate, validateBody(z.object({ token, app: z.enum(['traveler', 'supplier']) }).strict()), (req, res) => {
  try { registerPushDevice(db, { token: req.body.token, app: req.body.app, ownerType: 'USER', ownerKey: req.user?.id }); res.json({ success: true }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
// Signing out removes the phone. The token itself proves the phone, so no session is needed.
router.post('/unregister', validateBody(z.object({ token }).strict()), (req, res) => {
  unregisterPushDevice(db, req.body.token);
  res.json({ success: true });
});
export default router;
