import fs from 'fs';
import path from 'path';

const cacheDir = './.wwebjs_cache';
const srcFile = './wwebjs_version.html';
const destFile = path.join(cacheDir, '2.3000.1044830814-alpha.html');

console.log('Organizing local wwebjs cache...');

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

if (fs.existsSync(srcFile)) {
  fs.copyFileSync(srcFile, destFile);
  console.log(`Copied ${srcFile} to ${destFile}`);
  console.log('Size of target file:', fs.statSync(destFile).size, 'bytes');
  process.exit(0);
} else {
  console.error('Source file not found:', srcFile);
  process.exit(1);
}
