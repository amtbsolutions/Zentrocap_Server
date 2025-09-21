import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectDB } from './utils/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initGridFS } from './config/gridfs.js';
import nodemailer from 'nodemailer'; // <-- Added for email sending

// Import routes
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import documentsRoutes from './routes/documents.js';
import profileRoutes from './routes/profile.js';
import earningsRoutes from './routes/earnings.js';
import generalRoutes from './routes/general.js';
import contactRoutes from './routes/contact.js';
import partnerInterestRoutes from './routes/partnerInterest.js';
import notificationsRoutes from './routes/notifications.js';
import referralRoutes from './routes/referral.js';
import adminRedemptionsRoutes from './routes/adminRedemptions.js';
import { startReferralSummaryWorker } from './services/referralSummaryService.js';
import partnersRoutes from './routes/partners.js';
import adminAuthRoutes from './routes/admin/auth.js';
import adminLeadsRoutes from './routes/admin/leads.js';
import companyRoutes from './routes/company.js';
import path from 'path';

// Load environment variables
dotenv.config({ path: './.env' });

const app = express();
const PORT = process.env.PORT || 5001;

// ==================== UPDATED: Trust proxy for Render ====================
app.set('trust proxy', 1); // <-- NEW: fixes X-Forwarded-For warning
// ========================================================================

// Connect to MongoDB
connectDB();

// Initialize GridFS
initGridFS();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting - More lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    if (process.env.NODE_ENV !== 'production') {
      return req.path === '/api/health' || req.path === '/api/test/connection';
    }
    return false;
  }
});
app.use('/api/', limiter);

// General middleware
app.use(compression());

// ==================== UPDATED CORS CONFIG ====================
const allowedOrigins = process.env.CLIENT_URL?.split(',') || [
  'http://localhost:5174',
  'https://zentrocap.com'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server requests
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('CORS blocked:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// =============================================================

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ==================== EMAIL CONFIGURATION ====================
export const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,       // smtp.hostinger.com
  port: process.env.EMAIL_PORT,       // 465 or 587
  secure: process.env.EMAIL_PORT == 465, // SSL true for 465
  auth: {
    user: process.env.EMAIL_USER,     // support@zentrocap.com
    pass: process.env.EMAIL_PASS      // YOUR_EMAIL_PASSWORD
  }
});

// Test email connection
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration failed', error);
  } else {
    console.log('✅ Email server ready to send messages');
  }
});
// =============================================================

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/general', generalRoutes);
app.use('/api/client', contactRoutes);
app.use('/api/client', partnerInterestRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/company', companyRoutes);

// Static serving
app.use('/uploads', express.static(path.resolve('uploads')));

// Admin portal
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminLeadsRoutes);
app.use('/api/admin', adminRedemptionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Quick ping for auth base check
app.get('/api/auth/ping', (req, res) => {
  res.json({ ok: true, route: 'auth/ping' });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
  try {
    startReferralSummaryWorker();
  } catch (e) {
    console.error('Failed to start referral summary worker', e?.message);
  }
});

export default app;
