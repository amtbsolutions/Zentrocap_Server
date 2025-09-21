import express from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { uploadDocument, downloadDocument, previewDocument, previewByGridFSId, deleteDocument, updateDocument } from '../controllers/documents.js';
import Document from '../models/Document.js';
import { protect } from '../middleware/auth.js';
import { getGridFSBucket } from '../config/gridfs.js';
import CompressionService from '../services/compressionService.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed!'), false);
    }
  }
});

// Special route for signup document uploads (no authentication required)
router.post('/upload-signup', upload.single('document'), async (req, res) => {
  try {
    // For signup uploads, we don't have an authenticated user yet
    // We'll store them temporarily and associate with user upon successful signup
    const { documentType } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { originalname, mimetype, buffer } = req.file;
    
    // Compress file
    console.log(`📂 Original file size: ${CompressionService.formatFileSize(buffer.length)}`);
    const compressedBuffer = await CompressionService.compressFile(buffer, mimetype);
    console.log(`🗜️ Compressed file size: ${CompressionService.formatFileSize(compressedBuffer.length)}`);

    const gridfsBucket = getGridFSBucket();
    
    // Create unique filename
    const filename = `signup_${Date.now()}_${originalname}`;
    
    // Upload to GridFS
    const uploadStream = gridfsBucket.openUploadStream(filename, {
      metadata: {
        originalName: originalname,
        documentType: documentType,
        isSignupDocument: true,
        uploadDate: new Date(),
        compressedSize: compressedBuffer.length,
        originalSize: buffer.length,
        mimetype: mimetype
      }
    });

    // Create readable stream from buffer
    const readableStream = new Readable({
      read() {
        this.push(compressedBuffer);
        this.push(null);
      }
    });

    // Pipe to GridFS
    readableStream.pipe(uploadStream);

    uploadStream.on('finish', async () => {
      try {
        // Generate URL for GridFS direct access
        const documentUrl = `${req.protocol}://${req.get('host')}/api/documents/gridfs/${uploadStream.id}`;
        
        res.status(201).json({
          message: 'Signup document uploaded successfully',
          document: {
            id: uploadStream.id,
            gridfsId: uploadStream.id,
            filename: filename,
            originalName: originalname,
            documentType: documentType,
            url: documentUrl,
            size: compressedBuffer.length,
            uploadDate: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error saving signup document info:', error);
        res.status(500).json({ message: 'Error saving document information' });
      }
    });

    uploadStream.on('error', (error) => {
      console.error('GridFS upload error:', error);
      res.status(500).json({ message: 'Error uploading file to GridFS' });
    });

  } catch (error) {
    console.error('Signup upload error:', error);
    res.status(500).json({ message: 'Error processing upload' });
  }
});

// Protect all other routes - require authentication
router.use(protect);

// Routes
router.post('/upload', upload.single('document'), uploadDocument);
router.get('/list', async (req, res) => {
  try {
    // Filter documents by the authenticated partner's ID
    const partnerId = req.user._id;
  // Exclude signup-only documents from the general documents list
  const documents = await Document.find({ uploadedBy: partnerId, isSignupDocument: { $ne: true } }).sort({ uploadedAt: -1 });
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Error fetching documents' });
  }
});
router.get('/download/:id', downloadDocument);
router.get('/preview/:id', previewDocument);
router.get('/gridfs/:id', previewByGridFSId); // New route for GridFS direct access
router.get('/personal', async (req, res) => {
  try {
    // Filter documents by the authenticated partner's ID
    const partnerId = req.user._id;
  const documents = await Document.find({ uploadedBy: partnerId }).sort({ uploadedAt: -1 });
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Error fetching documents' });
  }
});
router.delete('/:id', deleteDocument);
router.put('/:id', updateDocument);

export default router;
