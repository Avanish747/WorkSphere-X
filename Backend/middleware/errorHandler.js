function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) console.error(error.stack || error);

  let status = error.statusCode || 500;
  let message = error.message || 'Internal server error.';

  if (error.code === 'LIMIT_FILE_SIZE' || error.name === 'MulterError') {
    status = 400;
    message = error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file exceeds the 10 MB limit.' : error.message;
  } else if (error.message === 'Origin is not allowed by CORS.') {
    status = 403;
    message = 'Origin is not allowed by CORS.';
  } else if (error.code === 11000) {
    status = 409;
    message = 'A record with the same unique value already exists.';
  } else if (error.name === 'ValidationError' || error.name === 'ZodError') {
    status = 400;
    message = error.message;
  } else if (error.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier or value.';
  } else if (['MongoServerSelectionError', 'MongoNetworkError'].includes(error.name)) {
    status = 503;
    message = 'Database is currently unavailable.';
  }

  return res.status(status).json({
    message: isProduction && status >= 500 ? 'Internal server error.' : message,
    ...(error.details && { details: error.details }),
  });
}

module.exports = { errorHandler };
