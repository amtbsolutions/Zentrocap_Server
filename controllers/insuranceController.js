import Insurance from '../models/Insurance.js';
import path from 'path';
import fs from 'fs';

export const addInsurance = async (req, res) => {
  try {
    const { name, company, type, coverageAmount, premium, expectedReturn, policyTerm, claimRatio } = req.body;
    const existing = await Insurance.findOne({ name, company, coverageAmount, premium });
    if (existing) return res.status(400).json({ message: 'Insurance already exists.' });
    const logo = req.file ? req.file.filename : null;
    const insurance = await Insurance.create({ name, company, type, coverageAmount, premium, expectedReturn, policyTerm, claimRatio, logo });
    res.status(201).json({ message: 'Insurance added successfully', insurance });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add insurance', error: err.message });
  }
};

export const updateInsurance = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (req.file) {
      updates.logo = req.file.filename;
      const old = await Insurance.findById(id);
      if (old?.logo) {
        const oldPath = path.join(process.cwd(), 'uploads', old.logo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }
    const updated = await Insurance.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Insurance not found.' });
    res.status(200).json({ message: 'Insurance updated successfully', insurance: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update insurance', error: err.message });
  }
};

export const deleteInsurance = async (req, res) => {
  try {
    const { id } = req.params;
    const insurance = await Insurance.findByIdAndDelete(id);
    if (!insurance) return res.status(404).json({ message: 'Insurance not found.' });
    if (insurance.logo) {
      const logoPath = path.join(process.cwd(), 'uploads', insurance.logo);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }
    res.status(200).json({ message: 'Insurance deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete insurance', error: err.message });
  }
};

export const getInsurance = async (_req, res) => {
  try {
    const insurances = await Insurance.find();
    res.status(200).json({ insurances });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch insurance', error: err.message });
  }
};
