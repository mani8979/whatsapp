import fs from 'fs';
import https from 'https';

const url = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1044830814-alpha.html';
const dest = './wwebjs_version.html';

console.log('Downloading WhatsApp Web version HTML...');
const file = fs.createWriteStream(dest);

https.get(url, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download: Status Code ${response.statusCode}`);
    process.exit(1);
  }
  response.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Download completed successfully. Saved to:', dest);
    process.exit(0);
  });
}).on('error', (err) => {
  fs.unlink(dest, () => {});
  console.error('Download error:', err.message);
  process.exit(1);
});
