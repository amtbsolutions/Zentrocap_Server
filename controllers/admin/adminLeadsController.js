import csv from 'csvtojson';
import Lead from '../../models/Lead.js';
import Partner from '../../models/Partner.js';
import Earning from '../../models/Earning.js';
import AdminLead from '../../models/admin/AdminLead.js';
import AdminNotification from '../../models/admin/AdminNotification.js';
import NotificationService from '../../services/NotificationService.js';

// Helper to safely build a case-insensitive exact-match email regex
const buildEmailRegex = (email) => {
  if (!email || typeof email !== 'string') return null;
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
};
// No longer using admin-dashboard DB for insurance leads; use local AdminLead model

export const getAllLeads = async (_req, res) => {
  try {
    const leads = await AdminLead.find().sort({ createdAt: -1 }).limit(1000).lean();
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
      earningAssigned: typeof l.earningAssigned === 'boolean' ? l.earningAssigned : earningsByLead.has(String(l._id))
    }));

    // Derive stats similar to legacy adminController version
    const totalCompleted = withFlags.filter(l => l.status === 'Completed').length;
    const totalTerminated = withFlags.filter(l => ['Terminated','Not Interested'].includes(l.status)).length;
    const totalPendingContacted = withFlags.filter(l => ['Pending','Contacted','Interested'].includes(l.status)).length;

    // Compute top partners by Completed leads
    const partnerCompleted = {};
    withFlags.forEach(l => {
      if (l.status === 'Completed' && l.assignedPartnerEmail) {
        partnerCompleted[l.assignedPartnerEmail] = (partnerCompleted[l.assignedPartnerEmail] || 0) + 1;
      }
    });
    const topPartners = Object.entries(partnerCompleted)
      .map(([email, completedLeads]) => ({ partnerEmail: email, completedLeads }))
      .sort((a,b) => b.completedLeads - a.completedLeads)
      .slice(0,5);

    res.json({
      success: true,
      leads: withFlags,
      stats: {
        totalCompleted,
        totalTerminated,
        totalPendingContacted
      },
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

// ------------------- BULK ASSIGN LEADS -------------------
export const bulkAssignLeads = async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ success: false, message: 'CSV file is required' });
    }

    const rows = await csv({ trim: true, ignoreEmpty: true }).fromFile(req.file.path);
    const inserted = [];
    const skipped = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      // Normalize keys dynamically
      const normalizedRow = {};
      for (const key in row) {
        if (!row.hasOwnProperty(key)) continue;
        const camelKey = key
          .replace(/[\s_-]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
          .replace(/^./, str => str.toLowerCase());
        normalizedRow[camelKey] = row[key] !== '' ? row[key] : null;
      }

      // Required validation
      if (!normalizedRow.ownerName || !normalizedRow.assignedPartnerEmail) {
        skipped.push({ index, ...normalizedRow, reason: 'Missing required fields' });
        continue;
      }

      // Map to partner if email exists
      const partner = await Partner.findOne({ email: normalizedRow.assignedPartnerEmail });
      if (partner) {
        normalizedRow.assignedPartnerEmail = partner.email;
      }

      // Fill missing fields dynamically
      const doc = {};
      const schemaFields = Object.keys(AdminLead.schema.paths);
      schemaFields.forEach(field => {
        doc[field] = normalizedRow[field] ?? null;
      });

      try {
        const lead = await AdminLead.create(doc);
        inserted.push(lead);
      } catch (err) {
        skipped.push({ index, ...normalizedRow, reason: err.message });
      }
    }

    res.status(201).json({
      success: true,
      inserted: inserted.length,
      skipped: skipped.length,
      createdLeads: inserted,
      skippedDetails: skipped.slice(0, 200)
    });
  } catch (err) {
    console.error('bulkAssignLeads error:', err.stack);
    res.status(500).json({ success: false, message: 'Internal server error' });
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



export const assignEarning = async (req, res) => {
  try {
    const { leadId, earningType, rate, insuranceSaleAmount, lumpSumAmount, partnerEmail } = req.body || {};
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
      earningAmount: lead.earningAmount
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
        ownerName: adminLead.ownerName
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
