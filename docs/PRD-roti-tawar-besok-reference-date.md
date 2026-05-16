# PRD: Perbaikan Referensi Perhitungan Roti Saat Memilih "Besok"

## 1. Latar Belakang Masalah

Pada proses operasional harian, order roti untuk tanggal berikutnya biasanya dibuat pada malam hari sebelumnya. Contoh: pada malam tanggal 15, user membuat order roti untuk tanggal 16. Dalam kondisi ini, tanggal order memang harus menjadi tanggal 16, tetapi data stok dan perhitungan kebutuhan roti masih harus mengacu pada kondisi terakhir tanggal 15.

Saat ini sistem memperlakukan tanggal yang dipilih user sebagai satu-satunya tanggal untuk session order dan sumber data stok roti. Akibatnya, ketika user memilih opsi "Besok", sistem mencoba mengambil data stok untuk tanggal besok. Jika data tanggal besok belum tersedia di sumber inventory/GAS, stok cabang dapat dianggap 0 dan hasil perhitungan roti menjadi tidak sesuai dengan kondisi operasional terakhir.

Masalah utama yang perlu direvisi adalah pemisahan antara:

- `order_date`: tanggal order yang akan dibuat/dikirim ke supplier.
- `stock_reference_date`: tanggal data stok yang digunakan sebagai dasar perhitungan kebutuhan roti.

## 2. Current Behavior

Alur saat ini berdasarkan kode:

1. User membuka halaman Input Order di `client/src/pages/OrderEntry.jsx`.
2. State `orderDate` default menggunakan tanggal hari ini dari `toInputDate()`.
3. Saat user klik tombol "Besok", kode membuat tanggal besok dan memanggil `handleDateChange(...)`.
4. `handleDateChange`:
   - mengubah `orderDate` ke tanggal besok,
   - mengosongkan `matrix` sementara dengan `setMatrix({})`,
   - membuat atau mengambil session berdasarkan `order_date` tanggal besok melalui `POST /api/orders/session`,
   - memuat item yang sudah ada pada session tanggal tersebut.
5. Saat user klik "Hitung Otomatis" pada material Roti Tawar, `handleRotiAutoFill` memanggil `previewRotiOrder(orderDate)`.
6. `previewRotiOrder(orderDate)` memanggil backend `/api/roti-tawar/preview?tanggal=<orderDate>`.
7. Backend di `server/routes/rotiTawar.js` memakai query `tanggal` tersebut untuk mengambil data GAS:
   - `getDashboard&tanggal=<tanggal>`.
8. Jika data roti untuk tanggal tersebut tidak ditemukan, current stock per cabang di-set menjadi `0`:
   - `const currentStock = gasRow ? Math.floor(Number(gasRow.stok_akhir)) : 0;`
9. Kebutuhan roti dihitung dari `min_stock - current_stock`.

Dampak current behavior:

- Saat order untuk besok dibuat pada malam hari ini, sistem mencari stok tanggal besok.
- Karena data stok tanggal besok belum tersedia, stok dapat terbaca 0.
- Perhitungan kebutuhan roti tidak lagi mengacu ke kondisi stok terakhir hari berjalan.
- User melihat hasil perhitungan yang terasa seperti dimulai ulang dari 0.

## 3. Expected Behavior

Saat user memilih opsi "Besok":

1. Tanggal session/order tetap menjadi tanggal besok.
2. Perhitungan roti otomatis tetap menggunakan data stok dari tanggal referensi sebelumnya, yaitu tanggal operasional terakhir/hari berjalan.
3. Untuk contoh malam tanggal 15 membuat order tanggal 16:
   - `order_date = 16`
   - `stock_reference_date = 15`
4. UI harus tetap menampilkan bahwa order dibuat untuk tanggal 16.
5. Detail kalkulasi roti harus menampilkan tanggal stok referensi yang digunakan, misalnya "Data stok referensi: 15".
6. Sistem tidak boleh menganggap stok tanggal besok sebagai 0 hanya karena data tanggal besok belum tersedia.

Dengan kata lain, tombol "Besok" harus mengubah tanggal tujuan order, bukan mengubah tanggal sumber stok menjadi tanggal besok.

## 4. User Flow

### Flow Utama: Membuat Order Roti Untuk Besok

1. User membuka halaman Input Order.
2. Sistem menampilkan tanggal default hari berjalan.
3. User klik tombol "Besok".
4. Sistem mengubah tanggal order menjadi tanggal besok.
5. Sistem membuat atau mengambil draft session untuk tanggal besok.
6. User klik "Hitung Otomatis" pada baris Roti Tawar.
7. Sistem mengambil data stok dari `stock_reference_date`, bukan dari `order_date`.
8. Sistem menghitung kebutuhan roti per cabang berdasarkan:
   - stok akhir pada tanggal referensi,
   - minimum stock per cabang,
   - status buka/tutup outlet,
   - mode 1 hari/2 hari.
9. Sistem mengisi quantity Roti Tawar di matrix order tanggal besok.
10. User dapat mengubah quantity secara manual jika dibutuhkan.
11. User klik "Hitung & Review".
12. Sistem membuat review PO untuk `order_date` tanggal besok dengan quantity hasil kalkulasi yang sudah disimpan.

### Flow Existing Session Tanggal Besok

1. User membuka session order tanggal besok yang sudah pernah dibuat.
2. Sistem memuat item yang sudah tersimpan pada session tersebut.
3. Jika user klik "Hitung Otomatis" lagi, sistem menghitung ulang berdasarkan `stock_reference_date` yang sesuai.
4. Sistem hanya menimpa quantity Roti Tawar ketika user memang menjalankan "Hitung Otomatis".

## 5. Business Rule

1. `order_date` adalah tanggal order yang akan tampil di session, review, distribusi, PO, email, dan laporan order.
2. `stock_reference_date` adalah tanggal stok yang dipakai untuk perhitungan otomatis Roti Tawar.
3. Jika user memilih tombol "Besok", maka:
   - `order_date` harus menjadi H+1 dari tanggal lokal operasional.
   - `stock_reference_date` harus tetap H, yaitu tanggal operasional saat order dibuat.
4. Tanggal operasional mengikuti aturan existing di `server/services/reportingDate.js`:
   - zona waktu WITA/UTC+8,
   - sebelum pukul 03:00 dianggap masih tanggal operasional sebelumnya.
5. Untuk kalkulasi otomatis Roti Tawar, backend harus menerima atau menentukan `stock_reference_date` secara eksplisit.
6. Backend tidak boleh diam-diam menganggap stok cabang 0 ketika data stok untuk tanggal yang diminta tidak tersedia tanpa memberi sinyal yang jelas.
7. Jika data stok referensi tidak tersedia dari GAS, sistem harus menampilkan error yang informatif, bukan menghasilkan angka order dari stok 0.
8. Quantity manual yang sudah diinput user pada material selain Roti Tawar tidak boleh terhapus saat user memilih tanggal atau menjalankan kalkulasi Roti Tawar.
9. Quantity Roti Tawar pada session draft boleh ditimpa oleh hasil kalkulasi otomatis hanya setelah user menekan "Hitung Otomatis".
10. Session yang statusnya bukan `draft` tetap read-only dan tidak boleh dihitung ulang atau disimpan ulang.

## 6. Acceptance Criteria

1. Ketika user berada pada malam tanggal 15 dan menekan tombol "Besok", sistem membuat/memuat session dengan `order_date` tanggal 16.
2. Ketika user menekan "Hitung Otomatis" setelah memilih "Besok", backend mengambil data stok roti dari tanggal 15 sebagai `stock_reference_date`.
3. Hasil kalkulasi tidak boleh menggunakan stok 0 hanya karena data tanggal 16 belum ada.
4. UI hasil kalkulasi menampilkan dua konteks tanggal secara jelas:
   - tanggal order,
   - tanggal referensi stok.
5. Matrix order tanggal 16 terisi dengan quantity Roti Tawar berdasarkan stok tanggal 15.
6. Setelah halaman di-refresh atau session tanggal 16 dibuka ulang, quantity yang sudah tersimpan tetap muncul.
7. Jika user mengubah tanggal manual ke hari ini, kalkulasi otomatis menggunakan tanggal hari ini sebagai referensi stok.
8. Jika user mengubah tanggal manual ke tanggal masa depan selain besok, sistem harus menggunakan aturan referensi yang konsisten:
   - default: gunakan tanggal operasional saat ini sebagai `stock_reference_date`, kecuali user diberi kontrol eksplisit untuk memilih referensi lain.
9. Jika GAS tidak mengembalikan data untuk `stock_reference_date`, user melihat error seperti "Data stok roti untuk tanggal referensi belum tersedia" dan quantity tidak diisi otomatis.
10. Existing behavior pembuatan PO, review order, pengiriman email, dan distribusi tetap memakai `order_date`, bukan `stock_reference_date`.

## 7. Edge Cases

1. User klik "Besok" sebelum pukul 03:00 WITA.
   - Karena aturan reporting date menganggap sebelum 03:00 sebagai tanggal operasional sebelumnya, `stock_reference_date` harus mengikuti hasil `getReportingDate()`.
2. User klik "Besok" tetapi session tanggal besok sudah ada dan berisi quantity.
   - Sistem harus memuat quantity existing.
   - Kalkulasi otomatis hanya menimpa Roti Tawar jika user klik "Hitung Otomatis".
3. GAS mengembalikan data tetapi tidak ada baris `Roti Tawar` untuk salah satu cabang.
   - Backend harus membedakan antara stok benar-benar 0 dan data cabang tidak ditemukan.
   - Rekomendasi: tampilkan warning per cabang atau gagalkan kalkulasi jika data mapping wajib tidak lengkap.
4. Mapping cabang roti aktif tidak cocok dengan nama outlet aplikasi.
   - UI saat ini mencocokkan `display_name` dengan `outlet.name` secara lowercase.
   - Jika tidak cocok, cabang tersebut dilewati. Ini perlu dicek agar tidak ada hasil kalkulasi hilang diam-diam.
5. Minimum stock belum dikonfigurasi.
   - Existing backend sudah mengembalikan error `No min stock configured`.
   - Error perlu tetap ditampilkan dengan pesan yang mudah dipahami user.
6. User membuka session yang sudah `sent` atau `completed`.
   - Tombol "Besok" dan kalkulasi otomatis tidak boleh mengubah data.
7. User memilih tanggal lampau.
   - Kalkulasi sebaiknya menggunakan tanggal yang dipilih sebagai referensi stok, kecuali ada business rule berbeda.
8. User memilih tanggal jauh di masa depan.
   - Jangan mengambil stok tanggal masa depan yang belum tersedia.
   - Gunakan tanggal operasional saat ini sebagai referensi atau minta user memilih tanggal referensi.
9. Perbedaan timezone browser dan server.
   - Penentuan `stock_reference_date` sebaiknya dilakukan di backend menggunakan `getReportingDate()` agar konsisten.
10. User mengganti status buka/tutup outlet atau 1 hari/2 hari sebelum "Hitung Otomatis".
    - Perhitungan quantity tetap harus mengikuti status tersebut setelah data stok referensi berhasil didapat.

## 8. Saran Teknis Bagian Code Yang Perlu Dicek atau Direvisi

### Client

1. `client/src/pages/OrderEntry.jsx`
   - Tombol "Besok" ada di sekitar handler `onClick` yang membuat `tomorrow`.
   - `handleDateChange` saat ini mengubah `orderDate` dan mengosongkan `matrix`.
   - `handleRotiAutoFill` saat ini memanggil `previewRotiOrder(orderDate)`.
   - Perlu revisi agar UI menyimpan dua konsep:
     - `orderDate`
     - `stockReferenceDate` atau `rotiReferenceDate`
   - Saat tombol "Besok" diklik, `orderDate` menjadi besok, tetapi `stockReferenceDate` tetap tanggal operasional hari berjalan dari backend atau helper yang konsisten.

2. `client/src/services/rotiTawarService.js`
   - `previewRotiOrder(tanggal)` saat ini hanya mengirim satu query `tanggal`.
   - Perlu dibuat kontrak baru, misalnya:
     - `previewRotiOrder({ orderDate, referenceDate })`
     - endpoint: `/api/roti-tawar/preview?order_date=YYYY-MM-DD&reference_date=YYYY-MM-DD`
   - Hindari nama query `tanggal` yang ambigu karena sekarang ada dua tanggal dengan makna berbeda.

3. `client/src/lib/api.js`
   - `toInputDate()` memakai `new Date().toISOString()`, yang berbasis UTC.
   - Perlu dicek karena aplikasi beroperasi di WITA/Asia-Singapore. Untuk tanggal lokal, helper berbasis UTC bisa menghasilkan tanggal yang tidak sesuai pada jam tertentu.
   - Pertimbangkan helper tanggal lokal atau ambil tanggal operasional dari backend.

### Server

4. `server/routes/rotiTawar.js`
   - Endpoint `/api/roti-tawar/preview` saat ini memakai `req.query.tanggal || getReportingDate()`.
   - Perlu revisi agar menerima `order_date` dan `reference_date`.
   - GAS harus dipanggil menggunakan `reference_date`, bukan `order_date`.
   - Response perlu menyertakan:
     - `order_date`
     - `reference_date`
     - `total_needed`
     - `optimal_order`
     - `bonus`
     - `fulfilled`
     - `branches`
   - Bagian `currentStock = gasRow ? ... : 0` perlu dicek. Jika `gasRow` tidak ada, jangan langsung dianggap stok 0 tanpa validasi/warning.

5. `server/services/reportingDate.js`
   - Sudah ada helper `getReportingDate()` dengan cutoff 03:00 WITA.
   - Jadikan ini sumber utama untuk default `reference_date`.
   - Pertimbangkan menambah helper:
     - `getOperationalToday()`
     - `getOperationalTomorrow()`
     - `resolveRotiReferenceDate(orderDate)`

6. `server/routes/orders.js`
   - Endpoint session tetap memakai `order_date`.
   - Tidak perlu menyimpan `reference_date` ke `order_sessions` jika hanya digunakan untuk preview kalkulasi.
   - Jika audit dibutuhkan, pertimbangkan kolom baru atau metadata untuk mencatat `stock_reference_date` yang dipakai saat auto-fill.

7. `server/services/calculator.js`
   - Perhitungan bonus supplier Roti Tawar ada di sini untuk tahap review/PO.
   - Tidak langsung terkait bug tanggal stok, tetapi perlu dipastikan total Roti Tawar yang masuk ke calculator berasal dari hasil auto-fill yang benar.

8. `supabase/schema.sql`
   - Saat ini belum ada kolom untuk menyimpan tanggal referensi stok.
   - Jika bisnis perlu audit historis, pertimbangkan tabel/kolom tambahan, misalnya:
     - `order_sessions.stock_reference_date`
     - atau `order_request_items.source_reference_date` khusus hasil auto-fill.
   - Jika tidak ada kebutuhan audit, perubahan database bisa dihindari.

## 9. Rekomendasi Kontrak Revisi

### Request

```http
GET /api/roti-tawar/preview?order_date=2026-05-16&reference_date=2026-05-15
```

Jika `reference_date` tidak dikirim:

```text
reference_date = getReportingDate()
```

### Response

```json
{
  "order_date": "2026-05-16",
  "reference_date": "2026-05-15",
  "total_needed": 42,
  "optimal_order": 40,
  "bonus": 2,
  "fulfilled": 42,
  "branches": [
    {
      "inv_cabang_id": "CAB001",
      "display_name": "Buduk",
      "current_stock": 8,
      "min_stock": 20,
      "need": 12
    }
  ],
  "warnings": []
}
```

### Pseudocode Backend

```js
const orderDate = req.query.order_date || getReportingDate();
const referenceDate = req.query.reference_date || getReportingDate();

const gasRes = await fetch(`${GAS_BASE}?action=getDashboard&tanggal=${referenceDate}`);

// Jika data mapping wajib tidak ditemukan, return error/warning.
// Jangan langsung fallback ke current_stock = 0 tanpa sinyal.
```

### Pseudocode Client

```js
const handleTomorrowClick = async () => {
  const tomorrow = getLocalTomorrow();
  const referenceDate = await getOperationalDateFromServer();

  setOrderDate(tomorrow);
  setRotiReferenceDate(referenceDate);
  await loadOrCreateSession(tomorrow);
};

const handleRotiAutoFill = async () => {
  const result = await previewRotiOrder({
    orderDate,
    referenceDate: rotiReferenceDate,
  });
};
```

## 10. Out of Scope

1. Mengubah formula minimum stock per cabang.
2. Mengubah aturan bonus supplier 20 + 1.
3. Mengubah alur review PO, pengiriman email, atau catatan penerimaan.
4. Membuat modul forecasting penjualan roti.
5. Mengubah struktur master data supplier/material/outlet kecuali diperlukan untuk audit tanggal referensi.

