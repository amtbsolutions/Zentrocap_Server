import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
  // Quiet by default
    
    if (!process.env.MONGODB_URI) {
  // Quiet by default
      return;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI);
  // Print only the DB connect banner
  console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
  // Quiet by default
    // Don't exit - continue without DB for development
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {});

mongoose.connection.on('reconnected', () => {});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  // Quiet by default
  process.exit(0);
});
