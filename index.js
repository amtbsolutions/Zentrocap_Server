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
// Quiet startup: remove noisy environment prints

const app = express();
const PORT = process.env.PORT || 5001;

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Much higher limit in development
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for health checks and some endpoints during development
    if (process.env.NODE_ENV !== 'production') {
      return req.path === '/api/health' || req.path === '/api/test/connection';
    }
    return false;
  }
});
app.use('/api/', limiter);

// General middleware
app.use(compression());
// CORS: allow common dev origins (localhost & 127.0.0.1 across typical ports)
if (process.env.NODE_ENV !== 'production') {
  // In development, allow any origin so local testing isn't blocked by CORS
  const devCors = cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With']
  });
  app.use(devCors);
  // Explicitly handle preflight quickly
  app.options('*', devCors);
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Requested-With');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
} else {
  const corsOrigin = (origin, callback) => {
    const allowed = [
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
      'http://127.0.0.1:3000'
    ];
    if (!origin) return callback(null, true);
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  };
  const prodCors = cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With']
  });
  app.use(prodCors);
  app.options('*', prodCors);
}
// Remove request logging by default (morgan disabled)
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/general', generalRoutes);
app.use('/api/client', contactRoutes); // public contact form endpoint
app.use('/api/client', partnerInterestRoutes); // partner interest form
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
  // Email configuration status
  const hasValidEmailConfig = process.env.EMAIL_USER && 
                             process.env.EMAIL_PASS && 
                             process.env.EMAIL_USER !== 'your-email@gmail.com' &&
                             process.env.EMAIL_PASS !== 'your-app-password';
  
  // Email config status logs removed for quiet console

  // Watch admin-dashboard lead assignments -> auto-create notifications
  // (Removed) initAdminLeadAssignmentWatcher call after deprecating watchers.
  try {
    startReferralSummaryWorker();
  } catch (e) {
    console.error('Failed to start referral summary worker', e?.message);
  }
});

export default app;


