import Referral from '../models/Referral.js';
import Partner from '../models/Partner.js';
import mongoose from 'mongoose';
import ReferralRedemption from '../models/ReferralRedemption.js';
import PartnerReferralSummary from '../models/PartnerReferralSummary.js';
import { enqueueReferralSummaryUpdate } from '../services/referralSummaryService.js';
import { getMinRedeemAmount, getRedeemCooldownSeconds } from '../config/referralConfig.js';

// Generate a unique referral code similar to PartnerSchema pre-save
async function ensureReferralCodeForPartner(partner) {
  if (partner.referralCode) return partner.referralCode;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  const namePrefix = (partner.name || '')
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 3)
    .toUpperCase() || 'PAR';
  while (!isUnique && attempts < maxAttempts) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `PART${namePrefix}${randomSuffix}`;
    const existing = await Partner.findOne({ referralCode: candidate }).lean();
    if (!existing) {
      partner.referralCode = candidate;
      await partner.save();
      return partner.referralCode;
    }
    attempts++;
  }
  // Fallback
  partner.referralCode = `PART${Date.now()}`;
  await partner.save();
  return partner.referralCode;
}

// Get referral overview/stats for a partner
export const getReferralOverview = async (req, res) => {
  try {
    const partnerId = req.user.id || req.user._id;
    
  // console.log('📊 Getting referral overview for partner:', partnerId);
    
  // Get partner details including referral code
  const partner = await Partner.findById(partnerId).select('referralCode name email');
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }
  // Ensure partner has a referral code
  const code = await ensureReferralCodeForPartner(partner);
    
    // Get referral statistics
    const stats = await Referral.getReferralStats(partnerId);

  // Compute how much of the paid commission has already been redeemed using the ledger
    // Sum only credited redemptions; for legacy entries without status, treat as credited
    const rrDocs = await ReferralRedemption.find({ referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) })
      .select('earningId commissionRedeemed status')
      .lean();
    // Only count credited redemptions when the underlying redemption earning still exists and is paid
    let redeemedTotal = 0;
    try {
      const credited = rrDocs.filter(r => {
        const st = String(r?.status || 'credited').toLowerCase();
        return (st === 'credited' || !r?.status) && r?.earningId;
      });
      const ids = credited.map(r => new mongoose.Types.ObjectId(String(r.earningId)));
      let existing = [];
      if (ids.length) {
        existing = await mongoose.model('Earning').find({ _id: { $in: ids }, status: 'paid' }).select('_id').lean();
      }
      const existingSet = new Set(existing.map(e => String(e._id)));
      for (const r of credited) {
        if (existingSet.has(String(r.earningId))) {
          redeemedTotal += (Number(r?.commissionRedeemed) || 0);
        } else {
          // Best-effort cleanup: mark as failed if redemption earning missing/not paid
          try { await ReferralRedemption.updateOne({ earningId: r.earningId }, { status: 'failed', updatedAt: new Date() }); } catch {}
        }
      }
    } catch (redErr) {
      console.warn('⚠️ Redeemed credited reconcile failed:', redErr?.message);
      redeemedTotal = rrDocs.reduce((sum, r) => {
        const st = String(r?.status || 'credited').toLowerCase();
        return sum + ((st === 'credited' || !r?.status) ? (Number(r?.commissionRedeemed) || 0) : 0);
      }, 0);
    }
    // Sum of requested (pending) redemptions for visibility. Do NOT clear them based on earning status.
    const pendingRedemption = rrDocs.reduce((sum, r) => {
      const st = String(r?.status || '').toLowerCase();
      return sum + (st === 'requested' ? (Number(r?.commissionRedeemed) || 0) : 0);
    }, 0);

  // Compute total paid commissions exclusively from referred partners' paid earnings (exclude referral redemptions)
    let paidCommissionTotal = 0;
    try {
      const [refs, partnersByRel] = await Promise.all([
        Referral.find({ referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) })
          .select('referredPartnerId commissionRate')
          .lean(),
        Partner.find({ referredBy: new mongoose.Types.ObjectId(String(partnerId)) })
          .select('_id')
          .lean()
      ]);
      const refRateMap = (refs || []).reduce((m, r) => { m[String(r.referredPartnerId)] = Number(r.commissionRate || 1); return m; }, {});
      const partnerIds = [
        ...new Set([
          ...((refs || []).map(r => String(r.referredPartnerId))),
          ...((partnersByRel || []).map(p => String(p._id)))
        ])
      ].map(id => new mongoose.Types.ObjectId(String(id)));
      if (partnerIds.length) {
        const earnings = await mongoose.model('Earning').find({ partnerId: { $in: partnerIds }, status: 'paid' })
          .select('partnerId investmentAmount commissionEarned commissionRate metadata description fundName')
          .lean();
        const investByPartner = {};
        for (const e of earnings) {
          const descLc = String(e?.description || '').toLowerCase();
          const fundLc = String(e?.fundName || '').toLowerCase();
          const isReferralEarning = (descLc === 'referal earning' || descLc === 'referral earning') || (fundLc === 'referal earning' || fundLc === 'referral earning') || Boolean(e?.metadata?.isReferralRedemption);
          if (isReferralEarning) continue; // skip multi-level/referral-redemption earnings
          const pid = String(e.partnerId);
          const invest = Number(e.investmentAmount || e?.metadata?.baseAmount || 0) || (
            Number(e.commissionEarned || 0) > 0 && Number(e.commissionRate || 0) > 0
              ? Math.round((Number(e.commissionEarned) * 100) / Number(e.commissionRate))
              : 0
          );
          if (!investByPartner[pid]) investByPartner[pid] = 0;
          investByPartner[pid] += invest;
        }
        for (const pid of Object.keys(investByPartner)) {
          const rate = refRateMap[pid] || 1;
          paidCommissionTotal += (investByPartner[pid] * rate) / 100;
        }
      }
    } catch (fbErr) {
      console.warn('⚠️ Paid commission compute from Earnings failed:', fbErr.message);
    }

  // Embedded commissionPayments deprecated; rely on Earnings-based compute only
  let effectivePaidCommission = Math.max(0, Number(paidCommissionTotal || 0));
    // Final fallback: aggregate paid investedSum per referred partner and apply referral rate
    if (!(effectivePaidCommission > 0)) {
      try {
        const [refs, partnersByRel] = await Promise.all([
          Referral.find({ referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) })
            .select('referredPartnerId commissionRate')
            .lean(),
          Partner.find({ referredBy: new mongoose.Types.ObjectId(String(partnerId)) })
            .select('_id')
            .lean()
        ]);
        const refRateMap = (refs || []).reduce((m, r) => { m[String(r.referredPartnerId)] = Number(r.commissionRate || 1); return m; }, {});
        const partnerIds = [
          ...new Set([
            ...((refs || []).map(r => String(r.referredPartnerId))),
            ...((partnersByRel || []).map(p => String(p._id)))
          ])
        ].map(id => new mongoose.Types.ObjectId(String(id)));
        if (partnerIds.length) {
          const paidAgg = await mongoose.model('Earning').aggregate([
            { $match: {
              partnerId: { $in: partnerIds },
              status: 'paid',
              description: { $nin: ['Referal Earning', 'Referral Earning'] },
              fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
              $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
            } },
            { $group: { _id: '$partnerId', investedSum: { $sum: { $ifNull: ['$investmentAmount', 0] } } } }
          ]);
          const investedMap = paidAgg.reduce((m, r) => { m[String(r._id)] = Number(r.investedSum || 0); return m; }, {});
          let computed = 0;
          for (const pid of Object.keys(investedMap)) {
            const rate = refRateMap[pid] || 1;
            computed += (investedMap[pid] * rate) / 100;
          }
          if (computed > 0) effectivePaidCommission = computed;
        }
      } catch (aggErr) {
        console.warn('⚠️ Paid commission aggregate fallback failed:', aggErr?.message);
      }
    }

  // Compute pending commission total exclusively from referred partners' approved earnings (exclude referral redemptions)
    let pendingCommissionTotal = 0;
    try {
      const [refs, partnersByRel] = await Promise.all([
        Referral.find({ referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) })
          .select('referredPartnerId commissionRate')
          .lean(),
        Partner.find({ referredBy: new mongoose.Types.ObjectId(String(partnerId)) })
          .select('_id')
          .lean()
      ]);
      const refRateMap = (refs || []).reduce((m, r) => { m[String(r.referredPartnerId)] = Number(r.commissionRate || 1); return m; }, {});
      const partnerIds = [
        ...new Set([
          ...((refs || []).map(r => String(r.referredPartnerId))),
          ...((partnersByRel || []).map(p => String(p._id)))
        ])
      ].map(id => new mongoose.Types.ObjectId(String(id)));
      if (partnerIds.length) {
        // Only treat 'approved' earnings as pending-for-referral (ready to be counted but not yet paid out)
        const pendEarnings = await mongoose.model('Earning').find({ partnerId: { $in: partnerIds }, status: 'approved' })
          .select('partnerId investmentAmount commissionEarned commissionRate metadata description fundName')
          .lean();
        for (const e of pendEarnings) {
          const descLc = String(e?.description || '').toLowerCase();
          const fundLc = String(e?.fundName || '').toLowerCase();
          const isReferralEarning = (descLc === 'referal earning' || descLc === 'referral earning') || (fundLc === 'referal earning' || fundLc === 'referral earning') || Boolean(e?.metadata?.isReferralRedemption);
          if (isReferralEarning) continue;
          const pid = String(e.partnerId);
          const rate = refRateMap[pid] || Number(e.commissionRate || 1) || 1;
          // Always compute referral pending commission from investment at the referral rate
          let invest = Number(e.investmentAmount || e?.metadata?.baseAmount || 0);
          if (!(invest > 0)) {
            // Fallback: derive base investment from earning's commission and its own rate if present
            const ownRate = Number(e.commissionRate || 0);
            const earned = Number(e.commissionEarned || 0);
            if (earned > 0 && ownRate > 0) {
              invest = Math.round((earned * 100) / ownRate);
            }
          }
          if (invest > 0 && rate > 0) {
            pendingCommissionTotal += (invest * rate) / 100;
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Pending commission compute failed:', e.message);
    }

  // Prefer freshest compute from events for availability; use summary only for pendingRedemption fallback
  const summary = await PartnerReferralSummary.findOne({ partnerId: new mongoose.Types.ObjectId(String(partnerId)) }).lean();
  // Immediate UX: subtract live pending redemptions so Available resets to zero instantly after request
  const availableBalance = Math.max(0, effectivePaidCommission - redeemedTotal);
    
    // Get recent referrals (last 10)
    const recentReferrals = await Referral.find({ referrerPartnerId: partnerId })
      .populate('referredPartnerId', 'name email phone registrationDate')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
  // Fallback: fetch latest earning for these referred partners if no paid commission
  const recentIds = recentReferrals.map(r => r.referredPartnerId?._id || r.referredPartnerId).filter(Boolean);
    let latestRecentEarningsMap = {};
  let monthlyActiveSet = new Set();
    if (recentIds.length) {
      const latestRecentEarnings = await mongoose.model('Earning').aggregate([
          { $match: { 
            partnerId: { $in: recentIds.map(id => new mongoose.Types.ObjectId(String(id))) }, 
            status: 'paid',
            description: { $ne: 'Referal Earning' },
            fundName: { $ne: 'Referal Earning' },
            $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
          } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$partnerId', doc: { $first: '$$ROOT' } } }
      ]);
      latestRecentEarningsMap = latestRecentEarnings.reduce((acc, e) => {
        const invest = (e?.doc?.investmentAmount) || ((e?.doc?.commissionEarned && e?.doc?.commissionRate) ? (e.doc.commissionEarned * 100) / e.doc.commissionRate : 0);
        const obj = {
          investment: invest > 0 ? Math.round(invest) : 0,
          clientId: e?.doc?.clientId || null,
          clientName: e?.doc?.clientName || null
        };
        acc[String(e._id)] = obj;
        return acc;
      }, {});
      // Compute current-month activity per referred partner (status active/inactive)
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const activeRows = await mongoose.model('Earning').aggregate([
          { $match: {
            partnerId: { $in: recentIds.map(id => new mongoose.Types.ObjectId(String(id))) },
            status: 'paid',
            description: { $nin: ['Referal Earning', 'Referral Earning'] },
            fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
            $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ],
            $or: [
              { paymentDate: { $gte: monthStart, $lt: monthEnd } },
              { $and: [ { $or: [ { paymentDate: { $exists: false } }, { paymentDate: null } ] }, { createdAt: { $gte: monthStart, $lt: monthEnd } } ] }
            ]
          } },
          { $group: { _id: '$partnerId', cnt: { $sum: 1 } } }
        ]);
        monthlyActiveSet = new Set(activeRows.map(r => String(r._id)));
      } catch {}
      // Aggregate lifetime totals as a robust fallback when commissionPayments are missing
      const lifetimeAgg = await mongoose.model('Earning').aggregate([
          { $match: { 
            partnerId: { $in: recentIds.map(id => new mongoose.Types.ObjectId(String(id))) }, 
            status: 'paid',
            description: { $ne: 'Referal Earning' },
            fundName: { $ne: 'Referal Earning' },
            $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
          } },
        { $group: { _id: '$partnerId', investedSum: { $sum: { $ifNull: ['$investmentAmount', 0] } }, commissionSum: { $sum: { $ifNull: ['$commissionEarned', 0] } } } }
      ]);
      var lifetimeTotalsMap = lifetimeAgg.reduce((acc, r) => { acc[String(r._id)] = { investedSum: r.investedSum || 0, commissionSum: r.commissionSum || 0 }; return acc; }, {});
    }
    
    // Construct referral link
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5174';
  const referralLink = `${baseUrl.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(code)}`;
    
    const overview = {
      partnerId: partner._id,
      partnerName: partner.name,
  referralCode: code,
      referralLink: referralLink,
      commissionRate: 1, // Default 1% - can be made configurable
      ...stats,
  // approvedCommission removed: availability based on paid only
  availableBalance,
  // Expose both live and summarized pending for transparency (client can read pendingRedemption)
  pendingRedemption: pendingRedemption,
  // Debug breakdown for validation/troubleshooting
  paidBreakdown: {
    effectivePaidCommission: Number(effectivePaidCommission || 0),
    paidFromEarnings: Number(paidCommissionTotal || 0),
    redeemedCredited: Number(redeemedTotal || 0),
    pendingRedemption: Number(pendingRedemption || 0)
  },
  // Config-driven settings for client
  minRedeemAmount: getMinRedeemAmount(),
  redeemCooldownSeconds: getRedeemCooldownSeconds(),
  // Override totals strictly from Earnings (excluding 'Referal Earning')
  paidCommission: Math.max(0, Number(effectivePaidCommission || 0)),
  pendingCommission: Math.max(0, Number(pendingCommissionTotal || 0)),
  totalCommissionEarned: Math.max(0, Number(effectivePaidCommission || 0) + Number(pendingCommissionTotal || 0)),
  recentReferrals: recentReferrals.map(ref => {
  const payments = [];
  const sumInvestments = 0;
  const paymentsCommissionSum = 0;
  const latestPaid = null;
  const latestPaidInvestment = 0;
  const paidSorted = [];
  const recentActivityDate = ref.lastActivityDate || ref.registrationDate;
  const lastInvestmentDatePrev = null;
        const latestObj = latestRecentEarningsMap[String(ref.referredPartnerId?._id || ref.referredPartnerId)] || {};
        const fallbackLatest = latestObj?.investment || 0;
  const latestInvestment = latestPaidInvestment > 0 ? latestPaidInvestment : (fallbackLatest > 0 ? fallbackLatest : 0);
  const ltTotals = (lifetimeTotalsMap || {})[String(ref.referredPartnerId?._id || ref.referredPartnerId)] || { investedSum: 0, commissionSum: 0 };
  const lifetimeInvestment = sumInvestments > 0 ? sumInvestments : (ltTotals.investedSum > 0 ? ltTotals.investedSum : Number(ref.totalInvestmentAmount || 0));
        const rate = Number(ref?.commissionRate ?? 1);
        const totalCommission = (paymentsCommissionSum > 0
          ? paymentsCommissionSum
          : (lifetimeInvestment > 0 && rate > 0)
            ? Math.round((lifetimeInvestment * rate) / 100)
            : Number(ref.totalCommissionEarned || 0));
        const totalBusiness = lifetimeInvestment;
        const currentBusiness = latestInvestment;
        const currentCommission = (currentBusiness > 0 && rate > 0) ? Math.round((currentBusiness * rate) / 100) : 0;
        return {
          _id: ref._id,
          referredPartnerId: ref.referredPartnerId?._id || ref.referredPartnerId,
          referredUser: ref.referredPartnerId?.name || ref.referredPartnerName,
          email: ref.referredPartnerId?.email || ref.referredPartnerEmail,
          registrationDate: ref.registrationDate,
          status: monthlyActiveSet.has(String(ref.referredPartnerId?._id || ref.referredPartnerId)) ? 'active' : 'inactive',
          // Show latest paid investment if present, else latest earning's investment, else total
          totalInvestment: latestPaidInvestment > 0 ? latestPaidInvestment : (fallbackLatest > 0 ? fallbackLatest : ref.totalInvestmentAmount),
          latestInvestment,
          lifetimeInvestment,
          totalBusiness,
          currentBusiness,
          currentCommission,
          earnedCommission: ref.totalCommissionEarned,
          totalCommission,
          commissionRate: rate,
          totalInvestmentAmount: Number(ref.totalInvestmentAmount || 0),
          lastActivity: ref.lastActivityDate,
          recentActivityDate,
          lastInvestmentDatePrev,
          latestClientId: latestObj?.clientId || null,
          latestClientName: latestObj?.clientName || null
        };
      })
    };
    
  // console.log('✅ Referral overview generated:', {
  //   totalReferrals: stats.totalReferrals,
  //   totalCommission: stats.totalCommissionEarned
  // });
    
    res.json({
      success: true,
      data: overview
    });
    
  } catch (error) {
    console.error('❌ Error getting referral overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral overview',
      error: error.message
    });
  }
};

// Get detailed referral history with pagination
export const getReferralHistory = async (req, res) => {
  try {
    const partnerId = req.user.id || req.user._id;
  const { limit = 10, status, cursor } = req.query;
    
  // console.log('📋 Getting referral history for partner:', partnerId);
    
    // Build filter
  const filter = { referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) };
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Cursor pagination: createdAt desc, _id as tiebreaker
    const q = { ...filter };
    if (cursor) {
      const [d, id] = String(cursor).split('_');
      const date = new Date(d);
      q.$or = [
        { createdAt: { $lt: date } },
        { createdAt: date, _id: { $lt: new mongoose.Types.ObjectId(id) } }
      ];
    }
    const referrals = await Referral.find(q)
      .populate('referredPartnerId', 'name email phone registrationDate')
      .sort({ createdAt: -1, _id: -1 })
      .limit(parseInt(limit))
      .lean();
    
    // Fallback: latest earning for these referred partners
    const referredIds = referrals.map(r => r.referredPartnerId?._id || r.referredPartnerId).filter(Boolean);
  let latestEarningsMap = {};
  let lifetimeTotalsMap = {};
  let monthlyActiveSet = new Set();
    if (referredIds.length) {
  const latestEarnings = await mongoose.model('Earning').aggregate([
        { $match: { 
          partnerId: { $in: referredIds.map(id => new mongoose.Types.ObjectId(String(id))) }, 
          status: 'paid',
          description: { $nin: ['Referal Earning', 'Referral Earning'] },
          fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
          $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
        } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$partnerId', doc: { $first: '$$ROOT' } } }
      ]);
      latestEarningsMap = latestEarnings.reduce((acc, e) => {
        const invest = (e?.doc?.investmentAmount) || ((e?.doc?.commissionEarned && e?.doc?.commissionRate) ? (e.doc.commissionEarned * 100) / e.doc.commissionRate : 0);
        acc[String(e._id)] = {
          investment: invest > 0 ? Math.round(invest) : 0,
          clientId: e?.doc?.clientId || null,
          clientName: e?.doc?.clientName || null,
          paymentDate: e?.doc?.paymentDate || e?.doc?.createdAt || null
        };
        return acc;
      }, {});
      // Robust lifetime totals fallback from Earnings when commissionPayments are incomplete
      const lifetimeAgg = await mongoose.model('Earning').aggregate([
        { $match: { 
          partnerId: { $in: referredIds.map(id => new mongoose.Types.ObjectId(String(id))) }, 
          status: 'paid',
          description: { $nin: ['Referal Earning', 'Referral Earning'] },
          fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
          $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
        } },
        { $group: { _id: '$partnerId', investedSum: { $sum: { $ifNull: ['$investmentAmount', 0] } }, commissionSum: { $sum: { $ifNull: ['$commissionEarned', 0] } } } }
      ]);
      lifetimeTotalsMap = lifetimeAgg.reduce((acc, r) => {
        acc[String(r._id)] = { investedSum: r.investedSum || 0, commissionSum: r.commissionSum || 0 };
        return acc;
      }, {});
      // Determine current-month activity for each referred partner
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const activeRows = await mongoose.model('Earning').aggregate([
          { $match: {
            partnerId: { $in: referredIds.map(id => new mongoose.Types.ObjectId(String(id))) },
            status: 'paid',
            description: { $nin: ['Referal Earning', 'Referral Earning'] },
            fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
            $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ],
            $or: [
              { paymentDate: { $gte: monthStart, $lt: monthEnd } },
              { $and: [ { $or: [ { paymentDate: { $exists: false } }, { paymentDate: null } ] }, { createdAt: { $gte: monthStart, $lt: monthEnd } } ] }
            ]
          } },
          { $group: { _id: '$partnerId', cnt: { $sum: 1 } } }
        ]);
        monthlyActiveSet = new Set(activeRows.map(r => String(r._id)));
      } catch {}
    }

    // Format response
  const formattedReferrals = referrals.map(ref => {
      const payments = [];
  const sumInvestments = 0;
    const paymentsCommissionSum = 0;
      const latestPaid = null;
      const latestPaidInvestment = 0;
      const latestObj = latestEarningsMap[String(ref.referredPartnerId?._id || ref.referredPartnerId)] || {};
      const fallbackLatest = latestObj?.investment || 0;
  // Prefer Earnings-derived latest investment
  const latestInvestment = (fallbackLatest > 0 ? fallbackLatest : (latestPaidInvestment > 0 ? latestPaidInvestment : 0));
  const ltTotals = (lifetimeTotalsMap || {})[String(ref.referredPartnerId?._id || ref.referredPartnerId)] || { investedSum: 0, commissionSum: 0 };
  // Prefer Earnings-derived lifetime first; fallback to embedded payments, then legacy totalInvestmentAmount
  const lifetimeInvestment = (ltTotals.investedSum > 0 ? ltTotals.investedSum : (sumInvestments > 0 ? sumInvestments : Number(ref.totalInvestmentAmount || 0)));
  const paidSorted = [];
  const recentActivityDate = latestObj?.paymentDate || ref.lastActivityDate || ref.registrationDate;
  const lastInvestmentDatePrev = null;
  const rate = Number(ref?.commissionRate ?? 1);
  const computedMonthlyStatus = monthlyActiveSet.has(String(ref.referredPartnerId?._id || ref.referredPartnerId)) ? 'active' : 'inactive';
      // Referral commission should be computed from referral data, not the referred partner's own commissionEarned sums
      const totalCommission = (
        (paymentsCommissionSum > 0)
          ? paymentsCommissionSum
          : (lifetimeInvestment > 0 && rate > 0)
            ? Math.round((lifetimeInvestment * rate) / 100)
            : Number(ref.totalCommissionEarned || 0)
      );
      const totalBusiness = lifetimeInvestment;
      const currentBusiness = latestInvestment;
  const currentCommission = (currentBusiness > 0 && rate > 0) ? Math.round((currentBusiness * rate) / 100) : 0;
  return {
        _id: ref._id,
        referredPartnerId: ref.referredPartnerId?._id || ref.referredPartnerId,
        referredUser: ref.referredPartnerId?.name || ref.referredPartnerName,
        email: ref.referredPartnerId?.email || ref.referredPartnerEmail,
        phone: ref.referredPartnerId?.phone || 'N/A',
        registrationDate: ref.registrationDate,
  status: computedMonthlyStatus,
        // Maintain backward field but it's the latest; client uses lifetimeInvestment separately
        totalInvestment: latestInvestment,
        latestInvestment,
        lifetimeInvestment,
        totalBusiness,
        currentBusiness,
        currentCommission,
  // Align earnedCommission with referral perspective (not partner's own commissions)
  earnedCommission: totalCommission,
  totalInvestmentAmount: Number(ref.totalInvestmentAmount || 0),
  pendingCommission: ref.pendingCommission,
        paidCommission: ref.paidCommission,
        lastActivity: ref.lastActivityDate,
        recentActivityDate,
        lastInvestmentDatePrev,
        totalCommission,
  commissionRate: rate,
  commissionPayments: [],
        latestClientId: latestObj?.clientId || null,
        latestClientName: latestObj?.clientName || null
      };
    });
    
    const nextCursor = referrals.length === parseInt(limit)
      ? `${new Date(referrals[referrals.length - 1].createdAt).toISOString()}_${referrals[referrals.length - 1]._id}`
      : null;
    res.json({ success: true, data: { referrals: formattedReferrals, nextCursor } });
    
  } catch (error) {
    console.error('❌ Error getting referral history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral history',
      error: error.message
    });
  }
};

// Validate referral code (used during signup)
export const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.params;
    
    console.log('🔍 Validating referral code:', referralCode);
    
    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: 'Referral code is required'
      });
    }
    
    // Find partner with this referral code
    const referrer = await Partner.findOne({ referralCode }).select('_id name email referralCode');
    
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }
    
    res.json({
      success: true,
      data: {
        isValid: true,
        referrer: {
          id: referrer._id,
          name: referrer.name,
          email: referrer.email,
          referralCode: referrer.referralCode
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error validating referral code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate referral code',
      error: error.message
    });
  }
};

// Process referral signup (called after new partner registration)
export const processReferralSignup = async (referredPartnerId, referralCode) => {
  try {
    console.log('🎯 Processing referral signup:', { referredPartnerId, referralCode });
    
    if (!referralCode) {
      console.log('⚠️ No referral code provided');
      return null;
    }
    
    // Find referrer partner
    const referrer = await Partner.findOne({ referralCode });
    if (!referrer) {
      console.log('⚠️ Invalid referral code:', referralCode);
      return null;
    }
    
    // Get referred partner details
    const referredPartner = await Partner.findById(referredPartnerId);
    if (!referredPartner) {
      console.log('⚠️ Referred partner not found:', referredPartnerId);
      return null;
    }
    
    // Check if referral already exists
    const existingReferral = await Referral.findOne({ 
      referrerPartnerId: referrer._id,
      referredPartnerId: referredPartnerId
    });
    
    if (existingReferral) {
      console.log('⚠️ Referral already exists');
      return existingReferral;
    }
    
    // Create referral record
    const referral = new Referral({
      referrerPartnerId: referrer._id,
      referredPartnerId: referredPartnerId,
      referralCode: referralCode,
      referredPartnerEmail: referredPartner.email,
      referredPartnerName: referredPartner.name,
      status: 'pending' // Will become 'active' after first investment
    });
    
    await referral.save();
    
    // Update referred partner's referral info
    referredPartner.referredBy = referrer._id;
    referredPartner.referredByCode = referralCode;
    await referredPartner.save();
    
    console.log('✅ Referral processed successfully');
    return referral;
    
  } catch (error) {
    console.error('❌ Error processing referral signup:', error);
    return null;
  }
};

// Process referral commission (called when referred partner makes investment)
export const processReferralCommission = async (partnerId, investmentAmount, status = 'paid') => {
  try {
    console.log('💰 Processing referral commission:', { partnerId, investmentAmount });
    
    // Find if this partner was referred by someone
  const partner = await Partner.findById(partnerId).select('referredBy referredByCode name email');
    if (!partner) {
      console.log('ℹ️ Partner not found');
      return null;
    }
    if (!partner.referredBy) {
      // Try to find an existing referral by this referred partner
      const existingRef = await Referral.findOne({ referredPartnerId: partnerId }).select('referrerPartnerId referralCode');
      if (existingRef) {
        partner.referredBy = existingRef.referrerPartnerId;
        if (!partner.referredByCode && existingRef.referralCode) partner.referredByCode = existingRef.referralCode;
        try { await partner.save(); } catch (e) { console.warn('⚠️ Failed to backfill partner.referredBy:', e.message); }
      } else {
        console.log('ℹ️ Partner was not referred by anyone');
        return null;
      }
    }
    
    // Find the referral record
  let referral = await Referral.findOne({
      referrerPartnerId: partner.referredBy,
      referredPartnerId: partnerId
    });
    
    if (!referral) {
      console.log('⚠️ Referral record not found — creating lazily');
    try {
        referral = await Referral.create({
          referrerPartnerId: partner.referredBy,
          referredPartnerId: partnerId,
          referralCode: partner.referredByCode || 'AUTO',
      referredPartnerEmail: partner.email || 'unknown@example.com',
      referredPartnerName: partner.name || 'Unknown',
          status: 'pending'
        });
      } catch (mkErr) {
        console.error('❌ Failed to create referral on-the-fly:', mkErr.message);
        return null;
      }
    }
    
    // Ensure rate
    if (!referral.commissionRate || Number.isNaN(Number(referral.commissionRate))) {
      referral.commissionRate = 1; // default 1%
    }
    // Mark referral as active if it's the first investment
    if (referral.status === 'pending' && investmentAmount > 0) {
      referral.status = 'active';
      referral.firstInvestmentDate = new Date();
    }
    
  // Add commission payment (embedded for backward compatibility)
    const investNum = Number(investmentAmount) || 0;
    if (investNum > 0) await referral.addCommissionPayment(investNum);
    // Mark the most recent commission payment with provided status (default 'paid')
    if (Array.isArray(referral.commissionPayments) && referral.commissionPayments.length > 0) {
      const last = referral.commissionPayments[referral.commissionPayments.length - 1];
      last.status = status;
      if (!last.paymentDate) last.paymentDate = new Date();
      await referral.save();
    }
    
  // Enqueue summary update for quick reads
  try { enqueueReferralSummaryUpdate(referral.referrerPartnerId); } catch {}

    console.log('✅ Referral commission processed:', {
      referralId: referral._id,
      commission: (investmentAmount * referral.commissionRate) / 100,
      status
    });
    
    return referral;
    
  } catch (error) {
  console.error('❌ Error processing referral commission:', error);
    return null;
  }
};

// Get referral commission details
export const getReferralCommissions = async (req, res) => {
  try {
    const partnerId = req.user.id || req.user._id;
  const { status = 'all', limit = 50 } = req.query;

  // console.log('💰 Getting referral commissions (embedded) for partner:', partnerId);

    const filter = { referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) };
    const refs = await Referral.find(filter)
      .populate('referredPartnerId', 'name email')
      .lean();
    let commissions = [];
    refs.forEach(referral => {
      const payments = Array.isArray(referral.commissionPayments) ? referral.commissionPayments : [];
      payments.forEach(payment => {
        if (status === 'all' || String(payment.status || '').toLowerCase() === String(status).toLowerCase()) {
          commissions.push({
            _id: payment._id,
            referralId: referral._id,
            referredPartner: referral.referredPartnerId?.name || referral.referredPartnerName,
            referredPartnerEmail: referral.referredPartnerId?.email || referral.referredPartnerEmail,
            amount: Number(payment.amount || 0),
            investmentAmount: Number(payment.investmentAmount || 0),
            commissionRate: Number(referral.commissionRate || 1),
            paymentDate: payment.paymentDate,
            status: payment.status,
            createdAt: payment.createdAt || referral.createdAt
          });
        }
      });
    });
    commissions.sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));
    if (limit) commissions = commissions.slice(0, parseInt(limit));
    
    // Calculate totals
    const totals = {
      totalCommissions: commissions.length,
      totalAmount: commissions.reduce((sum, c) => sum + c.amount, 0),
      pendingAmount: commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0),
      paidAmount: commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0)
    };
    
    res.json({
      success: true,
      data: {
  commissions,
  totals,
  nextCursor: null
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting referral commissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral commissions',
      error: error.message
    });
  }
};

// Get redemption summary per referral (how much commission already redeemed)
export const getRedemptionSummary = async (req, res) => {
  try {
    const partnerId = req.user.id || req.user._id;
    const rows = await ReferralRedemption.aggregate([
      { $match: { referrerPartnerId: new mongoose.Types.ObjectId(String(partnerId)) } },
      { $group: { _id: '$referralId', total: { $sum: '$commissionRedeemed' } } }
    ]);
    const map = rows.reduce((acc, r) => { acc[String(r._id)] = r.total; return acc; }, {});
    res.json({ success: true, data: { redeemedByReferral: map, count: rows.length } });
  } catch (error) {
    console.error('❌ Error getting redemption summary:', error);
    res.status(500).json({ success: false, message: 'Failed to get redemption summary', error: error.message });
  }
};

// DEBUG: Inspect commissions, redemptions, and computed availability for current partner
export const debugReferralState = async (req, res) => {
  try {
    const partnerId = req.user.id || req.user._id;
    const pid = new mongoose.Types.ObjectId(String(partnerId));

    // Compute from embedded commission payments only
    const refs = await Referral.find({ referrerPartnerId: pid }).select('commissionPayments').lean();
    let paidSum = 0;
    let pendingSum = 0;
    for (const r of refs) {
      const payments = Array.isArray(r.commissionPayments) ? r.commissionPayments : [];
      for (const p of payments) {
        const st = String(p?.status || '').toLowerCase();
        const amt = Number(p?.amount || 0);
        if (st === 'paid') paidSum += amt;
        if (st === 'pending') pendingSum += amt;
      }
    }

    const rrDocs = await ReferralRedemption.find({ referrerPartnerId: pid })
      .select('commissionRedeemed status createdAt')
      .sort({ createdAt: -1 })
      .lean();
    const redeemedCredited = rrDocs.reduce((s, r) => s + ((String(r.status || 'credited').toLowerCase() === 'credited' || !r.status) ? (Number(r.commissionRedeemed) || 0) : 0), 0);
    const pendingRedemption = rrDocs.reduce((s, r) => s + ((String(r.status || '').toLowerCase() === 'requested') ? (Number(r.commissionRedeemed) || 0) : 0), 0);

  const available = Math.max(0, paidSum - redeemedCredited);
  const availableAfterPending = Math.max(0, paidSum - redeemedCredited - pendingRedemption);

  res.json({ success: true, data: { counts: { refs: refs.length, rr: rrDocs.length }, paidSum, pendingSum, redeemedCredited, pendingRedemption, available, availableAfterPending, sample: { redemption: rrDocs[0] || null } } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Debug failed', error: e.message });
  }
};

// DEBUG: Reset referral redemption ledger for current partner (testing only)
export const resetReferralLedgerForCurrent = async (req, res) => {
  try {
    const partnerId = req.user.id || req.user._id;
    const pid = new mongoose.Types.ObjectId(String(partnerId));
    const del = await ReferralRedemption.deleteMany({ referrerPartnerId: pid });
    // Optionally, clear requested statuses left over (already deleted above)
    res.json({ success: true, data: { deletedCount: del?.deletedCount || 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to reset referral ledger', error: e.message });
  }
};

// ADMIN/MAINT: Cleanup legacy fields on Referral documents
export const cleanupLegacyReferralFields = async (req, res) => {
  try {
    const result = await mongoose.model('Referral').updateMany(
      {},
      { $unset: { totalInvestmentAmount: 1, totalCommissionEarned: 1, commissionPayments: 1 } }
    );
    // Index cleanup is typically manual/migration-time; we can attempt a best-effort drop if present
    try {
      const ReferralModel = mongoose.model('Referral');
      // These index names may vary; ignoring errors
      await ReferralModel.collection.dropIndex('commissionPayments_1').catch(() => {});
    } catch {}
    res.json({ success: true, data: { matched: result.matchedCount || result.n || 0, modified: result.modifiedCount || result.nModified || 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to cleanup legacy fields', error: e.message });
  }
};
