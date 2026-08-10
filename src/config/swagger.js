import swaggerJsdoc from 'swagger-jsdoc';
import env from './env.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Automation REST API',
      version: '1.0.0',
      description: 'Production-ready REST API for WhatsApp Automation, including messaging, media management, contacts, groups, and AI-powered auto-replies.',
      contact: {
        name: 'Antigravity Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Access token for securing API endpoints (optional/configurable)',
        },
      },
    },
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'], // Scan routes and controllers for swagger annotations
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
