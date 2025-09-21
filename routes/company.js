import express from 'express';
import { companyUpload } from '../middleware/uploadCompany.js';
import { addBank, updateBank, deleteBank, getBanks } from '../controllers/bankController.js';
import { addMutualFund, updateMutualFund, deleteMutualFund, getMutualFunds, getMutualFundById } from '../controllers/mutualFundController.js';
import { addInsurance, updateInsurance, deleteInsurance, getInsurance } from '../controllers/insuranceController.js';

const router = express.Router();

// BANK
router.post('/bank', companyUpload.single('logo'), addBank);
router.put('/bank/:id', companyUpload.single('logo'), updateBank);
router.delete('/bank/:id', deleteBank);
router.get('/banks', getBanks);

// MUTUAL FUND
router.post('/mutual-fund', companyUpload.single('logo'), addMutualFund);
router.put('/mutual-fund/:id', companyUpload.single('logo'), updateMutualFund);
router.delete('/mutual-fund/:id', deleteMutualFund);
router.get('/mutual-funds', getMutualFunds);
router.get('/mutual-fund/:id', getMutualFundById);

// INSURANCE
router.post('/insurance', companyUpload.single('logo'), addInsurance);
router.put('/insurance/:id', companyUpload.single('logo'), updateInsurance);
router.delete('/insurance/:id', deleteInsurance);
router.get('/insurances', getInsurance);

export default router;
