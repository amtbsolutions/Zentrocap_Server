import Lead from '../models/Lead.js';

/**
 * Lead Service - Business logic for lead management
 */

export class LeadService {
  /**
   * Auto-assign leads based on workload and availability
   * @param {string} leadId - The lead ID to assign
   * @param {string} leadSource - Source of the lead for intelligent assignment
   * @returns {Object} Assignment result
   */
  static async autoAssignLead(leadId, leadSource = null) {
    try {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Get available users for assignment (excluding partners)
      const availableUsers = await User.find({
        role: { $in: ['admin', 'manager', 'employee'] },
        isActive: true
      });

      if (availableUsers.length === 0) {
        throw new Error('No available users for assignment');
      }

      // Get current workload for each user
      const userWorkloads = await Promise.all(
        availableUsers.map(async (user) => {
          const activeLeads = await Lead.countDocuments({
            assignedTo: user._id,
            status: { $nin: ['Closed Won', 'Closed Lost'] }
          });
          return { user, activeLeads };
        })
      );

      // Sort by workload (ascending) to find least busy user
      userWorkloads.sort((a, b) => a.activeLeads - b.activeLeads);

      // For partner referrals, try to assign to specific partner if available
      let assignedPartner = null;
      if (leadSource === 'Partner Referral') {
        const partners = await User.find({ role: 'partner', isActive: true });
        if (partners.length > 0) {
          // Simple round-robin assignment for now
          const partnerIndex = Math.floor(Math.random() * partners.length);
          assignedPartner = partners[partnerIndex]._id;
        }
      }

      // Assign to least busy user
      const assignedUser = userWorkloads[0].user;

      // Update lead
      lead.assignedTo = assignedUser._id;
      if (assignedPartner) {
        lead.assignedPartner = assignedPartner;
      }
      await lead.save();

      return {
        success: true,
        assignedTo: assignedUser,
        assignedPartner: assignedPartner ? await User.findById(assignedPartner) : null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate lead conversion probability based on various factors
   * @param {Object} leadData - Lead data for calculation
   * @returns {number} Conversion probability (0-100)
   */
  static calculateConversionProbability(leadData) {
    let probability = 50; // Base probability

    // Factor 1: Lead Source (higher probability for referrals)
    const sourceMultipliers = {
      'Partner Referral': 1.4,
      'Referral': 1.3,
      'Website Form': 1.1,
      'Email Campaign': 1.0,
      'Social Media': 0.9,
      'Cold Call': 0.7,
      'Advertisement': 0.8,
      'Trade Show': 1.2,
      'Other': 0.8
    };
    probability *= sourceMultipliers[leadData.leadSource] || 1.0;

    // Factor 2: Investment Amount (higher amounts = higher probability)
    if (leadData.estimatedInvestment >= 1000000) probability *= 1.3;
    else if (leadData.estimatedInvestment >= 500000) probability *= 1.2;
    else if (leadData.estimatedInvestment >= 100000) probability *= 1.1;
    else if (leadData.estimatedInvestment < 50000) probability *= 0.8;

    // Factor 3: Investment Timeframe (urgent = higher probability)
    const timeframeMultipliers = {
      'Immediate': 1.4,
      'Within 1 Month': 1.3,
      'Within 3 Months': 1.1,
      'Within 6 Months': 1.0,
      'Within 1 Year': 0.9,
      'Not Decided': 0.7
    };
    probability *= timeframeMultipliers[leadData.investmentTimeframe] || 1.0;

    // Factor 4: Lead Type (corporate leads might have higher conversion)
    if (leadData.leadType === 'Corporate' || leadData.leadType === 'Enterprise') {
      probability *= 1.2;
    }

    // Factor 5: Communication frequency (more communications = higher probability)
    if (leadData.communications && leadData.communications.length > 0) {
      const communicationBonus = Math.min(leadData.communications.length * 0.05, 0.3);
      probability *= (1 + communicationBonus);
    }

    // Factor 6: Response rate (positive outcomes increase probability)
    if (leadData.communications && leadData.communications.length > 0) {
      const positiveResponses = leadData.communications.filter(c => c.outcome === 'Positive').length;
      const responseRate = positiveResponses / leadData.communications.length;
      probability *= (1 + responseRate * 0.3);
    }

    // Ensure probability stays within bounds
    return Math.min(Math.max(probability, 5), 95);
  }

  /**
   * Generate follow-up recommendations for a lead
   * @param {Object} lead - Lead object
   * @returns {Array} Array of follow-up recommendations
   */
  static generateFollowUpRecommendations(lead) {
    const recommendations = [];
    const now = new Date();
    const daysSinceCreated = Math.floor((now - lead.createdAt) / (1000 * 60 * 60 * 24));
    const daysSinceLastContact = lead.lastContactDate 
      ? Math.floor((now - lead.lastContactDate) / (1000 * 60 * 60 * 24))
      : daysSinceCreated;

    // Based on status
    switch (lead.status) {
      case 'New':
        if (daysSinceCreated > 1) {
          recommendations.push({
            type: 'urgent',
            action: 'Initial Contact',
            message: 'Make initial contact within 24 hours of lead creation',
            priority: 'High'
          });
        } else {
          recommendations.push({
            type: 'normal',
            action: 'Schedule Call',
            message: 'Schedule initial consultation call',
            priority: 'Medium'
          });
        }
        break;

      case 'Contacted':
        if (daysSinceLastContact > 3) {
          recommendations.push({
            type: 'follow-up',
            action: 'Follow-up Call',
            message: 'Follow up on initial contact',
            priority: 'Medium'
          });
        }
        break;

      case 'Qualified':
        recommendations.push({
          type: 'proposal',
          action: 'Send Proposal',
          message: 'Prepare and send customized proposal',
          priority: 'High'
        });
        break;

      case 'Proposal Sent':
        if (daysSinceLastContact > 7) {
          recommendations.push({
            type: 'urgent',
            action: 'Proposal Follow-up',
            message: 'Follow up on sent proposal',
            priority: 'High'
          });
        }
        break;

      case 'Negotiation':
        recommendations.push({
          type: 'negotiation',
          action: 'Continue Negotiation',
          message: 'Schedule meeting to address concerns',
          priority: 'High'
        });
        break;

      case 'On Hold':
        if (daysSinceLastContact > 14) {
          recommendations.push({
            type: 'reactivate',
            action: 'Reactivate Lead',
            message: 'Check if circumstances have changed',
            priority: 'Low'
          });
        }
        break;
    }

    // Based on investment timeframe
    if (lead.investmentTimeframe === 'Immediate' && daysSinceLastContact > 1) {
      recommendations.push({
        type: 'urgent',
        action: 'Immediate Response',
        message: 'Lead wants immediate investment - respond urgently',
        priority: 'Urgent'
      });
    }

    // Based on lead score
    if (lead.leadScore > 70 && daysSinceLastContact > 2) {
      recommendations.push({
        type: 'high-value',
        action: 'Priority Follow-up',
        message: 'High-scoring lead requires priority attention',
        priority: 'High'
      });
    }

    return recommendations;
  }

  /**
   * Get lead pipeline analysis
   * @param {Object} filters - Filters for analysis
   * @returns {Object} Pipeline analysis data
   */
  static async getPipelineAnalysis(filters = {}) {
    try {
      // Build match stage
      const matchStage = {};
      if (filters.assignedTo) matchStage.assignedTo = filters.assignedTo;
      if (filters.assignedPartner) matchStage.assignedPartner = filters.assignedPartner;
      if (filters.dateFrom || filters.dateTo) {
        matchStage.createdAt = {};
        if (filters.dateFrom) matchStage.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) matchStage.createdAt.$lte = new Date(filters.dateTo);
      }

      // Pipeline stages analysis
      const pipelineStages = await Lead.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$estimatedInvestment' },
            avgLeadScore: { $avg: '$leadScore' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Conversion rates
      const conversionAnalysis = await Lead.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalLeads: { $sum: 1 },
            convertedLeads: { $sum: { $cond: ['$convertedToClient', 1, 0] } },
            totalConversionValue: { $sum: '$conversionValue' },
            avgConversionTime: {
              $avg: {
                $cond: [
                  '$convertedToClient',
                  { $subtract: ['$closedDate', '$createdAt'] },
                  null
                ]
              }
            }
          }
        }
      ]);

      // Lead source performance
      const sourcePerformance = await Lead.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$leadSource',
            count: { $sum: 1 },
            converted: { $sum: { $cond: ['$convertedToClient', 1, 0] } },
            conversionRate: {
              $multiply: [
                { $divide: [
                  { $sum: { $cond: ['$convertedToClient', 1, 0] } },
                  { $sum: 1 }
                ]},
                100
              ]
            },
            avgInvestment: { $avg: '$estimatedInvestment' }
          }
        },
        { $sort: { conversionRate: -1 } }
      ]);

      return {
        pipelineStages,
        conversionAnalysis: conversionAnalysis[0] || {
          totalLeads: 0,
          convertedLeads: 0,
          totalConversionValue: 0,
          avgConversionTime: 0
        },
        sourcePerformance
      };
    } catch (error) {
      throw new Error(`Pipeline analysis failed: ${error.message}`);
    }
  }

  /**
   * Get leads requiring immediate attention
   * @param {string} userId - User ID for filtering (optional)
   * @returns {Array} Array of urgent leads
   */
  static async getUrgentLeads(userId = null) {
    try {
      const matchStage = {
        status: { $nin: ['Closed Won', 'Closed Lost'] },
        $or: [
          { nextFollowUpDate: { $lte: new Date() } },
          { 
            $and: [
              { status: 'New' },
              { createdAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
            ]
          },
          { investmentTimeframe: 'Immediate' },
          { leadScore: { $gte: 80 } }
        ]
      };

      if (userId) {
        matchStage.$and = matchStage.$and || [];
        matchStage.$and.push({
          $or: [
            { assignedTo: userId },
            { assignedPartner: userId }
          ]
        });
      }

      const urgentLeads = await Lead.find(matchStage)
        .populate('assignedTo', 'name email')
        .populate('assignedPartner', 'name email')
        .sort({ leadScore: -1, nextFollowUpDate: 1 })
        .limit(20);

      return urgentLeads.map(lead => ({
        ...lead.toObject(),
        urgencyReasons: this.getUrgencyReasons(lead)
      }));
    } catch (error) {
      throw new Error(`Failed to get urgent leads: ${error.message}`);
    }
  }

  /**
   * Get urgency reasons for a lead
   * @param {Object} lead - Lead object
   * @returns {Array} Array of urgency reasons
   */
  static getUrgencyReasons(lead) {
    const reasons = [];
    const now = new Date();

    if (lead.nextFollowUpDate && lead.nextFollowUpDate <= now) {
      const overdueDays = Math.floor((now - lead.nextFollowUpDate) / (1000 * 60 * 60 * 24));
      reasons.push(`Follow-up overdue by ${overdueDays} day(s)`);
    }

    if (lead.status === 'New') {
      const daysSinceCreated = Math.floor((now - lead.createdAt) / (1000 * 60 * 60 * 24));
      if (daysSinceCreated >= 1) {
        reasons.push(`New lead created ${daysSinceCreated} day(s) ago - needs initial contact`);
      }
    }

    if (lead.investmentTimeframe === 'Immediate') {
      reasons.push('Lead wants immediate investment');
    }

    if (lead.leadScore >= 80) {
      reasons.push(`High lead score (${lead.leadScore})`);
    }

    if (lead.priority === 'Urgent') {
      reasons.push('Marked as urgent priority');
    }

    return reasons;
  }
}
