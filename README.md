# Enterprise WhatsApp Automation System

A production-ready, scalable WhatsApp automation server built using **Node.js (ES Modules)**, **Express.js**, **whatsapp-web.js** with `LocalAuth` session persistence, and **MongoDB**. The server features rich logging, rate limiting, request validation, automated messaging scheduler, and a **Dark Glassmorphic Web Dashboard** with real-time state synchronization via Socket.io.

---

## 🛠️ Architecture & MVC Structure

```
d:\whatsapp/
├── src/
│   ├── config/          # Configurations (db.js, logger.js, swagger.js, env.js)
│   ├── controllers/     # MVC route controllers
│   ├── models/          # Mongoose collections (Message, Contact, Group, ScheduledMessage, Session, Log)
│   ├── middleware/      # Rate limiters, request validation, multer upload, error handler
│   ├── routes/          # Express route definitions
│   ├── services/        # Services (whatsapp.service.js, ai.service.js, scheduler.service.js)
│   ├── events/          # Event bindings (client.events.js handles incoming, edits, and deletes)
│   ├── public/          # Dashboard static assets (style.css, app.js, socket.io client)
│   ├── views/           # Dashboard HTML layouts (index.html)
│   └── app.js           # Express application setup
│
├── sessions/            # Persistent whatsapp-web.js auth session store
├── uploads/             # Received & sent media files (images, audio, PDFs)
├── logs/                # Daily rotate winston log files
├── .env                 # Environment variables
├── package.json         # Dependencies & execution scripts
├── server.js            # Node HTTP server entry point
├── Dockerfile           # Multi-stage production container build
├── docker-compose.yml   # Multi-container local environment
├── ecosystem.config.cjs # PM2 process manager ecosystem file
└── README.md            # Documentation
```

---

## 🚀 Installation & Local Setup

### Prerequisites
- **Node.js** (LTS version >= 18.0.0)
- **MongoDB** running locally (e.g. at `mongodb://127.0.0.1:27017/ailocal`) or MongoDB Atlas.

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory (based on `.env.example`):
```env
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/ailocal
NVIDIA_API_KEY=your_nvidia_api_key_here
AI_MODEL=meta/llama-3.3-70b-instruct
AI_AUTO_REPLY_ENABLED=true
AI_SYSTEM_PROMPT="You are a helpful and polite customer support agent. Keep responses short and suitable for a WhatsApp text message."
```

### 3. Run in Development Mode
Starts the server with `nodemon`, watching for code changes and excluding session/media writes from triggering restarts:
```bash
npm run dev
```

### 4. Run in Production Mode (Standard Node)
```bash
npm start
```

### 5. Run in Production Mode (PM2)
Manage the node process in the background with automatic memory limits, process restarts, and cluster configuration:
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
```

---

## 🐳 Docker Deployment

The project provides custom Docker configurations optimized to install Chromium dependencies needed for Puppeteer.

### 1. Build and Run using Docker Compose
This command compiles the Express application and boots up a local MongoDB container side-by-side:
```bash
docker-compose up --build -d
```

### 2. Check logs
```bash
docker-compose logs -f app
```

---

## 📊 Live Control Panel Dashboard
Open your browser and navigate to:
```
http://localhost:3001
```
- **If Disconnected**: A dynamic QR code is rendered using Socket.io. Scan it once using your phone.
- **If Connected**: The page displays a "System Connected" banner, mounts real-time event logs, and exposes a text console to send test messages directly.

---

## 📖 Swagger API Reference
Access interactive swagger documentation detailing schemas, query params, and sample request payloads at:
```
http://localhost:3001/api-docs
```

---

## ⚡ API Endpoint Cheat-sheet

### 1. Authentication Status
- **URL**: `GET /api/status`
- **Response**:
```json
{
  "success": true,
  "data": {
    "status": "authenticated",
    "qrCode": null,
    "ready": true
  }
}
```

### 2. Send Text Message
- **URL**: `POST /api/send-message`
- **Payload**:
```json
{
  "to": "919876543210",
  "body": "Hello World! 👋"
}
```

### 3. Send Location Card
- **URL**: `POST /api/send-location`
- **Payload**:
```json
{
  "to": "919876543210",
  "latitude": 17.385044,
  "longitude": 78.486671,
  "description": "Charminar, Hyderabad"
}
```

### 4. Schedule a Broadcast
- **URL**: `POST /api/schedule`
- **Payload**:
```json
{
  "to": ["919876543210"],
  "body": "This alert will send in the future!",
  "scheduledTime": "2026-07-12T12:00:00.000Z",
  "type": "text"
}
```
