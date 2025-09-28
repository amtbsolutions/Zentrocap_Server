import Partner from '../models/Partner.js';
import OTP from '../models/OTP.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import { generateOTP, sendOTPEmail, sendWelcomeEmail, sendForgotPasswordOTPEmail } from '../utils/emailUtils.js';
import { processReferralSignup } from './referral.js';

// GridFS bucket for file storage
let gridfsBucket;
mongoose.connection.once('open', () => {
  gridfsBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'documents'
  });
});

// Helper function to upload file to GridFS
const uploadFileToGridFS = async (file, filename, req) => {
  return new Promise((resolve, reject) => {
    const uploadStream = gridfsBucket.openUploadStream(filename, {
      metadata: {
        originalName: file.originalname,
        mimetype: file.mimetype,
        uploadDate: new Date(),
        fileSize: file.size,
        fileExtension: file.originalname.split('.').pop()?.toLowerCase()
      }
    });

    const readableStream = Readable.from(file.buffer);
    readableStream.pipe(uploadStream);

    uploadStream.on('finish', () => {
      // Generate full URL for iframe compatibility
      const fileUrl = `${req.protocol}://${req.get('host')}/api/documents/gridfs/${uploadStream.id}`;
      resolve({ 
        fileId: uploadStream.id, 
        fileUrl,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        extension: file.originalname.split('.').pop()?.toLowerCase()
      });
    });

    uploadStream.on('error', (error) => {
      reject(error);
    });
  });
};

// Helper function to send token response for partners
const sendTokenResponse = (partner, statusCode, res) => {
  const token = partner.getSignedJwtToken();
  
  const options = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  res.status(statusCode)
     .cookie('token', token, options)
     .json({
       success: true,
       token,
       data: {
         id: partner._id,
         name: partner.name,
         email: partner.email,
         phone: partner.phone,
         role: partner.role,
         type: 'partner',
         companyName: partner.companyName,
         status: partner.status
       }
     });
};

// @desc    Step 1: Send OTP for email verification during registration
// @route   POST /api/auth/send-otp
// @access  Public
export const sendRegistrationOTP = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, message: 'Email and name are required' });
    }

    // Check if partner already exists with this email
    const existingPartner = await Partner.findOne({ email });
    if (existingPartner) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please use a different email or login.' });
    }

    // Generate OTP
    const otp = generateOTP();

    // Delete any existing OTPs for this email and purpose
    await OTP.deleteMany({ email, purpose: 'registration' });

    // Create new OTP record (valid for 10 minutes for registration)
    await OTP.create({
      email,
      otp,
      purpose: 'registration',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Dispatch email in background so client isn't blocked by SMTP latency
    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const emailResult = await sendOTPEmail(email, otp, 'registration', name);
        if (!emailResult.success) {
          console.error('registration:email-failed', {
            email,
            error: emailResult.error,
            elapsedMs: Date.now() - sendStart
          });
        } else {
          console.log('registration:otp-email-sent', {
            email,
            messageId: emailResult.messageId,
            elapsedMs: Date.now() - sendStart
          });
        }
      } catch (err) {
        console.error('registration:email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    const total = Date.now() - t0;
    return res.status(200).json({
      success: true,
      message: 'OTP generated and email dispatch in progress',
      data: { email, expiresIn: '10 minutes', processingMs: total }
    });
  } catch (error) {
    console.error('Error in sendRegistrationOTP:', { error: error.message, stack: error.stack, totalMs: Date.now() - t0 });
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Step 2: Verify OTP and complete registration
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const {
      // OTP Verification
      otp,
      
      // Basic Information
      name,
      email,
      phone,
      password,
      
  // Company Information
  entityType,
      companyName,
      designation,
  companyAddress,
  address,
      city,
      state,
      pincode,
      
      // Document Information
      aadhaarNumber,
      panNumber,
      
      // Additional Information
      experience,
      specialization,
  referralCode,
  signupDocuments
    } = req.body;

    console.log('Registration attempt for:', email);
    console.log('Files received:', req.files);

    // Check if OTP was verified
    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP is required for registration'
      });
    }

    // Check if there's a verified OTP for this email (verified within the last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    let verifiedOTP = await OTP.findOne({
      email,
      purpose: 'registration',
      verified: true,
      // Prefer verifiedAt freshness; fallback to createdAt if verifiedAt missing
      $or: [
        { verifiedAt: { $gte: thirtyMinutesAgo } },
        { $and: [ { verifiedAt: { $exists: false } }, { createdAt: { $gte: thirtyMinutesAgo } } ] }
      ]
    }).sort({ verifiedAt: -1, createdAt: -1 });

    if (!verifiedOTP) {
      return res.status(400).json({
        success: false,
        message: 'Email verification required. Please verify your email with OTP first.'
      });
    }

    // Check if partner already exists (double-check after OTP verification)
    const existingPartner = await Partner.findOne({ 
      $or: [
        { email },
        { phone },
        { aadhaarNumber },
        { panNumber }
      ]
    });

    if (existingPartner) {
      let message = 'Partner already exists';
      if (existingPartner.email === email) message = 'Email already registered';
      else if (existingPartner.phone === phone) message = 'Phone number already registered';
      else if (existingPartner.aadhaarNumber === aadhaarNumber) message = 'Aadhaar number already registered';
      else if (existingPartner.panNumber === panNumber) message = 'PAN number already registered';
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    // Handle file uploads
    let aadhaarFileUrl = null;
    let aadhaarFileMetadata = null;
    let panFileUrl = null;
    let panFileMetadata = null;

    try {
      // Upload Aadhaar file if provided
      if (req.files && req.files.aadhaarFile && req.files.aadhaarFile[0]) {
        console.log('Uploading Aadhaar file...');
        const aadhaarFile = req.files.aadhaarFile[0];
        const aadhaarFilename = `aadhaar_${Date.now()}_${aadhaarFile.originalname}`;
        const aadhaarResult = await uploadFileToGridFS(aadhaarFile, aadhaarFilename, req);
        aadhaarFileUrl = aadhaarResult.fileUrl;
        aadhaarFileMetadata = {
          originalName: aadhaarResult.originalName,
          mimetype: aadhaarResult.mimetype,
          size: aadhaarResult.size,
          extension: aadhaarResult.extension
        };
        console.log('Aadhaar file uploaded:', aadhaarFileUrl);
      }

      // Upload PAN file if provided
      if (req.files && req.files.panFile && req.files.panFile[0]) {
        console.log('Uploading PAN file...');
        const panFile = req.files.panFile[0];
        const panFilename = `pan_${Date.now()}_${panFile.originalname}`;
        const panResult = await uploadFileToGridFS(panFile, panFilename, req);
        panFileUrl = panResult.fileUrl;
        panFileMetadata = {
          originalName: panResult.originalName,
          mimetype: panResult.mimetype,
          size: panResult.size,
          extension: panResult.extension
        };
        console.log('PAN file uploaded:', panFileUrl);
      }
    } catch (fileError) {
      console.error('File upload error:', fileError);
      return res.status(500).json({
        success: false,
        message: 'Error uploading documents. Please try again.'
      });
    }

    // Create partner with uploaded file URLs
    const partnerData = {
      name,
      email,
      phone,
      password,
      // Only set companyName if provided or entityType is company
      companyName: entityType === 'company' ? (companyName || '') : '',
      designation,
      // Persist address based on entity type
      companyAddress: entityType === 'company' ? (companyAddress || '') : '',
      address: entityType === 'individual' ? (address || companyAddress || '') : '',
      city,
      state,
      pincode,
      aadhaarNumber,
      panNumber,
      gstNumber: entityType === 'company' ? (req.body.gstNumber || '') : '',
      experience,
      specialization,
      // Don't set referralCode here - let the Partner model generate unique one
      status: 'pending', // Partners need approval
      emailVerified: true, // Email is verified through OTP
  emailVerifiedAt: new Date()
    };

    // Add file URLs and metadata if uploaded
    if (aadhaarFileUrl) {
      partnerData.aadhaarFile = aadhaarFileUrl;
      partnerData.aadhaarFileMetadata = aadhaarFileMetadata;
    }
    if (panFileUrl) {
      partnerData.panFile = panFileUrl;
      partnerData.panFileMetadata = panFileMetadata;
    }

    console.log('Creating partner with data:', { ...partnerData, password: '[HIDDEN]' });

    // Persist entityType as well (default 'individual' when missing)
    if (entityType && ['individual', 'company'].includes(entityType)) {
      partnerData.entityType = entityType;
    } else if (!partnerData.entityType) {
      partnerData.entityType = 'individual';
    }

    const partner = await Partner.create(partnerData);

    // If there are signup-uploaded documents (other docs), store them inside Partner.otherDocuments
    try {
      if (signupDocuments) {
        let docs = [];
        if (typeof signupDocuments === 'string') {
          try { docs = JSON.parse(signupDocuments); } catch {}
        } else if (Array.isArray(signupDocuments)) {
          docs = signupDocuments;
        }
        if (Array.isArray(docs) && docs.length > 0) {
          const { getGridFSBucket } = await import('../config/gridfs.js');
          const bucket = getGridFSBucket();
          const otherDocs = [];
          for (const d of docs) {
            if (!d?.gridfsId) continue;
            let fileInfo = null;
            try {
              const gfId = new mongoose.Types.ObjectId(d.gridfsId);
              const files = await bucket.find({ _id: gfId }).toArray();
              if (files && files[0]) fileInfo = files[0];
            } catch {}
            const originalName = d.originalName || fileInfo?.metadata?.originalName || 'document';
            const mimetype = fileInfo?.metadata?.mimetype || 'application/octet-stream';
            const size = fileInfo?.length || 0;
            const fileUrl = `${req.protocol}://${req.get('host')}/api/documents/gridfs/${d.gridfsId}`;
            otherDocs.push({
              gridfsId: fileInfo?._id || new mongoose.Types.ObjectId(d.gridfsId),
              documentType: d.documentType || 'general',
              originalName,
              filename: fileInfo?.filename || originalName,
              mimetype,
              size,
              fileUrl,
              previewUrl: fileUrl,
              notes: 'Uploaded during signup'
            });
          }
          if (otherDocs.length > 0) {
            const PartnerModel = (await import('../models/Partner.js')).default;
            await PartnerModel.updateOne({ _id: partner._id }, { $push: { otherDocuments: { $each: otherDocs } } });
          }
        }
      }
    } catch (assocErr) {
      console.warn('Failed to store signup documents in partner.otherDocuments:', assocErr?.message || assocErr);
    }

    // Process referral if provided
    if (referralCode) {
      console.log('Processing referral signup with code:', referralCode);
      await processReferralSignup(partner._id, referralCode);
    }

    // Clean up the verified OTP record
    if (verifiedOTP?._id) {
      await OTP.deleteOne({ _id: verifiedOTP._id });
    }

    console.log('Partner created successfully:', partner._id);

    // Send welcome email
    await sendWelcomeEmail(email, name);

    // Send response (without token since they need approval)
    res.status(201).json({
      success: true,
      message: 'Registration completed successfully! Your email has been verified. Please wait for admin approval.',
    data: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        companyName: partner.companyName,
        status: partner.status,
        documentsUploaded: {
          aadhaar: !!aadhaarFileUrl,
      pan: !!panFileUrl
        }
      }
    });

  } catch (error) {
    console.error('Error in register:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation Error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Resend OTP for email verification
// @route   POST /api/auth/resend-otp
// @access  Public
export const resendOTP = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Check if there's an existing unverified OTP record
    const existingOTP = await OTP.findOne({ email, purpose: 'registration', verified: false }).sort({ createdAt: -1 });
    if (!existingOTP) {
      return res.status(400).json({ success: false, message: 'No pending OTP found for this email. Please start registration again.' });
    }

    // Check if partner already exists
    const existingPartner = await Partner.findOne({ email });
    if (existingPartner) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please login instead.' });
    }

    // Check rate limiting - only allow resend after 1 minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    if (existingOTP.createdAt > oneMinuteAgo) {
      const remainingTime = Math.ceil(60 - (Date.now() - existingOTP.createdAt.getTime()) / 1000);
      return res.status(400).json({ success: false, message: `Please wait ${remainingTime} seconds before requesting a new OTP` });
    }

    // Generate new OTP
    const otp = generateOTP();
    const genMs = Date.now() - t0;

    // Delete old OTP records for this email and purpose
    await OTP.deleteMany({ email, purpose: 'registration' });
    const afterDeleteMs = Date.now() - t0;

    // Create new OTP record (valid for 10 minutes for registration)
    await OTP.create({
      email,
      otp,
      purpose: 'registration',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    const afterCreateMs = Date.now() - t0;

    // Dispatch email asynchronously so response isn't blocked
    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const emailResult = await sendOTPEmail(email, otp, 'registration', 'User');
        if (!emailResult.success) {
          const isTimeout = /timed? out/i.test(emailResult.error) || emailResult.error === 'EMAIL_TIMEOUT';
          console.error('resend-registration:email-failed', { email, error: emailResult.error, isTimeout, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('resend-registration:otp-email-sent', { email, messageId: emailResult.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('resend-registration:email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    const totalMs = Date.now() - t0;
    return res.status(200).json({
      success: true,
      message: 'New OTP generated and email dispatch in progress',
      data: { email, expiresIn: '10 minutes' },
      timings: { genMs, afterDeleteMs, afterCreateMs, totalMs }
    });
  } catch (error) {
    console.error('Error in resendOTP:', { error: error.message, stack: error.stack, totalMs: Date.now() - t0 });
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Verify OTP for email verification during signup
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyRegistrationOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    // Find and validate OTP
    const otpRecord = await OTP.findValidOTP(email, otp, 'registration');
    if (!otpRecord) {
      // Increment attempts if there's a recent OTP
      const existingOTP = await OTP.findOne({ email, purpose: 'registration', verified: false }).sort({ createdAt: -1 });
      if (existingOTP) {
        existingOTP.attempts = (existingOTP.attempts || 0) + 1;
        await existingOTP.save();
        if (existingOTP.attempts >= 5) {
          return res.status(400).json({ success: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.' });
        }
      }
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please check your email and try again.' });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    otpRecord.verifiedAt = new Date();
    await otpRecord.save();

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully. You can now proceed with registration.',
      data: { email, verified: true }
    });
  } catch (error) {
    console.error('Error in verifyRegistrationOTP:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Register partner
// @route   POST /api/auth/register-partner
// @access  Public
export const registerPartner = async (req, res) => {
  try {
    const {
      // Basic Information
      name,
      email,
      phone,
      password,
      
      // Company Information
      companyName,export const registerPartner = async (req, res) => {
  try {
    const {
      // Basic Information
      name,
      email,
      phone,
      password,
      
      // Company Information
      companyName,
      designation,
      companyAddress,
      city,
      state,
      pincode,
      
      // Document Information
      aadhaarNumber,
      panNumber,
      
      // Additional Information
      experience,
      specialization,
      referralCode,
      gstNumber
    } = req.body;

    // Check if partner already exists
    const existingPartner = await Partner.findOne({ 
      $or: [
        { email },
        { phone },
        { aadhaarNumber },
        { panNumber }
      ]
    });

    if (existingPartner) {
      let message = 'Partner already exists';
      if (existingPartner.email === email) message = 'Email already registered';
      else if (existingPartner.phone === phone) message = 'Phone number already registered';
      else if (existingPartner.aadhaarNumber === aadhaarNumber) message = 'Aadhaar number already registered';
      else if (existingPartner.panNumber === panNumber) message = 'PAN number already registered';
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    // Create partner
    const partner = await Partner.create({
      name,
      email,
      phone,
      password,
      companyName,
      designation,
      companyAddress,
      city,
      state,
      pincode,
      aadhaarNumber,
      panNumber,
      gstNumber: gstNumber?.trim() || null, // <-- important change
      experience,
      specialization,
      // Don't set referralCode here - let the Partner model generate unique one
      status: 'pending' // Partners need approval
    });

    // Process referral if provided
    if (referralCode) {
      console.log('Processing referral signup with code:', referralCode);
      await processReferralSignup(partner._id, referralCode);
    }

    // Send response (without token since they need approval)
    res.status(201).json({
      success: true,
      message: 'Partner registration submitted successfully. Please wait for admin approval.',
      data: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        companyName: partner.companyName,
        status: partner.status
      }
    });

  } catch (error) {
    console.error('Error in registerPartner:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation Error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

      designation,
      companyAddress,
      city,
      state,
      pincode,
      
      // Document Information
      aadhaarNumber,
      panNumber,
      
      // Additional Information
      experience,
      specialization,
      referralCode
    } = req.body;

    const { gstNumber } = req.body;

    // Check if partner already exists
    const existingPartner = await Partner.findOne({ 
      $or: [
        { email },
        { phone },
        { aadhaarNumber },
        { panNumber }
      ]
    });

    if (existingPartner) {
      let message = 'Partner already exists';
      if (existingPartner.email === email) message = 'Email already registered';
      else if (existingPartner.phone === phone) message = 'Phone number already registered';
      else if (existingPartner.aadhaarNumber === aadhaarNumber) message = 'Aadhaar number already registered';
      else if (existingPartner.panNumber === panNumber) message = 'PAN number already registered';
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    // Create partner
    const partner = await Partner.create({
      name,
      email,
      phone,
      password,
      companyName,
      designation,
      companyAddress,
      city,
      state,
      pincode,
      aadhaarNumber,
      panNumber,
      gstNumber: gstNumber || '',
      experience,
      specialization,
      // Don't set referralCode here - let the Partner model generate unique one
      status: 'pending' // Partners need approval
    });

    // Process referral if provided
    if (referralCode) {
      console.log('Processing referral signup with code:', referralCode);
      await processReferralSignup(partner._id, referralCode);
    }

    // Send response (without token since they need approval)
    res.status(201).json({
      success: true,
      message: 'Partner registration submitted successfully. Please wait for admin approval.',
      data: {
        id: partner._id,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        companyName: partner.companyName,
        status: partner.status
      }
    });

  } catch (error) {
    console.error('Error in registerPartner:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation Error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Login partner
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check for partner
    const partner = await Partner.findOne({ email }).select('+password');

    if (!partner) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if partner is approved
    if (partner.status !== 'approved') {
      let message = 'Account not approved yet';
      if (partner.status === 'rejected') message = 'Account has been rejected';
      if (partner.status === 'suspended') message = 'Account has been suspended';
      
      return res.status(401).json({
        success: false,
        message
      });
    }

    // Check if password matches
    const isMatch = await partner.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

  // Generate and store OTP for login verification
  const otpCode = generateOTP();
  const afterGenMs = Date.now() - t0;
    
    console.log('🔍 Login OTP Debug:', {
      email,
      otp: otpCode,
      expiresAt: new Date(Date.now() + 4 * 60 * 1000),
      timestamp: new Date().toISOString()
    });
    
    // Save OTP to database
    const savedOtp = await OTP.findOneAndUpdate(
      { email },
      { 
        email,
        otp: otpCode,
        purpose: 'login',
        expiresAt: new Date(Date.now() + 4 * 60 * 1000) // 4 minutes
      },
      { upsert: true, new: true }
    );
    const afterSaveMs = Date.now() - t0;

    console.log('✅ OTP saved to database:', {
      id: savedOtp._id,
      email: savedOtp.email,
      otp: savedOtp.otp,
      purpose: savedOtp.purpose,
      expiresAt: savedOtp.expiresAt
    });

    // Send OTP email in background (non-blocking)
    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const emailResult = await sendOTPEmail(email, otpCode, 'login', partner.name || 'User');
        if (!emailResult.success) {
          console.error('login:otp-email-failed', { email, error: emailResult.error, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('login:otp-email-sent', { email, messageId: emailResult.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('login:otp-email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    const total = Date.now() - t0;
    res.status(200).json({
      success: true,
      requiresOtp: true,
      message: 'OTP generated and email dispatch in progress',
      timings: { afterGenMs, afterSaveMs, totalMs: total }
    });
  } catch (error) {
    console.error('Error in login:', { error: error.message, stack: error.stack, totalMs: Date.now() - t0 });
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Verify login OTP
// @route   POST /api/auth/verify-login-otp
// @access  Public
export const verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('🔍 OTP Verification Debug:', {
      email,
      otp,
      timestamp: new Date().toISOString()
    });

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and OTP'
      });
    }

    // Check all OTPs for this email for debugging
    const allOtps = await OTP.find({ email, purpose: 'login' });
    console.log('🔍 All login OTPs for email:', allOtps.map(o => ({
      otp: o.otp,
      expiresAt: o.expiresAt,
      isExpired: o.expiresAt < new Date(),
      timeLeft: o.expiresAt > new Date() ? Math.max(0, Math.floor((o.expiresAt - new Date()) / 1000)) + 's' : 'expired'
    })));

    // Find and verify OTP
    const otpRecord = await OTP.findOne({
      email,
      otp,
      purpose: 'login',
      expiresAt: { $gt: new Date() }
    });

    console.log('🔍 OTP Record Found:', otpRecord ? 'Yes' : 'No');

    if (!otpRecord) {
      // Check if OTP exists but expired
      const expiredOtp = await OTP.findOne({
        email,
        otp,
        purpose: 'login'
      });

      if (expiredOtp) {
        console.log('🔍 OTP exists but expired:', {
          expiresAt: expiredOtp.expiresAt,
          now: new Date(),
          expiredBy: Math.floor((new Date() - expiredOtp.expiresAt) / 1000) + 's'
        });
        return res.status(400).json({
          success: false,
          message: 'OTP has expired. Please request a new one.'
        });
      }

      // Check if there's any OTP for this email
      const anyOtp = await OTP.findOne({ email, purpose: 'login' });
      if (!anyOtp) {
        console.log('🔍 No login OTP found for this email');
        return res.status(400).json({
          success: false,
          message: 'No OTP found. Please login again to receive a new OTP.'
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please check and try again.'
      });
    }

    // Get partner details
    const partner = await Partner.findOne({ email });
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });
    console.log('✅ OTP verified successfully and deleted');

    // Send token response
    sendTokenResponse(partner, 200, res);
  } catch (error) {
    console.error('Error in verify login OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Resend login OTP
// @route   POST /api/auth/resend-login-otp
// @access  Public
export const resendLoginOtp = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email'
      });
    }

    // Check if partner exists
    const partner = await Partner.findOne({ email });
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const genMs = Date.now() - t0;
    
    // Save OTP to database
    await OTP.findOneAndUpdate(
      { email, purpose: 'login' },
      { 
        email,
        otp: otpCode,
        purpose: 'login',
        expiresAt: new Date(Date.now() + 4 * 60 * 1000) // 4 minutes
      },
      { upsert: true, new: true }
    );
    const afterSaveMs = Date.now() - t0;

    // Dispatch email asynchronously (non-blocking)
    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const emailResult = await sendOTPEmail(email, otpCode, 'login', partner.name || 'User');
        if (!emailResult.success) {
          const isTimeout = /timed? out/i.test(emailResult.error) || emailResult.error === 'EMAIL_TIMEOUT';
          console.error('resend-login:email-failed', { email, error: emailResult.error, isTimeout, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('resend-login:otp-email-sent', { email, messageId: emailResult.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('resend-login:email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    const totalMs = Date.now() - t0;
    res.status(200).json({
      success: true,
      message: 'OTP regenerated and email dispatch in progress',
      timings: { genMs, afterSaveMs, totalMs }
    });
  } catch (error) {
    console.error('Error in resend login OTP:', { error: error.message, stack: error.stack, totalMs: Date.now() - t0 });
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Step 1: Send OTP for forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const sendForgotPasswordOTP = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if partner exists with this email
    const partner = await Partner.findOne({ email });
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

  // Generate OTP
  const otp = generateOTP();
  const genMs = Date.now() - t0;
    
  // Delete any existing OTPs for this email and purpose
  await OTP.deleteMany({ email, purpose: 'password-reset' });
  const afterDeleteMs = Date.now() - t0;

    // Create new OTP record (valid for 10 minutes)
    const otpRecord = await OTP.create({
      email,
      otp,
      purpose: 'password-reset',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    const afterCreateMs = Date.now() - t0;

    // Send OTP email asynchronously
    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const emailResult = await sendForgotPasswordOTPEmail(email, otp, partner.name);
        if (!emailResult.success) {
          const isTimeout = /timed? out/i.test(emailResult.error) || emailResult.error === 'EMAIL_TIMEOUT';
            console.error('forgot-password:email-failed', {
              email,
              error: emailResult.error,
              isTimeout,
              elapsedMs: Date.now() - sendStart
            });
        } else {
          console.log('forgot-password:otp-sent', {
            email,
            messageId: emailResult.messageId,
            elapsedMs: Date.now() - sendStart
          });
        }
      } catch (err) {
        console.error('forgot-password:email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    res.status(200).json({
      success: true,
      message: 'Password reset OTP generated and email dispatch in progress',
      data: {
        email,
        expiresIn: '10 minutes'
      },
      timings: { genMs, afterDeleteMs, afterCreateMs, totalMs: Date.now() - t0 }
    });

  } catch (error) {
    console.error('Error in sendForgotPasswordOTP:', { error: error.message, stack: error.stack, totalMs: Date.now() - t0 });
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};

// @desc    Step 2: Verify OTP for forgot password
// @route   POST /api/auth/verify-forgot-password-otp
// @access  Public
export const verifyForgotPasswordOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Find and validate OTP
    const otpRecord = await OTP.findValidOTP(email, otp, 'password-reset');
    
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Check if partner still exists
    const partner = await Partner.findOne({ email });
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Generate a temporary reset token (valid for 15 minutes)
    const resetToken = jwt.sign(
      { 
        partnerId: partner._id,
        email: partner.email,
        purpose: 'password-reset'
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Delete the used OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        resetToken,
        expiresIn: '15 minutes'
      }
    });

  } catch (error) {
    console.error('Error in verifyForgotPasswordOTP:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};

// @desc    Step 3: Reset password with verified token
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if token is for password reset
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    // Find the partner
    const partner = await Partner.findById(decoded.partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Update password
    partner.password = newPassword;
    await partner.save();

    console.log(`Password reset successful for partner: ${partner.email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
};
