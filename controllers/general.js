import Partner from '../models/Partner.js';
import Document from '../models/Document.js';
import Payment from '../models/Payment.js';
import Earning from '../models/Earning.js';
import Lead from '../models/Lead.js';
import mongoose from 'mongoose';

// Get dashboard statistics for authenticated partner
export const getDashboardStats = async (req, res) => {
  try {
    const partnerId = req.user._id;
  // Ensure we use a hex string-based ObjectId (not numeric overload)
  const partnerObjectId = mongoose.Types.ObjectId.createFromHexString(String(partnerId));
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const startOfYear = new Date(currentYear, 0, 1);
    const startOfToday = new Date(currentYear, currentMonth, currentDate.getDate());

    // Get all partner-related data in parallel
    const [
      partnerData,
      totalDocuments,
      totalPayments,
      totalEarnings,
      totalLeads,
      monthlyEarnings,
      yearlyEarnings,
      todayEarnings,
      monthlyPayments,
      yearlyPayments,
      recentEarnings,
      recentPayments,
      recentLeads,
      pendingPayments,
      completedPayments,
      earningsByMonth
    ] = await Promise.all([
      // Basic partner info
      Partner.findById(partnerId).select('name email phone createdAt'),
      
      // Documents statistics
      Document.countDocuments({ uploadedBy: partnerId }),
      
      // Payment statistics
      Payment.countDocuments({ partnerId }),
      
      // Earnings statistics
      Earning.countDocuments({ partnerId }),
      
      // Leads statistics (count leads created by or assigned to this partner)
      Lead.countDocuments({
        $or: [
          { createdBy: partnerId },
          { assignedTo: partnerId },
          { assignedPartner: partnerId }
        ]
      }),
      
      // Monthly earnings (approved or paid)
      Earning.aggregate([
        { $match: { partnerId: partnerObjectId, status: { $in: ['approved','paid'] }, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, totalAmount: { $sum: { $ifNull: ['$commissionEarned', { $ifNull: ['$amount', 0] }] } }, count: { $sum: 1 } } }
      ]),
      
      // Yearly earnings (approved or paid)
      Earning.aggregate([
        { $match: { partnerId: partnerObjectId, status: { $in: ['approved','paid'] }, createdAt: { $gte: startOfYear } } },
        { $group: { _id: null, totalAmount: { $sum: { $ifNull: ['$commissionEarned', { $ifNull: ['$amount', 0] }] } }, count: { $sum: 1 } } }
      ]),
      
      // Today's earnings (approved or paid)
      Earning.aggregate([
        { $match: { partnerId: partnerObjectId, status: { $in: ['approved','paid'] }, createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, totalAmount: { $sum: { $ifNull: ['$commissionEarned', { $ifNull: ['$amount', 0] }] } }, count: { $sum: 1 } } }
      ]),
      
      // Monthly payments
      Payment.aggregate([
        { $match: { partnerId: partnerObjectId, createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      
      // Yearly payments
      Payment.aggregate([
        { $match: { partnerId: partnerObjectId, createdAt: { $gte: startOfYear } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      
  // Recent earnings (last 5)
  Earning.find({ partnerId, status: { $in: ['approved','paid'] } })
        .populate('partnerId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('commissionEarned clientName fundName investmentAmount createdAt'),
      
      // Recent payments (last 5)
      Payment.find({ partnerId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('amount status paymentMethod transactionId createdAt'),
      
      // Recent leads (last 5) - created by or assigned to this partner
      Lead.find({
        $or: [
          { createdBy: partnerId },
          { assignedTo: partnerId },
          { assignedPartner: partnerId }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email phone status estimatedInvestment createdAt'),
      
      // Pending payments
      Payment.countDocuments({ partnerId, status: 'pending' }),
      
      // Completed payments
      Payment.countDocuments({ partnerId, status: 'completed' }),
      
  // Earnings by month for the current year
      Earning.aggregate([
        {
          $match: {
    partnerId: partnerObjectId,
    status: { $in: ['approved','paid'] },
            createdAt: { $gte: startOfYear }
          }
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
    totalAmount: { $sum: { $ifNull: ['$commissionEarned', { $ifNull: ['$amount', 0] }] } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Calculate growth percentages (mock data for now)
    const monthlyGrowth = Math.random() * 20 - 10; // Random between -10% and +10%
    const yearlyGrowth = Math.random() * 30 + 5; // Random between 5% and 35%

    // Prepare response data
    const dashboardStats = {
      partner: {
        id: partnerId,
        name: partnerData?.name,
        email: partnerData?.email,
        phone: partnerData?.phone,
        memberSince: partnerData?.createdAt
      },
      totalStats: {
        totalDocuments,
        totalPayments,
        totalEarnings,
        totalLeads,
        pendingPayments,
        completedPayments
      },
      earnings: {
        monthly: monthlyEarnings[0]?.totalAmount || 0,
        yearly: yearlyEarnings[0]?.totalAmount || 0,
        today: todayEarnings[0]?.totalAmount || 0,
        monthlyCount: monthlyEarnings[0]?.count || 0,
        yearlyCount: yearlyEarnings[0]?.count || 0,
        todayCount: todayEarnings[0]?.count || 0,
        growth: {
          monthly: monthlyGrowth,
          yearly: yearlyGrowth
        }
      },
      payments: {
        monthly: monthlyPayments[0]?.totalAmount || 0,
        yearly: yearlyPayments[0]?.totalAmount || 0,
        monthlyCount: monthlyPayments[0]?.count || 0,
        yearlyCount: yearlyPayments[0]?.count || 0
      },
      recentActivity: {
        earnings: recentEarnings,
        payments: recentPayments,
        leads: recentLeads
      },
      analytics: {
        earningsByMonth: (earningsByMonth || []).map(item => ({
          month: item._id,
          amount: item.totalAmount,
          count: item.count
        }))
      }
    };

    res.status(200).json({
      success: true,
      data: dashboardStats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

// Get quick stats for widgets
export const getQuickStats = async (req, res) => {
  try {
    const partnerId = req.user._id;
    
    const [documentsCount, paymentsCount, earningsSum, leadsCount] = await Promise.all([
      Document.countDocuments({ uploadedBy: partnerId }),
      Payment.countDocuments({ partnerId }),
      Earning.aggregate([
        { $match: { partnerId: new mongoose.Types.ObjectId(partnerId), status: { $in: ['approved','paid'] } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$commissionEarned', { $ifNull: ['$amount', 0] }] } } } }
      ]),
      Lead.countDocuments({ $or: [ { createdBy: partnerId }, { assignedTo: partnerId }, { assignedPartner: partnerId } ] })
    ]);

    res.status(200).json({
      success: true,
      data: {
        documents: documentsCount,
        payments: paymentsCount,
        totalEarnings: earningsSum[0]?.total || 0,
        leads: leadsCount
      }
    });

  } catch (error) {
    console.error('Quick stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quick statistics',
      error: error.message
    });
  }
};

// Get recent activities
export const getRecentActivities = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    const [recentEarnings, recentPayments, recentDocuments] = await Promise.all([
      Earning.find({ partnerId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('commissionEarned clientName fundName createdAt'),
      
      Payment.find({ partnerId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('amount status paymentMethod createdAt'),
      
      Document.find({ uploadedBy: partnerId })
        .sort({ uploadedAt: -1 })
        .limit(limit)
        .select('originalName documentType status uploadedAt')
    ]);

    // Combine and sort all activities by date
    const activities = [
      ...recentEarnings.map(item => ({
        type: 'earning',
        id: item._id,
        title: `Commission from ${item.clientName || 'Client'}`,
        subtitle: item.fundName,
        amount: item.commissionEarned,
        date: item.createdAt,
        icon: 'dollar-sign'
      })),
      ...recentPayments.map(item => ({
        type: 'payment',
        id: item._id,
        title: `Payment ${item.status}`,
        subtitle: item.paymentMethod,
        amount: item.amount,
        date: item.createdAt,
        icon: 'credit-card'
      })),
      ...recentDocuments.map(item => ({
        type: 'document',
        id: item._id,
        title: `Document uploaded`,
        subtitle: item.originalName,
        amount: null,
        date: item.uploadedAt,
        icon: 'file-text'
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);

    res.status(200).json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('Recent activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent activities',
      error: error.message
    });
  }
};
