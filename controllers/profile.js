import Partner from '../models/Partner.js';
import Document from '../models/Document.js';

// Get user profile
export const getUserProfile = async (req, res) => {
  try {
    // Get the authenticated partner ID from req.user (set by auth middleware)
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    console.log('Getting profile for authenticated user ID:', userId); // Debug log
    
    const user = await Partner.findById(userId).select('-password');
    if (!user) {
      console.log('User not found for ID:', userId); // Debug log
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User found:', user.name, user.email); // Debug log

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      address: user.companyAddress || '',
      companyName: user.companyName || '',
      designation: user.designation || '',
      city: user.city || '',
      state: user.state || '',
      pincode: user.pincode || '',
      joinDate: user.createdAt,
      role: user.role || 'partner',
      status: user.status || 'pending',
      avatar: user.avatar || null,
      
      // Additional partner information
      aadhaarNumber: user.aadhaarNumber || '',
      panNumber: user.panNumber || '',
      experience: user.experience || '',
      specialization: user.specialization || '',
      referralCode: user.referralCode || '',
      
      // Performance metrics
      totalEarnings: user.totalEarnings || 0,
      totalLeads: user.totalLeads || 0,
      conversionRate: user.conversionRate || 0,
      
      // Payment preferences
      preferredPaymentMethod: user.preferredPaymentMethod || 'upi',
      upiId: user.upiId || '',
      bankDetails: user.bankDetails || {},
      
      // Approval information
      approvedAt: user.approvedAt,
      approvedBy: user.approvedBy
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    // Get user ID from authenticated request
    const userId = req.user.id;
    const { name, email, phone, address, companyName, designation, city, state, pincode } = req.body;

    const user = await Partner.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (address) user.companyAddress = address;
    if (companyName) user.companyName = companyName;
    if (designation) user.designation = designation;
    if (city) user.city = city;
    if (state) user.state = state;
    if (pincode) user.pincode = pincode;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.companyAddress,
        joinDate: user.createdAt,
        role: 'Partner',
        status: user.status,
        companyName: user.companyName,
        designation: user.designation,
        city: user.city,
        state: user.state,
        pincode: user.pincode
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
};

// Get personal documents for the user (signup documents only)
export const getPersonalDocuments = async (req, res) => {
  try {
    // Get the authenticated partner ID from req.user (set by auth middleware)
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      console.log('No user ID found in request'); // Debug log
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    console.log('Getting documents for authenticated user ID:', userId); // Debug log
    
  // Find the partner and get their documents including otherDocuments array
  const partner = await Partner.findById(userId).select('aadhaarFile panFile aadhaarFileMetadata panFileMetadata aadhaarNumber panNumber createdAt name email otherDocuments');
    if (!partner) {
      console.log('Partner not found for documents:', userId); // Debug log
      return res.status(404).json({ message: 'Partner not found' });
    }

    console.log('Partner found:', {
      name: partner.name,
      email: partner.email,
      aadhaarFile: partner.aadhaarFile,
      panFile: partner.panFile,
      aadhaarMetadata: partner.aadhaarFileMetadata,
      panMetadata: partner.panFileMetadata,
      aadhaarNumber: partner.aadhaarNumber,
      panNumber: partner.panNumber
    }); // Debug log

  const personalDocuments = [];

    // Add Aadhaar document if exists
    if (partner.aadhaarFile) {
      console.log('Processing Aadhaar file:', partner.aadhaarFile); // Debug log
      // Convert relative URL to full URL if necessary
      let aadhaarFileUrl = partner.aadhaarFile;
      if (aadhaarFileUrl.startsWith('/api/')) {
        aadhaarFileUrl = `${req.protocol}://${req.get('host')}${aadhaarFileUrl}`;
      }
      
      // Get file metadata or use defaults
      const aadhaarMetadata = partner.aadhaarFileMetadata || {};
      const originalName = aadhaarMetadata.originalName || 'Aadhaar Card';
      const filename = aadhaarMetadata.originalName || 'aadhaar_card';
      const extension = aadhaarMetadata.extension || 'pdf';
      const size = aadhaarMetadata.size || null;
      
      personalDocuments.push({
        _id: `aadhaar_${userId}`,
        originalName: originalName,
        filename: filename,
        documentType: 'aadhaar',
        status: 'approved',
        uploadedAt: partner.createdAt || new Date(),
        createdAt: partner.createdAt || new Date(),
        fileUrl: aadhaarFileUrl,
        previewUrl: aadhaarFileUrl,
        compressedSize: size,
        mimetype: aadhaarMetadata.mimetype || 'application/octet-stream',
        extension: extension,
        notes: `Aadhaar Number: ${partner.aadhaarNumber || 'N/A'}`
      });
    } else {
      console.log('No Aadhaar file found for partner'); // Debug log
    }

    // Add PAN document if exists
    if (partner.panFile) {
      console.log('Processing PAN file:', partner.panFile); // Debug log
      // Convert relative URL to full URL if necessary
      let panFileUrl = partner.panFile;
      if (panFileUrl.startsWith('/api/')) {
        panFileUrl = `${req.protocol}://${req.get('host')}${panFileUrl}`;
      }
      
      // Get file metadata or use defaults
      const panMetadata = partner.panFileMetadata || {};
      const originalName = panMetadata.originalName || 'PAN Card';
      const filename = panMetadata.originalName || 'pan_card';
      const extension = panMetadata.extension || 'pdf';
      const size = panMetadata.size || null;
      
      personalDocuments.push({
        _id: `pan_${userId}`,
        originalName: originalName,
        filename: filename,
        documentType: 'pan',
        status: 'approved',
        uploadedAt: partner.createdAt || new Date(),
        createdAt: partner.createdAt || new Date(),
        fileUrl: panFileUrl,
        previewUrl: panFileUrl,
        compressedSize: size,
        mimetype: panMetadata.mimetype || 'application/octet-stream',
        extension: extension,
        notes: `PAN Number: ${partner.panNumber || 'N/A'}`
      });
    } else {
      console.log('No PAN file found for partner'); // Debug log
    }

    // Include partner.otherDocuments (signup other documents stored on Partner)
    try {
      if (Array.isArray(partner.otherDocuments) && partner.otherDocuments.length > 0) {
        const mapped = partner.otherDocuments
          .slice() // clone
          .sort((a, b) => new Date(b.uploadedAt || b.createdAt) - new Date(a.uploadedAt || a.createdAt))
          .map(doc => ({
            _id: doc.gridfsId?.toString?.() || `gridfs_${doc.gridfsId}`,
            originalName: doc.originalName || doc.filename,
            filename: doc.filename,
            documentType: doc.documentType || 'general',
            isSignupDocument: true,
            status: 'pending',
            uploadedAt: doc.uploadedAt || partner.createdAt,
            createdAt: doc.uploadedAt || partner.createdAt,
            fileUrl: doc.fileUrl || doc.previewUrl,
            previewUrl: doc.previewUrl || doc.fileUrl,
            compressedSize: doc.size,
            mimetype: doc.mimetype,
            extension: doc.filename?.split('.')?.pop()?.toLowerCase() || '',
            notes: doc.notes || 'Uploaded during signup'
          }));
        personalDocuments.push(...mapped);
      }
    } catch (docErr) {
      console.warn('Failed to map partner.otherDocuments:', docErr?.message || docErr);
    }

    console.log('Final personal documents array:', personalDocuments); // Debug log
    console.log('Returning', personalDocuments.length, 'documents'); // Debug log

    res.json(personalDocuments);
  } catch (error) {
    console.error('Get personal documents error:', error);
    res.status(500).json({ message: 'Error fetching personal documents' });
  }
};

// Get payment preferences
export const getPaymentPreferences = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    const partner = await Partner.findById(userId).select('preferredPaymentMethod upiId bankDetails');
    
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }
    
    // Security Enhancement: Mask sensitive bank data for client response
    const maskedBankDetails = partner.bankDetails ? {
      accountNumber: partner.bankDetails.accountNumber ? 
        `****${partner.bankDetails.accountNumber.slice(-4)}` : '',
      accountHolderName: partner.bankDetails.accountHolderName || '',
      ifscCode: partner.bankDetails.ifscCode || '',
      bankName: partner.bankDetails.bankName || ''
    } : {};
    
    res.json({
      preferredPaymentMethod: partner.preferredPaymentMethod,
      upiId: partner.upiId,
      bankDetails: maskedBankDetails
    });
  } catch (error) {
    console.error('Get payment preferences error:', error);
    res.status(500).json({ message: 'Error fetching payment preferences' });
  }
};

// Update payment preferences
export const updatePaymentPreferences = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    console.log('🔍 Payment preferences update request:', {
      userId,
      body: req.body,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    const { preferredPaymentMethod, upiId, bankDetails } = req.body;
    
    // Security Validation: Payment method validation
    const validPaymentMethods = ['upi', 'paytm', 'phonepe', 'google-pay', 'internet-banking'];
    if (preferredPaymentMethod && !validPaymentMethods.includes(preferredPaymentMethod)) {
      console.error('❌ Invalid payment method:', preferredPaymentMethod);
      return res.status(400).json({ message: 'Invalid payment method' });
    }
    
    // Security Validation: UPI ID format validation
    if (upiId && upiId.length > 0) {
      const upiRegex = /^[a-zA-Z0-9.-]{2,}@[a-zA-Z0-9.-]{2,}$|^[0-9]{10}$/;
      if (!upiRegex.test(upiId)) {
        return res.status(400).json({ message: 'Invalid UPI ID format' });
      }
    }
    
    // Security Validation: Bank details validation
    if (preferredPaymentMethod === 'internet-banking') {
      if (!bankDetails || !bankDetails.accountNumber || !bankDetails.accountHolderName || !bankDetails.ifscCode || !bankDetails.bankName) {
        console.error('❌ Missing bank details for internet banking');
        return res.status(400).json({ 
          message: 'All bank details (Account Number, Account Holder Name, IFSC Code, Bank Name) are required for Internet Banking',
          missingFields: {
            accountNumber: !bankDetails?.accountNumber,
            accountHolderName: !bankDetails?.accountHolderName,
            ifscCode: !bankDetails?.ifscCode,
            bankName: !bankDetails?.bankName
          }
        });
      }
      
      const { accountNumber, accountHolderName, ifscCode, bankName } = bankDetails;
      
      // IFSC code format validation
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(ifscCode.toUpperCase())) {
        console.error('❌ Invalid IFSC code format:', ifscCode);
        return res.status(400).json({ message: 'Invalid IFSC code format. Example: HDFC0001234' });
      }
      
      // Account number validation (basic)
      if (accountNumber.length < 8 || accountNumber.length > 20) {
        console.error('❌ Invalid account number length:', accountNumber.length);
        return res.status(400).json({ 
          message: 'Account number must be between 8 and 20 characters' 
        });
      }
    }
    
    const partner = await Partner.findById(userId);
    
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }
    
    // Update payment preferences
    if (preferredPaymentMethod) partner.preferredPaymentMethod = preferredPaymentMethod;
    if (upiId !== undefined) partner.upiId = upiId;
    if (bankDetails) {
      const incoming = { ...bankDetails };
      // Prevent saving masked account numbers (e.g., ****1234)
      if (typeof incoming.accountNumber === 'string' && /\*/.test(incoming.accountNumber)) {
        delete incoming.accountNumber; // keep existing stored value
      }
      // Normalize IFSC to uppercase
      if (incoming.ifscCode) incoming.ifscCode = incoming.ifscCode.toUpperCase();
      partner.bankDetails = {
        ...partner.bankDetails,
        ...incoming
      };
    }
    
    await partner.save();
    
    // Audit Log: Record sensitive data changes
    console.info(`Payment preferences updated - Partner: ${userId} (${partner.email}), Method: ${partner.preferredPaymentMethod}, Timestamp: ${new Date().toISOString()}`);
    
    // Security Enhancement: Mask sensitive data in response
    const maskedBankDetails = partner.bankDetails ? {
      accountNumber: partner.bankDetails.accountNumber ? 
        `****${partner.bankDetails.accountNumber.slice(-4)}` : '',
      accountHolderName: partner.bankDetails.accountHolderName || '',
      ifscCode: partner.bankDetails.ifscCode || '',
      bankName: partner.bankDetails.bankName || ''
    } : {};
    
    res.json({
      message: 'Payment preferences updated successfully',
      preferredPaymentMethod: partner.preferredPaymentMethod,
      upiId: partner.upiId,
      bankDetails: maskedBankDetails
    });
  } catch (error) {
    console.error('Update payment preferences error:', error);
    res.status(500).json({ message: 'Error updating payment preferences' });
  }
};

// Get partner payment preferences for admin (for payment processing)
// Invoice-only endpoint: return unmasked payment preferences for the authenticated partner
// Usage: Client should call only when generating an invoice, not for general display.
export const getPaymentPreferencesRawForInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const partner = await Partner.findById(userId).select('preferredPaymentMethod upiId bankDetails');
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }

    // Return unmasked details for invoice generation only
    res.json({
      preferredPaymentMethod: partner.preferredPaymentMethod || 'upi',
      upiId: partner.upiId || '',
      bankDetails: partner.bankDetails || {}
    });
  } catch (error) {
    console.error('Get raw payment preferences (invoice) error:', error);
    res.status(500).json({ message: 'Error fetching payment preferences for invoice' });
  }
};
export const getPartnerPaymentPreferencesForAdmin = async (req, res) => {
  try {
    const { partnerId } = req.params;
    
    // Security Check 1: Verify admin role
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      // Log unauthorized access attempt
      console.warn(`Unauthorized access attempt to partner payment preferences by user: ${req.user._id} (${req.user.email}) - Role: ${req.user.role}`);
      return res.status(403).json({ 
        message: 'Access denied. Admin privileges required to view partner payment preferences.' 
      });
    }
    
    // Security Check 2: Validate partner ID format
    if (!partnerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid partner ID format' });
    }
    
    const partner = await Partner.findById(partnerId)
      .select('name email preferredPaymentMethod upiId bankDetails status');
    
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }
    
    // Security Check 3: Only allow access to approved partners
    if (partner.status !== 'approved') {
      return res.status(403).json({ 
        message: 'Access denied. Can only view payment preferences for approved partners.' 
      });
    }
    
    // Security Enhancement: Mask sensitive data
    const maskedBankDetails = partner.bankDetails ? {
      accountNumber: partner.bankDetails.accountNumber ? 
        `****${partner.bankDetails.accountNumber.slice(-4)}` : '',
      accountHolderName: partner.bankDetails.accountHolderName || '',
      ifscCode: partner.bankDetails.ifscCode || '',
      bankName: partner.bankDetails.bankName || ''
    } : {};
    
    // Audit Log: Record access to sensitive data
    console.info(`Admin access to partner payment preferences - Admin: ${req.user._id} (${req.user.email}), Partner: ${partnerId} (${partner.email}), Timestamp: ${new Date().toISOString()}`);
    
    res.json({
      partnerId: partner._id,
      partnerName: partner.name,
      partnerEmail: partner.email,
      preferredPaymentMethod: partner.preferredPaymentMethod,
      upiId: partner.upiId,
      bankDetails: maskedBankDetails,
      // Additional security metadata
      lastUpdated: partner.updatedAt,
      partnerStatus: partner.status
    });
  } catch (error) {
    console.error('Get partner payment preferences for admin error:', error);
    res.status(500).json({ message: 'Error fetching partner payment preferences' });
  }
};
