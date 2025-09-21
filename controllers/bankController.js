import Bank from '../models/Bank.js';
import path from 'path';
import fs from 'fs';

export const addBank = async (req, res) => {
  try {
    const { name, type, establishedYear, branches, country } = req.body;
    let contact = {};
    if (req.body.contact) {
      contact = typeof req.body.contact === 'string' ? JSON.parse(req.body.contact) : req.body.contact;
    } else {
      contact = { email: req.body.email || '', phone: req.body.phone || '', website: req.body.website || '' };
    }
    const existing = await Bank.findOne({ name });
    if (existing) return res.status(400).json({ message: 'Bank already exists.' });
    const logo = req.file ? req.file.filename : null;
    const bank = await Bank.create({ name, type, establishedYear, branches, country, contact, logo });
    res.status(201).json({ message: 'Bank added successfully', bank });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add bank', error: err.message });
  }
};

export const updateBank = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.contact) {
      updates.contact = typeof updates.contact === 'string' ? JSON.parse(updates.contact) : updates.contact;
    } else {
      updates.contact = { email: updates.email || undefined, phone: updates.phone || undefined, website: updates.website || undefined };
    }
    if (req.file) {
      updates.logo = req.file.filename;
      const old = await Bank.findById(id);
      if (old?.logo) {
        const oldPath = path.join(process.cwd(), 'uploads', old.logo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }
    const updated = await Bank.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Bank not found.' });
    res.status(200).json({ message: 'Bank updated successfully', bank: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update bank', error: err.message });
  }
};

export const deleteBank = async (req, res) => {
  try {
    const { id } = req.params;
    const bank = await Bank.findByIdAndDelete(id);
    if (!bank) return res.status(404).json({ message: 'Bank not found.' });
    if (bank.logo) {
      const logoPath = path.join(process.cwd(), 'uploads', bank.logo);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }
    res.status(200).json({ message: 'Bank deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete bank', error: err.message });
  }
};

export const getBanks = async (_req, res) => {
  try {
    const banks = await Bank.find();
    res.status(200).json({ banks });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch banks', error: err.message });
  }
};
