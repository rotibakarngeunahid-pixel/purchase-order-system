# PRD: Integrasi Sistem Inventori → Rekomendasi Order Bahan Baku

**Dokumen:** Product Requirements Document  
**Versi:** 1.0  
**Tanggal:** 2026-06-10  
**Status:** Draft  
**Penulis:** Claude (berdasarkan analisis kode sistem RBN)

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Latar Belakang & Masalah](#2-latar-belakang--masalah)
3. [Analisis Sistem Existing](#3-analisis-sistem-existing)
4. [User Stories](#4-user-stories)
5. [Spesifikasi Fitur](#5-spesifikasi-fitur)
6. [Spesifikasi Teknis](#6-spesifikasi-teknis)
7. [UI/UX Mockup (Wireframe Teks)](#7-uiux-mockup-wireframe-teks)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [Sprint Plan](#9-sprint-plan)
10. [Risiko & Mitigasi](#10-risiko--mitigasi)

---

## 1. Executive Summary

Fitur ini menjembatani **Sistem Inventori** (Google Sheets + Apps Script) dengan **Sistem Pemesanan Bahan Baku/Purchase Order** (React + Node.js + Supabase) agar alur kerja staff → admin menjadi satu kesatuan yang mulus.

**Masalah yang diselesaikan:**  
Staff yang melihat stok hampir habis saat mengisi laporan harian tidak punya cara formal untuk memberitahu admin. Admin harus membuka dua sistem berbeda secara bergantian, memperkirakan sendiri bahan mana yang perlu diorder.

**Solusi:**  
Tambahkan tombol "Rekomendasikan untuk diorder" di halaman inventori (sisi staff), lalu tampilkan rekomendasi tersebut secara otomatis di halaman pemesanan bahan baku (sisi admin) lengkap dengan kondisi stok terkini dan tombol satu klik untuk langsung memasukkan ke daftar order.

**Dampak yang diharapkan:**
- Waktu proses order berkurang karena admin tidak perlu bolak-balik sistem
- Tidak ada bahan yang kehabisan karena terlewat dari radar
- Komunikasi staff → admin lebih terstruktur dan tercatat

---

## 2. Latar Belakang & Masalah

### Alur Kerja Saat Ini (Bermasalah)

```
Staff di cabang                    Admin/Pemilik
─────────────────                  ─────────────────────
Buka sistem inventori              Buka sistem inventori
↓                                  ↓
Isi laporan stok harian            Lihat laporan stok tiap cabang
↓                                  ↓
Selesai                            [Bolak-balik layar]
↓                                  ↓
(Stok hampir habis? Tidak ada      Buka sistem pemesanan bahan baku
cara memberitahu admin secara      ↓
formal selain WA/telepon)          Isi order manual berdasarkan perkiraan
```

### Pain Points

| No | Pain Point | Dampak |
|----|-----------|--------|
| 1 | Staff tidak punya cara formal untuk flag bahan yang hampir habis | Informasi terlewat atau hanya via chat informal |
| 2 | Admin harus buka dua sistem berbeda untuk satu keputusan order | Waktu terbuang, risiko lupa |
| 3 | Admin tidak bisa lihat kondisi stok di halaman pemesanan | Harus mengandalkan ingatan atau catatan manual |
| 4 | Tidak ada rekam jejak siapa yang merekomendasikan apa | Tidak bisa evaluasi atau audit |

---

## 3. Analisis Sistem Existing

### 3.1 Sistem Pemesanan Bahan Baku (purchase_order)

**Stack:** React + Vite (frontend) · Node.js/Express (backend) · Supabase PostgreSQL (database)  
**URL Frontend:** `http://localhost:5173` (dev) / `https://po.rotibakarngeunah.my.id` (prod)  
**URL Backend API:** `http://localhost:3001/api` (dev) / `https://api.rotibakarngeunah.my.id/api` (prod)  
**Autentikasi:** JWT Bearer Token (via `localStorage.rbn_token`)

#### Skema Database (Tabel Relevan)

**Tabel `outlets`** — Daftar cabang/gerai
```
id          uuid        PRIMARY KEY
name        text        Nama cabang (Buduk, Bunderan Dalung, Dalung Permai, Soputan, Pemogan)
is_active   boolean     Apakah cabang aktif
```

**Tabel `materials`** — Daftar bahan baku yang bisa dipesan
```
id                      uuid    PRIMARY KEY
code                    text    Kode bahan (BHN01-BHN16)
name                    text    Nama bahan (Roti Tawar, Mentega, Susu Kental Manis, dll.)
supplier_id             uuid    FK ke suppliers
package_qty             number  Isi kemasan
package_unit            text    Satuan kemasan (Kg, Pcs, dll.)
purchase_unit           text    Satuan pembelian
price_per_purchase_unit number  Harga per satuan beli
is_active               boolean Apakah bahan aktif
```

**Data bahan yang ada:** BHN01 Roti Tawar, BHN02 Roti Canai, BHN03 Risol, BHN04 Mentega, BHN05 Susu Kental Manis, BHN06 Keju Parut, BHN07 Messes Coklat, BHN08–10 Selai (Strawberry, Blueberry, Nanas), BHN11 Glaze Tiramisu, BHN12 Milo, BHN13 Box, BHN14 Plastik Kresek, BHN15 Sarung Tangan, BHN16 Isolasi Plastik.

**Tabel `order_sessions`** — Sesi pengisian order
```
id          uuid    PRIMARY KEY
order_date  date    Tanggal order (untuk pengiriman hari berikutnya)
status      text    draft | sent | completed
```

**Tabel `order_items`** — Item per sesi order (qty per outlet per bahan)
```
id          uuid    PRIMARY KEY
session_id  uuid    FK ke order_sessions
outlet_id   uuid    FK ke outlets
material_id uuid    FK ke materials
qty         number  Jumlah yang dipesan
```

**Tabel `purchase_orders`** — Purchase Order yang dikirim ke supplier
```
id              uuid    PRIMARY KEY
session_id      uuid    FK ke order_sessions
supplier_id     uuid    FK ke suppliers
status          text    pending | confirmed | received | received_partial
total_estimated number  Total estimasi harga
total_actual    number  Total harga aktual
```

**Tabel `po_items`** — Item per PO
```
id              uuid    PRIMARY KEY
po_id           uuid    FK ke purchase_orders
material_id     uuid    FK ke materials
qty_ordered     number  Qty yang dipesan
qty_received    number  Qty yang diterima aktual
price_actual    number  Harga aktual per satuan
source          text    ordered | adjustment
variant_id      uuid    FK ke material_variants (opsional)
```

#### Halaman & Alur Kerja

```
/order           → OrderEntry.jsx    → Input qty per outlet per bahan (matrix / per-outlet / per-bahan)
/order/:id/review → OrderReview.jsx  → Review + kirim PO ke supplier
/purchase        → PurchaseRecord.jsx → Catat penerimaan barang dari supplier
/master-data     → MasterData.jsx    → Kelola bahan, outlet, supplier
```

---

### 3.2 Sistem Inventori (inventori)

**Stack:** Google Apps Script (backend) · Google Sheets (database) · HTML + Vanilla JS (frontend)  
**Deployment:** Google Apps Script Web App (URL berbentuk `https://script.google.com/macros/s/.../exec`)  
**Autentikasi:** API Key (via parameter `api_key=...` untuk API V1)

#### Skema "Database" (Sheet Google Spreadsheet)

**Sheet `Master_Bahan`** — Daftar bahan yang diinventarisir
```
bahan_id    | nama_bahan | satuan | (kolom lain)
```

**Sheet `Master_Cabang`** — Daftar cabang
```
cabang_id | nama_cabang | (kolom lain) | aktif
```

**Sheet `Master_Staff`** — Daftar staff
```
staff_id | nama_staff | cabang_id
```

**Sheet `Mapping_Cabang_Bahan`** — Bahan apa yang dicatat di cabang mana
```
mapping_id | cabang_id | bahan_id | aktif | min_stock
```

**Sheet `Konfigurasi_Tipe_Bahan`** — Cara mencatat stok per bahan
```
bahan_id | (kolom lain) | tipe   
                          ↳ "foto"      = hanya upload foto (bahan tidak bisa dikuantifikasi angka)
                          ↳ "stok"      = angka stok + upload foto sebagai bukti
                          ↳ "stok_only" = hanya angka stok, tanpa foto
```

**Sheet `Log_Laporan`** — Log laporan stok harian (20 kolom)
```
log_id | tanggal | cabang_id | nama_cabang | staff_id | nama_staff |
bahan_id | nama_bahan | tipe | stok_masuk | stok_akhir | stok_terbuang |
stok_transfer | catatan | foto_url | timestamp | status |
alasan_terbuang | alasan_terbuang_lainnya | foto_terbuang_url
```

**Sheet `Log_Transfer`** — Log transfer antar cabang
```
transfer_id | tanggal | from_cabang_id | from_cabang_nama | to_cabang_id | to_cabang_nama |
bahan_id | nama_bahan | qty | staff_id | nama_staff | catatan | timestamp
```

**Sheet `POS_Bahan_Mapping`** — Mapping bahan inventori ke ingredient di sistem kasir
```
mapping_id | bahan_id | (nama_bahan) | pos_ingredient_id | pos_ingredient_name | aktif
```

**Sheet `POS_Cabang_Mapping`** — Mapping cabang inventori ke branch di sistem kasir
```
mapping_id | cabang_id | (nama_cabang) | pos_branch_id | (nama_branch) | aktif
```

#### API yang Sudah Ada

| Endpoint (action) | Method | Keterangan |
|-------------------|--------|-----------|
| `getCabang` | GET | List semua cabang aktif |
| `getStaff` | GET | List semua staff |
| `getBahanByCabang` | GET | List bahan+tipe+stok_awal per cabang |
| `cekSubmitHarian` | GET | Cek sudah submit hari ini? |
| `getAllLaporan` | GET | Semua laporan per tanggal |
| `getDashboard` | GET | Dashboard harian |
| `submitLaporan` | POST | Submit laporan stok harian |
| `uploadFoto` | POST | Upload foto ke Google Drive |
| `api.v1.stocks.latest` | GET | Stok terkini (API V1, perlu API key) |
| `api.v1.reports.list` | GET | Daftar laporan (API V1, perlu API key) |
| `api.v1.materials.list` | GET | Daftar bahan (API V1, perlu API key) |

---

### 3.3 Gap Analisis

| Kebutuhan | Status Saat Ini | Yang Perlu Dibangun |
|-----------|----------------|---------------------|
| Staff flag bahan "perlu diorder" | ❌ Tidak ada | Checkbox di setiap card bahan di inventori.html |
| Simpan data rekomendasi | ❌ Tidak ada | Sheet baru `Rekomendasi_Order` + logika di `submitLaporan` |
| API ambil rekomendasi pending | ❌ Tidak ada | Endpoint baru `getRekomendasiOrder` di GAS |
| API tandai rekomendasi diproses | ❌ Tidak ada | Endpoint baru `processRekomendasiOrder` di GAS |
| Tampilan rekomendasi di PO | ❌ Tidak ada | Komponen panel baru di `OrderEntry.jsx` |
| Proxy endpoint di PO server | ❌ Tidak ada | Route baru `/api/inventori/rekomendasi` di Node.js |
| Mapping bahan inventori ↔ PO | ❌ Tidak ada | Sheet baru `Mapping_Bahan_PO` di Google Sheets |

---

## 4. User Stories

### Role: Staff Cabang

**US-01: Tandai Bahan Perlu Diorder**
> Sebagai staff cabang, saya ingin menandai bahan tertentu sebagai "perlu diorder" saat mengisi laporan stok harian, agar admin mengetahui bahan mana yang hampir habis tanpa saya harus menghubungi via WA.

**Kriteria:**
- Checkbox/toggle "Rekomendasikan untuk diorder" muncul di setiap card bahan
- Checkbox ini **opsional** — laporan tetap bisa disubmit tanpa mencentangnya
- Tanda centang ini hanya tersedia saat sesi pengisian belum disubmit
- Setelah submit, status rekomendasi tersimpan dan tidak bisa diubah lagi dari halaman inventori

**US-02: Lihat Konfirmasi Rekomendasi Terkirim**
> Sebagai staff cabang, saya ingin melihat konfirmasi bahwa rekomendasi saya sudah terkirim saat laporan berhasil disubmit.

**Kriteria:**
- Pesan sukses saat submit menyebutkan berapa bahan yang direkomendasikan (misal: "Laporan berhasil! 2 bahan direkomendasikan untuk diorder.")
- Jika tidak ada yang direkomendasikan, pesan sukses biasa tanpa tambahan

---

### Role: Admin/Pemilik

**US-03: Lihat Rekomendasi Otomatis di Halaman Pemesanan**
> Sebagai admin, saat saya membuka halaman pemesanan bahan baku, saya ingin langsung melihat daftar bahan yang direkomendasikan staff untuk diorder, agar saya tidak perlu membuka sistem inventori secara terpisah.

**Kriteria:**
- Panel rekomendasi muncul secara otomatis di halaman Order Entry jika ada rekomendasi pending
- Setiap item rekomendasi menampilkan: nama bahan, nama cabang yang merekomendasikan, tanggal laporan, kondisi stok terkini

**US-04: Lihat Kondisi Stok di Panel Rekomendasi**
> Sebagai admin, saya ingin melihat kondisi stok bahan yang direkomendasikan langsung di halaman pemesanan tanpa perlu buka sistem inventori.

**Kriteria:**
- Jika tipe bahan adalah `stok` atau `stok_only` (stok berupa angka): tampilkan angka stok akhir beserta satuannya
- Jika tipe bahan adalah `foto` (stok berupa foto): tampilkan thumbnail foto yang bisa diklik untuk memperbesar
- Informasi dari laporan stok terbaru yang tersedia

**US-05: Tambahkan Item Rekomendasi ke Daftar Order**
> Sebagai admin, saya ingin mengklik satu tombol untuk langsung memasukkan bahan yang direkomendasikan ke daftar pemesanan, agar proses order lebih cepat.

**Kriteria:**
- Tombol "Tambahkan ke Order" di setiap item rekomendasi
- Saat diklik, bahan langsung masuk ke matrix order dengan qty default 1
- Admin bisa mengubah qty setelah bahan masuk ke daftar
- Tombol berubah menjadi "Sudah Ditambahkan ✓" setelah diklik (dalam satu sesi, tidak persisten)
- Jika bahan tidak ada di database PO (belum ada mapping), tampilkan peringatan yang informatif

**US-06: Abaikan Rekomendasi**
> Sebagai admin, saya ingin bisa menutup atau mengabaikan panel rekomendasi jika saya memutuskan tidak perlu memesan bahan tersebut saat ini.

**Kriteria:**
- Tombol "Tutup" atau "Tandai Semua Sudah Diproses" di panel
- Panel tersembunyi sampai ada rekomendasi baru dari staff

**US-07: Tidak Perlu Buka Sistem Inventori untuk Cek Stok**
> Sebagai admin yang sedang membuat order, saya ingin bisa melihat kondisi stok bahan yang direkomendasikan langsung di halaman pemesanan.

**Kriteria:**
- Semua informasi yang dibutuhkan untuk mengambil keputusan order tersedia di panel rekomendasi
- Admin tidak perlu login ke sistem inventori untuk validasi stok

---

## 5. Spesifikasi Fitur

### Fitur 1: Tombol Rekomendasi di Sistem Inventori

**Lokasi:** `inventori/inventory.html` — di dalam setiap card bahan (`.inv-card`)

**Tampilan:**
- Muncul di bagian bawah body card bahan, sebelum tombol submit
- Berupa checkbox dengan label yang jelas
- Visual: kotak kuning/orange dengan border, agar terlihat berbeda dari form stok utama

**Perilaku:**
- Defaultnya: tidak dicentang
- Bisa dicentang/batal centang bebas sebelum submit
- Tidak mempengaruhi validasi form lainnya (foto tetap wajib, stok tetap wajib jika tipenya `stok`)
- Saat submit: nilai checkbox dikirim bersama data item lainnya via `submitLaporan`

---

### Fitur 2: Penyimpanan Rekomendasi di Google Sheets

**Lokasi:** Fungsi `submitLaporan` di `backend.inventori.gs`

**Perilaku:**
- Saat `submitLaporan` dipanggil, proses loop item seperti biasa
- Untuk setiap item yang punya `rekomendasikan_order: true`:
  - Tulis satu baris ke sheet `Rekomendasi_Order`
  - Data yang disimpan: semua info item termasuk nilai stok akhir dan URL foto
  - Status awal: `pending`
- Rekomendasi **tidak** menggantikan data di `Log_Laporan` — keduanya ditulis terpisah

---

### Fitur 3: API Rekomendasi di Google Apps Script

**Endpoint baru 1:** `getRekomendasiOrder`
- Method: GET
- Parameter: `status` (opsional, default `pending`), `bahan_id` (opsional filter)
- Return: array rekomendasi sesuai filter
- Akses: bebas (tanpa API key) untuk kemudahan integrasi, atau dengan API key jika keamanan diutamakan

**Endpoint baru 2:** `processRekomendasiOrder`
- Method: POST
- Body: `{ rekomendasi_ids: [...], note: "..." }`
- Return: `{ status: "ok", processed: N }`
- Akses: perlu API key dengan scope `write:rekomendasi`

---

### Fitur 4: Panel Rekomendasi di Sistem Purchase Order

**Lokasi:** `purchase_order/client/src/pages/OrderEntry.jsx` — sidebar kanan (desktop) / section bawah (mobile)

**Tampilan:**
- Card berwarna kuning-orange (warna peringatan) dengan judul "Rekomendasi dari Staff"
- Badge counter menunjukkan jumlah rekomendasi pending
- Setiap item rekomendasi: nama bahan, nama cabang, tanggal, stok terkini, tombol aksi

**Perilaku:**
- Data di-fetch saat halaman pertama kali dimuat
- Loading state saat fetch berlangsung
- Error state jika fetch gagal (tidak memblok halaman)
- Panel bisa ditutup/disembunyikan
- State "sudah ditambahkan" bersifat lokal (per sesi browser, tidak persisten ke server)

---

### Fitur 5: Mapping Bahan Inventori ↔ Purchase Order

**Lokasi:** Sheet baru `Mapping_Bahan_PO` di Google Spreadsheet inventori

**Tujuan:** Menghubungkan `bahan_id` di sistem inventori dengan `material_id` (UUID) di database Supabase PO

**Cara kerja:**
- Diisi manual oleh admin satu kali saat setup
- Saat panel rekomendasi dimuat, sistem akan meng-include `po_material_id` di setiap item rekomendasi
- Jika bahan tidak punya mapping, tombol "Tambahkan ke Order" tetap muncul tapi dengan indikator bahwa perlu setup mapping dulu

---

## 6. Spesifikasi Teknis

### 6.1 Perubahan di Sistem Inventori

#### A. Sheet Baru: `Rekomendasi_Order`

Buat sheet baru di Google Spreadsheet dengan header berikut (urutan kolom penting untuk append):

| # | Nama Kolom | Tipe | Keterangan |
|---|-----------|------|-----------|
| 1 | `rekomendasi_id` | string | UUID (Utilities.getUuid()) |
| 2 | `tanggal` | string | Tanggal laporan (YYYY-MM-DD) |
| 3 | `cabang_id` | string | ID cabang dari `Master_Cabang` |
| 4 | `nama_cabang` | string | Nama cabang |
| 5 | `staff_id` | string | ID staff |
| 6 | `nama_staff` | string | Nama staff |
| 7 | `bahan_id` | string | ID bahan dari `Master_Bahan` |
| 8 | `nama_bahan` | string | Nama bahan |
| 9 | `tipe_stok` | string | `foto` / `stok` / `stok_only` |
| 10 | `stok_akhir` | number/null | Nilai stok akhir (angka); null jika tipe `foto` |
| 11 | `foto_url` | string | URL foto stok; kosong jika tidak ada |
| 12 | `timestamp` | string | ISO 8601 saat baris dibuat |
| 13 | `status` | string | `pending` atau `processed` |
| 14 | `processed_at` | string | ISO 8601 saat diproses; kosong jika belum |
| 15 | `processed_note` | string | Catatan saat diproses; kosong jika belum |

Tambahkan konstanta baru di `backend.inventori.gs`:
```javascript
// Di dalam SHEETS object:
REKOMENDASI_ORDER: "Rekomendasi_Order"
```

#### B. Sheet Baru: `Mapping_Bahan_PO`

| # | Nama Kolom | Tipe | Keterangan |
|---|-----------|------|-----------|
| 1 | `mapping_id` | string | UUID |
| 2 | `bahan_id` | string | ID bahan di sistem inventori |
| 3 | `nama_bahan_inventori` | string | Nama bahan di inventori (referensi) |
| 4 | `po_material_id` | string | UUID material di Supabase PO |
| 5 | `po_material_name` | string | Nama material di PO (referensi) |
| 6 | `aktif` | boolean | TRUE/FALSE |

Tambahkan konstanta:
```javascript
// Di dalam SHEETS object:
MAPPING_BAHAN_PO: "Mapping_Bahan_PO"
```

#### C. Perubahan di `submitLaporan` (backend.inventori.gs)

**Lokasi:** Fungsi `submitLaporan(body)` — setelah baris `sh.getRange(...).setValues(rows);`

Tambahkan logika berikut:
```javascript
// Simpan rekomendasi order jika ada item yang ditandai
const rekomendasiRows = [];
for (const item of items) {
  if (!_toBool(item.rekomendasikan_order)) continue;
  rekomendasiRows.push([
    Utilities.getUuid(),          // rekomendasi_id
    reportDate,                   // tanggal
    cabang_id,                    // cabang_id
    item.nama_cabang || "",       // nama_cabang
    body.staff_id || "",          // staff_id
    staffName,                    // nama_staff
    item.bahan_id,                // bahan_id
    item.nama_bahan || "",        // nama_bahan
    item.tipe || "foto",          // tipe_stok
    _stockToNum(item.stok_akhir) > 0 ? _stockToNum(item.stok_akhir) : "",  // stok_akhir
    item.foto_url || "",          // foto_url
    timestamp,                    // timestamp
    "pending",                    // status
    "",                           // processed_at
    ""                            // processed_note
  ]);
}
if (rekomendasiRows.length > 0) {
  const rekSh = _ensureRekomendasiOrderSheet(ss);
  rekSh.getRange(rekSh.getLastRow() + 1, 1, rekomendasiRows.length, rekomendasiRows[0].length)
    .setValues(rekomendasiRows);
}
```

**Tambahan helper function:**
```javascript
function _ensureRekomendasiOrderSheet(ss) {
  let sh = ss.getSheetByName(SHEETS.REKOMENDASI_ORDER);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.REKOMENDASI_ORDER);
    const headers = [
      "rekomendasi_id", "tanggal", "cabang_id", "nama_cabang",
      "staff_id", "nama_staff", "bahan_id", "nama_bahan",
      "tipe_stok", "stok_akhir", "foto_url", "timestamp",
      "status", "processed_at", "processed_note"
    ];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}
```

#### D. API Endpoint Baru: `getRekomendasiOrder`

Tambahkan ke `switch (action)` di `doGet(e)`:
```javascript
case "getRekomendasiOrder": 
  return jsonResponse(getRekomendasiOrder(e.parameter));
```

**Implementasi fungsi:**
```javascript
function getRekomendasiOrder(params) {
  try {
    const statusFilter = String(params.status || "pending").toLowerCase();
    const bahanFilter  = String(params.bahan_id || "").trim();
    const cabangFilter = String(params.cabang_id || "").trim();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = _ensureRekomendasiOrderSheet(ss);
    if (sh.getLastRow() < 2) return { status: "ok", data: [] };

    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 15).getValues();

    // Load mapping bahan → po_material_id
    const poMappingSh = ss.getSheetByName(SHEETS.MAPPING_BAHAN_PO);
    const poMap = {};
    if (poMappingSh && poMappingSh.getLastRow() >= 2) {
      poMappingSh.getRange(2, 1, poMappingSh.getLastRow() - 1, 6).getValues()
        .filter(r => r[1] && r[3] && _isActiveValue(r[5]))
        .forEach(r => { poMap[String(r[1])] = { po_material_id: String(r[3]), po_material_name: String(r[4] || "") }; });
    }

    let filtered = rows.filter(r => {
      const rowStatus = String(r[12] || "").toLowerCase();
      if (statusFilter !== "all" && rowStatus !== statusFilter) return false;
      if (bahanFilter  && String(r[6])  !== bahanFilter)  return false;
      if (cabangFilter && String(r[2])  !== cabangFilter) return false;
      return true;
    });

    const data = filtered.map(r => {
      const bahanId = String(r[6]);
      const mapping = poMap[bahanId] || null;
      return {
        rekomendasi_id: String(r[0]),
        tanggal:        _fmtDate(r[1]),
        cabang_id:      String(r[2]),
        nama_cabang:    r[3]  || "",
        staff_id:       String(r[4]),
        nama_staff:     r[5]  || "",
        bahan_id:       bahanId,
        nama_bahan:     r[7]  || "",
        tipe_stok:      r[8]  || "foto",
        stok_akhir:     r[9]  !== "" ? Number(r[9]) : null,
        foto_url:       r[10] || "",
        timestamp:      _fmtTs(r[11]),
        status:         r[12] || "pending",
        processed_at:   r[13] ? _fmtTs(r[13]) : null,
        processed_note: r[14] || "",
        // Info mapping ke sistem PO
        po_material_id:   mapping ? mapping.po_material_id   : null,
        po_material_name: mapping ? mapping.po_material_name : null
      };
    });

    return { status: "ok", data };
  } catch(e) {
    return { status: "error", message: e.message };
  }
}
```

#### E. API Endpoint Baru: `processRekomendasiOrder`

Tambahkan ke `switch (action)` di `doPost(e)`:
```javascript
case "processRekomendasiOrder":
  return jsonResponse(processRekomendasiOrder(body));
```

**Implementasi fungsi:**
```javascript
function processRekomendasiOrder(body) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { status: "error", message: "Server busy. Coba lagi." };
  try {
    const ids    = Array.isArray(body.rekomendasi_ids) ? body.rekomendasi_ids.map(String) : [];
    const note   = String(body.note || "").trim();
    const tsNow  = new Date().toISOString();

    if (ids.length === 0) return { status: "error", message: "rekomendasi_ids wajib diisi." };

    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    const sh  = _ensureRekomendasiOrderSheet(ss);
    if (sh.getLastRow() < 2) return { status: "ok", processed: 0 };

    const colId          = 1;  // rekomendasi_id
    const colStatus      = 13; // status
    const colProcessedAt = 14; // processed_at
    const colNote        = 15; // processed_note

    let processed = 0;
    for (let row = 2; row <= sh.getLastRow(); row++) {
      const rowId = String(sh.getRange(row, colId).getValue());
      if (ids.includes(rowId)) {
        sh.getRange(row, colStatus).setValue("processed");
        sh.getRange(row, colProcessedAt).setValue(tsNow);
        sh.getRange(row, colNote).setValue(note);
        processed++;
      }
    }
    return { status: "ok", processed };
  } catch(e) {
    return { status: "error", message: e.message };
  } finally {
    lock.releaseLock();
  }
}
```

#### F. Perubahan di `inventory.html` (Frontend Inventori)

**Lokasi:** Di dalam `.inv-body` setiap card bahan — setelah semua input stok dan foto, sebelum submit.

**HTML yang ditambahkan** (sebagai template di dalam loop render bahan):
```html
<!-- Rekomendasi Order — tambahkan di dalam inv-body, sebelum tutup div -->
<div class="rekomendasi-block" id="rek-block-{{bahan_id}}">
  <label class="rek-label" for="rek-{{bahan_id}}">
    <input type="checkbox" id="rek-{{bahan_id}}" class="rek-checkbox" data-bahan="{{bahan_id}}">
    <span class="rek-text">
      <strong>Tandai untuk diorder</strong>
      <small>Centang jika stok hampir habis dan perlu segera dipesan ulang</small>
    </span>
  </label>
</div>
```

**CSS yang ditambahkan:**
```css
.rekomendasi-block {
  margin: 10px 0 6px;
  padding: 10px 12px;
  border: 1.5px solid var(--yellow-200);
  border-radius: var(--r-lg);
  background: var(--yellow-50);
}
.rek-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.rek-checkbox { width: 18px; height: 18px; margin-top: 2px; flex-shrink: 0; accent-color: var(--orange-600); }
.rek-text strong { display: block; font-size: 13px; color: var(--ink-800); font-weight: 700; }
.rek-text small  { display: block; font-size: 11px; color: var(--ink-400); margin-top: 2px; }
.rek-label:has(.rek-checkbox:checked) { border-color: var(--orange-400); background: var(--orange-100); }
```

**JavaScript:** Saat `buildPayload()` (atau fungsi pengumpul data form), tambahkan:
```javascript
// Di dalam loop pengumpul data per bahan:
const rekCheckbox = document.getElementById('rek-' + bahan.bahan_id);
item.rekomendasikan_order = rekCheckbox ? rekCheckbox.checked : false;
```

**Tampilan pesan sukses** (di dalam fungsi yang menampilkan modal sukses setelah submit):
```javascript
// Hitung berapa bahan yang direkomendasikan
const rekCount = submittedItems.filter(i => i.rekomendasikan_order).length;
const rekMsg   = rekCount > 0 ? `\n${rekCount} bahan ditandai untuk diorder.` : '';
// Tampilkan di modal sukses
```

---

### 6.2 Perubahan di Sistem Purchase Order

#### A. Env Vars Baru

Tambahkan ke `.env` di folder `purchase_order/server/`:
```env
# Integrasi Sistem Inventori
INVENTORI_GAS_URL=https://script.google.com/macros/s/XXXXXXXX/exec
INVENTORI_API_KEY=inv_key_xxxxxxxxxxxxxxxx
```

#### B. Route Baru: `/api/inventori/rekomendasi`

Buat file baru: `purchase_order/server/routes/inventoriRekomendasi.js`

```javascript
const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const GAS_URL = () => process.env.INVENTORI_GAS_URL || '';
const GAS_KEY = () => process.env.INVENTORI_API_KEY || '';

// GET /api/inventori/rekomendasi?status=pending
router.get('/', async (req, res) => {
  const { status = 'pending', cabang_id, bahan_id } = req.query;
  const url = GAS_URL();
  const key = GAS_KEY();

  if (!url || !key) {
    return res.status(503).json({
      error: 'Integrasi inventori belum dikonfigurasi. Hubungi admin.',
    });
  }

  const params = new URLSearchParams({ action: 'getRekomendasiOrder', status });
  if (cabang_id) params.append('cabang_id', cabang_id);
  if (bahan_id)  params.append('bahan_id',  bahan_id);
  // Gunakan API key sebagai query param (sesuai sistem inventori)
  params.append('api_key', key);

  try {
    const resp = await axios.get(`${url}?${params.toString()}`, { timeout: 15000 });
    res.json(resp.data);
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'Gagal menghubungi sistem inventori';
    res.status(502).json({ error: msg });
  }
});

// POST /api/inventori/rekomendasi/process
router.post('/process', async (req, res) => {
  const { rekomendasi_ids, note } = req.body;
  const url = GAS_URL();
  const key = GAS_KEY();

  if (!url || !key) {
    return res.status(503).json({ error: 'Integrasi inventori belum dikonfigurasi.' });
  }
  if (!Array.isArray(rekomendasi_ids) || rekomendasi_ids.length === 0) {
    return res.status(400).json({ error: 'rekomendasi_ids wajib diisi.' });
  }

  try {
    const resp = await axios.post(url, {
      action: 'processRekomendasiOrder',
      api_key: key,
      rekomendasi_ids,
      note: note || '',
    }, { timeout: 15000 });
    res.json(resp.data);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(502).json({ error: msg });
  }
});

module.exports = router;
```

Daftarkan di `purchase_order/server/index.js`:
```javascript
const inventoriRekomendasiRouter = require('./routes/inventoriRekomendasi');
// ...
app.use('/api/inventori/rekomendasi', authMiddleware, inventoriRekomendasiRouter);
```

#### C. Komponen React Baru: `RekomendasiPanel.jsx`

Buat file baru: `purchase_order/client/src/components/order/RekomendasiPanel.jsx`

**Props:**
```javascript
{
  materials,       // array — daftar bahan dari master data PO
  onAddToOrder,    // function(materialId, rekomendasiId) — callback saat tombol diklik
  addedIds,        // Set<string> — set rekomendasi_id yang sudah ditambahkan di sesi ini
}
```

**State internal:**
- `items`: array rekomendasi dari API
- `loading`: boolean
- `error`: string | null
- `collapsed`: boolean (panel bisa dilipat)

**Logika fetch:**
```javascript
useEffect(() => {
  fetchRekomendasi();
}, []);

async function fetchRekomendasi() {
  setLoading(true);
  try {
    const res = await api.get('/api/inventori/rekomendasi?status=pending');
    setItems(res.data?.data || []);
  } catch (err) {
    setError('Gagal memuat rekomendasi. Panel ini tidak mempengaruhi order.');
  } finally {
    setLoading(false);
  }
}
```

**Render per item rekomendasi:**
```jsx
function RekomendasiItem({ item, material, isAdded, onAdd }) {
  const hasNumber = item.tipe_stok !== 'foto' && item.stok_akhir !== null;
  const hasPhoto  = !!item.foto_url;

  return (
    <div className="rek-item-card">
      <div className="rek-item-info">
        <span className="rek-item-name">{item.nama_bahan}</span>
        <span className="rek-item-meta">{item.nama_cabang} · {formatDateID(item.tanggal)}</span>
        {/* Tampilan stok */}
        {hasNumber && (
          <span className="rek-item-stock">Sisa: {item.stok_akhir} {/* satuan dari material */}</span>
        )}
        {!hasNumber && hasPhoto && (
          <a href={item.foto_url} target="_blank" rel="noopener noreferrer" className="rek-item-photo-link">
            <img src={item.foto_url.replace('/view', '/preview')} alt="stok" className="rek-thumb" />
          </a>
        )}
        {!hasNumber && !hasPhoto && (
          <span className="rek-item-stock-unknown">Stok: lihat laporan</span>
        )}
      </div>
      <div className="rek-item-actions">
        {!material && (
          <span className="rek-no-mapping" title="Bahan ini belum ada di master data PO">
            Perlu setup mapping
          </span>
        )}
        {material && !isAdded && (
          <button className="btn-rek-add" onClick={() => onAdd(material.id, item.rekomendasi_id)}>
            + Tambahkan ke Order
          </button>
        )}
        {material && isAdded && (
          <span className="rek-added">Sudah Ditambahkan ✓</span>
        )}
      </div>
    </div>
  );
}
```

#### D. Integrasi ke `OrderEntry.jsx`

**State tambahan di `OrderEntry.jsx`:**
```javascript
const [rekAddedIds, setRekAddedIds] = useState(new Set()); // rekomendasi_id yang sudah ditambah
```

**Handler baru:**
```javascript
const handleAddRekToOrder = (materialId, rekomendasiId) => {
  // Tambahkan ke semua outlet dengan qty 1 (atau ke outlet yang merekomendasikan saja)
  // Strategi: set qty = 1 untuk outlet pertama yang aktif, lainnya 0
  const activeOutlet = outlets.find(o => outletOpen[o.id] !== false);
  if (!activeOutlet) return;

  const key = getMatrixKey(activeOutlet.id, materialId);
  const currentQty = Number(matrix[key]) || 0;
  const newQty = Math.max(currentQty, 1); // jangan turunkan jika sudah diisi lebih besar

  handleCellChange(activeOutlet.id, materialId, newQty);
  setRekAddedIds(prev => new Set([...prev, rekomendasiId]));
};
```

**Tambahkan di JSX sidebar:**
```jsx
{/* Sidebar desktop */}
<div className="w-72 flex-shrink-0 hidden lg:flex flex-col gap-4">
  {/* ... komponen existing ... */}
  <RekomendasiPanel
    materials={materials}
    onAddToOrder={handleAddRekToOrder}
    addedIds={rekAddedIds}
  />
</div>
```

---

### 6.3 Ringkasan Semua File yang Diubah/Dibuat

#### Sistem Inventori (Google Apps Script)
| File | Jenis Perubahan |
|------|----------------|
| `backend.inventori.gs` | Tambah konstanta, fungsi baru, modifikasi `submitLaporan` |
| `inventori/inventory.html` | Tambah HTML checkbox + CSS + JS pengumpul data |
| Google Spreadsheet | Buat sheet `Rekomendasi_Order` dan `Mapping_Bahan_PO` |

#### Sistem Purchase Order (Node.js + React)
| File | Jenis Perubahan |
|------|----------------|
| `server/routes/inventoriRekomendasi.js` | **BARU** — route proxy ke GAS |
| `server/index.js` | Daftarkan route baru |
| `server/.env` | Tambah 2 env var baru |
| `client/src/components/order/RekomendasiPanel.jsx` | **BARU** — komponen panel |
| `client/src/pages/OrderEntry.jsx` | Tambah state + handler + render panel |

---

## 7. UI/UX Mockup (Wireframe Teks)

### 7.1 Inventori — Card Bahan dengan Rekomendasi

```
┌──────────────────────────────────────────────────────────────┐
│  🧈  Mentega                                    [SUDAH ISI ✓] │
│  STOK BAHAN BAKU                                              │
├──────────────────────────────────────────────────────────────┤
│  STOK KEMARIN        SISA AKHIR HARI INI                      │
│  [  2.5 kg  ]        [    0.5    ]                            │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  📸 Foto Stok Fisik (Wajib)                          │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  [Klik atau ambil foto untuk upload]           │  │   │
│  │  │  📷  Ambil Foto  /  📁  Pilih dari galeri      │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚠️  Tandai untuk Diorder?                            │   │
│  │                                                      │   │
│  │  ☐  Rekomendasikan untuk diorder                     │   │
│  │     Centang jika stok hampir habis dan perlu segera  │   │
│  │     dipesan ulang                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Saat checkbox dicentang:**
```
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ✅  Tandai untuk Diorder?        [AKAN DIREKOMENDASIKAN] │   │
│  │                                                      │   │
│  │  ☑  Rekomendasikan untuk diorder  ←── tercentang    │   │
│  │     Admin akan melihat rekomendasi ini di halaman    │   │
│  │     pemesanan bahan baku.                            │   │
│  └──────────────────────────────────────────────────────┘   │
```

---

### 7.2 Inventori — Modal Sukses (dengan rekomendasi)

```
┌─────────────────────────────────────────────┐
│                                             │
│              🎉                             │
│                                             │
│   Laporan Berhasil Dikirim!                 │
│                                             │
│   ┌─────────────────────────────────────┐  │
│   │  Tanggal Laporan   10 Juni 2026    │  │
│   │  Jam Submit        14:32 WITA      │  │
│   └─────────────────────────────────────┘  │
│                                             │
│   ✅  2 bahan ditandai untuk diorder:       │
│      • Mentega                              │
│      • Susu Kental Manis                    │
│      Admin akan melihat rekomendasi ini.    │
│                                             │
│            [ Kembali ke Beranda ]           │
│                                             │
└─────────────────────────────────────────────┘
```

---

### 7.3 Purchase Order — Panel Rekomendasi di OrderEntry

**State: Ada rekomendasi, panel terbuka (desktop sidebar)**

```
┌────────────────────────────────────────────┐
│ 📋 REKOMENDASI DARI STAFF          3 item  │
│ Berdasarkan laporan stok terkini           │
├────────────────────────────────────────────┤
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │  🧈 Mentega                          │  │
│ │  Buduk  ·  Kemarin                   │  │
│ │  Sisa stok: 0.5 kg                   │  │
│ │                                      │  │
│ │             [+ Tambahkan ke Order]   │  │
│ └──────────────────────────────────────┘  │
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │  🍓 Selai Strawberry                 │  │
│ │  Dalung Permai  ·  Kemarin           │  │
│ │  Sisa stok: [📷 lihat foto]          │  │
│ │                                      │  │
│ │             [+ Tambahkan ke Order]   │  │
│ └──────────────────────────────────────┘  │
│                                            │
│ ┌──────────────────────────────────────┐  │
│ │  🥛 Susu Kental Manis                │  │
│ │  Soputan  ·  Kemarin                 │  │
│ │  Sisa stok: 1 kaleng                 │  │
│ │                                      │  │
│ │             [+ Tambahkan ke Order]   │  │
│ └──────────────────────────────────────┘  │
│                                            │
│         [Tutup / Semua Sudah Diproses]     │
└────────────────────────────────────────────┘
```

**State: Setelah beberapa item ditambahkan**

```
│ ┌──────────────────────────────────────┐  │
│ │  🧈 Mentega                          │  │
│ │  Buduk  ·  Kemarin                   │  │
│ │  Sisa stok: 0.5 kg                   │  │
│ │                                      │  │
│ │          ✅  Sudah Ditambahkan       │  │ ← tombol berubah
│ └──────────────────────────────────────┘  │
```

**State: Bahan tidak ada di mapping PO**

```
│ ┌──────────────────────────────────────┐  │
│ │  🫙 Tepung Terigu                    │  │
│ │  Pemogan  ·  Kemarin                 │  │
│ │  Sisa stok: 200 gr                   │  │
│ │                                      │  │
│ │   ⚠ Belum ada di master data PO     │  │ ← tidak ada tombol add
│ └──────────────────────────────────────┘  │
```

**State: Panel sedang loading**

```
│ ┌──────────────────────────────────────┐  │
│ │  ⟳  Memuat rekomendasi...           │  │
│ └──────────────────────────────────────┘  │
```

**State: Tidak ada rekomendasi pending**

```
│ ┌──────────────────────────────────────┐  │
│ │  ✅  Tidak ada rekomendasi baru      │  │
│ │  Staff belum menandai bahan          │  │
│ │  apapun untuk diorder hari ini.      │  │
│ └──────────────────────────────────────┘  │
```

**State: Gagal fetch (error)**

```
│ ┌──────────────────────────────────────┐  │
│ │  ⚠  Gagal memuat rekomendasi        │  │
│ │  Tidak mempengaruhi proses order.    │  │
│ │         [Coba Lagi]                  │  │
│ └──────────────────────────────────────┘  │
```

---

### 7.4 Purchase Order — Panel Rekomendasi (Mobile)

Di mobile, panel muncul di bawah area input (sama seperti `RotiTawarPanel`):

```
┌─────────────────────────────────────────────────────────────┐
│  📋 REKOMENDASI DARI STAFF                        3 item ▼  │
├─────────────────────────────────────────────────────────────┤
│  Mentega · Buduk · Kemarin       Sisa: 0.5 kg               │
│                                    [+ Tambahkan ke Order]   │
├─────────────────────────────────────────────────────────────┤
│  Selai Strawberry · Dalung · Kemarin       [📷 foto]        │
│                                    [+ Tambahkan ke Order]   │
├─────────────────────────────────────────────────────────────┤
│  Susu Kental Manis · Soputan · Kemarin  Sisa: 1 kaleng      │
│                                    [+ Tambahkan ke Order]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Acceptance Criteria

### AC-01: Checkbox Rekomendasi di Inventori

- [ ] Setiap card bahan di `inventory.html` menampilkan checkbox "Rekomendasikan untuk diorder"
- [ ] Checkbox **tidak** mempengaruhi validasi wajib (foto, stok akhir tetap diperiksa mandiri)
- [ ] Saat laporan disubmit, nilai checkbox dikirim bersama data item (`rekomendasikan_order: true/false`)
- [ ] Checkbox tidak muncul saat laporan sudah disubmit (form dalam mode read-only)

### AC-02: Penyimpanan Rekomendasi

- [ ] Sheet `Rekomendasi_Order` ada di Google Spreadsheet dengan 15 kolom header yang benar
- [ ] Setiap bahan yang `rekomendasikan_order: true` menghasilkan satu baris di sheet `Rekomendasi_Order`
- [ ] Baris yang tersimpan memiliki: `rekomendasi_id` (UUID unik), `tanggal`, `cabang_id`, `bahan_id`, `tipe_stok`, `stok_akhir` (angka atau kosong), `foto_url` (URL atau kosong), `status: "pending"`
- [ ] Laporan tanpa rekomendasi tetap berhasil disubmit (tidak ada error)
- [ ] Laporan dengan rekomendasi tetap berhasil disubmit meski ada error saat tulis ke Rekomendasi_Order (gagal silently, tidak blokir submit)

### AC-03: API `getRekomendasiOrder`

- [ ] `GET ?action=getRekomendasiOrder` mengembalikan array rekomendasi
- [ ] Default filter `status=pending` — hanya rekomendasi belum diproses yang muncul
- [ ] Setiap item response memiliki field: `rekomendasi_id`, `nama_bahan`, `nama_cabang`, `tanggal`, `tipe_stok`, `stok_akhir`, `foto_url`, `po_material_id` (null jika belum ada mapping)
- [ ] Jika sheet kosong, return `{ status: "ok", data: [] }` (bukan error)

### AC-04: API `processRekomendasiOrder`

- [ ] `POST { action: "processRekomendasiOrder", rekomendasi_ids: [...] }` mengubah status baris menjadi `processed`
- [ ] Field `processed_at` diisi dengan timestamp ISO
- [ ] Return `{ status: "ok", processed: N }` di mana N = jumlah baris yang berhasil diupdate
- [ ] Jika `rekomendasi_ids` kosong, return error yang jelas

### AC-05: Route Proxy di PO Server

- [ ] `GET /api/inventori/rekomendasi` mengembalikan data dari GAS (dengan autentikasi JWT PO yang valid)
- [ ] Jika `INVENTORI_GAS_URL` atau `INVENTORI_API_KEY` tidak diset, return HTTP 503 dengan pesan informatif
- [ ] Jika GAS timeout atau error, return HTTP 502 dengan pesan error
- [ ] Tanpa token JWT PO yang valid, return HTTP 401

### AC-06: Panel Rekomendasi di Purchase Order

- [ ] Panel `RekomendasiPanel` muncul di sidebar kanan (desktop) dan section bawah (mobile) di halaman Order Entry
- [ ] Loading state ditampilkan saat fetch berlangsung
- [ ] Error state ditampilkan jika fetch gagal — **tidak memblokir halaman order**
- [ ] Empty state ditampilkan jika tidak ada rekomendasi pending
- [ ] Panel bisa dilipat/disembunyikan

### AC-07: Tampilan Stok di Panel

- [ ] Jika `tipe_stok` adalah `stok` atau `stok_only`: tampilkan angka `stok_akhir`
- [ ] Jika `tipe_stok` adalah `foto`: tampilkan thumbnail foto (gambar kecil yang bisa diklik)
- [ ] Jika tidak ada `stok_akhir` dan tidak ada `foto_url`: tampilkan teks "Lihat laporan inventori"
- [ ] Klik thumbnail membuka foto di tab/jendela baru

### AC-08: Tombol Tambahkan ke Order

- [ ] Setiap item dengan `po_material_id` yang valid menampilkan tombol "Tambahkan ke Order"
- [ ] Item **tanpa** `po_material_id` menampilkan teks "Belum ada di master data PO" (tanpa tombol)
- [ ] Klik tombol memasukkan bahan ke matrix order dengan qty = 1 (atau mempertahankan nilai yang sudah ada jika lebih dari 1)
- [ ] Setelah diklik, tombol berubah menjadi "Sudah Ditambahkan ✓" (tidak bisa diklik lagi dalam sesi ini)
- [ ] Perubahan matrix tersimpan otomatis (behavior yang sudah ada di `handleCellChange`)

### AC-09: Pesan Sukses Submit di Inventori

- [ ] Jika ada bahan yang direkomendasikan, modal sukses menampilkan list nama bahan yang direkomendasikan
- [ ] Jika tidak ada rekomendasi, modal sukses seperti biasa tanpa tambahan

---

## 9. Sprint Plan

### Estimasi Total: 3 Sprint (masing-masing ~3 hari kerja)

---

### Sprint 1: Backend Inventori (3 hari)

**Goal:** Sheet baru + API baru di Google Apps Script berjalan dan bisa ditest.

| # | Task | Estimasi | PIC |
|---|------|----------|-----|
| 1.1 | Buat sheet `Rekomendasi_Order` di Google Spreadsheet dengan header 15 kolom | 30 menit | Admin |
| 1.2 | Buat sheet `Mapping_Bahan_PO` di Google Spreadsheet dengan header 6 kolom | 30 menit | Admin |
| 1.3 | Tambah konstanta `REKOMENDASI_ORDER` dan `MAPPING_BAHAN_PO` ke object `SHEETS` di `backend.inventori.gs` | 15 menit | Dev |
| 1.4 | Implementasi fungsi `_ensureRekomendasiOrderSheet()` | 30 menit | Dev |
| 1.5 | Implementasi fungsi `_ensureMappingBahanPoSheet()` | 30 menit | Dev |
| 1.6 | Modifikasi `submitLaporan()`: tambah logika tulis ke `Rekomendasi_Order` jika `rekomendasikan_order: true` | 1 jam | Dev |
| 1.7 | Implementasi fungsi `getRekomendasiOrder(params)` | 1 jam | Dev |
| 1.8 | Tambah `case "getRekomendasiOrder"` ke `doGet` | 15 menit | Dev |
| 1.9 | Implementasi fungsi `processRekomendasiOrder(body)` | 1 jam | Dev |
| 1.10 | Tambah `case "processRekomendasiOrder"` ke `doPost` | 15 menit | Dev |
| 1.11 | Deploy ulang Google Apps Script (klik Deploy → Kelola Deployment → Update) | 15 menit | Dev |
| 1.12 | Test manual: submit laporan dengan checkbox → cek sheet `Rekomendasi_Order` terisi | 30 menit | Dev+QA |
| 1.13 | Test manual: call `getRekomendasiOrder` via browser URL → cek response JSON | 30 menit | Dev+QA |
| 1.14 | Isi sheet `Mapping_Bahan_PO` dengan data mapping bahan inventori → material PO | 1 jam | Admin |

**Definisi Selesai Sprint 1:**
- Submit laporan dengan rekomendasi → baris tertulis di sheet `Rekomendasi_Order`
- GET request ke `?action=getRekomendasiOrder` mengembalikan data JSON yang benar
- POST ke `processRekomendasiOrder` mengubah status ke `processed`

---

### Sprint 2: Backend PO + Frontend Inventori (3 hari)

**Goal:** Route proxy di PO server jalan + Checkbox di inventori berfungsi.

| # | Task | Estimasi | PIC |
|---|------|----------|-----|
| 2.1 | Tambah `INVENTORI_GAS_URL` dan `INVENTORI_API_KEY` ke `.env` PO server | 15 menit | Dev |
| 2.2 | Buat file `purchase_order/server/routes/inventoriRekomendasi.js` | 1 jam | Dev |
| 2.3 | Daftarkan route baru di `purchase_order/server/index.js` | 15 menit | Dev |
| 2.4 | Test route `GET /api/inventori/rekomendasi` via Postman/curl | 30 menit | Dev |
| 2.5 | Test route `POST /api/inventori/rekomendasi/process` via Postman | 30 menit | Dev |
| 2.6 | Tambah CSS `.rekomendasi-block`, `.rek-label`, dll ke `inventori/inventory.html` | 1 jam | Dev |
| 2.7 | Tambah HTML checkbox di template render card bahan (dalam loop JavaScript) | 1 jam | Dev |
| 2.8 | Modifikasi `buildPayload()` untuk include `rekomendasikan_order` per item | 45 menit | Dev |
| 2.9 | Modifikasi modal sukses untuk tampilkan nama bahan yang direkomendasikan | 45 menit | Dev |
| 2.10 | Test E2E: inventori.html → centang checkbox → submit → lihat pesan sukses → cek sheet | 1 jam | Dev+QA |
| 2.11 | Test: submit tanpa rekomendasi tetap berhasil (regression test) | 30 menit | Dev+QA |
| 2.12 | Test: submit di bawah jam 03:00 masih menggunakan reporting date kemarin (regression) | 30 menit | Dev+QA |

**Definisi Selesai Sprint 2:**
- Checkbox muncul di setiap card bahan di halaman inventori
- Submit dengan checkbox → rekomendasi tersimpan → pesan sukses dengan nama bahan
- `GET /api/inventori/rekomendasi` (dengan JWT token PO) mengembalikan data benar

---

### Sprint 3: Frontend Purchase Order + Polish (3 hari)

**Goal:** Panel rekomendasi di halaman Order Entry berfungsi penuh.

| # | Task | Estimasi | PIC |
|---|------|----------|-----|
| 3.1 | Buat file `purchase_order/client/src/components/order/RekomendasiPanel.jsx` | 2 jam | Dev |
| 3.2 | Implementasi fungsi `fetchRekomendasi` + loading/error/empty states | 1 jam | Dev |
| 3.3 | Implementasi komponen `RekomendasiItem` dengan logika tampilan stok (angka vs foto) | 1 jam | Dev |
| 3.4 | Tambah state `rekAddedIds` dan handler `handleAddRekToOrder` ke `OrderEntry.jsx` | 45 menit | Dev |
| 3.5 | Render `RekomendasiPanel` di sidebar desktop dan section mobile `OrderEntry.jsx` | 45 menit | Dev |
| 3.6 | Styling komponen `RekomendasiPanel` (konsisten dengan desain PO yang ada) | 1 jam | Dev |
| 3.7 | Test: panel muncul dengan data dari API | 30 menit | Dev+QA |
| 3.8 | Test: tombol "Tambahkan ke Order" mengisi matrix dengan benar | 30 menit | Dev+QA |
| 3.9 | Test: stok berupa angka ditampilkan dengan benar | 30 menit | Dev+QA |
| 3.10 | Test: stok berupa foto ditampilkan sebagai thumbnail yang bisa diklik | 30 menit | Dev+QA |
| 3.11 | Test: bahan tanpa mapping menampilkan pesan "Belum ada di master data PO" | 30 menit | Dev+QA |
| 3.12 | Test: error fetch tidak memblokir halaman order | 30 menit | Dev+QA |
| 3.13 | Test: panel berfungsi di mobile (tampilan responsif) | 30 menit | Dev+QA |
| 3.14 | Test E2E full: staff centang → submit inventori → admin buka PO → panel muncul → tambah ke order | 1 jam | Dev+QA |

**Definisi Selesai Sprint 3:**
- Panel rekomendasi muncul otomatis di halaman Order Entry
- Semua state (loading, error, empty, ada data) ditampilkan dengan benar
- Tombol "Tambahkan ke Order" berfungsi, mengisi matrix dengan qty 1
- Bahan yang tidak ada di mapping ditampilkan dengan pesan yang informatif
- Tidak ada regresi pada fitur yang sudah ada

---

### Checklist Setup Awal (Sebelum Sprint 1)

Admin perlu menyiapkan:

- [ ] Buka Google Spreadsheet sistem inventori
- [ ] Pastikan memiliki akses edit ke spreadsheet
- [ ] Siapkan daftar `bahan_id` dari sheet `Master_Bahan` (untuk pengisian `Mapping_Bahan_PO`)
- [ ] Siapkan daftar `material_id` dari database Supabase PO (query: `SELECT id, name FROM materials WHERE is_active = true`)
- [ ] Pastikan Google Apps Script sudah dalam mode deploy "Anyone" untuk eksekusi

---

## 10. Risiko & Mitigasi

| # | Risiko | Kemungkinan | Dampak | Mitigasi |
|---|--------|-------------|--------|---------|
| R1 | GAS timeout saat PO server fetch rekomendasi | Sedang | Rendah (panel error, order tetap jalan) | Fail silently: error tidak memblokir halaman order, tampilkan pesan "Gagal memuat rekomendasi" |
| R2 | Bahan di inventori tidak punya mapping ke PO | Tinggi (awal) | Sedang | Tampilkan pesan informatif di panel, bukan error. Admin bisa isi mapping bertahap |
| R3 | Rekomendasi menumpuk jika tidak pernah diproses | Sedang | Rendah | Tambahkan filter tanggal (default 7 hari terakhir) di `getRekomendasiOrder` |
| R4 | Staff salah centang dan tidak bisa dibatalkan | Rendah | Rendah | Checkbox hanya tersimpan saat submit, bisa dibatalkan sebelum submit |
| R5 | Perubahan di `submitLaporan` break submit normal | Rendah | Tinggi | Error saat tulis rekomendasi harus ditangkap (try-catch) dan tidak propagate ke submit utama |
| R6 | API key inventori ter-expose di frontend PO | Tinggi (jika salah impl) | Tinggi | API key **hanya ada di server PO** (env var), frontend hanya call ke `/api/inventori/rekomendasi` dengan JWT PO |
| R7 | Nama bahan berbeda antara dua sistem | Tinggi | Sedang | Mapping berbasis ID, bukan nama — sheet `Mapping_Bahan_PO` menjembatani perbedaan nama |

---

## Lampiran: Urutan Pengisian `Mapping_Bahan_PO`

Isi sheet ini setelah Sprint 1 selesai. Cocokkan bahan di inventori dengan material di PO:

| bahan_id (inventori) | nama_bahan_inventori | po_material_id (UUID Supabase) | po_material_name | aktif |
|---------------------|---------------------|-------------------------------|-----------------|-------|
| BHN-001 | Roti Tawar | `<uuid dari Supabase>` | Roti Tawar | TRUE |
| BHN-002 | Mentega | `<uuid dari Supabase>` | Mentega | TRUE |
| BHN-003 | Susu Kental Manis | `<uuid dari Supabase>` | Susu Kental Manis | TRUE |
| ... | ... | ... | ... | TRUE |

> **Catatan:** `po_material_id` adalah UUID dari tabel `materials` di Supabase. Untuk mendapatkan UUID-nya, buka halaman Master Data di sistem PO atau query langsung ke Supabase Dashboard.

---

*Dokumen ini dibuat berdasarkan pembacaan penuh kode sumber `purchase_order/` dan `inventori/` per tanggal 2026-06-10.*
