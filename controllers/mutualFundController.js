import MutualFund from '../models/MutualFund.js';
import path from 'path';
import fs from 'fs';

export const addMutualFund = async (req, res) => {
  try {
    let { name, company, type, expectedReturn, previousReturns, riskLevel, minInvestment, lockInPeriod, symbol } = req.body;
    if (previousReturns && typeof previousReturns === 'string') {
      previousReturns = JSON.parse(previousReturns);
    }
    const existing = await MutualFund.findOne({ name, company, type });
    if (existing) return res.status(400).json({ message: 'Mutual Fund already exists.' });
    const logo = req.file ? req.file.filename : null;
    const fund = await MutualFund.create({ name, company, type, expectedReturn, previousReturns: previousReturns || [], riskLevel, minInvestment, lockInPeriod, logo, symbol });
    res.status(201).json({ message: 'Mutual Fund added successfully', fund });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add mutual fund', error: err.message });
  }
};

export const updateMutualFund = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.previousReturns && typeof updates.previousReturns === 'string') {
      updates.previousReturns = JSON.parse(updates.previousReturns);
    }
    if (req.file) {
      updates.logo = req.file.filename;
      const old = await MutualFund.findById(id);
      if (old?.logo) {
        const oldPath = path.join(process.cwd(), 'uploads', old.logo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }
    const updated = await MutualFund.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Mutual Fund not found.' });
    res.status(200).json({ message: 'Mutual Fund updated successfully', fund: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update mutual fund', error: err.message });
  }
};

export const deleteMutualFund = async (req, res) => {
  try {
    const { id } = req.params;
    const fund = await MutualFund.findByIdAndDelete(id);
    if (!fund) return res.status(404).json({ message: 'Mutual Fund not found.' });
    if (fund.logo) {
      const logoPath = path.join(process.cwd(), 'uploads', fund.logo);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }
    res.status(200).json({ message: 'Mutual Fund deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete mutual fund', error: err.message });
  }
};

export const getMutualFunds = async (_req, res) => {
  try {
    const funds = await MutualFund.find();
    res.status(200).json({ funds });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch mutual funds', error: err.message });
  }
};

export const getMutualFundById = async (req, res) => {
  try {
    const { id } = req.params;
    const fund = await MutualFund.findById(id);
    if (!fund) return res.status(404).json({ message: 'Mutual Fund not found' });
    res.status(200).json({ fund });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch mutual fund', error: err.message });
  }
};
