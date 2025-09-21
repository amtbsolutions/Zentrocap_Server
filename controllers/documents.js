import { Readable } from 'stream';
import mongoose from 'mongoose';
import { getGridFSBucket } from '../config/gridfs.js';
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';
import CompressionService from '../services/compressionService.js';
import NotificationService from '../services/NotificationService.js';

// Upload document
export const uploadDocument = async (req, res) => {
  try {
    const { documentType, userId, title, description } = req.body;
    
    // Debug logging
    console.log('Upload request body:', { documentType, userId, title, description });
    
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
    const filename = `${Date.now()}_${originalname}`;
    
    // Upload to GridFS
    const uploadStream = gridfsBucket.openUploadStream(filename, {
      metadata: {
        originalName: originalname,
        documentType: documentType,
        userId: req.user._id, // Use authenticated partner's ID
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
        // Generate URL
        const documentUrl = `${req.protocol}://${req.get('host')}/api/documents/preview/${uploadStream.id}`;
        
        // Save document info to database
        const document = new Document({
          filename: filename,
          originalName: title || originalname, // Use title if provided, otherwise use original filename
          documentType: documentType,
          mimetype: mimetype,
          originalSize: buffer.length,
          compressedSize: compressedBuffer.length,
          gridfsId: uploadStream.id,
          fileUrl: documentUrl,
          downloadUrl: `${req.protocol}://${req.get('host')}/api/documents/download/${uploadStream.id}`,
          previewUrl: documentUrl,
          uploadedBy: req.user._id, // Use authenticated partner's ID
          status: 'approved',
          notes: description || '', // Use description if provided
          tags: []
        });

        // Debug logging
        console.log('Creating document with:', {
          originalName: title || originalname,
          notes: description || '',
          filename: filename
        });

        await document.save();
        console.log('Document saved successfully');

        // Create notification for document upload
        try {
          // Check if a recent notification exists for this document to prevent duplicates
          const recentNotification = await Notification.findOne({
            partnerId: req.user._id,
            category: 'documents',
            relatedId: document._id,
            createdAt: { $gte: new Date(Date.now() - 60000) } // Within last minute
          });

          if (!recentNotification) {
            await NotificationService.createDocumentNotification(
              req.user._id, 
              document, 
              'uploaded'
            );
            console.log('Document upload notification created');
          } else {
            console.log('Skipped duplicate document notification');
          }
        } catch (notificationError) {
          console.error('Failed to create document notification:', notificationError);
          // Don't fail the upload if notification fails
        }

        res.status(201).json({
          message: 'Document uploaded successfully',
          document: {
            id: document._id,
            filename: filename,
            originalName: originalname,
            documentType: documentType,
            url: documentUrl,
            size: compressedBuffer.length,
            uploadDate: document.uploadDate
          }
        });
      } catch (error) {
        console.error('Error saving document info:', error);
        res.status(500).json({ message: 'Error saving document information' });
      }
    });

    uploadStream.on('error', (error) => {
      console.error('GridFS upload error:', error);
      res.status(500).json({ message: 'Error uploading file to GridFS' });
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Error processing upload' });
  }
};

// Download document
export const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');
    const gridfsBucket = getGridFSBucket();

    // Find document in database and verify ownership
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if the document belongs to the authenticated partner
    if (!isAdmin && document.uploadedBy.toString() !== partnerId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only access your own documents.' });
    }

    // Create download stream from GridFS
    const downloadStream = gridfsBucket.openDownloadStream(document.gridfsId);

    // Set headers for download
    res.set({
      'Content-Type': document.mimetype,
      'Content-Disposition': `attachment; filename="${document.originalName}"`
    });

    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('Download error:', error);
      res.status(404).json({ message: 'File not found in GridFS' });
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Error downloading file' });
  }
};

// Preview document
export const previewDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');
    const gridfsBucket = getGridFSBucket();

    // Find document in database and verify ownership
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if the document belongs to the authenticated partner
    if (!isAdmin && document.uploadedBy.toString() !== partnerId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only access your own documents.' });
    }

    // Create download stream from GridFS
    const downloadStream = gridfsBucket.openDownloadStream(document.gridfsId);

    // Set headers for inline viewing
    res.set({
      'Content-Type': document.mimetype,
      'Content-Disposition': 'inline'
    });

    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('Preview error:', error);
      res.status(404).json({ message: 'File not found in GridFS' });
    });

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ message: 'Error previewing file' });
  }
};

// Preview document by GridFS ID (for partner documents uploaded during signup)
export const previewByGridFSId = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');
    const gridfsBucket = getGridFSBucket();

    console.log('Previewing GridFS file with ID:', id);

    // Convert string to ObjectId
    let gridfsId;
    try {
      gridfsId = new mongoose.Types.ObjectId(String(id));
    } catch (error) {
      console.error('Invalid ObjectId format:', id);
      return res.status(400).json({ message: 'Invalid file ID format' });
    }

    // Ownership checks (skip for admins)
    if (!isAdmin) {
      let ownsFile = false;
      const document = await Document.findOne({ gridfsId: gridfsId });
      if (document) {
        if (document.uploadedBy.toString() !== partnerId.toString()) {
          return res.status(403).json({ message: 'Access denied. You can only access your own documents.' });
        }
        ownsFile = true;
      } else {
        try {
          const PartnerModel = (await import('../models/Partner.js')).default;
          const partner = await PartnerModel.findById(partnerId).select('otherDocuments aadhaarFile panFile');
          // Check otherDocuments
          const ownsViaOtherDocs = !!partner && Array.isArray(partner.otherDocuments) && partner.otherDocuments.some(d => {
            try { return (d.gridfsId?.toString?.() || '') === gridfsId.toString(); } catch { return false; }
          });
          // Check Aadhaar/PAN file URL contains this id
          const idStr = gridfsId.toString();
          const ownsViaKyc = !!partner && ((typeof partner.aadhaarFile === 'string' && partner.aadhaarFile.includes(idStr)) || (typeof partner.panFile === 'string' && partner.panFile.includes(idStr)));
          ownsFile = ownsViaOtherDocs || ownsViaKyc;
          if (!ownsFile) {
            console.warn('Access denied: GridFS file not associated with partner otherDocuments or KYC fields');
            return res.status(403).json({ message: 'Access denied. You can only access your own documents.' });
          }
        } catch (e) {
          console.error('Error verifying ownership via Partner model:', e);
          return res.status(500).json({ message: 'Error verifying document ownership' });
        }
      }
    }

    // Get file info first to check if it exists and get metadata
    const files = await gridfsBucket.find({ _id: gridfsId }).toArray();
    if (files.length === 0) {
      console.error('File not found in GridFS:', id);
      return res.status(404).json({ message: 'File not found' });
    }

    const file = files[0];
    console.log('File found:', { 
      filename: file.filename, 
      contentType: file.metadata?.mimetype,
      size: file.length 
    });

  // Create download stream from GridFS using the ID directly
    const downloadStream = gridfsBucket.openDownloadStream(gridfsId);

    // Set headers for inline viewing with proper content type
    const contentType = file.metadata?.mimetype || 'application/octet-stream';
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Content-Length': file.length
    });

    console.log('Streaming file with content type:', contentType);

    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('Preview error for GridFS ID:', id, error);
      if (!res.headersSent) {
        res.status(404).json({ message: 'Error streaming file from GridFS' });
      }
    });

    downloadStream.on('end', () => {
      console.log('File streaming completed for ID:', id);
    });

  } catch (error) {
    console.error('Preview by GridFS ID error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error previewing file' });
    }
  }
};

// Delete document
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;
    const gridfsBucket = getGridFSBucket();

    // Find document in database and verify ownership
    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if the document belongs to the authenticated partner
    if (document.uploadedBy.toString() !== partnerId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own documents.' });
    }

    // Delete from GridFS
    try {
      await gridfsBucket.delete(document.gridfsId);
    } catch (gridfsError) {
      console.error('GridFS delete error:', gridfsError);
      // Continue with database deletion even if GridFS fails
    }

    // Delete from database
    await Document.findByIdAndDelete(id);

    res.status(200).json({ message: 'Document deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Error deleting document' });
  }
};

// Update document metadata (title, description, category, status)
export const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user._id;
  const { title, description, category, status, uploadDate } = req.body || {};

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    if (document.uploadedBy.toString() !== partnerId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only update your own documents.' });
    }

    // Apply updates if provided
    if (typeof title === 'string' && title.trim() !== '') {
      document.originalName = title.trim();
    }
    if (typeof description === 'string') {
      document.notes = description;
    }
    if (typeof category === 'string' && category.trim() !== '') {
      // Map UI category (e.g., 'General') to lowercase enum value
      document.documentType = category.trim().toLowerCase();
    }
    if (typeof status === 'string' && status.trim() !== '') {
      // UI has only two states: Active / Inactive -> map to backend
      const s = status.trim().toLowerCase();
      document.status = s === 'active' ? 'approved' : 'rejected';
    }

    // Optional upload date update
    if (uploadDate) {
      const d = new Date(uploadDate);
      if (!isNaN(d.getTime())) {
        document.uploadedAt = d;
      }
    }

    await document.save();

    return res.json({
      message: 'Document updated successfully',
      document,
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Error updating document' });
  }
};
