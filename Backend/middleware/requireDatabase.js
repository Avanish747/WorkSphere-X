const mongoose = require('mongoose');

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database is unavailable. Configure MONGO_URI and ensure MongoDB is running.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  return next();
}

module.exports = { requireDatabase };
