import express from 'express';
import { submitContactForm } from '../controllers/contact.js';
import rateLimit from '../middleware/rateLimit.js';

const router = express.Router();

// Apply a light rate limit specifically for contact form
router.post('/contact', rateLimit({ windowMs: 60 * 1000, max: 5 }), submitContactForm);

export default router;
