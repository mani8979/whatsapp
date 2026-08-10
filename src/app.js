import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';
import env from './config/env.js';
import logger from './config/logger.js';
import apiRateLimiter from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import apiRoutes from './routes/api.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP for development dashboard flexibility
}));
app.use(cors());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware (API logs to winston and combined files)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      isApiLog: true,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    });
  });
  next();
});

// Serve media uploads
app.use('/uploads', express.static(path.join(path.resolve(), 'uploads')));

// Serve dashboard static files
app.use(express.static(path.join(__dirname, 'public')));

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Apply Rate Limiting to REST APIs
app.use('/api', apiRateLimiter, apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ success: true, timestamp: new Date() });
});

// Root route - serve frontend dashboard template
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handler
app.use(errorHandler);

export default app;
