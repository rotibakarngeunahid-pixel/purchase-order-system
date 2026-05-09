const nodemailer = require('nodemailer');
const supabase = require('./supabase');
const { formatDate, formatRupiah } = require('./waLink');

async function getAdminSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['admin_email', 'business_name']);

  if (error) throw new Error('Gagal membaca pengaturan: ' + error.message);

  const settings = {};
  (data || []).forEach((row) => {
    settings[row.key] = row.value;
  });
  return settings;
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Konfigurasi SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) belum diatur di environment variables.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildEmailHTML(pos, orderDate, businessName) {
  const dateStr = formatDate(orderDate);

  const supplierBlocks = pos
    .map((po) => {
      const itemList = po.items
        .map(
          (item) =>
            `<tr>
              <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;">${item.material_name}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.qty_ordered} ${item.purchase_unit}</td>
              <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">Rp ${formatRupiah(item.subtotal_estimated)}</td>
            </tr>`
        )
        .join('');

      return `
        <div style="margin-bottom:24px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
          <div style="background:#D32F2F;color:#fff;padding:12px 16px;">
            <strong style="font-size:16px;">${po.supplier.name}</strong>
          </div>
          <div style="padding:16px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <thead>
                <tr style="background:#f5f5f5;">
                  <th style="padding:6px 8px;text-align:left;">Bahan</th>
                  <th style="padding:6px 8px;text-align:center;">Qty</th>
                  <th style="padding:6px 8px;text-align:right;">Est. Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemList}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding:8px;text-align:right;font-weight:bold;">Total Estimasi:</td>
                  <td style="padding:8px;text-align:right;font-weight:bold;color:#D32F2F;">Rp ${formatRupiah(po.total_estimated)}</td>
                </tr>
              </tfoot>
            </table>
            <div style="margin-top:12px;text-align:center;">
              <a href="${po.wa_link}" style="display:inline-block;background:#FF6F00;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">
                📱 Kirim WA ke ${po.supplier.name}
              </a>
            </div>
          </div>
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#D32F2F,#FF6F00);padding:24px;text-align:center;">
      <img src="https://staff-portal.rotibakarngeunah.my.id/wp-content/uploads/2026/05/cropped-Untitled-2.png" alt="${businessName}" style="height:60px;max-width:200px;object-fit:contain;" onerror="this.style.display='none'">
      <h1 style="color:#fff;margin:8px 0 4px;font-size:20px;">${businessName}</h1>
      <p style="color:#FFE082;margin:0;font-size:14px;">Purchase Order — ${dateStr}</p>
    </div>
    <div style="padding:24px;">
      <p style="color:#555;margin:0 0 20px;">Berikut adalah purchase order untuk hari ini. Klik tombol di bawah untuk membuka WhatsApp dan mengirim pesan ke masing-masing supplier.</p>
      ${supplierBlocks}
      <div style="margin-top:16px;padding:12px;background:#FFF8E1;border-radius:6px;font-size:13px;color:#795548;">
        💡 <strong>Cara penggunaan:</strong> Klik tombol "Kirim WA ke [Supplier]", WhatsApp akan terbuka dengan pesan yang sudah terisi. Cukup tekan tombol kirim.
      </div>
    </div>
    <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#999;">
      Email ini dikirim otomatis oleh sistem ${businessName}. Jangan balas email ini.
    </div>
  </div>
</body>
</html>`;
}

async function sendOrderEmail(pos, orderDate) {
  const settings = await getAdminSettings();

  const adminEmail = settings.admin_email || 'rotibakarngeunahid@gmail.com';
  const businessName = settings.business_name || 'Roti Bakar Ngeunah';

  const transporter = createTransporter();
  const html = buildEmailHTML(pos, orderDate, businessName);
  const dateStr = formatDate(orderDate);
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"${businessName}" <${fromEmail}>`,
    to: adminEmail,
    subject: `Purchase Order ${dateStr} — ${businessName}`,
    html,
  });
}

async function sendTestEmail() {
  const settings = await getAdminSettings();

  const adminEmail = settings.admin_email || 'rotibakarngeunahid@gmail.com';
  const businessName = settings.business_name || 'Roti Bakar Ngeunah';
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"${businessName}" <${fromEmail}>`,
    to: adminEmail,
    subject: `Test Email — ${businessName}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:400px;margin:20px auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
      <h2 style="color:#D32F2F;">${businessName}</h2>
      <p>✅ Konfigurasi email berhasil! Email ini dikirim sebagai test dari sistem order ${businessName}.</p>
      <p style="color:#999;font-size:12px;">Dikirim pada: ${new Date().toLocaleString('id-ID')}</p>
    </div>`,
  });
}

module.exports = { sendOrderEmail, sendTestEmail };
