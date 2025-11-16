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

// Configure trust proxy (needed when behind Nginx, Cloudflare, ELB, etc.)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1); // trust first proxy
} else {
  app.set("trust proxy", false);
}

// Guardrails: avoid hard crashes on unhandled exceptions/rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err?.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason && (reason.message || reason));
});

// Connect to MongoDB
connectDB();

// Initialize GridFS
initGridFS();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting – very high in production so it won’t block normal users
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 10000 : 1000, 
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

// CORS – allow all origins in production to avoid blocking users
const corsOptions = {
  origin: true, // reflects request origin
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(cookieParser());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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

// Static serving for uploaded logos/documents
app.use('/uploads', express.static(path.resolve('uploads')));

// Admin portal API
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminLeadsRoutes);
app.use('/api/admin', adminRedemptionsRoutes);

// Health check endpoint
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
