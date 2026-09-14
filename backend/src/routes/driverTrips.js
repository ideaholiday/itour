import { createHash } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db from '../db.js';
import { validateBody } from '../middleware/validation.js';
import { authenticateDriver, exchangeDriverLink, driverAction } from '../services/dispatchWorkflowService.js';
import { latestDriverLocation, MAX_POINTS_PER_BATCH, recordDriverLocations } from '../services/driverLocationService.js';

const router = express.Router();
// Location uploads are limited per trip session instead: many phones share one carrier IP.
router.use(rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/location' }));
const locationLimit = rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => createHash('sha256').update(String(req.headers.authorization || '')).digest('hex') });
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
router.post('/session', validateBody(z.object({ token: z.string().min(20).max(512) }).strict()), (req, res) => {
  try { res.json({ success: true, token: exchangeDriverLink(db, req.body.token) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
router.use((req, res, next) => {
  try { req.driverTrip = authenticateDriver(db, String(req.headers.authorization || '').replace(/^Bearer /, '')); next(); }
  catch (err) { res.status(err.status || 401).json({ error: err.message }); }
});
router.get('/', (req, res) => {
  const { assignment: a, booking: b } = req.driverTrip;
  res.json({ success: true, trip: {
    bookingRef: b.ref, date: b.activity_date, pickupTime: b.pickup_time, pickupLocation: b.pickup_location, dropLocation: b.drop_location,
    travelerName: b.traveler_name, travelerPhone: a.acknowledgement === 'ACCEPTED' ? b.traveler_phone : null,
    passengers: Number(b.adults || 0) + Number(b.children || 0), driverName: a.driver_name, vehicleModel: a.vehicle_model, vehicleNumber: a.vehicle_number,
    acknowledgement: a.acknowledgement, responseDeadline: a.response_deadline, status: a.assignment_status, completedAt: a.completed_at,
    location: latestDriverLocation(db, a.id),
  } });
});
router.post('/action', validateBody(z.object({ action: z.enum(['ACCEPT','DECLINE','EN_ROUTE','ARRIVED','START','COMPLETE']), otp: z.string().regex(/^\d{4,6}$/).optional(), note: z.string().max(1000).optional() }).strict()), (req, res) => {
  try { const a = driverAction(db, req.driverTrip, req.body); res.json({ success: true, status: a.assignment_status }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message, code: err.code }); }
});
// Positions from the driver's phone while the trip is active (ADR 012).
router.post('/location', locationLimit, validateBody(z.object({ points: z.array(z.object({
  lat: z.number(), lng: z.number(), accuracy: z.number().nullable().optional(), speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(), recordedAt: z.string().max(40).optional(),
}).strict()).min(1).max(MAX_POINTS_PER_BATCH) }).strict()), (req, res) => {
  try {
    const result = recordDriverLocations(db, req.driverTrip, req.body.points);
    res.json({ success: true, accepted: result.accepted, rejected: result.rejected, location: result.latest });
  } catch (err) { res.status(err.status || 500).json({ error: err.message, code: err.code }); }
});
export default router;
