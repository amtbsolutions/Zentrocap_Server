import jwt from 'jsonwebtoken';
import Partner from '../models/Partner.js';
import Admin from '../models/admin/Admin.js';

// Protect routes - Partner only system
export const protect = async (req, res, next) => {
  // Helper: extract Bearer token robustly
  const extractBearer = (hdr) => {
    if (!hdr || typeof hdr !== 'string') return '';
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : '';
  };

  let token = extractBearer(req.headers.authorization);
  // Support token via query param for asset/image requests (e.g., <img src> / <a href>)
  if ((!token || token.length === 0) && req.query && typeof req.query.token === 'string') {
    token = String(req.query.token).trim();
  }
  if (!token && req.cookies && req.cookies.token) {
    token = String(req.cookies.token || '').trim();
  }

  // Normalize obviously invalid tokens
  const invalidValues = new Set(['', 'null', 'undefined', 'bearer', 'Bearer']);
  if (invalidValues.has(token)) token = '';

  // Basic JWT shape validation: three base64url segments
  const isLikelyJwt = typeof token === 'string' && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);

  if (!token || !isLikelyJwt) {
    return res.status(401).json({ success: false, message: 'Invalid or missing token' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || !secret.length) {
    // Misconfiguration: fail with 500 to signal server issue
    return res.status(500).json({ success: false, message: 'Server configuration error (JWT secret missing)' });
  }

  try {
    // Verify token (restrict algorithms if desired)
    const decoded = jwt.verify(token, secret /*, { algorithms: ['HS256'] } */);

    // Try Partner first
    let principal = await Partner.findById(decoded.id).select('-password');
    if (principal) {
      // Check if partner is allowed
      if (principal.status === 'suspended' || principal.status === 'rejected') {
        return res.status(401).json({ success: false, message: 'Partner account is suspended or rejected' });
      }
      req.user = principal;
    } else {
      // Fallback: try Admin (admin portal tokens)
      const admin = await Admin.findById(decoded.id).select('-password');
      if (!admin) {
        return res.status(401).json({ success: false, message: 'Unauthorized: user not found' });
      }
      if (!admin.isApproved) {
        return res.status(403).json({ success: false, message: 'Admin approval pending' });
      }
      // Craft a minimal user object compatible with authorize(role)
      req.user = {
        _id: admin._id,
        role: 'admin',
        email: admin.email,
        fullName: admin.fullName
      };
    }
    next();
  } catch (error) {
    // Reduce console noise; classify common JWT errors
    const name = error && error.name;
    const msg = name === 'TokenExpiredError' ? 'Token expired'
              : name === 'JsonWebTokenError' ? 'Invalid token'
              : 'Unauthorized';
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Auth middleware:', name || 'Error');
    }
    return res.status(401).json({ success: false, message: msg });
  }
};

// Grant access to specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};
