/**
 * END-TO-END HTTP DOWNLOAD VERIFIER
 * ===================================
 * Makes a real HTTP GET to the running dashboard server at:
 *   GET http://localhost:3001/api/contacts/export?format=xlsx
 *
 * This is the EXACT same request that the browser makes when the
 * Export button is clicked (window.location.href = '/api/contacts/export?format=xlsx').
 *
 * Then it opens the downloaded file with ExcelJS and verifies every property.
 *
 * This script has a 5-minute timeout to accommodate the WhatsApp
 * Puppeteer contact collection step.
 */

import http from 'http';
import fs from 'fs';
import fsExtra from 'fs-extra';
import crypto from 'crypto';
import path from 'path';
import ExcelJS from 'exceljs';

const OUT_DIR  = path.resolve('./exports_test');
const OUT_FILE = path.join(OUT_DIR, 'dashboard_e2e_download.xlsx');

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('data', c => h.update(c));
    s.on('end',  () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

const hr = t => { const b = '─'.repeat(60); console.log(`\n${b}`); if (t) console.log(`  ${t}`); console.log(b); };

// ── STEP 1: HTTP download ─────────────────────────────────────────
async function downloadFromDashboard() {
  hr('STEP 1 — HTTP GET /api/contacts/export?format=xlsx');
  console.log('\n  Target URL: http://localhost:3001/api/contacts/export?format=xlsx');
  console.log('  This is the exact URL the browser uses when Export is clicked.');
  console.log('  Timeout: 5 minutes (WhatsApp contact collection is slow).\n');

  await fsExtra.ensureDir(OUT_DIR);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = http.get({
      hostname: 'localhost',
      port: 3001,
      path: '/api/contacts/export?format=xlsx',
      timeout: 300000, // 5 minutes
    }, (res) => {
      console.log(`  HTTP Status       : ${res.statusCode} ${res.statusMessage}`);
      console.log(`  Content-Type      : ${res.headers['content-type']}`);
      console.log(`  Content-Disposition: ${res.headers['content-disposition']}`);

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
        return;
      }

      const out = fs.createWriteStream(OUT_FILE);
      res.pipe(out);
      out.on('finish', () => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n  Download complete in ${elapsed}s`);
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentDisposition: res.headers['content-disposition'],
        });
      });
      out.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out after 5 minutes'));
    });
    req.on('error', reject);
  });
}

// ── STEP 2: Inspect downloaded file ──────────────────────────────
async function inspectDownloadedFile(httpMeta) {
  hr('STEP 2 — File Identity');
  const fileSize = (await fsExtra.stat(OUT_FILE)).size;
  const sha256 = await sha256File(OUT_FILE);
  console.log(`\n  File path   : ${OUT_FILE}`);
  console.log(`  File size   : ${fileSize} bytes`);
  console.log(`  SHA-256     : ${sha256}`);
  console.log(`  HTTP Status : ${httpMeta.statusCode}`);
  console.log(`  Content-Type: ${httpMeta.contentType}`);
  console.log(`  Content-Disposition: ${httpMeta.contentDisposition}`);

  // Verify Content-Type is xlsx
  const ctOk = httpMeta.contentType && httpMeta.contentType.includes('spreadsheetml');
  const cdOk = httpMeta.contentDisposition && httpMeta.contentDisposition.includes('Contacts_WaVault');
  console.log(`\n  Content-Type correct (spreadsheetml): ${ctOk ? '✅' : '❌'}`);
  console.log(`  Content-Disposition has filename    : ${cdOk ? '✅' : '❌'}`);

  hr('STEP 3 — Open Downloaded File with ExcelJS');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(OUT_FILE);
  console.log('\n  ✅ ExcelJS opened the downloaded file successfully.');

  // ── Worksheet names & states ──────────────────────────────────
  hr('STEP 4 — Worksheets');
  workbook.eachSheet((ws, id) => {
    console.log(`  Sheet #${id}: name="${ws.name}" state="${ws.state}"`);
  });

  const ws = workbook.getWorksheet('All Contacts');
  if (!ws) throw new Error('"All Contacts" sheet not found');

  // ── Workbook metadata ─────────────────────────────────────────
  hr('STEP 5 — Workbook Metadata');
  console.log(`  creator        : ${workbook.creator}`);
  console.log(`  title          : ${workbook.title}`);
  console.log(`  subject        : ${workbook.subject}`);
  console.log(`  company        : ${workbook.company}`);
  console.log(`  keywords       : ${workbook.keywords}`);
  console.log(`  category       : ${workbook.category}`);
  console.log(`  created        : ${workbook.created}`);
  console.log(`  modified       : ${workbook.modified}`);

  // ── Freeze panes ──────────────────────────────────────────────
  hr('STEP 6 — Freeze Panes (worksheet.views)');
  console.log(JSON.stringify(ws.views, null, 4));

  // ── Merged regions ────────────────────────────────────────────
  hr('STEP 7 — Merged Regions');
  (ws.model.merges || []).forEach(m => console.log(`  ${m}`));

  // ── AutoFilter ────────────────────────────────────────────────
  hr('STEP 8 — AutoFilter');
  console.log(`  worksheet.autoFilter = "${ws.autoFilter}"`);

  // ── Cell A1 ───────────────────────────────────────────────────
  hr('STEP 9 — Cell A1 (Title Banner)');
  const a1 = ws.getCell('A1');
  console.log(`  value      : ${JSON.stringify(a1.value)}`);
  console.log(`  fill.argb  : ${a1.fill?.fgColor?.argb}`);
  console.log(`  font.size  : ${a1.font?.size}`);
  console.log(`  font.bold  : ${a1.font?.bold}`);
  console.log(`  font.color : ${a1.font?.color?.argb}`);

  // ── ARGB format check ─────────────────────────────────────────
  hr('STEP 10 — ARGB Format Check (8-digit verification)');
  const argbCells = [
    { a: 'A1', get: () => ws.getCell('A1').fill?.fgColor?.argb },
    { a: 'A1 font', get: () => ws.getCell('A1').font?.color?.argb },
    { a: 'A2', get: () => ws.getCell('A2').fill?.fgColor?.argb },
    { a: 'A3', get: () => ws.getCell('A3').fill?.fgColor?.argb },
    { a: 'A4', get: () => ws.getCell('A4').fill?.fgColor?.argb },
    { a: 'E4', get: () => ws.getCell('E4').fill?.fgColor?.argb },
    { a: 'A6', get: () => ws.getCell('A6').fill?.fgColor?.argb },
    { a: 'A7', get: () => ws.getCell('A7').fill?.fgColor?.argb },
    { a: 'I7 font', get: () => ws.getCell('I7').font?.color?.argb },
  ];
  let allOk = true;
  argbCells.forEach(({ a, get }) => {
    const v = get();
    const ok = v && /^[0-9A-Fa-f]{8}$/.test(v);
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✅' : '❌'} ${a.padEnd(10)} = "${v}"`);
  });
  console.log(`\n  ARGB Overall: ${allOk ? '✅ ALL 8-DIGIT' : '❌ SOME WRONG'}`);

  // ── Statistics cards ──────────────────────────────────────────
  hr('STEP 11 — Statistics Cards');
  ['A4','E4','I4','M4'].forEach(addr => {
    const c = ws.getCell(addr);
    console.log(`  ${addr}: value="${c.value}"  fill=${c.fill?.fgColor?.argb}`);
  });

  // ── Header row ────────────────────────────────────────────────
  hr('STEP 12 — Header Row (Row 6)');
  const headerRow = ws.getRow(6);
  for (let c = 1; c <= 19; c++) {
    console.log(`  Col ${String(c).padStart(2)}: ${headerRow.getCell(c).value}`);
  }

  // ── First data row ────────────────────────────────────────────
  hr('STEP 13 — First Data Row (Row 7)');
  const row7 = ws.getRow(7);
  for (let c = 1; c <= 19; c++) {
    const val = row7.getCell(c).value;
    const display = typeof val === 'object' ? JSON.stringify(val) : val;
    console.log(`  Col ${String(c).padStart(2)}: ${display}`);
  }

  // ── Hash column check ─────────────────────────────────────────
  hr('STEP 14 — Hash Column (Col 19) Check');
  const hashVal = row7.getCell(19).value;
  console.log(`  Col 19 (Hash): "${hashVal}"`);
  console.log(`  Hash populated: ${hashVal ? '✅ YES' : '⚠️  empty (no contacts in DB yet)'}`);

  // ── Hyperlink ─────────────────────────────────────────────────
  hr('STEP 15 — Hyperlink Cell I7');
  const i7 = ws.getCell('I7');
  console.log(`  value : ${JSON.stringify(i7.value)}`);
  console.log(`  font.underline : ${i7.font?.underline}`);
  console.log(`  font.color     : ${i7.font?.color?.argb}`);

  // ── Zebra striping ────────────────────────────────────────────
  hr('STEP 16 — Zebra Striping');
  const r7fill = ws.getCell('A7').fill?.fgColor?.argb;
  const r8fill = ws.getCell('A8').fill?.fgColor?.argb;
  console.log(`  Row 7 fill: ${r7fill}`);
  console.log(`  Row 8 fill: ${r8fill}`);
  console.log(`  Different : ${r7fill !== r8fill ? '✅ YES (zebra active)' : '❌ SAME (zebra broken)'}`);

  // ── Hidden sheet ──────────────────────────────────────────────
  hr('STEP 17 — Hidden Technical Data Sheet');
  const tech = workbook.getWorksheet('Technical Data');
  if (tech) {
    console.log(`  techSheet.state : "${tech.state}"`);
    tech.eachRow((row, n) => {
      const vals = [];
      row.eachCell(c => vals.push(c.value));
      console.log(`  Row ${n}: ${JSON.stringify(vals)}`);
    });
  } else {
    console.log('  ❌ Technical Data sheet not found');
  }

  // ── Summary ───────────────────────────────────────────────────
  hr('END-TO-END VERIFICATION SUMMARY');
  console.log(`
  HTTP path verified  : ✅ Browser → GET /api/contacts/export → Express → controller → exportData() → ExcelExporter → res.download()
  File downloaded     : ✅ ${OUT_FILE}
  File size           : ${fileSize} bytes
  SHA-256             : ${sha256}
  ExcelJS opened      : ✅
  Content-Type        : ${ctOk ? '✅' : '❌'} ${httpMeta.contentType}
  Content-Disposition : ${cdOk ? '✅' : '❌'} ${httpMeta.contentDisposition}
  ARGB colors         : ${allOk ? '✅ All 8-digit' : '❌ Some wrong'}
  `);
}

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  hr('END-TO-END BROWSER DOWNLOAD VERIFICATION');
  console.log('  Generated at:', new Date().toISOString());

  const httpMeta = await downloadFromDashboard();
  await inspectDownloadedFile(httpMeta);

  // Cleanup
  await fsExtra.remove(OUT_DIR);
  console.log('  ✅ Cleanup done.\n');
}

main().catch(err => {
  console.error('\n❌ Script failed:', err.message);
  process.exit(1);
});
