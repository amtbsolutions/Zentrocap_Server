import Lead from '../models/Lead.js';
import { recomputeAndPersistPartnerAggregates } from '../utils/partnerAggregates.js';
import Partner from '../models/Partner.js';
import NotificationService from '../services/NotificationService.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { connectAdminDB, createAdminLeadModel, createAdminInsuranceLeadModel } from '../utils/adminDbConnection.js';
import csv from 'csv-parser';
import { Transform } from 'stream';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// @desc    Get all leads with filtering, sorting and pagination
// @route   GET /api/leads
// @access  Private
export const getLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      status,
      priority,
      leadSource,
      leadType,
      assignedPartner,
      search,
      dateFrom,
      dateTo
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (leadSource) filter.leadSource = leadSource;
    if (leadType) filter.leadType = leadType;
    if (assignedPartner) filter.assignedPartner = assignedPartner;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    
    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    // Role-based filtering
    if (req.user.role === 'partner') {
      filter.assignedPartner = req.user._id;
    }

    const skip = (page - 1) * limit;
    
    const leads = await Lead.find(filter)
      .populate('assignedPartner', 'name email companyName')
      .populate('createdBy', 'name email companyName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      },
      data: leads
    });
  } catch (error) {
    console.error('Error in getLeads:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
export const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedPartner', 'name email phone companyName')
      .populate('createdBy', 'name email companyName')
      .populate('notes.createdBy', 'name email companyName')
      .populate('communications.createdBy', 'name email companyName');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check permissions
    if (req.user.role === 'partner' && 
        lead.assignedPartner && 
        lead.assignedPartner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this lead'
      });
    }

    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (error) {
    console.error('Error in getLead:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private
export const createLead = async (req, res) => {
  try {
    console.log('CREATE LEAD REQUEST:', {
      body: req.body,
      user: req.user?._id,
      headers: req.headers.authorization
    });

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array()
      });
    }

    // Check if lead with same email or phone already exists
    const existingLead = await Lead.findOne({
      $or: [
        { email: req.body.email },
        { phone: req.body.phone }
      ]
    });

    if (existingLead) {
      return res.status(400).json({
        success: false,
        message: 'Lead with this email or phone already exists'
      });
    }

    const leadData = {
      ...req.body,
      createdBy: req.user._id,
      assignedPartner: req.user._id, // Auto-assign to the partner who created it
      notes: [] // Initialize as empty array
    };

    // Handle importNote from CSV import
    if (req.body.importNote && req.body.importNote.trim()) {
      leadData.notes = [{
        content: req.body.importNote.trim(),
        createdBy: req.user._id,
        createdAt: new Date()
      }];
      // Remove importNote from leadData as it's not part of the schema
      delete leadData.importNote;
    }

    // Remove any notes field if it's not an array (from CSV import)
    if (req.body.notes && typeof req.body.notes === 'string') {
      delete leadData.notes;
      // If there was a string note, convert it to proper format
      if (req.body.notes.trim()) {
        leadData.notes = [{
          content: req.body.notes.trim(),
          createdBy: req.user._id,
          createdAt: new Date()
        }];
      } else {
        leadData.notes = [];
      }
    }

  const lead = await Lead.create(leadData);

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedPartner', 'name email companyName')
      .populate('createdBy', 'name email companyName');

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: populatedLead
    });
  } catch (error) {
    console.error('Error in createLead:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      details: error.message
    });
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
export const updateLead = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors.array()
      });
    }

    let lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check permissions
    if (req.user.role === 'partner' && 
        lead.assignedPartner && 
        lead.assignedPartner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this lead'
      });
    }

    // Handle notes - add new notes instead of replacing
    if (req.body.notes && Array.isArray(req.body.notes)) {
      for (const note of req.body.notes) {
        lead.notes.push({
          content: note.content || note,
          createdBy: req.user._id,
          createdAt: new Date()
        });
      }
    }

    // Handle communications - add new communications instead of replacing
    if (req.body.communications && Array.isArray(req.body.communications)) {
      for (const comm of req.body.communications) {
        lead.communications.push({
          ...comm,
          createdBy: req.user._id,
          createdAt: new Date()
        });
      }
    }

    // Update other fields (excluding notes and communications as they're handled above)
    const { notes, communications, ...otherUpdates } = req.body;
    const updateData = {
      ...otherUpdates,
      updatedBy: req.user._id
    };


    // If status is being updated to 'Converted', set convertedToClient to true
    if (updateData.status === 'Converted') {
      lead.convertedToClient = true;
    } else if (updateData.status && lead.convertedToClient) {
      // If status is changed from 'Converted' to something else, set convertedToClient to false
      lead.convertedToClient = false;
    }

    // Apply updates to the lead object
    Object.assign(lead, updateData);

    // Save the lead with all updates
    await lead.save({ runValidators: true });

    // Recompute partner aggregates if relevant status changed
    try {
      if (lead.assignedPartner && updateData.status) {
        if (['Converted','Completed','Lost','New','Qualified'].includes(updateData.status)) {
          recomputeAndPersistPartnerAggregates(lead.assignedPartner).catch(err => console.warn('aggregate recompute (lead update) failed:', err.message));
        }
      }
    } catch (aggErr) {
      console.warn('Lead update aggregate recompute non-fatal:', aggErr.message);
    }

    // Populate the updated lead
    await lead.populate('assignedPartner', 'name email companyName');
    await lead.populate('createdBy', 'name email companyName');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found after update'
      });
    }

  // Lead score removed

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully',
      data: lead
    });
  } catch (error) {
    console.error('Error in updateLead:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private (Admin only)
export const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Only allow partners to delete their own leads
    if (req.user.role === 'partner' && lead.assignedPartner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this lead.'
      });
    }
    await Lead.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteLead:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Add note to lead
// @route   POST /api/leads/:id/notes
// @access  Private
export const addNote = async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Note content is required'
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check permissions
    if (req.user.role === 'partner' && 
        lead.assignedPartner && 
        lead.assignedPartner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add notes to this lead'
      });
    }

    lead.notes.push({
      content,
      createdBy: req.user._id
    });

    await lead.save();

    const updatedLead = await Lead.findById(req.params.id)
      .populate('notes.createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Note added successfully',
      data: updatedLead.notes
    });
  } catch (error) {
    console.error('Error in addNote:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Add communication to lead
// @route   POST /api/leads/:id/communications
// @access  Private
export const addCommunication = async (req, res) => {
  try {
    const { type, subject, description, outcome, nextFollowUp } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Communication type is required'
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check permissions
    if (req.user.role === 'partner' && 
        lead.assignedPartner && 
        lead.assignedPartner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add communications to this lead'
      });
    }

    lead.communications.push({
      type,
      subject,
      description,
      outcome,
      nextFollowUp,
      createdBy: req.user._id
    });

    // Update next follow-up date
    if (nextFollowUp) {
      lead.nextFollowUpDate = nextFollowUp;
    }

    await lead.save();

    const updatedLead = await Lead.findById(req.params.id)
      .populate('communications.createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Communication logged successfully',
      data: updatedLead.communications
    });
  } catch (error) {
    console.error('Error in addCommunication:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Assign lead to partner
// @route   PUT /api/leads/:id/assign
// @access  Private (Partner only)
export const assignLead = async (req, res) => {
  try {
    const { assignedPartner } = req.body;
  const actorRole = req.user.role; // Expect 'admin' or 'superadmin' for admin-driven assignment

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const previousPartner = lead.assignedPartner?.toString();

    // Verify assigned partner exists (if provided)
    if (assignedPartner) {
      const partner = await Partner.findById(assignedPartner);
      if (!partner) {
        return res.status(400).json({ success: false, message: 'Assigned partner not found' });
      }
    }

    const isChange = assignedPartner && assignedPartner.toString() !== previousPartner;

    // Apply assignment
    lead.assignedPartner = assignedPartner || null;
    lead.updatedBy = req.user._id;

    // If admin initiating a NEW assignment (or reassignment) capture admin flags
    if (isChange && (actorRole === 'admin' || actorRole === 'superadmin')) {
      lead.assignedByAdmin = true;
      lead.adminAssignedBy = req.user.name || req.user.email || 'Admin';
      lead.adminAssignedAt = new Date();
    }

    await lead.save();

    const updatedLead = await Lead.findById(req.params.id)
      .populate('assignedPartner', 'name email companyName');

    // Fire notification ONLY when a new assignment occurred and an admin performed it
    if (isChange && (actorRole === 'admin' || actorRole === 'superadmin') && assignedPartner) {
      // watcher logs suppressed
      try {
        await NotificationService.createAdminAssignedLeadsNotification(
          assignedPartner,
          1,
          { name: lead.adminAssignedBy }
        );
      } catch (notificationError) {
        // watcher logs suppressed
      }
    }

    res.status(200).json({ success: true, message: 'Lead assigned successfully', data: updatedLead });
  } catch (error) {
    console.error('Error in assignLead:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get lead statistics
// @route   GET /api/leads/stats
// @access  Private
export const getLeadStats = async (req, res) => {
  try {
    let matchStage = {};
    
    // Role-based filtering
    if (req.user.role === 'partner') {
      matchStage.assignedPartner = req.user._id;
    }

    const stats = await Lead.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
          newLeads: { $sum: { $cond: [{ $eq: ['$status', 'New'] }, 1, 0] } },
          qualifiedLeads: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
          convertedLeads: { $sum: { $cond: ['$convertedToClient', 1, 0] } },
          totalConversionValue: { $sum: '$conversionValue' }
        }
      }
    ]);

    const statusBreakdown = await Lead.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const sourceBreakdown = await Lead.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$leadSource',
          count: { $sum: 1 }
        }
      }
    ]);

    const monthlyLeads = await Lead.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          converted: { $sum: { $cond: ['$convertedToClient', 1, 0] } }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalLeads: 0,
          newLeads: 0,
          qualifiedLeads: 0,
          convertedLeads: 0,
          totalConversionValue: 0
        },
        statusBreakdown,
        sourceBreakdown,
        monthlyLeads
      }
    });
  } catch (error) {
    console.error('Error in getLeadStats:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get leads requiring follow-up
// @route   GET /api/leads/followup
// @access  Private
export const getFollowUpLeads = async (req, res) => {
  try {
    let matchStage = {
      nextFollowUpDate: { $lte: new Date() },
      status: { $nin: ['Closed Won', 'Closed Lost'] }
    };
    
    // Role-based filtering
    if (req.user.role === 'partner') {
      matchStage.assignedPartner = req.user._id;
    }

    const followUpLeads = await Lead.find(matchStage)
      .populate('assignedPartner', 'name email companyName')
      .sort('nextFollowUpDate')
      .limit(50);

    res.status(200).json({
      success: true,
      count: followUpLeads.length,
      data: followUpLeads
    });
  } catch (error) {
    console.error('Error in getFollowUpLeads:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get admin assigned leads for current partner
// @route   GET /api/leads/admin-assigned
// @access  Private (Partners only)
export const getAdminAssignedLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      status,
      search,
      dateFrom,
      dateTo
    } = req.query;

    // Connect to admin-dashboard database to get admin assigned leads
    const adminConnection = connectAdminDB();
    const AdminLead = createAdminLeadModel(adminConnection);

    // Build filter for admin-assigned leads (match by partner ID or partner email)
    const partnerIdStr = req.user._id?.toString();
    const partnerEmail = req.user.email || req.user.username || null;
    const emailRegex = partnerEmail ? new RegExp(`^${partnerEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
    const filter = {
      $or: [
        ...(partnerIdStr ? [{ assignedPartner: partnerIdStr }] : []),
        ...(partnerEmail ? [{ assignedPartner: partnerEmail }] : []),
        ...(emailRegex ? [{ assignedPartner: { $regex: emailRegex } }] : [])
      ]
    };
    
    if (status && status !== 'all') filter.status = status;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    
    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

  // watcher logs suppressed

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const leads = await AdminLead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await AdminLead.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

  // watcher logs suppressed

    // Transform leads to match expected format for frontend
  const transformedLeads = leads.map(lead => ({
      _id: lead._id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      city: lead.city,
      state: lead.state,
      pincode: lead.pincode,
      leadSource: lead.leadSource || 'Other',
      status: lead.status || 'New',
      priority: lead.priority || 'Medium',
      interestedProducts: lead.interestedProducts || [],
  estimatedInvestment: (lead.investmentAmount ?? lead.budget) || 0,
  investmentAmount: lead.investmentAmount ?? lead.budget ?? 0,
  budget: lead.budget || 0,
  investmentDate: lead.investmentDate || null,
  saleAmount: lead.saleAmount || 0,
  saleDate: lead.saleDate || null,
  insuranceType: lead.insuranceType || '',
      notes: Array.isArray(lead.notes) ? lead.notes : (lead.notes ? [{ content: lead.notes, createdAt: lead.createdAt }] : []),
      assignedByAdmin: true,
      adminAssignedBy: lead.assignedBy || 'Admin System',
      adminAssignedAt: lead.assignedAt || lead.createdAt,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      // Virtual fields for frontend compatibility
      leadId: lead._id.toString().slice(-8).toUpperCase(),
      daysSinceCreated: Math.floor((Date.now() - new Date(lead.createdAt)) / (1000 * 60 * 60 * 24))
    }));

    // Calculate summary statistics
  const summaryData = await AdminLead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: 1 },
      totalBudget: { $sum: { $ifNull: ['$investmentAmount', '$budget'] } },
          statusBreakdown: { $push: '$status' }
        }
      }
    ]);

    // Process status breakdown
    const statusStats = {};
    if (summaryData.length > 0) {
      summaryData[0].statusBreakdown.forEach(status => {
        const normalizedStatus = status || 'new';
        statusStats[normalizedStatus] = (statusStats[normalizedStatus] || 0) + 1;
      });
    }

    // Close admin connection
    await adminConnection.close();

    res.status(200).json({
      success: true,
      count: transformedLeads.length,
      total,
      totalPages,
      currentPage: pageNum,
      data: transformedLeads,
      summary: {
        totalLeads: summaryData[0]?.totalLeads || 0,
        totalEstimatedValue: summaryData[0]?.totalBudget || 0,
        avgLeadScore: 0, // Admin leads don't have lead scores
        statusStats
      }
    });
  } catch (error) {
    console.error('Error in getAdminAssignedLeads:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get admin assigned insurance leads (from partner-dashboard.leads)
// @route   GET /api/leads/admin-assigned-insurance
// @access  Private (Partners only)
export const getAdminAssignedInsuranceLeads = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, dateFrom, dateTo } = req.query;
    const AdminLead = (await import('../models/admin/AdminLead.js')).default;

    // Assigned to partner by email captured in AdminLead.assignedPartnerEmail
    const partnerEmail = (req.user.email || req.user.username || '').trim();
    const emailRegex = partnerEmail ? new RegExp(`^${partnerEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
    const filter = emailRegex ? { assignedPartnerEmail: { $regex: emailRegex } } : {};
    if (status && status !== 'all') filter.status = status;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      filter.$or = [
        { ownerName: { $regex: search, $options: 'i' } },
        { ownerMobileNumber: { $regex: search, $options: 'i' } },
        { state: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { registrationNo: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const leads = await (await AdminLead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean());

    const total = await AdminLead.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    const getPath = (obj, path) => {
      if (!obj || !path) return undefined;
      const parts = path.split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
          cur = cur[p];
        } else {
          return undefined;
        }
      }
      return cur;
    };
    const getFirst = (obj, keys) => {
      for (const k of keys) {
        const v = k.includes('.') ? getPath(obj, k) : obj[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };
    const flatten = (obj, prefix = '', out = {}) => {
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            flatten(v, key, out);
          } else {
            out[key] = v;
          }
        }
      }
      return out;
    };
    const pickByKeywords = (obj, mustIncludes = [], mustNotIncludes = []) => {
      const flat = flatten(obj);
      const entries = Object.entries(flat);
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [k, v] of entries) {
        const nk = norm(k);
        if (mustIncludes.every((kw) => nk.includes(kw)) && !mustNotIncludes.some((kw) => nk.includes(kw))) {
          if (v !== undefined && v !== null && v !== '') return v;
        }
      }
      return undefined;
    };
    const toDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
      if (typeof val === 'number') {
        // Interpret 10-digit as seconds, 13-digit as ms
        const ms = val < 1e12 ? val * 1000 : val;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof val === 'string') {
        const s = val.trim();
        if (!s) return null;
        // DD/MM/YYYY or DD-MM-YYYY
        let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
        if (m) {
          const [_, dd, mm, yyyy] = m;
          const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
          return isNaN(d.getTime()) ? null : d;
        }
        // YYYY/MM/DD or YYYY-MM-DD
        m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
        if (m) {
          const [_, yyyy, mm, dd] = m;
          const d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
          return isNaN(d.getTime()) ? null : d;
        }
        // ISO or other parseable formats
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    const transformed = leads.map((lead) => {
  const ownerName = getFirst(lead, ['ownerName','OwnerName','owner','Owner','customerName','CustomerName','insuredName','policyHolder','policyHolderName','name','customer.name','owner.name']);
      const contact = undefined;
      const phone = lead.ownerMobileNumber || getFirst(lead, ['phone','phoneNumber','mobile']);
      const email = undefined;
      const city = lead.city;
      const state = lead.state;
      const address = lead.currentAddress;
      let registrationNo = getFirst(lead, [
        'registrationNo','registrationNumber','vehicleRegistration','vehicleRegNo','vehicleNumber',
        'registration_number','reg_no','veh_reg_no','vehicle.registrationNo','vehicle.regNo','vehicle.number',
        'Registration No','Reg No','Vehicle No','Vehicle Number','rc.registration_number','rc.regn_no',
        'vehicleInfo.registrationNo','vehicleInfo.regNo','policy.vehicleRegistrationNo'
      ]);
      let registrationDate = toDate(getFirst(lead, [
        'registrationDate','regDate','registration_date','dateOfRegistration','vehicleRegDate','vehicle.registrationDate',
        'Registration Date','Date of Registration','rc.registration_date','vehicleInfo.registrationDate',
        'reg_date','registrationDt','vehicleInfo.regDate'
      ]));
      let engineNumber = getFirst(lead, [
        'engineNumber','engine_no','engineNo','vehicle.engineNumber','Engine Number','rc.engine_no','rc.eng_no',
        'vehicleInfo.engineNumber'
      ]);
      let chassisNumber = getFirst(lead, [
        'chassisNumber','chassis_no','chassisNo','vehicle.chassisNumber','Chassis Number','rc.chassis_no',
        'vehicleInfo.chassisNumber'
      ]);
      let vehicleMaker = getFirst(lead, [
        'vehicleMaker','manufacturer','maker','make','brand','vehicle.make','vehicle.manufacturer','Vehicle Maker',
        'makerName','makeName','brandName','rc.maker_model.make','vehicleInfo.make','vehicleInfo.manufacturer'
      ]);
      let vehicleModel = getFirst(lead, [
        'vehicleModel','model','modelName','variant','vehicle.model','Vehicle Model','variantName',
        'rc.maker_model.model','vehicleInfo.model','vehicleInfo.modelName'
      ]);

      // Fallback heuristic search in flattened keys
      if (!registrationNo) registrationNo = pickByKeywords(lead, ['reg'], ['date']);
      if (!registrationDate) {
        const val = pickByKeywords(lead, ['reg','date'], []);
        registrationDate = toDate(val);
      }
      if (!engineNumber) engineNumber = pickByKeywords(lead, ['engine'], []);
      if (!chassisNumber) chassisNumber = pickByKeywords(lead, ['chassis'], []);
      if (!vehicleMaker) vehicleMaker = pickByKeywords(lead, ['make']);
      if (!vehicleMaker) vehicleMaker = pickByKeywords(lead, ['brand']);
      if (!vehicleMaker) vehicleMaker = pickByKeywords(lead, ['manufacturer']);
      if (!vehicleModel) vehicleModel = pickByKeywords(lead, ['model']);
      const statusVal = getFirst(lead, ['status','Status']) || 'Pending';
      // Prefer persisted insuranceSaleAmount from schema; fallback to legacy field names
      let derivedSaleAmount = Number(getFirst(lead, ['saleAmount','premium','totalPremium','amount','policyAmount'])) || 0;
      const insuranceSaleAmount = (lead.insuranceSaleAmount !== undefined && lead.insuranceSaleAmount !== null)
        ? Number(lead.insuranceSaleAmount) : derivedSaleAmount;
      const saleDate = toDate(getFirst(lead, ['saleDate','policyDate','paymentDate','issuanceDate']));
      const insuranceType = getFirst(lead, ['insuranceType','type','policyType','planType','category']) || '';
      const leadExpiry = toDate(getFirst(lead, [
        'leadExpiry','expiryDate','policyExpiry','policyEndDate','endDate','expiry','policy.expiryDate','policy.endDate'
      ]));

      return {
        _id: lead._id,
        ownerName,
        name: getFirst(lead, ['name','Name']) || ownerName,
        contact,
        phone,
        email,
        city,
        state,
        address,
        registrationNo,
        registrationDate,
        engineNumber,
        chassisNumber,
        vehicleMaker,
        vehicleModel,
    status: statusVal,
    // Expose both insuranceSaleAmount (new) and saleAmount (legacy/UI compatibility)
    insuranceSaleAmount,
    saleAmount: insuranceSaleAmount,
        saleDate,
  insuranceType,
  leadExpiry,
    awaitingAdminApproval: !!lead.awaitingAdminApproval,
    earningAssigned: !!lead.earningAssigned,
        assignedByAdmin: true,
        adminAssignedBy: getFirst(lead, ['assignedBy','AssignedBy']) || 'Admin System',
        adminAssignedAt: getFirst(lead, ['assignedAt']) || lead.createdAt,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        leadId: lead._id.toString().slice(-8).toUpperCase(),
        daysSinceCreated: Math.floor((Date.now() - new Date(lead.createdAt)) / (1000 * 60 * 60 * 24))
      };
    });

    res.status(200).json({
      success: true,
      count: transformed.length,
      total,
      totalPages,
      currentPage: pageNum,
      data: transformed
    });
  } catch (error) {
    console.error('Error in getAdminAssignedInsuranceLeads:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
// Update admin assigned lead
export const updateAdminAssignedLead = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const partnerId = req.user._id;

  // watcher logs suppressed

  // Connect to admin database
  const adminConnection = connectAdminDB();
  // Use the shared AdminLead schema/model to keep fields consistent
  const AdminLead = createAdminLeadModel(adminConnection);

    // Verify this lead is assigned to the current partner (by ID or email)
    const partnerIdStr = partnerId?.toString();
    const partnerEmail = req.user.email || req.user.username || null;
    const emailRegex = partnerEmail ? new RegExp(`^${partnerEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
    const existingLead = await AdminLead.findOne({
      _id: id,
      $or: [
        ...(partnerIdStr ? [{ assignedPartner: partnerIdStr }] : []),
        ...(partnerEmail ? [{ assignedPartner: partnerEmail }] : []),
        ...(emailRegex ? [{ assignedPartner: { $regex: emailRegex } }] : [])
      ]
    });

  // watcher logs suppressed

    if (!existingLead) {
      await adminConnection.close();
      return res.status(404).json({
        success: false,
        message: 'Lead not found or not assigned to you'
      });
    }

    // Only allow certain fields to be updated by partners
    const allowedUpdates = {
      status: updates.status,
      priority: updates.priority,
      notes: updates.notes,
      followUpDate: updates.followUpDate,
      // investment edits allowed for partners
      investmentAmount: undefined,
      investmentDate: undefined,
      saleAmount: undefined,
      saleDate: undefined,
      insuranceType: undefined,
      lastContactDate: new Date()
    };

    // Helper: parse currency/number strings safely (strip commas, currency symbols)
    const parseAmount = (val) => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[^0-9.\-]/g, '');
        const n = Number(cleaned);
        return Number.isNaN(n) ? undefined : n;
      }
      return undefined;
    };

    // Map accepted input variants to investmentAmount/investmentDate
    const amountKeys = [
      'investmentAmount', 'InvestmentAmount', 'investment_amount',
      'estimatedInvestment', 'budget'
    ];
    for (const k of amountKeys) {
      if (updates[k] !== undefined) {
        const amt = parseAmount(updates[k]);
        if (amt !== undefined) {
          allowedUpdates.investmentAmount = amt;
        }
        break;
      }
    }

    const dateKeys = [
      'investmentDate',
      'InvestmentDate',
      'investmentdate',
      'investment_date'
    ];
    for (const k of dateKeys) {
      if (updates[k] !== undefined) {
        const dateVal = updates[k] ? new Date(updates[k]) : null;
        if (!isNaN(dateVal?.getTime?.())) {
          allowedUpdates.investmentDate = dateVal;
        }
        break;
      }
    }

    // Insurance fields mapping
    if (updates.saleAmount !== undefined) {
      const amt = parseAmount(updates.saleAmount);
      if (amt !== undefined) allowedUpdates.saleAmount = amt;
    }
    if (updates.saleDate !== undefined) {
      const d = updates.saleDate ? new Date(updates.saleDate) : null;
      if (!isNaN(d?.getTime?.())) allowedUpdates.saleDate = d;
    }
    if (updates.insuranceType !== undefined) {
      allowedUpdates.insuranceType = updates.insuranceType;
    }

    // Remove undefined fields
  Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });

    // Update the lead
    const updatedLead = await AdminLead.findByIdAndUpdate(
      id,
      { $set: allowedUpdates },
      { new: true }
    );

    // Close admin connection
    await adminConnection.close();

    res.status(200).json({
      success: true,
      message: 'Admin assigned lead updated successfully',
      data: updatedLead
    });

  } catch (error) {
    console.error('Error in updateAdminAssignedLead:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Update admin assigned insurance lead (from partner-dashboard.leads)
export const updateAdminAssignedInsuranceLead = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const AdminLead = (await import('../models/admin/AdminLead.js')).default;
    const partnerEmail = (req.user.email || req.user.username || '').trim();
    const emailRegex = partnerEmail ? new RegExp(`^${partnerEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') : null;
    const existing = await AdminLead.findOne({ _id: id, assignedPartnerEmail: { $regex: emailRegex } });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Lead not found or not assigned to you' });
    }

    const parseAmount = (val) => {
      if (val === null || val === undefined) return undefined;
      if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[^0-9.\-]/g, '');
        const n = Number(cleaned);
        return Number.isNaN(n) ? undefined : n;
      }
      return undefined;
    };

    const allowed = {
      status: updates.status,
      priority: updates.priority,
      notes: updates.notes,
      followUpDate: updates.followUpDate,
      saleAmount: undefined,
      saleDate: undefined,
      leadExpiry: undefined,
      insuranceType: undefined,
      lastContactDate: new Date()
    };

    // Handle admin approval workflow flags based on partner status updates
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      let incomingStatus = updates.status;
      // Map partner 'Converted' to stored 'Completed'
      if (incomingStatus === 'Converted') {
        console.log('[Lead Status] Mapping partner status Converted -> Completed for lead', id);
        incomingStatus = 'Completed';
      }
      allowed.status = incomingStatus; // ensure we use mapped value

      if (incomingStatus === 'Completed') {
        // Partner indicates conversion/completion -> awaits admin approval
        allowed.awaitingAdminApproval = true;
        allowed.adminAcknowledged = false;
      } else {
        // Any other status clears the awaiting flag
        allowed.awaitingAdminApproval = false;
        allowed.adminAcknowledged = false;
      }
    }

    if (updates.saleAmount !== undefined) {
      const amt = parseAmount(updates.saleAmount);
      if (amt !== undefined) {
        // Store under insuranceSaleAmount canonical field
        allowed.insuranceSaleAmount = amt;
      }
    }
    if (updates.saleDate !== undefined) {
      const d = updates.saleDate ? new Date(updates.saleDate) : null;
      if (!isNaN(d?.getTime?.())) allowed.saleDate = d;
    }
    if (updates.leadExpiry !== undefined) {
      const de = updates.leadExpiry ? new Date(updates.leadExpiry) : null;
      if (!isNaN(de?.getTime?.())) allowed.leadExpiry = de;
    }
    if (updates.insuranceType !== undefined) {
      allowed.insuranceType = updates.insuranceType;
    }

    // prune undefined
    Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);

    const updated = await AdminLead.findByIdAndUpdate(id, { $set: allowed }, { new: true });

    return res.status(200).json({ success: true, message: 'Admin assigned insurance lead updated successfully', data: updated });
  } catch (error) {
    console.error('Error in updateAdminAssignedInsuranceLead:', error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Export leads to CSV
// @route   GET /api/leads/export
// @access  Private
export const exportLeads = async (req, res) => {
  try {
    const {
      status,
      priority,
      leadSource,
      leadType,
      search,
      dateFrom,
      dateTo
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (leadSource) filter.leadSource = leadSource;
    if (leadType) filter.leadType = leadType;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    
    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    // Role-based filtering (only if authenticated)
    if (req.user && req.user.role === 'partner') {
      filter.assignedPartner = req.user._id;
    }

    const leads = await Lead.find(filter)
      .populate('assignedPartner', 'name email companyName')
      .populate('createdBy', 'name email companyName')
      .sort('-createdAt');

    // Convert to CSV format
    const csvHeaders = [
      'Name',
      'Email', 
      'Phone',
      'Company',
      'Designation',
      'Lead Source',
      'Lead Type',
      'Status',
      'Priority',
      'Address',
      'City',
      'State',
      'Pincode',
  'Interested Products',
  'Estimated Investment',
  'Investment Timeframe',
      'Created Date'
    ];

    const csvData = leads.map(lead => [
      lead.name || '',
      lead.email || '',
      lead.phone || '',
      lead.company || '',
      lead.designation || '',
      lead.leadSource || '',
      lead.leadType || '',
      lead.status || '',
      lead.priority || '',
      lead.address || '',
      lead.city || '',
      lead.state || '',
      lead.pincode || '',
  (lead.interestedProducts || []).join('; '),
  lead.estimatedInvestment || '',
  lead.investmentTimeframe || '',
      lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : ''
    ]);

    // Create CSV content
    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in exportLeads:', error);
    if (error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message || error.toString()
    });
  }
};

// @desc    Import leads from CSV
// @route   POST /api/leads/import
// @access  Private
export const importLeads = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const results = [];
    const errors = [];
    let importedCount = 0;
    let skippedCount = 0;

    // Read and parse CSV file
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          for (const row of results) {
            try {
              // Check if lead already exists
              const existingLead = await Lead.findOne({
                $or: [
                  { email: row.Email },
                  { phone: row.Phone }
                ]
              });

              if (existingLead) {
                skippedCount++;
                continue;
              }

              // Create lead data
              const leadData = {
                name: row.Name || row.name,
                email: row.Email || row.email,
                phone: row.Phone || row.phone,
                company: row.Company || row.company,
                designation: row.Designation || row.designation,
                leadSource: row['Lead Source'] || row.leadSource || 'Website Form',
                leadType: row['Lead Type'] || row.leadType || 'Individual',
                status: row.Status || row.status || 'New',
                priority: row.Priority || row.priority || 'Medium',
                address: row.Address || row.address,
                city: row.City || row.city,
                state: row.State || row.state,
                pincode: row.Pincode || row.pincode,
                interestedProducts: row['Interested Products'] ? 
                  row['Interested Products'].split(';').map(p => p.trim()) : [],
                estimatedInvestment: parseFloat(row['Estimated Investment']) || 0,
                investmentTimeframe: row['Investment Timeframe'] || row.investmentTimeframe || 'Within 3 Months',
                createdBy: req.user._id,
                assignedPartner: req.user._id,
                notes: []
              };

              await Lead.create(leadData);
              importedCount++;

            } catch (leadError) {
              errors.push(`Row with email ${row.Email}: ${leadError.message}`);
            }
          }

          // Clean up uploaded file
          fs.unlinkSync(filePath);

          res.status(200).json({
            success: true,
            message: `Import completed. ${importedCount} leads imported, ${skippedCount} skipped.`,
            imported: importedCount,
            skipped: skippedCount,
            errors: errors.length > 0 ? errors : null
          });

        } catch (processError) {
          console.error('Error processing CSV:', processError);
          res.status(500).json({
            success: false,
            message: 'Error processing CSV file'
          });
        }
      });

  } catch (error) {
    console.error('Error in importLeads:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};
