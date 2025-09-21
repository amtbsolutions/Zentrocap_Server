// Very small in-memory rate limiter (per-IP) suitable for low volume endpoints like contact form
// For production scale, replace with Redis or a package like express-rate-limit.

const buckets = new Map(); // key: ip, value: { count, expires }

export default function rateLimit({ windowMs = 60000, max = 10 } = {}) {
  return (req, res, next) => {
    try {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      let bucket = buckets.get(ip);
      if (!bucket || bucket.expires < now) {
        bucket = { count: 0, expires: now + windowMs };
        buckets.set(ip, bucket);
      }
      bucket.count += 1;
      if (bucket.count > max) {
        return res.status(429).json({ success:false, error:'Too many requests. Please wait a moment.' });
      }
      next();
    } catch (e) {
      next(); // fail open
    }
  };
}
