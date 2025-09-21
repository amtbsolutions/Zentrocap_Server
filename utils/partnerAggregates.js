import Earning from '../models/Earning.js';
import Lead from '../models/Lead.js';
import Partner from '../models/Partner.js';
import mongoose from 'mongoose';

/**
 * Recompute and persist aggregate metrics for a single partner.
 * Includes: totalEarnings (approved+paid), totalLeads (assignedPartner), conversionRate.
 * Optionally returns metrics.
 */
export async function recomputeAndPersistPartnerAggregates(partnerId) {
  if (!partnerId) return null;
  const pid = typeof partnerId === 'string' ? new mongoose.Types.ObjectId(partnerId) : partnerId;

  const [earnAgg] = await Earning.aggregate([
    { $match: { partnerId: pid, status: { $in: ['approved','paid'] } } },
    { $group: { _id: null, total: { $sum: '$commissionEarned' } } }
  ]);
  const totalEarnings = earnAgg?.total || 0;

  const leadAgg = await Lead.aggregate([
    { $match: { assignedPartner: pid } },
    { $group: { _id: null, totalLeads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status','Converted'] }, 1, 0] } } } }
  ]);
  const totalLeads = leadAgg[0]?.totalLeads || 0;
  const converted = leadAgg[0]?.converted || 0;
  const conversionRate = totalLeads > 0 ? Number(((converted / totalLeads) * 100).toFixed(2)) : 0;

  await Partner.updateOne({ _id: pid }, { $set: { totalEarnings, totalLeads, conversionRate } });
  return { totalEarnings, totalLeads, conversionRate };
}

/**
 * Bulk recompute for a list (or all) partners. Uses aggregation in batches.
 */
export async function bulkRecomputePartnerAggregates(partnerIds = null) {
  const filter = partnerIds?.length ? { _id: { $in: partnerIds.map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) } } : {};
  const partners = await Partner.find(filter).select('_id');
  if (!partners.length) return { updated: 0 };
  const ids = partners.map(p => p._id);

  const earnings = await Earning.aggregate([
    { $match: { partnerId: { $in: ids }, status: { $in: ['approved','paid'] } } },
    { $group: { _id: '$partnerId', totalEarnings: { $sum: '$commissionEarned' } } }
  ]);
  const earningsMap = new Map(earnings.map(e => [e._id.toString(), e.totalEarnings]));

  const leads = await Lead.aggregate([
    { $match: { assignedPartner: { $in: ids } } },
    { $group: { _id: '$assignedPartner', totalLeads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status','Converted'] }, 1, 0] } } } }
  ]);
  const leadMap = new Map(leads.map(l => [l._id.toString(), l]));

  const bulk = ids.map(id => {
    const k = id.toString();
    const totalEarnings = earningsMap.get(k) || 0;
    const lInfo = leadMap.get(k) || { totalLeads: 0, converted: 0 };
    const conversionRate = lInfo.totalLeads > 0 ? Number(((lInfo.converted / lInfo.totalLeads) * 100).toFixed(2)) : 0;
    return { updateOne: { filter: { _id: id }, update: { $set: { totalEarnings, totalLeads: lInfo.totalLeads, conversionRate } } } };
  });
  if (bulk.length) await Partner.bulkWrite(bulk);
  return { updated: bulk.length };
}
