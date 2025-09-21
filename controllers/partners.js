import mongoose from 'mongoose';
import Partner from '../models/Partner.js';
import Earning from '../models/Earning.js';
import Lead from '../models/Lead.js';

// GET /api/partners
// Admin: list partners with basic filtering + pagination
export const getPartners = async (req, res) => {
	try {
		const page = Math.max(parseInt(req.query.page) || 1, 1);
		const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
		const skip = (page - 1) * limit;
		const { status, role, search, compute = '1', persist, includeRef } = req.query;

		const filter = {};
		if (status) filter.status = status;
		if (role) filter.role = role;
		if (search) {
			const rx = new RegExp(search.trim(), 'i');
			filter.$or = [
				{ name: rx },
				{ email: rx },
				{ phone: rx },
				{ companyName: rx }
			];
		}

		const [partners, total] = await Promise.all([
			Partner.find(filter)
				.select('-password')
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit),
			Partner.countDocuments(filter)
		]);

		let computedMap = {};
		if (compute === '1' && partners.length) {
			const partnerIds = partners.map(p => p._id);

			// Aggregate earnings (approved or paid)
			const earningAgg = await Earning.aggregate([
				{ $match: { partnerId: { $in: partnerIds }, status: { $in: ['approved', 'paid'] } } },
				{ $group: { _id: '$partnerId', totalEarnings: { $sum: '$commissionEarned' }, earningCount: { $sum: 1 } } }
			]);
			earningAgg.forEach(e => { computedMap[e._id.toString()] = { totalEarnings: e.totalEarnings, earningCount: e.earningCount }; });

			// Leads aggregation (count + converted count)
			const leadAgg = await Lead.aggregate([
				{ $match: { assignedPartner: { $in: partnerIds } } },
				{ $group: { _id: '$assignedPartner', totalLeads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } } } }
			]);
			leadAgg.forEach(l => {
				const key = l._id.toString();
				computedMap[key] = {
					...(computedMap[key] || {}),
					totalLeads: l.totalLeads,
					converted: l.converted,
					conversionRate: l.totalLeads > 0 ? Number(((l.converted / l.totalLeads) * 100).toFixed(2)) : 0
				};
			});

			// Optionally persist aggregates back to Partner documents if requested
			if (persist === '1') {
				const bulk = Object.entries(computedMap).map(([id, v]) => ({
					updateOne: {
						filter: { _id: id },
						update: {
							$set: {
								totalEarnings: v.totalEarnings || 0,
								totalLeads: v.totalLeads || 0,
								conversionRate: v.conversionRate || 0
							}
						}
					}
				}));
				if (bulk.length) await Partner.bulkWrite(bulk);
			}
		}


		let referralMap = {};
		let reverseReferralMap = {};
		if (includeRef === '1' && partners.length) {
			// Collect all referralCodes and referredBy references to batch query
			const referralCodes = partners.filter(p => p.referralCode).map(p => p.referralCode);
			const referredByCodes = partners.filter(p => p.referredByCode).map(p => p.referredByCode);
			// Build a lookup for partners by referralCode for fast in-memory joins later
			if (referralCodes.length || referredByCodes.length) {
				const allCodes = Array.from(new Set([...referralCodes, ...referredByCodes]));
				const codeOwners = await Partner.find({ referralCode: { $in: allCodes } })
					.select('name email phone referralCode status isApproved referredByCode totalEarnings createdAt');
				const byCode = {};
				codeOwners.forEach(p => { byCode[p.referralCode] = p; });

				// Build reverse map: for each partner, find direct referrals (others whose referredByCode == this.referralCode)
				partners.forEach(p => {
					if (p.referralCode) {
						reverseReferralMap[p.referralCode] = [];
					}
				});
				partners.forEach(p => {
					if (p.referredByCode && reverseReferralMap[p.referredByCode]) {
						reverseReferralMap[p.referredByCode].push(p);
					}
				});

				referralMap = byCode;
			}
		}

		const enriched = partners.map(p => {
			const comp = computedMap[p._id.toString()] || {};
			let referredByDetails = null;
			let referralsArr = undefined;
			if (includeRef === '1') {
				if (p.referredByCode && referralMap[p.referredByCode]) {
					const rb = referralMap[p.referredByCode];
					referredByDetails = {
						_id: rb._id,
						fullName: rb.name,
						email: rb.email,
						mobile: rb.phone,
						referralCode: rb.referralCode,
						isApproved: rb.status === 'approved'
					};
				}
				if (p.referralCode && reverseReferralMap[p.referralCode]) {
					referralsArr = reverseReferralMap[p.referralCode].map(child => ({
						_id: child._id,
						fullName: child.name,
						email: child.email,
						mobile: child.phone,
						referralCode: child.referralCode,
						isApproved: child.status === 'approved',
						status: child.status,
						// Provide a light-weight earnings object consistent with UI expectations
						earnings: { totalEarning: child.totalEarnings || 0 }
					}));
				}
			}
			return {
				...p.toObject(),
				computed: {
					totalEarnings: comp.totalEarnings ?? p.totalEarnings ?? 0,
					totalLeads: comp.totalLeads ?? p.totalLeads ?? 0,
					conversionRate: comp.conversionRate ?? p.conversionRate ?? 0,
					converted: comp.converted ?? 0,
					earningCount: comp.earningCount ?? 0
				},
				...(includeRef === '1' ? { referredByDetails, referrals: referralsArr } : {})
			};
		});

		res.status(200).json({
			success: true,
			data: enriched,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
				hasNextPage: page * limit < total,
				hasPrevPage: page > 1
			}
		});
	} catch (err) {
		console.error('getPartners error:', err);
		res.status(500).json({ success: false, message: 'Error fetching partners' });
	}
};

// GET /api/partners/recalculate
// Recalculate and persist aggregate metrics for partners.
// Optional query params: partnerId (single), status filter.
export const recalcPartnerAggregates = async (req, res) => {
	try {
		const { partnerId, status, includeArrays } = req.query;
		const filter = {};
		if (partnerId) {
			if (!mongoose.Types.ObjectId.isValid(partnerId)) {
				return res.status(400).json({ success: false, message: 'Invalid partnerId' });
			}
			filter._id = new mongoose.Types.ObjectId(partnerId);
		}
		if (status) filter.status = status;

		const partners = await Partner.find(filter).select('_id');
		if (!partners.length) {
			return res.status(200).json({ success: true, message: 'No partners found for criteria', updated: 0 });
		}
		const partnerIds = partners.map(p => p._id);

		// Earnings aggregation (approved + paid)
		const earnings = await Earning.aggregate([
			{ $match: { partnerId: { $in: partnerIds }, status: { $in: ['approved', 'paid'] } } },
			{ $group: { _id: '$partnerId', totalEarnings: { $sum: '$commissionEarned' }, earningIds: { $push: '$_id' } } }
		]);
		const earningsMap = earnings.reduce((acc, e) => { acc[e._id.toString()] = { totalEarnings: e.totalEarnings, earningIds: e.earningIds }; return acc; }, {});

		// Leads aggregation (also capture IDs if includeArrays requested)
		const leadPipeline = [
			{ $match: { assignedPartner: { $in: partnerIds } } },
			{ $group: { _id: '$assignedPartner', totalLeads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } }, leadIds: { $push: '$_id' } } }
		];
		const leads = await Lead.aggregate(leadPipeline);
		const leadMap = leads.reduce((acc, l) => { acc[l._id.toString()] = l; return acc; }, {});

		const includeArraysBool = includeArrays === '1' || includeArrays === 'true';
		const MAX_IDS = 100; // cap to avoid unbounded growth

		const bulk = partnerIds.map(id => {
			const key = id.toString();
			const eInfo = earningsMap[key] || { totalEarnings: 0, earningIds: [] };
			const lInfo = leadMap[key] || { totalLeads: 0, converted: 0, leadIds: [] };
			const conversionRate = lInfo.totalLeads > 0 ? Number(((lInfo.converted / lInfo.totalLeads) * 100).toFixed(2)) : 0;
			const update = {
				$set: {
					totalEarnings: eInfo.totalEarnings,
					totalLeads: lInfo.totalLeads,
					conversionRate
				}
			};
			if (includeArraysBool) {
				update.$set.leads = lInfo.leadIds.slice(-MAX_IDS); // store recent IDs
				update.$set.transactions = eInfo.earningIds.slice(-MAX_IDS); // treat earnings as transactions reference
			}
			return { updateOne: { filter: { _id: id }, update } };
		});

		if (bulk.length) await Partner.bulkWrite(bulk);

		res.status(200).json({ success: true, message: 'Aggregates recalculated', updated: bulk.length, includeArrays: includeArraysBool });
	} catch (err) {
		console.error('recalcPartnerAggregates error:', err);
		res.status(500).json({ success: false, message: 'Error recalculating aggregates' });
	}
};

// PATCH /api/partners/:partnerId/approve
// Admin: approve partner account
export const approvePartner = async (req, res) => {
	try {
		const { partnerId } = req.params;
		if (!mongoose.Types.ObjectId.isValid(partnerId)) {
			return res.status(400).json({ success: false, message: 'Invalid partner ID' });
		}

		const partner = await Partner.findById(partnerId).select('-password');
		if (!partner) {
			return res.status(404).json({ success: false, message: 'Partner not found' });
		}

		if (partner.status === 'approved') {
			return res.status(200).json({ success: true, message: 'Already approved', data: partner });
		}

		partner.status = 'approved';
		partner.approvedAt = new Date();
		partner.approvedBy = req.user?._id || partner.approvedBy;
		await partner.save();

		res.status(200).json({ success: true, message: 'Partner approved', data: partner });
	} catch (err) {
		console.error('approvePartner error:', err);
		res.status(500).json({ success: false, message: 'Error approving partner' });
	}
};

	// PATCH /api/partners/:partnerId/status
	// Admin: update partner status (pending | approved | rejected | suspended)
	export const updatePartnerStatus = async (req, res) => {
		try {
			const { partnerId } = req.params;
			const { status } = req.body || {};

			if (!mongoose.Types.ObjectId.isValid(partnerId)) {
				return res.status(400).json({ success: false, message: 'Invalid partner ID' });
			}

			const allowed = ['pending', 'approved', 'rejected', 'suspended'];
			if (!status || !allowed.includes(status)) {
				return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });
			}

			const partner = await Partner.findById(partnerId).select('-password');
			if (!partner) {
				return res.status(404).json({ success: false, message: 'Partner not found' });
			}

			// Update status and related fields
			partner.status = status;
			if (status === 'approved') {
				partner.approvedAt = partner.approvedAt || new Date();
				partner.approvedBy = req.user?._id || partner.approvedBy;
			} else {
				// Clear approval metadata for non-approved states (optional choice)
				partner.approvedAt = partner.approvedAt || null;
				partner.approvedBy = partner.approvedBy || null;
			}

			await partner.save();

			res.status(200).json({ success: true, message: 'Status updated', data: partner });
		} catch (err) {
			console.error('updatePartnerStatus error:', err);
			res.status(500).json({ success: false, message: 'Error updating partner status' });
		}
	};

// DELETE /api/partners/:partnerId
// Admin: delete a partner account
export const deletePartner = async (req, res) => {
	try {
		const { partnerId } = req.params;
		if (!mongoose.Types.ObjectId.isValid(partnerId)) {
			return res.status(400).json({ success: false, message: 'Invalid partner ID' });
		}

		const partner = await Partner.findById(partnerId).select('-password');
		if (!partner) {
			return res.status(404).json({ success: false, message: 'Partner not found' });
		}

		await partner.deleteOne();
		return res.status(200).json({ success: true, message: 'Partner deleted successfully' });
	} catch (err) {
		console.error('deletePartner error:', err);
		res.status(500).json({ success: false, message: 'Error deleting partner' });
	}
};

