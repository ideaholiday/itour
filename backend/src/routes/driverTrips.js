import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db from '../db.js';
import { validateBody } from '../middleware/validation.js';
import { authenticateDriver, exchangeDriverLink, driverAction } from '../services/dispatchWorkflowService.js';

const router = express.Router();
router.use(rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false }));
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
  } });
});
router.post('/action', validateBody(z.object({ action: z.enum(['ACCEPT','DECLINE','EN_ROUTE','ARRIVED','START','COMPLETE']), otp: z.string().regex(/^\d{4,6}$/).optional(), note: z.string().max(1000).optional() }).strict()), (req, res) => {
  try { const a = driverAction(db, req.driverTrip, req.body); res.json({ success: true, status: a.assignment_status }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
export default router;
