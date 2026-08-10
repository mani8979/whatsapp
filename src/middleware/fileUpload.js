import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = 'uploads';

// Ensure uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// Create multer upload instance
export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // Limit to 50MB
  },
});

export default upload;
