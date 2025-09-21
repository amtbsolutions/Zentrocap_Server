import mongoose from 'mongoose';
import ReferralRedemption from '../models/ReferralRedemption.js';
import Referral from '../models/Referral.js';
import PartnerReferralSummary from '../models/PartnerReferralSummary.js';

// Lightweight in-memory queue to rebuild referral summaries
const queue = [];
let working = false;

export function enqueueReferralSummaryUpdate(partnerId) {
  if (!partnerId) return;
  queue.push(String(partnerId));
}

export async function rebuildReferralSummary(partnerId) {
  const pid = typeof partnerId === 'string' ? partnerId : String(partnerId);
  const mongooseMod = (await import('mongoose')).default;

  // Load referred partners for this referrer
  const refs = await Referral.find({ referrerPartnerId: new mongooseMod.Types.ObjectId(pid) })
    .select('referredPartnerId commissionRate status')
    .lean();

  let paidCommission = 0; // referral paid commission (e.g., 1% of paid investments)
  let pendingCommission = 0; // referral pending commission (e.g., 1% of approved investments)
  let totalInvestmentAmount = 0; // lifetime invested amount by referred partners (paid only)
  let totalCommissionEarned = 0; // referral total = paid + pending

  if (refs.length) {
  const partnerIds = refs.map(r => new mongooseMod.Types.ObjectId(String(r.referredPartnerId)));
  const refRateMap = refs.reduce((m, r) => { m[String(r.referredPartnerId)] = Number(r.commissionRate || 1); return m; }, {});
    // Aggregate Earnings for these referred partners, excluding referral-redemption entries
  const lifetimeAgg = await mongoose.model('Earning').aggregate([
      { $match: {
        partnerId: { $in: partnerIds },
        status: 'paid',
        description: { $nin: ['Referal Earning', 'Referral Earning'] },
        fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
        $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
      } },
      { $group: { _id: null, investedSum: { $sum: { $ifNull: ['$investmentAmount', 0] } }, commissionSum: { $sum: { $ifNull: ['$commissionEarned', 0] } } } }
    ]);
    totalInvestmentAmount = Number(lifetimeAgg[0]?.investedSum || 0);
    // Compute paid referral commission from invested sums grouped per partner
    if (partnerIds.length) {
      const paidPerPartner = await mongoose.model('Earning').aggregate([
        { $match: {
          partnerId: { $in: partnerIds },
          status: 'paid',
          description: { $nin: ['Referal Earning', 'Referral Earning'] },
          fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
          $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
        } },
        { $group: { _id: '$partnerId', investedSum: { $sum: { $ifNull: ['$investmentAmount', 0] } } } }
      ]);
      paidCommission = paidPerPartner.reduce((acc, r) => acc + (((Number(r.investedSum || 0)) * (refRateMap[String(r._id)] || 1)) / 100), 0);
    }

    // Pending commissions: approved earnings not yet paid
    const pendingPerPartner = await mongoose.model('Earning').aggregate([
      { $match: {
        partnerId: { $in: partnerIds },
        status: 'approved',
        description: { $nin: ['Referal Earning', 'Referral Earning'] },
        fundName: { $nin: ['Referal Earning', 'Referral Earning'] },
        $or: [ { 'metadata.isReferralRedemption': { $exists: false } }, { 'metadata.isReferralRedemption': { $ne: true } } ]
      } },
      { $group: { _id: '$partnerId', investedSum: { $sum: { $ifNull: ['$investmentAmount', 0] } } } }
    ]);
    pendingCommission = pendingPerPartner.reduce((acc, r) => acc + (((Number(r.investedSum || 0)) * (refRateMap[String(r._id)] || 1)) / 100), 0);
  }

  // Redemptions from ledger
  const rr = await ReferralRedemption.find({ referrerPartnerId: pid }).select('commissionRedeemed status').lean();
  const redeemedCredited = rr.reduce((sum, r) => {
    const st = String(r?.status || 'credited').toLowerCase();
    return sum + ((st === 'credited' || !r?.status) ? (Number(r?.commissionRedeemed) || 0) : 0);
  }, 0);
  const pendingRedemption = rr.reduce((sum, r) => {
    const st = String(r?.status || '').toLowerCase();
    return sum + (st === 'requested' ? (Number(r?.commissionRedeemed) || 0) : 0);
  }, 0);

  // Availability excludes only credited redemptions in the summary; UI may subtract pending as needed
  const availableBalance = Math.max(0, paidCommission - redeemedCredited);

  // counts
  const counts = await Referral.aggregate([
    { $match: { referrerPartnerId: new (await import('mongoose')).default.Types.ObjectId(pid) } },
    { $group: { _id: '$status', n: { $sum: 1 } } }
  ]);
  const countsMap = counts.reduce((m, r) => { m[r._id] = r.n; return m; }, {});

  // Total referral commission for visibility (paid + pending)
  totalCommissionEarned = Math.max(0, Number(paidCommission || 0) + Number(pendingCommission || 0));

  await PartnerReferralSummary.findOneAndUpdate(
    { partnerId: pid },
    {
      $set: {
        partnerId: pid,
        paidCommission,
        pendingCommission,
        redeemedCredited,
        pendingRedemption,
        availableBalance,
        totalReferrals: (countsMap.active || 0) + (countsMap.pending || 0) + (countsMap.inactive || 0),
        activeReferrals: countsMap.active || 0,
        totalInvestmentAmount,
        totalCommissionEarned,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
}

export function startReferralSummaryWorker() {
  if (working) return;
  working = true;
  const loop = async () => {
    try {
      const next = queue.shift();
      if (next) {
        await rebuildReferralSummary(next);
      }
    } catch (e) {
      console.error('[summary worker] failed:', e.message);
    } finally {
      setTimeout(loop, 200);
    }
  };
  setTimeout(loop, 200);
}
