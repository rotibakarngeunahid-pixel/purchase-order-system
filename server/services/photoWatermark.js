// ============================================================
// Photo Watermark — resize + watermark + encode WebP
//
// PENTING: teks watermark dirender sebagai PATH VEKTOR (opentype.js
// + font DejaVu Sans Bold yang dibundel di server/assets), BUKAN
// elemen <text> SVG. Serverless Vercel tidak punya font sistem,
// sehingga <text> dirender librsvg sebagai kotak-kotak (tofu).
// Path vektor tidak bergantung font sistem — hasil identik di
// lokal maupun produksi.
// ============================================================

const path = require('path');

let sharpLib;
try { sharpLib = require('sharp'); } catch { sharpLib = null; }

let watermarkFont = null;
try {
  const opentype = require('opentype.js');
  watermarkFont = opentype.loadSync(
    path.join(__dirname, '..', 'assets', 'DejaVuSans-Bold.ttf')
  );
} catch (err) {
  console.error('[Watermark] Gagal memuat font, fallback ke <text>:', err.message);
}

// WITA = UTC+8
function getWITATime() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

function formatWITA(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Bangun overlay SVG watermark: bar gelap + teks di pojok kanan bawah
function buildWatermarkSvg(w, h, text) {
  const fontSize = Math.max(14, Math.round(w * 0.018));
  const padH = 12;
  const padV = 7;
  const barH = fontSize + padV * 2;
  const barY = h - barH - 10;
  const baseline = barY + padV + fontSize - 2;

  let textW;
  let textElement;
  if (watermarkFont) {
    textW = Math.ceil(watermarkFont.getAdvanceWidth(text, fontSize));
    const textX = w - padH - textW;
    const pathData = watermarkFont.getPath(text, textX, baseline, fontSize).toPathData(2);
    textElement = `<path d="${pathData}" fill="#ffffff"/>`;
  } else {
    // Fallback <text>: hanya tampil benar jika server punya font sistem
    textW = Math.round(text.length * fontSize * 0.58);
    textElement =
      `<text x="${w - padH}" y="${baseline}" font-family="Arial,Helvetica,sans-serif" ` +
      `font-size="${fontSize}" fill="white" text-anchor="end">${escapeXml(text)}</text>`;
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect x="${w - textW - padH * 2}" y="${barY}" width="${textW + padH * 2}" height="${barH}" rx="4" fill="rgba(0,0,0,0.60)"/>` +
    textElement +
    `</svg>`
  );
}

// Resize ke maks 1920px, watermark "RBN • cabang • waktu WITA", WebP q75
async function processAndWatermark(buffer, branchName, witaTime) {
  if (!sharpLib) return buffer;

  const MAX_DIM = 1920;

  // Pass 1: auto-rotate + resize → dapatkan dimensi final
  const { data: resizedBuf, info } = await sharpLib(buffer)
    .rotate()
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const text = `RBN • ${branchName} • ${formatWITA(witaTime)} WITA`;
  const svgBuf = buildWatermarkSvg(info.width, info.height, text);

  // Pass 2: composite watermark + encode WebP (quality 75, effort 6)
  return sharpLib(resizedBuf)
    .composite([{ input: svgBuf, blend: 'over' }])
    .webp({ quality: 75, effort: 6, smartSubsample: true })
    .toBuffer();
}

module.exports = {
  processAndWatermark,
  getWITATime,
  formatWITA,
  isSharpAvailable: () => !!sharpLib,
  hasVectorFont: () => !!watermarkFont,
};
