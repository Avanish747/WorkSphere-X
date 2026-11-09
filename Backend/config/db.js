const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  if (!uri) {
    const error = new Error('MONGO_URI is required. Refusing to start without persistent storage.');
    error.code = 'MONGO_URI_MISSING';
    throw error;
  }

  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    autoIndex: process.env.NODE_ENV !== 'production',
    maxPoolSize: 20,
    minPoolSize: 2,
  });

  await Promise.all(Object.values(require('../models')).map((model) => model.init()));
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
