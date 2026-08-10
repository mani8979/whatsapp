import http from 'http';
import fs from 'fs';
import path from 'path';

const url = 'http://localhost:3001/api/screenshot';
const outputPath = 'C:\\Users\\Manibabu\\.gemini\\antigravity-ide\\brain\\98ac17dd-1706-4d91-a168-be51643482c0\\current_whatsapp_state.png';

http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      if (res.statusCode !== 200) {
        console.error(`Request failed with status code ${res.statusCode}: ${data}`);
        process.exit(1);
      }
      
      const match = data.match(/src="data:image\/png;base64,([^"]+)"/);
      if (!match) {
        console.error('No base64 image match found in response:', data);
        process.exit(1);
      }

      const base64Data = match[1];
      fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
      console.log(`Successfully saved screenshot to: ${outputPath}`);
      process.exit(0);
    } catch (err) {
      console.error('Error parsing response:', err.message);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});
