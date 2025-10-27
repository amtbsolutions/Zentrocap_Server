import csv from 'csvtojson';
import Lead from '../../models/Lead.js';
import Partner from '../../models/Partner.js';
import Earning from '../../models/Earning.js';
import AdminLead from '../../models/admin/AdminLead.js';
import AdminNotification from '../../models/admin/AdminNotification.js';
import NotificationService from '../../services/NotificationService.js';

//*************************************
import { parse } from '@fast-csv/parse';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import path from 'path'; // *** UPDATE: Added for file extension checking ***
import fs from 'fs'; // *** UPDATE: Added for file cleanup ***



// Helper to safely build a case-insensitive exact-match email regex
const buildEmailRegex = (email) => {
  if (!email || typeof email !== 'string') return null;
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
};
// No longer using admin-dashboard DB for insurance leads; use local AdminLead model

export const getAllLeads = async (_req, res) => {
  try {
    // Remove .limit(1000) – return every document
    const leads = await AdminLead.find()
      .sort({ createdAt: -1 })
      .lean();

    const ids = leads.map(l => l._id).filter(Boolean);
    const idStrs = ids.map(id => String(id));
    let earningsByLead = new Set();

    if (ids.length) {
      const earnings = await Earning.find({
        $or: [
          { 'metadata.adminLeadId': { $in: ids } },
          { 'metadata.adminLeadId': { $in: idStrs } }
        ]
      }, 'metadata.adminLeadId').lean();

      earningsByLead = new Set(earnings.map(e => String(e?.metadata?.adminLeadId)));
    }

    const withFlags = leads.map(l => ({
      ...l,
      hasPartnerEarning: earningsByLead.has(String(l._id)),
      earningAssigned: typeof l.earningAssigned === 'boolean'
        ? l.earningAssigned
        : earningsByLead.has(String(l._id))
    }));

    // …stats & top-partners calculation unchanged…

    res.json({
      success: true,
      leads: withFlags,
      stats: { /* … */ },
      topPartners
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ------------------- CREATE OR ASSIGN SINGLE LEAD -------------------
export const createOrAssignLead = async (req, res) => {
  try {
    const leadData = req.body || {};

    // Required fields
    if (!leadData.ownerName || !leadData.assignedPartnerEmail) {
      return res.status(400).json({ success: false, message: 'ownerName and assignedPartnerEmail are required' });
    }

    // Map only existing fields dynamically
    const doc = {};
    const schemaFields = Object.keys(AdminLead.schema.paths);
    schemaFields.forEach(field => {
      doc[field] = leadData[field] ?? null; // assign null if not provided
    });

    // Create lead
    const lead = await AdminLead.create(doc);

    // Map partner
    const partner = await Partner.findOne({ email: lead.assignedPartnerEmail });
    if (partner) {
      // Optional: create notification for partner
      console.log(`Partner ${partner.email} mapped for lead ${lead.ownerName}`);
    }

    res.status(201).json({ success: true, lead });
  } catch (err) {
    console.error('createOrAssignLead error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};



// *** UPDATE: Debug import ***
console.log('parse from @fast-csv/parse:', parse);

// ... (other controller functions unchanged: getAllLeads, createOrAssignLead, etc.)

// ------------------- BULK ASSIGN LEADS -------------------
export const bulkAssignLeads = async (req, res) => {
  try {
    if (!req.file?.path) {
      console.log('No file uploaded');
      return res.status(400).json({ success: false, message: 'CSV or Excel file is required' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    console.log(`Processing file: ${filePath} (type: ${fileExt})`);

    const inserted = [];
    const skipped = [];
    let rows = [];

    // *** UPDATE: Handle CSV or Excel ***
    try {
      if (fileExt === '.csv') {
        console.log('Parsing CSV file');
        await new Promise((resolve, reject) => {
          parse(filePath, { headers: true, trim: true, ignoreEmpty: true }) // *** UPDATE: Use parse instead of parseFile ***
            .on('data', (row) => rows.push(row))
            .on('end', () => {
              console.log(`Parsed ${rows.length} rows from CSV`);
              resolve();
            })
            .on('error', reject);
        });
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        console.log('Parsing Excel file');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        // Convert Excel rows to objects with headers
        if (rows.length > 0) {
          const headers = rows[0];
          rows = rows.slice(1).map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
              rowData[header] = row[index] !== undefined ? row[index] : null;
            });
            return rowData;
          });
          console.log(`Parsed ${rows.length} rows from Excel`);
        } else {
          console.log('No data rows in Excel file');
        }
      } else {
        throw new Error('Unsupported file type. Only CSV and Excel (.xlsx, .xls) are allowed');
      }
    } finally {
      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        console.log(`Cleaning up file: ${filePath}`);
        fs.unlinkSync(filePath);
      }
    }

    // *** UPDATE: Explicit header mapping ***
    const headerMap = {
      'owner name': 'ownerName',
      'owner_name': 'ownerName',
      'ownername': 'ownerName',
      'partner email': 'assignedPartnerEmail',
      'partner_email': 'assignedPartnerEmail',
      'assignedpartneremail': 'assignedPartnerEmail',
      'registration no': 'registrationNo',
      'registration_no': 'registrationNo',
      'registrationno': 'registrationNo',
      'registration date': 'registrationDate',
      'registration_date': 'registrationDate',
      'registrationdate': 'registrationDate',
      'current address': 'currentAddress',
      'current_address': 'currentAddress',
      'currentaddress': 'currentAddress',
      'engine number': 'engineNumber',
      'engine_number': 'enginenumber',
      'enginenumber': 'engineNumber',
      'chassis number': 'chassisNumber',
      'chassis_number': 'chassisnumber',
      'chassisnumber': 'chassisNumber',
      'vehicle maker': 'vehicleMaker',
      'vehicle_maker': 'vehiclemaker',
      'vehiclemaker': 'vehicleMaker',
      'vehicle model': 'vehicleModel',
      'vehicle_model': 'vehiclemodel',
      'vehiclemodel': 'vehicleModel',
      'vehicle class': 'vehicleClass',
      'vehicle_class': 'vehicleclass',
      'vehicleclass': 'vehicleClass',
      'vehicle category': 'vehicleCategory',
      'vehicle_category': 'vehiclecategory',
      'vehiclecategory': 'vehicleCategory',
      'fuel type': 'fuelType',
      'fuel_type': 'fueltype',
      'fueltype': 'fuelType',
      'laden weight': 'ladenWeight',
      'laden_weight': 'ladenweight',
      'ladenweight': 'ladenWeight',
      'sale amount': 'insuranceSaleAmount',
      'sale_amount': 'insuranceSaleAmount',
      'insurancesaleamount': 'insuranceSaleAmount',
      'seat capacity': 'seatCapacity',
      'seat_capacity': 'seatcapacity',
      'seatcapacity': 'seatCapacity',
      'owner mobile number': 'ownerMobileNumber',
      'owner_mobile_number': 'ownermobilenumber',
      'ownermobilenumber': 'ownerMobileNumber'
    };

    console.log('Processing rows for database insertion');
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      console.log(`Processing row ${index}:`, row);

      // Normalize headers
      const normalizedRow = {};
      for (const key in row) {
        if (!row.hasOwnProperty(key)) continue;
        const lowerKey = key.toLowerCase().replace(/[\s_]+/g, ' ');
        const mappedKey = headerMap[lowerKey] || key
          .replace(/[\s_-]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
          .replace(/^./, str => str.toLowerCase());
        normalizedRow[mappedKey] = row[key] !== '' && row[key] !== undefined ? row[key] : null;
      }
      console.log(`Normalized row ${index}:`, normalizedRow);

      // Validate required fields
      if (!normalizedRow.ownerName || !normalizedRow.assignedPartnerEmail) {
        console.log(`Skipping row ${index}: Missing ownerName or assignedPartnerEmail`);
        skipped.push({ index, ...normalizedRow, reason: 'Missing ownerName or assignedPartnerEmail' });
        continue;
      }

      // Map to partner
      if (normalizedRow.assignedPartnerEmail) {
        const partner = await Partner.findOne({ email: normalizedRow.assignedPartnerEmail });
        if (partner) {
          normalizedRow.assignedPartnerEmail = partner.email;
          console.log(`Row ${index}: Matched partner ${partner.email}`);
        } else {
          normalizedRow.assignedPartnerEmail = null;
          console.log(`Row ${index}: No partner found for ${normalizedRow.assignedPartnerEmail}`);
        }
      }

      // Fill missing fields
      const doc = {};
      const schemaFields = Object.keys(AdminLead.schema.paths).filter(field => field !== '_id' && field !== '__v');
      schemaFields.forEach(field => {
        doc[field] = normalizedRow[field] !== undefined ? normalizedRow[field] : null;
      });

      try {
        const lead = await AdminLead.create(doc);
        inserted.push(lead);
        console.log(`Row ${index}: Created lead with ID ${lead._id}`);
      } catch (err) {
        console.log(`Row ${index}: Failed to create lead - ${err.message}`);
        skipped.push({ index, ...normalizedRow, reason: err.message });
      }
    }

    console.log(`Bulk assign completed: ${inserted.length} inserted, ${skipped.length} skipped`);
    res.status(201).json({
      success: true,
      inserted: inserted.length,
      skipped: skipped.length,
      createdLeads: inserted,
      skippedDetails: skipped.slice(0, 200)
    });
  } catch (err) {
    console.error('bulkAssignLeads error:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};



// ------------------- EDIT LEAD -------------------
export const editLead = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const lead = await AdminLead.findByIdAndUpdate(id, updates, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    res.status(200).json({ success: true, lead });
  } catch (err) {
    console.error('editLead error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ------------------- DELETE LEAD -------------------
export const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await AdminLead.findByIdAndDelete(id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    res.status(200).json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    console.error('deleteLead error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ------------------- BULK DELETE LEADS -------------------
export const bulkDeleteLeads = async (req, res) => {
  try {
    const { leadIds } = req.body; // expect an array of lead IDs

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'leadIds must be a non-empty array' });
    }

    // Validate IDs
    const validIds = leadIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) {
      return res.status(400).json({ success: false, message: 'No valid lead IDs provided' });
    }

    // Delete all leads
    const result = await AdminLead.deleteMany({ _id: { $in: validIds } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} lead(s) deleted successfully`
    });
  } catch (err) {
    console.error('bulkDeleteLeads error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


export const assignEarning = async (req, res) => {
  try {
    const { leadId, earningType, rate, insuranceSaleAmount, lumpSumAmount, partnerEmail, tdsPercent } = req.body || {};
    if (!leadId) return res.status(400).json({ success: false, message: 'leadId is required' });
    if (!earningType || !['Percent', 'LumpSum'].includes(earningType)) {
      return res.status(400).json({ success: false, message: "earningType must be 'Percent' or 'LumpSum'" });
    }

    const lead = await AdminLead.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  let computedEarning = 0;
    if (earningType === 'Percent') {
      const r = Number(rate);
      const sale = Number(insuranceSaleAmount);
      if (!Number.isFinite(r) || r <= 0) return res.status(400).json({ success: false, message: 'Valid rate is required for Percent type' });
      if (!Number.isFinite(sale) || sale <= 0) return res.status(400).json({ success: false, message: 'Valid insuranceSaleAmount is required for Percent type' });
      computedEarning = Math.round((sale * r) / 100);
      lead.rate = r;
      lead.insuranceSaleAmount = sale; // Always set when Percent selected
    } else { // LumpSum
      const lump = Number(lumpSumAmount);
      if (!Number.isFinite(lump) || lump <= 0) return res.status(400).json({ success: false, message: 'Valid lumpSumAmount is required for LumpSum type' });
      computedEarning = lump;
      // Only update insuranceSaleAmount if a valid positive number provided; otherwise preserve existing
      if (insuranceSaleAmount !== undefined && insuranceSaleAmount !== null) {
        const saleNum = Number(insuranceSaleAmount);
        if (Number.isFinite(saleNum) && saleNum > 0) {
          lead.insuranceSaleAmount = saleNum;
        }
      }
      // Reset percentage rate since LumpSum is chosen
      lead.rate = 0;
    }

    if (partnerEmail) {
      lead.assignedPartnerEmail = partnerEmail;
    }

    lead.earningType = earningType;
    lead.earningAmount = computedEarning;
    // Persist TDS, default 10% if not provided
    const tdsP = Number.isFinite(Number(tdsPercent)) ? Number(tdsPercent) : 10;
    const tdsAmt = Math.max(0, Math.round((tdsP / 100) * computedEarning));
    const net = Math.max(0, computedEarning - tdsAmt);
    lead.tdsPercent = tdsP;
    lead.tdsAmount = tdsAmt;
    lead.netAfterTds = net;

    await lead.save();
    await AdminNotification.create({
      type: 'Earning Assigned',
      message: `Earning assigned (${earningType}) for lead ${lead.registrationNo || lead.ownerName}: ${computedEarning}`,
      createdBy: 'Admin',
      relatedLead: lead._id
    });

    return res.json({ success: true, message: 'Earning assignment recorded', lead: {
      ...lead.toObject(),
      insuranceSaleAmount: lead.insuranceSaleAmount,
      earningType: lead.earningType,
      earningAmount: lead.earningAmount,
      tdsPercent: lead.tdsPercent,
      tdsAmount: lead.tdsAmount,
      netAfterTds: lead.netAfterTds
    } });
  } catch (e) {
    console.error('assignEarning error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};


// Admin acknowledges or terminates a completed lead
export const acknowledgeLeadByAdmin = async (req, res) => {
  try {
    const { leadId, action } = req.body; // action: 'approve' | 'terminate'
    if (!leadId || !action) {
      return res.status(400).json({ success: false, message: 'leadId and action are required' });
    }

    const lead = await AdminLead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (lead.status !== 'Completed') {
      return res.status(400).json({ success: false, message: 'Only completed leads can be acknowledged' });
    }

    if (action === 'terminate') {
      lead.status = 'Terminated';
      lead.adminAcknowledged = false;
      lead.awaitingAdminApproval = false;
      lead.earningAmount = 0;
    } else if (action === 'approve') {
      lead.adminAcknowledged = true;
      lead.adminAcknowledgmentDate = new Date();
      lead.awaitingAdminApproval = false;
    } else {
      return res.status(400).json({ success: false, message: "Invalid action. Must be 'approve' or 'terminate'" });
    }

    await lead.save();
    await AdminNotification.create({
      type: 'Lead Admin Action',
      message: action === 'approve'
        ? `Lead ${lead.registrationNo} approved by admin.`
        : `Lead ${lead.registrationNo} terminated by admin.`,
      createdBy: 'Admin',
      relatedLead: lead._id
    });

    return res.json({ success: true, lead });
  } catch (err) {
    console.error('Error in acknowledgeLeadByAdmin:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
export const getLeadTrend = async (_req, res) => {
  try {
    // Define status buckets used by the frontend
    const completedStatuses = ['Converted', 'Completed'];
    const inProgressStatuses = [
      'New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'On Hold',
      // tolerate legacy labels if present
      'Pending', 'Interested'
    ];
    const failedStatuses = ['Lost', 'Not Interested', 'Terminated'];

    // Overall stats across all leads
  const statsAgg = await AdminLead.aggregate([
      {
        $group: {
          _id: null,
          totalCompleted: {
            $sum: { $cond: [{ $in: ['$status', completedStatuses] }, 1, 0] }
          },
          totalOngoing: {
            $sum: { $cond: [{ $in: ['$status', inProgressStatuses] }, 1, 0] }
          },
          totalFailed: {
            $sum: { $cond: [{ $in: ['$status', failedStatuses] }, 1, 0] }
          },
          overallTotal: { $sum: 1 }
        }
      }
    ]);

    const stats = statsAgg[0] || {
      totalCompleted: 0,
      totalOngoing: 0,
      totalFailed: 0,
      overallTotal: 0
    };

    // Helper to build trend pipelines
    const buildTrendPipeline = (since, granularity) => {
      let groupId;
      if (granularity === 'daily') {
        groupId = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
      } else if (granularity === 'monthly') {
        groupId = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
      } else {
        groupId = { year: { $year: '$createdAt' } };
      }

      const sortSpec = { '_id.year': 1 };
      if (granularity !== 'yearly') sortSpec['-_id.year']; // no-op, keep order key present
      if (granularity !== 'yearly') sortSpec['_id.month'] = 1;
      if (granularity === 'daily') sortSpec['_id.day'] = 1;

      return [
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: groupId,
            completed: { $sum: { $cond: [{ $in: ['$status', completedStatuses] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $in: ['$status', inProgressStatuses] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $in: ['$status', failedStatuses] }, 1, 0] } }
          }
        },
        { $sort: sortSpec }
      ];
    };

    // Time windows
    const now = new Date();
    const sinceDaily = new Date(now); sinceDaily.setDate(sinceDaily.getDate() - 14); // last 2 weeks
    const sinceMonthly = new Date(now); sinceMonthly.setMonth(sinceMonthly.getMonth() - 12); // last year
    const sinceYearly = new Date(now); sinceYearly.setFullYear(sinceYearly.getFullYear() - 5); // last 5 years

    const [dailyTrend, monthlyTrend, yearlyTrend] = await Promise.all([
      AdminLead.aggregate(buildTrendPipeline(sinceDaily, 'daily')),
      AdminLead.aggregate(buildTrendPipeline(sinceMonthly, 'monthly')),
      AdminLead.aggregate(buildTrendPipeline(sinceYearly, 'yearly')),
    ]);

    res.json({
      success: true,
      stats,
      trends: {
        dailyTrend,
        monthlyTrend,
        yearlyTrend
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Create partner earning (approved) from an AdminLead entry
export const assignPartnerEarning = async (req, res) => {
  try {
    const { leadId } = req.body || {};
    if (!leadId) {
      return res.status(400).json({ success: false, message: 'leadId is required' });
    }

    const adminLead = await AdminLead.findById(leadId).lean();
    if (!adminLead) {
      return res.status(404).json({ success: false, message: 'Admin lead not found' });
    }

    if (!adminLead.assignedPartnerEmail) {
      return res.status(400).json({ success: false, message: 'Admin lead has no assigned partner email' });
    }

    // Find partner by email (case-insensitive)
    const emailRegex = new RegExp(`^${adminLead.assignedPartnerEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const partner = await Partner.findOne({ email: { $regex: emailRegex } });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Assigned partner not found by email' });
    }

    // Avoid duplicate earnings for same admin lead and partner
    const existing = await Earning.findOne({ partnerId: partner._id, 'metadata.adminLeadId': adminLead._id });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Earning already exists for this lead and partner', earning: existing });
    }

    const commissionEarned = Number(adminLead.earningAmount) || 0;
    if (commissionEarned <= 0) {
      return res.status(400).json({ success: false, message: 'Lead has no earning amount to assign' });
    }

    const earningDoc = await Earning.create({
      partnerId: partner._id,
      clientId: adminLead.registrationNo || undefined,
      clientName: adminLead.ownerName || undefined,
      investmentAmount: Number(adminLead.insuranceSaleAmount) || undefined,
      fundName: 'Insurance',
      commissionRate: Number(adminLead.rate) || undefined,
      commissionEarned,
      description: `Insurance earning for ${adminLead.registrationNo || adminLead.ownerName}`,
      // leadId references partner CRM Lead; we keep linkage inside metadata to AdminLead
      status: 'approved',
      metadata: {
        adminLeadId: adminLead._id,
        earningType: adminLead.earningType,
        insuranceSaleAmount: adminLead.insuranceSaleAmount,
        rate: adminLead.rate,
        registrationNo: adminLead.registrationNo,
        ownerName: adminLead.ownerName,
        tdsPercent: adminLead.tdsPercent,
        tdsAmount: adminLead.tdsAmount,
        netAfterTds: adminLead.netAfterTds
      }
    });

    // Persist flag on AdminLead so UI can disable button across refreshes
    await AdminLead.updateOne({ _id: adminLead._id }, { $set: { earningAssigned: true } });

    await AdminNotification.create({
      type: 'Partner Earning Assigned',
      message: `Approved earning assigned to ${partner.email}: ₹${commissionEarned}`,
      createdBy: 'Admin',
      relatedLead: adminLead._id
    });

  return res.status(201).json({ success: true, message: 'Partner earning created and approved', earning: earningDoc, earningAssigned: true });
  } catch (e) {
    console.error('assignPartnerEarning error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
