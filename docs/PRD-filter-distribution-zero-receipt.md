# PRD: Sembunyikan Bahan Kosong dari Distribution Listing

## 1. Ringkasan

Dokumen ini mendefinisikan kebutuhan produk untuk merevisi halaman **Distribution Listing** agar bahan yang tidak diterima saat proses **Catat Penerimaan** otomatis tidak tampil di daftar distribusi outlet.

Contoh kasus:

1. Pada input order, outlet **Nusa Kambangan** membutuhkan **Selai Nanas**.
2. Pada halaman **Catat Penerimaan**, admin mengisi **Selai Nanas diterima = 0** karena barang kosong dari supplier.
3. Sistem harus otomatis menyembunyikan **Selai Nanas** dari **Distribution Listing** outlet Nusa Kambangan.
4. Staff distribusi tidak melihat bahan tersebut, sehingga tidak bingung mencari barang yang memang tidak tersedia.

Halaman dan modul yang menjadi fokus:

1. `client/src/pages/PurchaseRecord.jsx`
2. `client/src/pages/DistributionListing.jsx`
3. `server/routes/purchase.js`
4. `server/routes/publicRoutes.js`
5. tabel `order_request_items`
6. tabel `purchase_orders`
7. tabel `purchase_order_items`

## 2. Latar Belakang Masalah

Saat ini **Distribution Listing** menampilkan daftar bahan berdasarkan data order outlet dari `order_request_items` dengan syarat `qty > 0`. Artinya, selama outlet pernah meminta bahan, bahan tersebut akan tetap tampil di listing distribusi.

Masalah muncul ketika barang dari supplier ternyata kosong. Admin sudah mencatat penerimaan dengan `qty_received = 0`, tetapi daftar distribusi masih menampilkan bahan tersebut karena listing belum membaca data aktual penerimaan.

Dampaknya:

1. Staff distribusi mengira bahan tersebut harus disiapkan.
2. Staff harus bertanya ulang ke admin atau gudang.
3. Proses packing menjadi lebih lambat.
4. Listing distribusi tidak lagi merepresentasikan barang yang benar-benar tersedia.
5. Ada risiko staff menandai item sebagai selesai padahal barang tidak ada.

## 3. Tujuan

1. Distribution Listing hanya menampilkan bahan yang tersedia berdasarkan hasil penerimaan.
2. Jika `qty_received = 0`, bahan otomatis hilang dari listing outlet terkait.
3. Data order awal tetap aman dan tidak dihapus.
4. Perubahan di **Catat Penerimaan** langsung tercermin ketika Distribution Listing dimuat ulang.
5. Staff distribusi hanya melihat item yang perlu dan bisa benar-benar disiapkan.
6. Admin tetap bisa melihat selisih penerimaan pada halaman Catat Penerimaan dan laporan.

## 4. Non-Goals

1. Tidak menghapus data dari `order_request_items`.
2. Tidak mengubah qty order awal outlet.
3. Tidak membuat modul inventory stok.
4. Tidak membuat alokasi stok parsial per outlet pada implementasi pertama.
5. Tidak mengubah formula kalkulasi PO.
6. Tidak mengubah alur input order.
7. Tidak membuat approval workflow untuk barang kosong.
8. Tidak mengubah fitur checklist lokal pada Distribution Listing selain menghitung item yang masih tampil.

## 5. Pengguna

### User Utama

Staff distribusi atau operasional outlet yang membuka halaman **Distribution Listing** untuk menyiapkan bahan per outlet.

### User Pendukung

Admin atau operasional gudang yang mencatat penerimaan barang dari supplier pada halaman **Catat Penerimaan**.

### Kebutuhan User

1. Staff distribusi hanya ingin melihat bahan yang benar-benar harus disiapkan.
2. Staff tidak perlu mencari bahan yang sudah diketahui kosong.
3. Admin bisa mencatat barang kosong cukup dengan mengisi `0` pada qty diterima.
4. Sistem otomatis menerjemahkan hasil penerimaan ke listing distribusi.

## 6. Current Behavior

Alur saat ini:

1. User membuat order bahan per outlet di halaman **Input Order**.
2. Sistem menyimpan kebutuhan outlet ke `order_request_items`.
3. PO dibuat per supplier.
4. Admin membuka halaman **Catat Penerimaan**.
5. Jika bahan kosong, admin mengisi `qty_received = 0`.
6. Staff membuka **Distribution Listing**.
7. Backend `GET /api/public/distribution?date=YYYY-MM-DD` mengambil item dari `order_request_items`.
8. Endpoint hanya memfilter `qty > 0`.
9. Bahan yang diterima `0` tetap tampil karena qty order outlet masih lebih dari 0.

Kelemahan current behavior:

1. Distribution Listing memakai qty rencana order, bukan ketersediaan aktual.
2. Data penerimaan tidak mempengaruhi daftar distribusi.
3. Barang kosong tetap muncul.
4. Staff distribusi harus mengandalkan informasi manual di luar sistem.

## 7. Expected Behavior

Setelah revisi:

1. Admin mencatat penerimaan di halaman **Catat Penerimaan**.
2. Jika satu bahan diisi `qty_received = 0`, bahan tersebut dianggap tidak tersedia untuk distribusi.
3. Distribution Listing membaca data penerimaan untuk tanggal/session yang sama.
4. Item outlet dengan material yang total penerimaannya `0` tidak ditampilkan.
5. Jika item sebelumnya sudah dicentang di Distribution Listing lalu kemudian disembunyikan, progress hanya menghitung item yang masih tampil.
6. Jika penerimaan diubah dari `0` menjadi nilai lebih dari `0`, bahan tampil kembali setelah Distribution Listing dimuat ulang.
7. Data order awal tetap ada untuk kebutuhan audit, laporan, dan analisis selisih.

## 8. Business Rules

1. Bahan dengan `qty_received = 0` pada PO terkait harus disembunyikan dari Distribution Listing.
2. Filter dilakukan berdasarkan `material_id` dan `order_session`.
3. Sistem tidak boleh menghapus record `order_request_items`.
4. Sistem hanya menyembunyikan item dari response Distribution Listing.
5. Sumber ketersediaan adalah total `qty_received` dari `purchase_order_items` untuk session terkait.
6. Hanya PO berstatus `received` atau `received_partial` yang dipakai sebagai data penerimaan final.
7. PO berstatus `pending` atau `confirmed` belum dianggap final untuk menentukan barang kosong.
8. Jika belum ada data penerimaan final untuk suatu material, behavior mengikuti keputusan implementasi MVP:
   - rekomendasi: item tetap tampil seperti behavior existing sampai penerimaan dicatat,
   - setelah penerimaan dicatat dan total diterima `0`, item disembunyikan.
9. Jika total `qty_received > 0`, item tetap tampil pada Distribution Listing.
10. Pada MVP, qty yang tampil tetap menggunakan qty order outlet dari `order_request_items`.
11. Pada MVP, partial received belum dialokasikan otomatis per outlet.
12. Item adjustment dengan `source = adjustment` tidak tampil di Distribution Listing kecuali ada aturan alokasi outlet pada fase lanjutan.
13. Jika ada lebih dari satu PO untuk material yang sama dalam session yang sama, sistem memakai total gabungan `qty_received`.
14. Jika semua item pada outlet tersembunyi, outlet menampilkan empty state `Tidak ada bahan untuk outlet ini`.

## 9. Functional Requirements

### 9.1 Catat Penerimaan

1. Admin tetap bisa mengisi `qty_received = 0` untuk item PO awal.
2. Sistem tetap menyimpan nilai `0` sebagai penerimaan valid.
3. PO menjadi `received_partial` jika ada item ordered yang diterima kurang dari qty dipesan.
4. Catatan otomatis selisih penerimaan tetap dibuat seperti behavior existing.
5. Tidak perlu tombol tambahan untuk menyembunyikan item dari distribusi.
6. Perubahan hide/show sepenuhnya mengikuti nilai `qty_received`.

### 9.2 Distribution Listing API

Endpoint existing:

```http
GET /api/public/distribution?date=YYYY-MM-DD
```

Response harus memfilter item berdasarkan data penerimaan:

1. Ambil session berdasarkan `order_date`.
2. Ambil semua `order_request_items` dengan `qty > 0` seperti behavior existing.
3. Ambil ringkasan penerimaan dari `purchase_order_items` yang join ke `purchase_orders` pada session yang sama.
4. Buat map availability per `material_id`:
   - `total_received`,
   - `has_final_receipt`.
5. Saat membentuk list outlet:
   - jika `has_final_receipt = true` dan `total_received <= 0`, jangan masukkan item tersebut,
   - jika `total_received > 0`, masukkan item seperti biasa,
   - jika `has_final_receipt = false`, ikuti behavior existing untuk menjaga kompatibilitas.
6. Response outlet tidak perlu mengirim item yang disembunyikan.
7. Response boleh menambahkan metadata opsional untuk audit/debug:

```json
{
  "date": "2026-05-16",
  "session": {},
  "outlets": [],
  "availability_applied": true
}
```

### 9.3 Distribution Listing UI

1. UI tidak perlu menampilkan bahan yang disembunyikan.
2. Jumlah item pada badge outlet mengikuti jumlah item yang tampil.
3. Progress pengecekan menghitung item yang tampil saja.
4. Jika semua item outlet tersembunyi, tampilkan empty state existing:
   - `Tidak ada bahan untuk outlet ini`.
5. Checklist localStorage untuk item yang hilang tidak perlu dihapus secara fisik, tetapi tidak boleh mempengaruhi progress.
6. Saat user mengganti tanggal atau reload halaman, filter tetap konsisten.

### 9.4 Admin Visibility

1. Halaman Catat Penerimaan tetap menampilkan item dengan `qty_received = 0`.
2. Admin tetap bisa membuka ulang PO dan melihat bahan mana yang kosong.
3. Laporan penerimaan tetap mencatat selisih.
4. Distribution Listing adalah satu-satunya tempat item tersebut disembunyikan untuk kebutuhan kerja staff.

## 10. UX Requirements

1. Staff distribusi tidak perlu melihat label teknis seperti `qty_received`, `partial`, atau `source`.
2. Bahan kosong tidak tampil sama sekali agar daftar tetap bersih.
3. Empty state harus tetap singkat dan jelas.
4. Tidak perlu menampilkan pesan panjang tentang bahan disembunyikan di halaman publik.
5. Jika di kemudian hari perlu transparansi, metadata barang kosong sebaiknya tampil hanya di halaman admin, bukan di listing staff.

## 11. Data Requirements

Tidak ada perubahan struktur database wajib untuk MVP.

Data yang digunakan:

1. `order_sessions.id`
2. `order_sessions.order_date`
3. `order_request_items.session_id`
4. `order_request_items.outlet_id`
5. `order_request_items.material_id`
6. `order_request_items.qty`
7. `purchase_orders.session_id`
8. `purchase_orders.status`
9. `purchase_order_items.material_id`
10. `purchase_order_items.qty_received`
11. `purchase_order_items.source`

Query agregasi yang dibutuhkan secara konsep:

```sql
SELECT
  poi.material_id,
  SUM(COALESCE(poi.qty_received, 0)) AS total_received,
  COUNT(*) AS receipt_item_count
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.po_id
WHERE po.session_id = :session_id
  AND po.status IN ('received', 'received_partial')
  AND COALESCE(poi.source, 'ordered') = 'ordered'
GROUP BY poi.material_id;
```

Catatan:

1. Gunakan `source = ordered` untuk filter ketersediaan order awal.
2. Item `source = adjustment` tidak digunakan untuk menentukan listing outlet pada MVP karena belum punya alokasi outlet.
3. Jika kolom `source` belum ada di database produksi, migration dari PRD adjustment penerimaan harus sudah diterapkan atau query harus aman dengan default ordered.

## 12. Acceptance Criteria

1. Admin dapat mencatat penerimaan bahan dengan `qty_received = 0`.
2. PO tersimpan tanpa error.
3. PO dengan item kosong menjadi `received_partial`.
4. Distribution Listing tanggal yang sama tidak menampilkan bahan yang total diterimanya `0`.
5. Contoh: Selai Nanas untuk outlet Nusa Kambangan hilang dari listing jika Selai Nanas diterima `0`.
6. Bahan lain pada outlet yang sama tetap tampil.
7. Jika Selai Nanas diubah menjadi diterima lebih dari `0`, Selai Nanas tampil kembali setelah reload.
8. Data `order_request_items` Selai Nanas tidak terhapus dari database.
9. Progress checklist hanya menghitung item yang tampil.
10. Jika semua item outlet disembunyikan, UI menampilkan `Tidak ada bahan untuk outlet ini`.
11. Distribution Listing tetap berjalan untuk tanggal yang belum punya penerimaan final.
12. Build frontend berhasil.
13. Tidak ada error JavaScript di halaman Distribution Listing.
14. Endpoint public distribution tetap merespons dalam format yang kompatibel dengan UI existing.

## 13. Edge Cases

1. Material diminta oleh banyak outlet, tetapi diterima `0`.
   - Material disembunyikan dari semua outlet pada session tersebut.

2. Material diminta oleh banyak outlet, diterima sebagian lebih dari `0`.
   - MVP: material tetap tampil di semua outlet sesuai qty order.
   - Phase lanjutan: sistem perlu alokasi partial per outlet.

3. PO belum dicatat penerimaannya.
   - MVP rekomendasi: Distribution Listing tetap menampilkan order seperti behavior existing.

4. Sebagian supplier sudah diterima, sebagian belum.
   - Material dari PO yang sudah final mengikuti filter penerimaan.
   - Material dari PO yang belum final mengikuti behavior existing.

5. Admin salah input `0`, lalu mengoreksi menjadi `5`.
   - Item tampil kembali setelah data disimpan dan listing direload.

6. Admin reset PO.
   - Karena data penerimaan kembali pending/null, listing kembali mengikuti behavior sebelum penerimaan final.

7. Item adjustment diterima tetapi tidak ada di order outlet.
   - Tidak tampil di Distribution Listing pada MVP.

8. `qty_received` null.
   - Tidak dianggap sebagai `0` final kecuali PO sudah berstatus final dan business rule memutuskan null sebagai tidak diterima.

9. Material punya variant/brand berbeda.
   - Filter MVP tetap berdasarkan `material_id`, bukan variant.

10. Bahan sudah dicentang di localStorage lalu kemudian disembunyikan.
    - Checklist lama diabaikan karena item tidak masuk daftar tampil.

## 14. Technical Recommendation

### 14.1 Backend

Perubahan utama dilakukan di `server/routes/publicRoutes.js`.

Rekomendasi implementasi:

1. Setelah session ditemukan, ambil `order_request_items` seperti existing.
2. Tambahkan query ke `purchase_orders` dan `purchase_order_items` untuk session tersebut.
3. Buat helper:

```js
function buildAvailabilityMap(receiptItems) {
  return receiptItems.reduce((map, item) => {
    const materialId = item.material_id;
    if (!map[materialId]) {
      map[materialId] = { total_received: 0, has_final_receipt: false };
    }
    map[materialId].total_received += Number(item.qty_received || 0);
    map[materialId].has_final_receipt = true;
    return map;
  }, {});
}
```

4. Saat loop item distribusi, skip item jika:

```js
const availability = availabilityMap[item.material_id];
if (availability?.has_final_receipt && availability.total_received <= 0) {
  return;
}
```

5. Pastikan item dengan material yang belum punya penerimaan final tetap masuk.
6. Jangan ubah struktur response utama agar frontend existing tidak rusak.

### 14.2 Frontend

Perubahan frontend minimal di `client/src/pages/DistributionListing.jsx`.

Rekomendasi:

1. Tidak perlu filter tambahan di frontend jika backend sudah benar.
2. Pastikan empty state tetap muncul ketika `items.length === 0`.
3. Pastikan `checkedCount`, `allDone`, dan `progressPct` dihitung dari item yang sudah difilter backend.
4. Tidak perlu menghapus localStorage checklist lama.

## 15. QA Checklist

### Smoke Test

1. Buat order untuk tanggal tertentu.
2. Pastikan ada bahan Selai Nanas untuk outlet Nusa Kambangan.
3. Buka Catat Penerimaan.
4. Isi Selai Nanas `qty_received = 0`.
5. Simpan penerimaan.
6. Buka Distribution Listing tanggal yang sama.
7. Pilih outlet Nusa Kambangan.
8. Pastikan Selai Nanas tidak tampil.
9. Pastikan bahan lain tetap tampil.

### Koreksi Penerimaan

1. Buka lagi PO yang sama.
2. Ubah Selai Nanas dari `0` menjadi `1`.
3. Simpan penerimaan.
4. Reload Distribution Listing.
5. Pastikan Selai Nanas tampil kembali.

### Multi Outlet

1. Buat Selai Nanas diminta oleh dua outlet.
2. Catat Selai Nanas diterima `0`.
3. Buka Distribution Listing untuk dua outlet tersebut.
4. Pastikan Selai Nanas hilang dari keduanya.

### Belum Terima Barang

1. Buat order baru.
2. Jangan catat penerimaan.
3. Buka Distribution Listing.
4. Pastikan behavior tetap sesuai keputusan MVP dan tidak error.

### Reset PO

1. Catat bahan diterima `0`.
2. Pastikan item hilang dari Distribution Listing.
3. Reset PO ke pending.
4. Reload Distribution Listing.
5. Pastikan behavior kembali sesuai kondisi belum ada penerimaan final.

## 16. Success Metrics

1. Staff distribusi tidak lagi melihat bahan yang kosong.
2. Pertanyaan manual dari staff ke admin terkait barang kosong berkurang.
3. Checklist distribusi lebih akurat.
4. Admin cukup input `0` di Catat Penerimaan tanpa perlu mengubah order outlet.
5. Data order awal tetap tersedia untuk audit selisih.

## 17. Rekomendasi Tahapan Implementasi

### Phase 1: Backend Filter

1. Tambahkan agregasi penerimaan per material di `GET /api/public/distribution`.
2. Filter item dengan `total_received <= 0` jika sudah ada penerimaan final.
3. Pertahankan response shape existing.

### Phase 2: QA UI

1. Validasi Distribution Listing untuk outlet yang itemnya berkurang.
2. Validasi empty state ketika semua item tersembunyi.
3. Validasi progress checklist.

### Phase 3: Partial Received Lanjutan

1. Tentukan aturan alokasi stok parsial per outlet.
2. Pilihan aturan:
   - manual allocation oleh admin,
   - prioritas outlet tertentu,
   - proporsional berdasarkan qty order,
   - first come first served berdasarkan urutan outlet.
3. Setelah aturan dipilih, update Distribution Listing agar qty tampil mengikuti alokasi aktual, bukan hanya qty order.

## 18. Out of Scope untuk MVP

1. Alokasi stok parsial per outlet.
2. Pengaturan prioritas outlet.
3. Tampilan daftar bahan kosong untuk staff.
4. Notifikasi otomatis ke outlet saat bahan kosong.
5. Audit log khusus untuk item yang disembunyikan.
6. Perubahan database untuk inventory.
