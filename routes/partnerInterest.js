import express from 'express';
import { submitPartnerInterest } from '../controllers/partnerInterest.js';
import rateLimit from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/partner', rateLimit({ windowMs: 60 * 1000, max: 5 }), submitPartnerInterest);

export default router;
