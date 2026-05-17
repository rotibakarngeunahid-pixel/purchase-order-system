# PRD: Fitur Cek Hari Libur Cabang pada Order Roti

## 1. Background / Masalah

Saat ini sistem order roti digunakan untuk beberapa cabang/outlet dan proses order roti dilakukan setiap 2 hari sekali. Dalam kondisi normal, sistem menghitung kebutuhan roti untuk 2 hari agar stok cabang cukup sampai periode order berikutnya.

Masalah muncul ketika besok ada cabang yang libur, tetapi informasi hari libur tersebut belum ikut diperiksa secara otomatis saat owner/admin melakukan order roti. Akibatnya, sistem tetap menghitung kebutuhan roti untuk 2 hari, padahal cabang tersebut hanya membutuhkan stok untuk 1 hari karena besok tidak beroperasi.

Dampak operasional:

- Quantity order roti bisa lebih besar dari kebutuhan sebenarnya.
- Stok roti di cabang menjadi berlebih.
- Risiko roti tidak terjual dan berjamur meningkat.
- Owner/admin harus mengingat hari libur cabang secara manual.
- Kesalahan pada satu cabang bisa terjadi tanpa memengaruhi cabang lain, sehingga sistem perlu mendukung pengaturan libur per cabang, bukan global.

Asumsi:

- Istilah "cabang" pada kebutuhan bisnis dapat dipetakan ke entity "outlet" jika codebase existing menggunakan istilah outlet.
- Default periode order roti existing adalah 2 hari.
- Perhitungan 1 hari/2 hari sudah ada atau dapat ditambahkan sebagai parameter kalkulasi roti tanpa membuat ulang modul order dari nol.

## 2. Tujuan

Tujuan utama fitur ini adalah membuat sistem order roti mampu mengecek hari libur cabang secara otomatis saat order dibuat, sehingga jumlah roti yang dihitung sesuai kebutuhan operasional cabang.

Target hasil:

- Owner/admin dapat mengatur tanggal libur untuk masing-masing cabang.
- Saat order roti dibuat, sistem otomatis mengecek apakah tanggal besok untuk cabang tersebut termasuk hari libur.
- Jika besok cabang libur, sistem otomatis menghitung kebutuhan roti hanya untuk 1 hari.
- Jika cabang tetap buka meskipun tercatat libur, owner/admin dapat melakukan override agar sistem tetap menghitung kebutuhan 2 hari.
- Informasi libur dan override terlihat jelas di halaman order agar mengurangi risiko salah klik.

## 3. Scope

### In Scope

- Halaman/menu pengaturan hari libur cabang.
- CRUD data hari libur per cabang:
  - tambah tanggal libur,
  - lihat daftar tanggal libur,
  - ubah catatan/status tanggal libur,
  - hapus/nonaktifkan tanggal libur.
- Validasi agar tanggal libur tidak duplikat untuk cabang yang sama.
- Cek otomatis tanggal besok berdasarkan tanggal order.
- Integrasi cek hari libur dengan proses order roti.
- Perubahan otomatis jumlah hari perhitungan dari 2 hari menjadi 1 hari jika besok libur.
- Warning/informasi jelas di halaman order roti saat besok cabang libur.
- Override manual per cabang/per transaksi order.
- Penyimpanan metadata hasil deteksi hari libur dan override pada transaksi/order.
- Dukungan banyak cabang dengan konfigurasi libur yang spesifik per cabang.
- Manual testing untuk flow normal, flow libur, flow override, dan flow cabang berbeda.

### Out of Scope

- Forecasting kebutuhan roti berbasis histori penjualan.
- Perubahan formula utama kebutuhan roti di luar parameter jumlah hari perhitungan.
- Integrasi kalender nasional otomatis dari API eksternal.
- Pengaturan libur global yang berlaku otomatis untuk semua cabang.
- Perubahan data stok historis karena cabang libur.
- Modul approval bertingkat untuk override.
- Notifikasi WhatsApp/email khusus untuk cabang libur.
- Redesign total halaman order di luar komponen yang dibutuhkan untuk warning dan override.

## 4. User Role

### Owner/Admin

Owner/admin adalah user utama fitur ini.

Hak dan tanggung jawab:

- Melihat daftar hari libur semua cabang.
- Menambahkan tanggal libur untuk cabang tertentu.
- Mengubah atau menghapus data hari libur.
- Melakukan order roti.
- Melihat warning saat besok cabang libur.
- Melakukan override jika cabang tetap buka meskipun tercatat libur.

### Staff

Staff relevan jika sistem existing mengizinkan staff mengakses halaman order atau data cabang.

Hak yang disarankan:

- Melihat informasi hari libur cabang jika diperlukan untuk operasional.
- Melihat warning pada halaman order jika staff diberi akses membuat order.
- Tidak dapat menambah, mengubah, atau menghapus data hari libur kecuali ada permission khusus.
- Tidak dapat melakukan override kecuali role staff memang diberi permission order override oleh owner/admin.

Asumsi:

- Jika codebase existing belum memiliki role staff yang aktif, implementasi awal cukup membatasi fitur CRUD dan override untuk owner/admin.

## 5. User Flow

### Mengatur Hari Libur Cabang

1. Owner/admin membuka menu pengaturan hari libur cabang.
2. Sistem menampilkan filter/pilihan cabang.
3. Owner/admin memilih cabang.
4. Sistem menampilkan daftar tanggal libur cabang tersebut.
5. Owner/admin klik tombol tambah tanggal libur.
6. Owner/admin mengisi:
   - cabang,
   - tanggal libur,
   - nama/catatan libur opsional.
7. Sistem memvalidasi apakah tanggal tersebut sudah ada untuk cabang yang sama.
8. Jika valid, sistem menyimpan data hari libur.
9. Sistem menampilkan tanggal libur baru pada daftar/kalender.

### Melakukan Order Roti Normal

1. Owner/admin membuka halaman order roti.
2. Owner/admin memilih tanggal order.
3. Sistem memuat daftar cabang dan data order.
4. Untuk setiap cabang, sistem menghitung tanggal besok berdasarkan tanggal order.
5. Sistem mengecek apakah tanggal besok adalah hari libur cabang tersebut.
6. Jika tanggal besok bukan hari libur, sistem memakai default perhitungan 2 hari.
7. Owner/admin menjalankan proses hitung order roti.
8. Sistem menghitung kebutuhan roti untuk 2 hari.
9. Owner/admin melanjutkan review dan submit order seperti biasa.

### Melakukan Order Roti Ketika Besok Libur

1. Owner/admin membuka halaman order roti.
2. Owner/admin memilih tanggal order.
3. Sistem mengecek tanggal besok untuk setiap cabang.
4. Jika besok tercatat sebagai hari libur cabang tertentu, sistem menampilkan warning pada cabang tersebut.
5. Warning minimal menjelaskan:
   - nama cabang,
   - tanggal libur yang terdeteksi,
   - catatan/nama libur jika tersedia,
   - perhitungan otomatis diubah menjadi 1 hari.
6. Sistem mengubah parameter kalkulasi cabang tersebut dari 2 hari menjadi 1 hari.
7. Owner/admin menjalankan hitung order roti.
8. Sistem menghitung kebutuhan roti hanya untuk 1 hari pada cabang yang besok libur.
9. Cabang lain yang tidak libur tetap dihitung 2 hari.

### Melakukan Override Ketika Cabang Tetap Buka

1. Sistem menampilkan warning bahwa besok cabang tercatat libur.
2. Owner/admin mengetahui bahwa cabang tersebut tetap buka.
3. Owner/admin mengaktifkan toggle/checkbox override pada cabang tersebut.
4. Sistem menampilkan confirmation modal sebelum override diterapkan.
5. Owner/admin mengonfirmasi override.
6. Sistem menandai order cabang tersebut sebagai override aktif.
7. Sistem mengembalikan jumlah hari perhitungan cabang tersebut menjadi 2 hari.
8. Metadata override disimpan pada transaksi/order.
9. Data kalender hari libur tidak berubah.
10. Override hanya berlaku untuk order/transaksi tersebut.

## 6. Functional Requirements

- FR-001: Sistem harus menyediakan menu/halaman pengaturan hari libur cabang.
- FR-002: Sistem harus menampilkan daftar cabang pada halaman pengaturan hari libur.
- FR-003: Owner/admin harus dapat menambahkan tanggal libur untuk cabang tertentu.
- FR-004: Form tambah tanggal libur minimal memiliki input cabang, tanggal libur, dan catatan/nama libur opsional.
- FR-005: Sistem harus menyimpan hari libur secara spesifik per cabang, bukan global untuk semua cabang.
- FR-006: Owner/admin harus dapat melihat daftar tanggal libur berdasarkan cabang.
- FR-007: Owner/admin harus dapat mengubah data hari libur, minimal catatan/nama libur dan status aktif.
- FR-008: Owner/admin harus dapat menghapus atau menonaktifkan data hari libur.
- FR-009: Sistem harus mencegah tanggal libur duplikat untuk kombinasi cabang dan tanggal yang sama.
- FR-010: Sistem harus mendukung filter daftar hari libur berdasarkan cabang, rentang tanggal, dan status aktif jika memungkinkan.
- FR-011: Saat halaman order roti dibuka atau tanggal order berubah, sistem harus mengecek tanggal besok berdasarkan tanggal order.
- FR-012: Sistem harus mengecek hari libur untuk setiap cabang yang terlibat dalam order.
- FR-013: Jika tanggal besok bukan hari libur cabang, sistem harus memakai default perhitungan 2 hari.
- FR-014: Jika tanggal besok adalah hari libur cabang, sistem harus menampilkan warning/informasi pada cabang tersebut di halaman order roti.
- FR-015: Jika tanggal besok adalah hari libur cabang, sistem harus otomatis mengubah jumlah hari perhitungan cabang tersebut dari 2 hari menjadi 1 hari.
- FR-016: Perubahan 2 hari menjadi 1 hari hanya berlaku untuk cabang yang besok libur.
- FR-017: Cabang lain yang tidak libur tidak boleh ikut berubah menjadi 1 hari.
- FR-018: Owner/admin harus dapat melakukan override pada cabang yang besok tercatat libur.
- FR-019: Jika override aktif, sistem harus menghitung kebutuhan roti untuk 2 hari meskipun tanggal besok tercatat libur.
- FR-020: Sistem harus menampilkan status override secara jelas di UI agar owner/admin tahu cabang tersebut tetap dihitung 2 hari.
- FR-021: Sistem harus menampilkan confirmation modal sebelum override diterapkan.
- FR-022: Override harus disimpan sebagai metadata order/transaksi, bukan mengubah data kalender hari libur.
- FR-023: Sistem harus menyimpan metadata apakah hari libur terdeteksi saat order dibuat.
- FR-024: Sistem harus menyimpan jumlah hari perhitungan final yang digunakan pada order.
- FR-025: Sistem harus tetap mengizinkan input quantity manual sesuai behavior existing.
- FR-026: Sistem harus tetap memakai pattern dan endpoint existing jika sudah ada modul order/kalkulasi roti.
- FR-027: Sistem harus memberikan pesan error yang jelas jika data hari libur gagal dimuat atau gagal disimpan.
- FR-028: Sistem harus menjaga kompatibilitas dengan order lama yang belum memiliki metadata hari libur.

## 7. Business Rules

- BR-001: Default order roti adalah untuk 2 hari.
- BR-002: Hari libur berlaku per cabang, bukan global untuk semua cabang.
- BR-003: Tanggal yang dicek adalah tanggal besok berdasarkan tanggal order, bukan selalu tanggal kalender hari ini.
- BR-004: Jika tanggal besok adalah hari libur cabang, sistem otomatis menghitung order roti cabang tersebut untuk 1 hari.
- BR-005: Jika tanggal besok bukan hari libur cabang, sistem menghitung order roti cabang tersebut untuk 2 hari.
- BR-006: Jika override aktif, sistem tetap menghitung order roti untuk 2 hari meskipun tanggal besok tercatat libur.
- BR-007: Override hanya berlaku untuk transaksi/order tersebut.
- BR-008: Override tidak boleh mengubah, menghapus, atau menonaktifkan data kalender hari libur.
- BR-009: Sistem tidak boleh mengubah data stok historis secara langsung hanya karena ada hari libur.
- BR-010: Sistem boleh menyimpan metadata holiday detection pada order untuk kebutuhan audit dan review.
- BR-011: Jika data hari libur tidak tersedia atau belum diatur, sistem harus fallback ke behavior normal 2 hari.
- BR-012: Jika satu cabang libur dan cabang lain tidak libur, hanya cabang yang libur yang dihitung 1 hari.
- BR-013: Tanggal libur yang berstatus tidak aktif tidak boleh dianggap sebagai hari libur saat order.
- BR-014: Tanggal libur duplikat untuk cabang dan tanggal yang sama tidak boleh dibuat.
- BR-015: Perubahan hari libur setelah order dibuat tidak boleh otomatis mengubah order lama yang sudah tersimpan/submitted.
- BR-016: Jika order draft dihitung ulang, sistem boleh mengecek ulang hari libur berdasarkan data terbaru selama order belum final/submitted.

## 8. Edge Cases

- Data hari libur belum diatur:
  - Sistem tidak menemukan tanggal libur untuk cabang.
  - Expected: sistem memakai default 2 hari tanpa warning libur.

- Cabang tidak ditemukan:
  - `branch_id`/`outlet_id` pada request tidak valid atau sudah tidak aktif.
  - Expected: sistem menampilkan error validasi dan tidak menyimpan hari libur untuk cabang tersebut.

- Tanggal libur dobel:
  - Owner/admin mencoba menambahkan tanggal libur yang sama untuk cabang yang sama.
  - Expected: sistem menolak input dan menampilkan pesan bahwa tanggal libur sudah ada.

- Tanggal libur sama untuk cabang berbeda:
  - Dua cabang memiliki libur pada tanggal yang sama.
  - Expected: sistem mengizinkan karena hari libur berlaku per cabang.

- User lupa override:
  - Besok tercatat libur, tetapi cabang sebenarnya buka dan user tidak mengaktifkan override.
  - Expected: sistem menghitung 1 hari sesuai data kalender; warning harus cukup jelas agar user sadar sebelum submit.

- Order dibuat untuk tanggal selain hari ini:
  - User membuat order untuk tanggal masa depan atau tanggal tertentu.
  - Expected: sistem mengecek `order_date + 1 hari`, bukan `today + 1 hari`.

- Zona waktu/tanggal berganti malam:
  - User membuat order mendekati tengah malam.
  - Expected: sistem menggunakan timezone lokal Indonesia yang konsisten antara frontend dan backend.

- Data holiday berubah saat halaman order sudah terbuka:
  - Admin lain menambah/menghapus hari libur saat user sedang membuat order.
  - Expected: sistem mengecek ulang saat hitung otomatis atau saat submit/review agar metadata final akurat.

- Holiday inactive:
  - Ada data hari libur untuk besok tetapi `is_active = false`.
  - Expected: sistem tidak menganggap tanggal tersebut sebagai libur.

- Order lama belum punya metadata:
  - Order historis dibuat sebelum fitur ini ada.
  - Expected: sistem tetap bisa membuka order lama tanpa error dan menampilkan field metadata sebagai kosong/default.

- Override aktif lalu user ubah tanggal order:
  - User sudah override, kemudian mengganti tanggal order.
  - Expected: sistem reset atau validasi ulang override berdasarkan tanggal order baru.

## 9. UI/UX Requirements

### Halaman Pengaturan Hari Libur

- Harus tersedia menu/halaman khusus untuk pengaturan hari libur cabang.
- Halaman harus menyediakan pilihan cabang.
- Halaman harus menampilkan daftar atau kalender tanggal libur cabang yang dipilih.
- Daftar minimal menampilkan:
  - tanggal libur,
  - nama/catatan libur,
  - status aktif,
  - aksi edit,
  - aksi hapus/nonaktifkan.
- Form tambah/edit tanggal libur harus sederhana dan jelas.
- Jika belum ada data libur, tampilkan empty state seperti "Belum ada hari libur untuk cabang ini."
- Saat data sedang dimuat, tampilkan loading state.
- Jika terjadi error, tampilkan error state dengan opsi coba lagi.

### Form Tambah Tanggal Libur

- Field wajib:
  - Cabang.
  - Tanggal libur.
- Field opsional:
  - Nama/catatan libur.
- Validasi:
  - Cabang wajib dipilih.
  - Tanggal wajib diisi.
  - Tanggal duplikat untuk cabang yang sama harus ditolak.
- Setelah berhasil menyimpan, form harus reset atau modal tertutup sesuai pattern UI existing.

### Warning di Halaman Order Roti

- Jika besok cabang libur, sistem harus menampilkan warning yang mudah terlihat pada area cabang tersebut.
- Warning minimal berisi:
  - "Besok cabang ini tercatat libur."
  - Tanggal libur.
  - Catatan/nama libur jika ada.
  - "Perhitungan otomatis menggunakan 1 hari."
- Warning tidak boleh menghalangi user untuk input manual.
- Warning harus tampil hanya pada cabang yang relevan.

### Override UI

- Override harus berupa toggle/checkbox yang jelas, misalnya "Override: cabang tetap buka, hitung 2 hari".
- Label override harus menjelaskan konsekuensinya.
- Saat override diaktifkan, tampilkan confirmation modal.
- Confirmation modal minimal berisi:
  - nama cabang,
  - tanggal libur yang akan dioverride,
  - informasi bahwa order akan dihitung 2 hari,
  - informasi bahwa kalender libur tidak berubah.
- Status override aktif harus terlihat setelah dikonfirmasi, misalnya badge "Override aktif - dihitung 2 hari".
- Override harus bisa dibatalkan selama order masih draft/belum submitted.

### State yang Wajib Ada

- Empty state untuk daftar libur kosong.
- Loading state saat mengambil data cabang/hari libur.
- Error state saat gagal memuat/menyimpan/menghapus data.
- Disabled state untuk tombol submit saat form tidak valid.
- Confirmation state untuk aksi hapus dan override.

## 10. Data Requirements

### Tabel/Collection: `branch_holidays`

Field yang disarankan:

| Field | Type | Required | Keterangan |
| --- | --- | --- | --- |
| `id` | uuid/bigint | Ya | Primary key. |
| `branch_id` | uuid/bigint | Ya | Referensi ke cabang/outlet. |
| `holiday_date` | date | Ya | Tanggal libur cabang. Simpan sebagai date tanpa jam. |
| `holiday_name` | text/varchar | Tidak | Nama hari libur, misalnya "Renovasi", "Libur lokal", atau "Event internal". |
| `note` | text | Tidak | Catatan tambahan jika dibutuhkan. |
| `is_active` | boolean | Ya | Default `true`. Jika `false`, tidak dianggap libur. |
| `created_by` | uuid/bigint | Tidak | User yang membuat data. |
| `updated_by` | uuid/bigint | Tidak | User terakhir yang mengubah data. |
| `created_at` | timestamp | Ya | Waktu data dibuat. |
| `updated_at` | timestamp | Ya | Waktu data terakhir diubah. |

Constraint yang disarankan:

- Unique aktif per cabang dan tanggal:
  - `branch_id + holiday_date` harus unik untuk data aktif.
  - Jika database tidak mendukung partial unique index, gunakan validasi aplikasi sebelum insert/update.
- Index:
  - `branch_id`
  - `holiday_date`
  - kombinasi `branch_id, holiday_date, is_active`

Asumsi:

- Jika tabel existing memakai nama `outlets`, maka `branch_id` dapat diimplementasikan sebagai `outlet_id` selama mapping konsisten di backend dan frontend.

### Metadata pada Transaksi/Order

Jika struktur order existing mendukung metadata per cabang/item, tambahkan field berikut pada level yang paling sesuai dengan model data saat ini.

Field yang disarankan:

| Field | Type | Required | Keterangan |
| --- | --- | --- | --- |
| `holiday_detected` | boolean | Ya | `true` jika tanggal besok terdeteksi libur saat order dihitung. |
| `override_holiday` | boolean | Ya | `true` jika user memilih override. |
| `calculation_days` | integer | Ya | Jumlah hari final yang dipakai kalkulasi, biasanya `1` atau `2`. |
| `holiday_date_detected` | date | Tidak | Tanggal libur yang terdeteksi, yaitu `order_date + 1 hari`. |
| `holiday_name_detected` | text/varchar | Tidak | Nama/catatan libur saat order dibuat. |
| `holiday_id_detected` | uuid/bigint | Tidak | Referensi ke data libur jika tersedia. |
| `holiday_override_by` | uuid/bigint | Tidak | User yang melakukan override. |
| `holiday_override_at` | timestamp | Tidak | Waktu override dilakukan. |

Catatan:

- Jika order terdiri dari banyak cabang, metadata ini sebaiknya berada pada level order item/detail per cabang, bukan hanya header order global.
- Jika existing order matrix menyimpan quantity per material dan cabang, metadata dapat disimpan pada record detail cabang/material atau pada struktur tambahan per cabang/session.

## 11. Permission & Access Control

- Melihat hari libur:
  - Owner/admin boleh melihat semua hari libur cabang.
  - Staff boleh melihat jika role existing membutuhkan akses operasional.

- Menambah hari libur:
  - Hanya owner/admin.

- Mengubah hari libur:
  - Hanya owner/admin.

- Menghapus/menonaktifkan hari libur:
  - Hanya owner/admin.
  - Aksi hapus harus memakai confirmation modal.

- Melakukan override:
  - Owner/admin boleh melakukan override.
  - Staff hanya boleh override jika permission existing memang mengizinkan staff membuat keputusan order.

- Audit:
  - Sistem sebaiknya menyimpan `created_by`, `updated_by`, dan metadata override agar keputusan operasional dapat ditelusuri.

Asumsi:

- Jika sistem saat ini belum memiliki permission granular, implementasi awal dapat memakai role admin/owner existing untuk semua aksi mutasi dan override.

## 12. Acceptance Criteria

- [ ] Sistem menyediakan halaman/menu pengaturan hari libur cabang.
- [ ] Owner/admin dapat memilih cabang pada halaman pengaturan hari libur.
- [ ] Sistem bisa menyimpan hari libur per cabang.
- [ ] Sistem bisa menampilkan daftar hari libur per cabang.
- [ ] Owner/admin bisa mengubah data hari libur.
- [ ] Owner/admin bisa menghapus atau menonaktifkan data hari libur.
- [ ] Sistem menolak tanggal libur duplikat untuk cabang yang sama.
- [ ] Sistem mengizinkan tanggal libur yang sama untuk cabang berbeda.
- [ ] Sistem bisa mendeteksi besok libur saat order roti dibuat.
- [ ] Sistem mengecek tanggal libur berdasarkan `order_date + 1 hari`.
- [ ] Sistem otomatis menghitung order untuk 1 hari jika besok libur.
- [ ] Sistem tetap menghitung order untuk 2 hari jika besok bukan libur.
- [ ] Sistem tetap menghitung 2 hari jika override aktif.
- [ ] UI menampilkan warning yang jelas ketika besok cabang libur.
- [ ] Warning menampilkan cabang, tanggal libur, dan efek ke perhitungan.
- [ ] Override terlihat jelas di UI dan memakai confirmation modal.
- [ ] Override hanya berlaku untuk order saat itu.
- [ ] Override tidak mengubah data kalender hari libur.
- [ ] Perhitungan cabang lain tidak ikut terpengaruh oleh hari libur satu cabang.
- [ ] Sistem menyimpan metadata `holiday_detected`, `override_holiday`, `calculation_days`, dan `holiday_date_detected` pada order atau detail order.
- [ ] Order lama tanpa metadata holiday tetap bisa dibuka tanpa error.
- [ ] Jika data hari libur gagal dimuat, sistem menampilkan error state yang jelas.
- [ ] Jika belum ada hari libur, sistem menampilkan empty state yang jelas.
- [ ] Manual quantity tetap bisa diedit sesuai behavior existing.

## 13. Testing Scenario

- Test Case: Order normal tanpa hari libur
  - Step:
    1. Pastikan cabang A tidak memiliki hari libur pada `order_date + 1 hari`.
    2. Buka halaman order roti.
    3. Pilih `order_date`.
    4. Jalankan hitung otomatis roti.
  - Expected Result:
    - Tidak ada warning libur untuk cabang A.
    - `calculation_days` cabang A bernilai `2`.
    - Quantity dihitung memakai kebutuhan 2 hari.

- Test Case: Order saat besok libur
  - Step:
    1. Tambahkan hari libur cabang A pada `order_date + 1 hari`.
    2. Buka halaman order roti.
    3. Pilih `order_date`.
    4. Jalankan hitung otomatis roti.
  - Expected Result:
    - Warning libur tampil untuk cabang A.
    - `holiday_detected` bernilai `true`.
    - `holiday_date_detected` berisi tanggal libur yang benar.
    - `calculation_days` cabang A bernilai `1`.
    - Quantity dihitung memakai kebutuhan 1 hari.

- Test Case: Override hari libur
  - Step:
    1. Tambahkan hari libur cabang A pada `order_date + 1 hari`.
    2. Buka halaman order roti.
    3. Aktifkan override pada cabang A.
    4. Konfirmasi override pada modal.
    5. Jalankan hitung otomatis roti.
  - Expected Result:
    - Status override aktif tampil jelas.
    - `holiday_detected` bernilai `true`.
    - `override_holiday` bernilai `true`.
    - `calculation_days` cabang A bernilai `2`.
    - Quantity dihitung memakai kebutuhan 2 hari.
    - Data pada `branch_holidays` tidak berubah.

- Test Case: Cabang berbeda tidak ikut terpengaruh
  - Step:
    1. Tambahkan hari libur cabang A pada `order_date + 1 hari`.
    2. Pastikan cabang B tidak memiliki hari libur pada tanggal tersebut.
    3. Buka halaman order roti.
    4. Jalankan hitung otomatis roti.
  - Expected Result:
    - Cabang A menampilkan warning dan dihitung 1 hari.
    - Cabang B tidak menampilkan warning dan tetap dihitung 2 hari.

- Test Case: Hapus/nonaktifkan tanggal libur
  - Step:
    1. Tambahkan hari libur cabang A pada `order_date + 1 hari`.
    2. Hapus atau nonaktifkan tanggal libur tersebut.
    3. Buka halaman order roti.
    4. Jalankan hitung otomatis roti.
  - Expected Result:
    - Cabang A tidak lagi dianggap libur.
    - Tidak ada warning libur.
    - `calculation_days` bernilai `2`.

- Test Case: Input tanggal libur duplikat
  - Step:
    1. Tambahkan hari libur cabang A pada tanggal tertentu.
    2. Tambahkan lagi hari libur cabang A pada tanggal yang sama.
  - Expected Result:
    - Sistem menolak input kedua.
    - Sistem menampilkan pesan error tanggal libur sudah ada.

- Test Case: Tanggal libur sama untuk cabang berbeda
  - Step:
    1. Tambahkan hari libur cabang A pada tanggal tertentu.
    2. Tambahkan hari libur cabang B pada tanggal yang sama.
  - Expected Result:
    - Kedua data berhasil disimpan.
    - Saat order, deteksi libur berjalan sesuai cabang masing-masing.

- Test Case: Order dibuat untuk tanggal selain hari ini
  - Step:
    1. Tambahkan hari libur cabang A pada tanggal 2026-06-11.
    2. Buka halaman order roti.
    3. Pilih `order_date` 2026-06-10.
    4. Jalankan hitung otomatis roti.
  - Expected Result:
    - Sistem mendeteksi 2026-06-11 sebagai tanggal besok dari order date.
    - Cabang A dihitung 1 hari kecuali override aktif.

- Test Case: Data hari libur belum diatur
  - Step:
    1. Pastikan tidak ada data hari libur aktif untuk cabang A.
    2. Buka halaman order roti.
    3. Jalankan hitung otomatis roti.
  - Expected Result:
    - Sistem tidak error.
    - Cabang A dihitung 2 hari.

## 14. Implementation Notes

- Gunakan timezone lokal Indonesia secara konsisten di frontend dan backend.
- Asumsi timezone awal: gunakan `Asia/Jakarta` jika bisnis beroperasi di WIB. Jika cabang berada di WITA/WIT, gunakan konfigurasi timezone aplikasi agar tidak hardcode.
- Cek tanggal besok berdasarkan tanggal order:
  - `next_date = order_date + 1 hari`
  - bukan berdasarkan tanggal device user jika user memilih order date lain.
- Simpan `holiday_date` sebagai tipe `date` tanpa jam untuk menghindari bug timezone.
- Jangan hardcode nama cabang.
- Gunakan ID cabang/outlet dari master data existing.
- Gunakan existing pattern di codebase untuk routing, service, API client, state management, dan UI component.
- Jangan membuat ulang modul order dari nol.
- Perubahan harus seminimal mungkin tetapi tetap rapi:
  - tambah tabel/collection hari libur,
  - tambah API CRUD hari libur,
  - tambah API/helper cek holiday per cabang,
  - integrasikan ke flow kalkulasi roti existing,
  - tambah UI warning dan override pada halaman order.
- Jika kalkulasi roti existing menerima parameter mode 1 hari/2 hari, gunakan parameter tersebut.
- Jika kalkulasi roti existing belum menerima `calculation_days` per cabang, tambahkan secara eksplisit dan jaga backward compatibility default `2`.
- Lakukan pengecekan ulang holiday saat:
  - halaman order dimuat,
  - tanggal order berubah,
  - tombol hitung otomatis dijalankan,
  - order masuk tahap review/submit jika diperlukan.
- Metadata holiday harus disimpan pada level yang paling dekat dengan cabang/order detail agar multi-cabang tetap akurat.
- UI override harus membutuhkan confirmation modal agar user tidak salah klik.
- Untuk penghapusan hari libur, pertimbangkan soft delete/nonaktif dengan `is_active = false` agar histori keputusan lebih mudah diaudit.
- Tambahkan validasi backend meskipun validasi frontend sudah ada.
- Pastikan order historis yang belum punya field holiday tetap bisa dibuka.
- Pastikan migration database aman untuk data existing.

## 15. Risiko / Asumsi

### Risiko

- Perhitungan roti bisa berubah pada cabang tertentu sehingga perlu testing teliti agar tidak memengaruhi cabang lain.
- Bug timezone dapat menyebabkan sistem mengecek tanggal yang salah, terutama saat order dibuat mendekati tengah malam.
- Jika metadata override tidak disimpan, keputusan owner/admin sulit diaudit setelah order dibuat.
- Jika warning terlalu kecil atau tidak jelas, user bisa lupa override saat cabang sebenarnya tetap buka.
- Jika data hari libur dikelola tidak disiplin, sistem akan menghitung berdasarkan data yang salah.
- Jika perubahan dilakukan langsung pada modul kalkulasi tanpa menjaga default behavior, order normal 2 hari bisa ikut terganggu.

### Asumsi

- Sistem sudah memiliki master data cabang/outlet.
- Sistem sudah memiliki proses order roti dan kalkulasi kebutuhan roti existing.
- Default kebutuhan roti untuk order normal adalah 2 hari.
- Owner/admin adalah role yang berwenang mengelola kalender libur dan melakukan override.
- Cabang yang libur besok tetap membutuhkan stok untuk hari ini, sehingga calculation days menjadi 1 hari, bukan 0 hari.
- Override bersifat per transaksi/order dan tidak mengubah kalender libur permanen.
- Hari libur yang dimaksud adalah hari libur operasional cabang, bukan kalender nasional global.
- Implementasi awal tidak perlu integrasi API kalender eksternal.
