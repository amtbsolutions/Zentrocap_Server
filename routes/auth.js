import express from 'express';
import multer from 'multer';
import { register, login, logout, getMe, sendRegistrationOTP, resendOTP, verifyRegistrationOTP, sendForgotPasswordOTP, verifyForgotPasswordOTP, resetPassword, verifyLoginOtp, resendLoginOtp } from '../controllers/auth.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads during registration
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed!'), false);
    }
  }
});

// Partner-only system routes
router.post('/send-otp', sendRegistrationOTP);  // Step 1: Send OTP for email verification
router.post('/verify-otp', verifyRegistrationOTP);  // Step 2: Verify OTP
router.post('/resend-otp', resendOTP);          // Resend OTP if needed
router.post('/register', upload.fields([
  { name: 'aadhaarFile', maxCount: 1 },
  { name: 'panFile', maxCount: 1 }
]), register);  // Step 3: Complete registration after OTP verification

// Forgot Password routes
router.post('/forgot-password', sendForgotPasswordOTP);        // Step 1: Send forgot password OTP
router.post('/verify-forgot-password-otp', verifyForgotPasswordOTP);  // Step 2: Verify OTP and get reset token
// Compatibility alias (some clients might call this):
router.post('/verify-reset-otp', verifyForgotPasswordOTP);
router.post('/reset-password', resetPassword);                // Step 3: Reset password with token

// Authentication routes
router.post('/login', login);        // Partner login - sends OTP
router.post('/verify-login-otp', verifyLoginOtp);  // Verify login OTP
router.post('/resend-login-otp', resendLoginOtp);  // Resend login OTP
router.post('/logout', logout);
router.get('/me', protect, getMe);

export default router;
