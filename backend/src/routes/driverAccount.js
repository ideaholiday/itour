import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db from '../db.js';
import logger from '../config/logger.js';
import { validateBody } from '../middleware/validation.js';
import { authenticateDriverAccount, driverTripLink, driverTrips, requestDriverCode, verifyDriverCode } from '../services/driverAccountService.js';

// Driver sign-in by email code and the driver's trip list (ADR 053).
const router = express.Router();
const login = z.string().trim().min(5).max(254);
const codeLimit = rateLimit({ windowMs: 15 * 60000, max: 10, standardHeaders: true, legacyHeaders: false });
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });

router.post('/code', codeLimit, validateBody(z.object({ login }).strict()), async (req, res) => {
  try { await requestDriverCode(db, req.body.login); }
  catch (err) { logger.error('Driver sign-in code failed', { error: err.message, requestId: req.requestId }); }
  // The same answer whether or not the login is a driver.
  res.json({ success: true, message: 'If this is a registered driver, a code is on its way to the driver email.' });
});
router.post('/session', codeLimit, validateBody(z.object({ login, code: z.string().trim().regex(/^\d{6}$/) }).strict()), (req, res) => {
  try { res.json({ success: true, token: verifyDriverCode(db, req.body.login, req.body.code) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message, code: err.code }); }
});
router.use((req, res, next) => {
  try { req.driverEmail = authenticateDriverAccount(String(req.headers.authorization || '').replace(/^Bearer /, '')); next(); }
  catch (err) { res.status(err.status || 401).json({ error: err.message }); }
});
router.get('/trips', (req, res) => {
  res.json({ success: true, ...driverTrips(db, req.driverEmail) });
});
router.post('/trips/:assignmentId/link', (req, res) => {
  try { res.json({ success: true, linkToken: driverTripLink(db, req.driverEmail, req.params.assignmentId) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
export default router;
