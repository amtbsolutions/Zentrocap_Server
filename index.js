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

// 🔹 UPDATE: Trust the first proxy (required for X-Forwarded-For headers and HTTPS detection)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5001;

// 🔹 Function to build CORS allowed origins
function buildAllowedOrigins() {
  const raw = process.env.CLIENT_URL || '';
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const set = new Set();

  const addVariant = (urlStr) => {
    try {
      const u = new URL(urlStr);
      const normalized = `${u.protocol}//${u.host}`;
      set.add(normalized);
      if (u.host.startsWith('www.')) {
        const apex = u.host.replace(/^www\./, '');
        set.add(`${u.protocol}//${apex}`);
      } else {
        set.add(`${u.protocol}//www.${u.host}`);
      }
    } catch (e) {
      // Ignore malformed entries
    }
  };

  parts.forEach(addVariant);
  return Array.from(set);
}

// Connect to MongoDB
connectDB();

// Initialize GridFS
initGridFS();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
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

if (process.env.NODE_ENV !== 'production') {
  const devCors = cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With']
  });
  app.use(devCors);
  app.options('*', devCors);
} else {
  const dynamicAllowed = buildAllowedOrigins();
  const localDevOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:3000',
    'https://www.zentrocap.com'
  ];
  const allowed = Array.from(new Set([...dynamicAllowed, ...localDevOrigins]));

  const corsOrigin = (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (allowed.includes(normalized)) return callback(null, true);
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

  console.log('CORS allowed origins:', allowed.join(', '));
}

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 🔹 UPDATE: Remove HTTPS redirect in Express (handled by Nginx to avoid loops)
// Commented out because Nginx already does HTTP -> HTTPS
/*
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
  }
  next();
});
*/

// 🔹 UPDATE: Optional www -> non-www redirect (safe behind Nginx)
// Uncomment if you want to normalize www to apex domain
/*
app.use((req, res, next) => {
  if (req.headers.host.startsWith('www.')) {
    const hostWithoutWWW = req.headers.host.replace(/^www\./, '');
    return res.redirect(301, `https://${hostWithoutWWW}${req.url}`);
  }
  next();
});
*/

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

app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin', adminLeadsRoutes);
app.use('/api/admin', adminRedemptionsRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/auth/ping', (req, res) => {
  res.json({ ok: true, route: 'auth/ping' });
});

app.use(errorHandler);

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
