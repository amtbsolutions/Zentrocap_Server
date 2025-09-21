import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let gridfsBucket;

const initGridFS = () => {
  const conn = mongoose.connection;
  
  conn.once('open', () => {
    // Initialize GridFS
    gridfsBucket = new GridFSBucket(conn.db, {
      bucketName: 'documents'
    });
  // Quiet by default
  });

  conn.on('error', (error) => {
  // Quiet by default
  });
};

const getGridFSBucket = () => {
  if (!gridfsBucket) {
    throw new Error('GridFS not initialized. Please check database connection.');
  }
  return gridfsBucket;
};

export { initGridFS, getGridFSBucket };
