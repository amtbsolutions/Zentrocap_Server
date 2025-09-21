import { body } from 'express-validator';

// Validation rules for creating a lead
export const validateCreateLead = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
    
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
    
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^[0-9]{10}$/)
    .withMessage('Please provide a valid 10-digit phone number'),
    
  body('leadSource')
    .notEmpty()
    .withMessage('Lead source is required')
    .isIn([
      'Website Form',
      'Social Media',
      'Referral',
      'Cold Call',
      'Email Campaign',
      'Partner Referral',
      'Advertisement',
      'Trade Show',
      'Other'
    ])
    .withMessage('Invalid lead source'),
    
  body('leadType')
    .optional()
    .isIn(['Individual', 'Corporate', 'SME', 'Enterprise'])
    .withMessage('Invalid lead type'),
    
  body('status')
    .optional()
    .isIn([
      'New',
      'Contacted',
      'Qualified',
      'Proposal Sent',
      'Negotiation',
      'Closed Won',
      'Closed Lost',
      'On Hold'
    ])
    .withMessage('Invalid status'),
    
  body('priority')
    .optional()
    .isIn(['Low', 'Medium', 'High', 'Urgent'])
    .withMessage('Invalid priority'),
    
  body('company')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Company name must not exceed 100 characters'),
    
  body('designation')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Designation must not exceed 50 characters'),
    
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must not exceed 200 characters'),
    
  body('city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City must not exceed 50 characters'),
    
  body('state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State must not exceed 50 characters'),
    
  body('pincode')
    .optional()
    .matches(/^[0-9]{6}$/)
    .withMessage('Please provide a valid 6-digit pincode'),
    
  body('interestedProducts')
    .optional()
    .isArray()
    .withMessage('Interested products must be an array'),
    
  body('interestedProducts.*')
    .optional()
    .isIn([
      'Mutual Funds',
      'Insurance',
      'Fixed Deposits',
      'Equity Trading',
      'Bonds',
      'Tax Planning',
      'Retirement Planning',
      'Wealth Management',
      'Other'
    ])
    .withMessage('Invalid product interest'),
    
  body('estimatedInvestment')
    .optional()
    .isNumeric()
    .withMessage('Estimated investment must be a number')
    .isFloat({ min: 0 })
    .withMessage('Estimated investment must be a positive number'),
    
  body('investmentTimeframe')
    .optional()
    .isIn([
      'Immediate',
      'Within 1 Month',
      'Within 3 Months',
      'Within 6 Months',
      'Within 1 Year',
      'Not Decided'
    ])
    .withMessage('Invalid investment timeframe'),
    
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned user ID'),
    
  body('assignedPartner')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned partner ID'),
    
  body('importNote')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Import note must not exceed 1000 characters')
];

// Validation rules for updating a lead
export const validateUpdateLead = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
    
  body('email')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Email cannot be empty')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
    
  body('phone')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Phone number cannot be empty')
    .matches(/^[0-9]{10}$/)
    .withMessage('Please provide a valid 10-digit phone number'),
    
  body('leadSource')
    .optional()
    .isIn([
      'Website Form',
      'Social Media',
      'Referral',
      'Cold Call',
      'Email Campaign',
      'Partner Referral',
      'Advertisement',
      'Trade Show',
      'Other'
    ])
    .withMessage('Invalid lead source'),
    
  body('leadType')
    .optional()
    .isIn(['Individual', 'Corporate', 'SME', 'Enterprise'])
    .withMessage('Invalid lead type'),
    
  body('status')
    .optional()
    .isIn([
      'New',
      'Contacted',
      'Qualified',
      'Proposal Sent',
      'Negotiation',
      'Closed Won',
      'Closed Lost',
      'On Hold'
    ])
    .withMessage('Invalid status'),
    
  body('priority')
    .optional()
    .isIn(['Low', 'Medium', 'High', 'Urgent'])
    .withMessage('Invalid priority'),
    
  body('company')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Company name must not exceed 100 characters'),
    
  body('designation')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Designation must not exceed 50 characters'),
    
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must not exceed 200 characters'),
    
  body('city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City must not exceed 50 characters'),
    
  body('state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State must not exceed 50 characters'),
    
  body('pincode')
    .optional()
    .matches(/^[0-9]{6}$/)
    .withMessage('Please provide a valid 6-digit pincode'),
    
  body('interestedProducts')
    .optional()
    .isArray()
    .withMessage('Interested products must be an array'),
    
  body('interestedProducts.*')
    .optional()
    .isIn([
      'Mutual Funds',
      'Insurance',
      'Fixed Deposits',
      'Equity Trading',
      'Bonds',
      'Tax Planning',
      'Retirement Planning',
      'Wealth Management',
      'Other'
    ])
    .withMessage('Invalid product interest'),
    
  body('estimatedInvestment')
    .optional()
    .isNumeric()
    .withMessage('Estimated investment must be a number')
    .isFloat({ min: 0 })
    .withMessage('Estimated investment must be a positive number'),
    
  body('investmentTimeframe')
    .optional()
    .isIn([
      'Immediate',
      'Within 1 Month',
      'Within 3 Months',
      'Within 6 Months',
      'Within 1 Year',
      'Not Decided'
    ])
    .withMessage('Invalid investment timeframe'),
    
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned user ID'),
    
  body('assignedPartner')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned partner ID'),
    
  body('convertedToClient')
    .optional()
    .isBoolean()
    .withMessage('Converted to client must be a boolean'),
    
  body('conversionValue')
    .optional()
    .isNumeric()
    .withMessage('Conversion value must be a number')
    .isFloat({ min: 0 })
    .withMessage('Conversion value must be a positive number'),
    
  body('nextFollowUpDate')
    .optional()
    .isISO8601()
    .withMessage('Next follow-up date must be a valid date')
];

// Validation rules for adding notes
export const validateAddNote = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Note content is required')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Note content must be between 1 and 1000 characters')
];

// Validation rules for adding communications
export const validateAddCommunication = [
  body('type')
    .notEmpty()
    .withMessage('Communication type is required')
    .isIn(['Call', 'Email', 'Meeting', 'WhatsApp', 'SMS', 'Other'])
    .withMessage('Invalid communication type'),
    
  body('subject')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subject must not exceed 200 characters'),
    
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
    
  body('outcome')
    .optional()
    .isIn(['Positive', 'Neutral', 'Negative', 'No Response'])
    .withMessage('Invalid outcome'),
    
  body('nextFollowUp')
    .optional()
    .isISO8601()
    .withMessage('Next follow-up date must be a valid date')
];

// Validation rules for assigning leads
export const validateAssignLead = [
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned user ID'),
    
  body('assignedPartner')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned partner ID')
];

// Custom validation to ensure at least one assignment is provided
export const validateAssignmentRequired = [
  body().custom((value, { req }) => {
    if (!req.body.assignedTo && !req.body.assignedPartner) {
      throw new Error('Either assignedTo or assignedPartner must be provided');
    }
    return true;
  })
];
