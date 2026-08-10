import logger from '../config/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(`API Error: ${err.message}`, { stack: err.stack, path: req.path });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export default errorHandler;
