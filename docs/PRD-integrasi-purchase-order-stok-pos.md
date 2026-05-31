# PRD: Integrasi Purchase Order ke Stok POS/Inventori

## 1. Judul Fitur

Integrasi stok masuk bahan baku dari sistem `purchase_order` ke sistem POS/inventori Roti Bakar Ngeunah.

Fitur ini mengganti pola stok masuk manual di halaman staff menjadi alur stok masuk utama yang bersumber dari PO yang sudah diterima. Admin tetap dapat melakukan stok masuk manual untuk koreksi atau kondisi khusus, tetapi staff tidak boleh lagi menambah stok masuk manual.

## 2. Latar Belakang Masalah

Saat ini POS dan `purchase_order` berjalan sebagai dua aplikasi terpisah:

1. POS/inventori berada di folder `point_of_sales`, memakai PHP API `api/api.php` dan database MySQL/cPanel.
2. Sistem PO berada di folder `purchase_order`, memakai Node/Express, React, dan Supabase.
3. Stok POS saat ini disimpan di `branch_inventory`.
4. Riwayat stok POS saat ini disimpan di `inventory_logs`.
5. Bahan POS disimpan di `ingredients`.
6. PO disimpan di `purchase_orders`.
7. Item PO disimpan di `purchase_order_items`.
8. Distribusi item PO per outlet, terutama untuk roti, disimpan di `purchase_item_branch_distribution`.

Masalah utama yang ditemukan dari kode saat ini:

1. Halaman staff POS (`point_of_sales/pos.html`) masih menampilkan tombol `Ubah Stok`.
2. Modal staff `modal-stock-adjust` masih memiliki pilihan `Stok Masuk`, `Stok Keluar`, dan `Opname`.
3. `point_of_sales/js/pos.js` membuka modal stok staff dengan default type `in`, lalu memanggil `inventoryService.adjustStock`.
4. `inventoryService.adjustStock` memanggil RPC `adjust_stock_atomic`.
5. Di backend POS, `rpc_adjust_stock_atomic` saat ini dapat dipanggil oleh user authenticated, termasuk staff, selama branch sesuai.
6. `rpc_adjust_stock_atomic` belum membedakan stok masuk manual admin, stok keluar staff, stok dari PO, atau rollback PO secara ketat.
7. Admin POS memang memiliki flow stok masuk/keluar/opname di `admin.html`, tetapi catatan alasan masih perlu diwajibkan untuk stok masuk manual.
8. Sistem PO sudah dapat mencatat penerimaan dengan status `received` atau `received_partial`, tetapi belum otomatis menambah stok POS.
9. Sistem PO dapat di-reset ke `pending`, tetapi belum ada mekanisme otomatis untuk mengurangi atau menyesuaikan stok POS yang sudah pernah masuk.
10. Belum ada tabel mapping bahan PO ke bahan POS.
11. Belum ada tabel bahan PO yang diabaikan dari stok POS.
12. Belum ada idempotency khusus agar PO yang sama tidak menambah stok dua kali.

Dampaknya, data stok dapat menjadi tidak akurat karena staff bisa menambah stok tanpa dasar pembelian, PO yang diterima tidak otomatis masuk stok, dan revisi/cancel PO belum otomatis mengubah stok POS.

## 3. Tujuan Fitur

Tujuan utama fitur ini adalah membuat stok masuk bahan baku lebih akurat dengan menjadikan `purchase_order` sebagai sumber utama stok masuk POS.

Tujuan detail:

1. Menghapus stok masuk manual dari halaman staff.
2. Membatasi staff hanya untuk transfer stok dan stok keluar.
3. Menjaga admin tetap bisa input stok masuk manual dengan catatan wajib.
4. Menambah stok POS otomatis ketika PO valid dan diterima.
5. Membuat fitur mapping bahan PO ke bahan POS.
6. Mengizinkan bahan PO tertentu diabaikan dari stok POS.
7. Mencegah stok dobel dari PO yang sama atau item PO yang sama.
8. Menyesuaikan stok POS ketika PO direvisi.
9. Mengembalikan atau mengurangi stok POS ketika PO dibatalkan/reset.
10. Mencatat semua perubahan stok, mapping, ignored item, sync ulang, error, revisi, dan cancel.
11. Menjaga akurasi stok untuk banyak cabang/outlet.

## 4. Scope Fitur

Yang termasuk scope:

1. Perubahan permission stok masuk di POS staff.
2. Pembatasan RPC/backend agar staff tidak bisa stok masuk manual dari API.
3. Integrasi PO `received` dan `received_partial` ke stok POS.
4. Mapping material `purchase_order.materials` ke POS `ingredients`.
5. Mapping outlet PO `outlets` ke POS `branches`.
6. Daftar bahan PO yang diabaikan dari stok POS.
7. Status sinkronisasi per PO item dan per cabang.
8. Pencegahan double sync.
9. Revisi PO dengan perhitungan selisih.
10. Cancel/reset PO dengan rollback stok yang pernah ditambahkan.
11. Riwayat stok dan riwayat sinkronisasi yang detail.
12. Log error sinkronisasi.
13. UI admin untuk daftar butuh mapping, ignored item, dan retry sync.
14. Acceptance criteria dan test case.

## 5. Yang Tidak Termasuk Scope

Yang tidak termasuk scope pada fase ini:

1. Mengubah formula order bahan atau kalkulasi Roti Tawar.
2. Mengubah proses penjualan POS.
3. Mengubah struktur produk/menu POS.
4. Membuat sistem approval multi-level baru.
5. Membuat prediksi kebutuhan bahan.
6. Membuat sinkronisasi harga jual POS.
7. Menghapus riwayat stok lama.
8. Memaksa semua item PO masuk stok POS.
9. Menebak mapping bahan dengan fuzzy matching tanpa konfirmasi admin.
10. Mengubah portal data keuangan kecuali perlu membaca status sync baru.

## 6. User Flow Lama

Flow lama POS staff:

1. Staff login ke POS.
2. Staff membuka tab `Stok`.
3. Staff klik `Ubah Stok`.
4. Staff memilih bahan.
5. Staff memilih jenis penyesuaian:
   - `Stok Masuk`
   - `Stok Keluar`
   - `Opname`
6. Staff mengisi jumlah.
7. Frontend memanggil `inventoryService.adjustStock`.
8. Backend POS menjalankan `adjust_stock_atomic`.
9. `branch_inventory` berubah.
10. `inventory_logs` dibuat dengan `reference_type = manual`.

Kelemahan flow lama:

1. Staff bisa menambah stok tanpa PO.
2. Staff bisa opname dari halaman kasir.
3. Stok masuk manual staff tercampur dengan stok keluar staff.
4. Riwayat tidak cukup membedakan sumber stok masuk.
5. Tidak ada hubungan ke PO.
6. Tidak ada idempotency PO.

## 7. User Flow Baru

Flow baru stok masuk dari PO:

1. Admin/user membuat PO di sistem `purchase_order`.
2. Barang datang dari supplier.
3. Admin mencatat penerimaan PO.
4. Status PO berubah menjadi `received` atau `received_partial`.
5. Sistem integrasi membaca semua item PO.
6. Sistem menentukan target outlet/cabang.
7. Sistem mengecek apakah bahan PO:
   - sudah memiliki mapping ke POS,
   - bisa dicocokkan secara aman,
   - masuk daftar ignored,
   - atau butuh mapping admin.
8. Item yang valid menambah stok POS.
9. Item yang ignored tidak mengubah stok POS, tetapi dicatat.
10. Item yang belum jelas masuk status `butuh_mapping_admin`.
11. Admin dapat membuka daftar butuh mapping.
12. Admin membuat mapping bahan PO ke bahan POS.
13. Admin menjalankan sinkronisasi ulang.
14. Sistem hanya menambah selisih yang belum pernah masuk.

Flow baru staff:

1. Staff login ke POS.
2. Staff bisa melihat stok cabangnya.
3. Staff bisa mengirim transfer stok ke outlet lain.
4. Staff bisa menerima transfer stok dari outlet lain.
5. Staff bisa input stok keluar dengan alasan wajib.
6. Staff tidak melihat tombol/menu stok masuk.
7. Staff tidak bisa memanggil API stok masuk manual.

## 8. Role dan Permission Pengguna

### Admin

Admin boleh:

1. Input stok masuk manual.
2. Input stok keluar manual.
3. Opname/koreksi stok.
4. Melihat semua riwayat stok.
5. Membuat, mengedit, menerima, reset, dan membatalkan PO sesuai aturan sistem PO.
6. Menjalankan sinkronisasi PO ke stok POS.
7. Melihat status sinkronisasi PO.
8. Melihat dan retry error sinkronisasi.
9. Membuat mapping bahan PO ke bahan POS.
10. Mengubah mapping bahan PO ke bahan POS.
11. Menghapus/nonaktifkan mapping jika belum dipakai atau melalui flow revisi aman.
12. Menentukan bahan PO yang diabaikan dari stok POS.
13. Membatalkan status ignored jika diperlukan.
14. Melihat laporan stok per cabang.

### Staff

Staff boleh:

1. Melihat stok cabangnya.
2. Input transfer stok keluar ke cabang lain.
3. Terima transfer stok masuk dari cabang lain.
4. Tolak transfer stok masuk dari cabang lain.
5. Input stok keluar untuk rusak, reject, hilang, terpakai operasional, atau kebutuhan lain.
6. Melihat riwayat stok yang relevan untuk cabangnya.

Staff tidak boleh:

1. Input stok masuk manual.
2. Melihat menu/tombol stok masuk manual.
3. Mengakses endpoint stok masuk manual.
4. Opname stok.
5. Koreksi stok masuk.
6. Mengubah stok dari PO.
7. Menjalankan sync PO.
8. Cancel sync PO.
9. Membuat mapping bahan.
10. Mengubah mapping bahan.
11. Menentukan bahan PO ignored.
12. Mengakses endpoint admin melalui API.

Pesan error backend untuk staff yang mencoba stok masuk:

```text
Staff tidak memiliki izin untuk input stok masuk. Stok masuk hanya dapat dilakukan oleh admin atau otomatis dari purchase order.
```

## 9. Detail Kebutuhan Fitur

### 9.1 Hapus Stok Masuk dari Staff

Perubahan pada halaman staff POS:

1. Hapus tombol `Ubah Stok` jika tombol tersebut masih membuka pilihan stok masuk/opname.
2. Ganti dengan tombol khusus `Stok Keluar` jika staff tetap perlu mencatat stok keluar.
3. Modal staff hanya boleh memiliki jenis transaksi `Stok Keluar`.
4. Field catatan/alasan untuk stok keluar wajib diisi.
5. Staff tidak boleh melihat pilihan:
   - `Stok Masuk`
   - `Opname`
   - `Koreksi Stok`

Perubahan backend:

1. RPC `adjust_stock_atomic` harus membaca role user dari session.
2. Jika role staff:
   - hanya boleh `p_type = out`,
   - `p_reference_type` harus `stok_keluar_staff`,
   - qty harus positif,
   - branch harus branch milik staff,
   - notes wajib.
3. Jika role admin/owner:
   - boleh `in`, `out`, dan `opname`,
   - stok masuk manual wajib `reference_type = stok_masuk_manual_admin`,
   - notes wajib untuk stok masuk manual dan opname.
4. Endpoint table langsung ke `branch_inventory` dan `inventory_logs` tetap tidak boleh bisa dipakai staff untuk menulis.

### 9.2 Stok Masuk Otomatis dari PO

Ketika PO berubah menjadi `received` atau `received_partial`, sistem harus melakukan sync:

1. Ambil PO dan item PO dari Supabase.
2. Ambil qty yang benar-benar diterima dari `qty_received`.
3. Jika `qty_received` kosong, jangan sync otomatis.
4. Tentukan target outlet/cabang.
5. Tentukan mapping bahan.
6. Hitung qty POS setelah konversi unit.
7. Cek sync sebelumnya untuk PO item dan cabang yang sama.
8. Tambahkan hanya delta yang belum pernah masuk.
9. Tulis `branch_inventory`, `inventory_logs`, dan tabel sync dalam satu transaksi di sisi POS.

### 9.3 Bahan yang Diabaikan dari Stok POS

Sistem harus mendukung bahan PO yang tidak dihitung di POS, misalnya:

1. Plastik kresek.
2. Tisu.
3. Sabun.
4. Alat kebersihan.
5. Barang kecil yang tidak dipakai dalam perhitungan resep/POS.

Ketentuan:

1. Bahan tetap tercatat di PO.
2. Bahan tidak menambah stok POS.
3. Bahan tidak mengurangi stok POS saat PO direvisi/cancel.
4. Keputusan ignored harus dibuat oleh admin.
5. Riwayat sync harus mencatat bahwa item diabaikan.
6. Ignored dapat dibuat global atau per cabang jika kebutuhan cabang berbeda.

### 9.4 Mapping Bahan Manual

Mapping menghubungkan `purchase_order.materials` ke `point_of_sales.ingredients`.

Contoh:

1. `box` di PO -> `lunch box` di POS.
2. `roti` di PO -> `roti tawar` di POS.
3. `susu kental` di PO -> `susu` di POS.

Ketentuan:

1. Mapping hanya boleh dibuat admin.
2. Staff tidak boleh membuat/mengubah mapping.
3. Sistem tidak boleh menebak mapping fuzzy seperti `box` ke `lunch box`.
4. Auto-match hanya boleh jika:
   - mapping eksplisit sudah ada, atau
   - nama bahan sama persis setelah normalisasi sederhana dan satuan aman.
5. Jika satuan berbeda, mapping harus memiliki `conversion_factor`.
6. Mapping harus menyimpan cabang/outlet jika nama atau kebutuhan stok antar cabang berbeda.
7. Setelah mapping dibuat, item yang `butuh_mapping_admin` bisa disinkronkan ulang.

### 9.5 Mapping Outlet PO ke Cabang POS

Karena PO memakai tabel `outlets` Supabase dan POS memakai tabel `branches` MySQL, sistem butuh mapping outlet-cabang.

Ketentuan:

1. Satu outlet PO harus dipetakan ke satu branch POS aktif.
2. Mapping outlet-cabang hanya boleh dibuat admin.
3. Sync tidak boleh jalan jika target cabang belum jelas.
4. Jika PO item memiliki `purchase_item_branch_distribution`, sync memakai distribusi tersebut.
5. Jika PO item tidak punya distribusi cabang, sistem harus menandai `butuh_alokasi_cabang`, kecuali PO memang memiliki cabang target yang jelas.
6. Sistem tidak boleh memakai pembagian proporsional ke cabang untuk stok fisik tanpa konfirmasi admin.

## 10. Struktur Data yang Disarankan

### 10.1 Tabel POS Existing

1. `ingredients`
   - Master bahan baku POS.
   - Berisi nama bahan, unit, min stock, status aktif.

2. `branch_inventory`
   - Stok saat ini per cabang dan bahan.
   - Menjadi sumber utama jumlah stok POS.

3. `inventory_logs`
   - Ledger pergerakan stok.
   - Semua stok masuk, stok keluar, transfer, opname, void transaksi, dan sync PO harus masuk ke sini.

4. `branches`
   - Master cabang POS.

5. `users`
   - Master user POS dengan role `admin`, `owner`, `staff`, `investor`.

6. `stock_transfers` dan `stock_transfer_items`
   - Flow transfer stok antar cabang.

### 10.2 Tabel PO Existing

1. `materials`
   - Master bahan di sistem purchase order.
   - Memiliki `name`, `purchase_unit`, `package_qty`, dan `package_unit`.

2. `purchase_orders`
   - Header PO.
   - Status existing: `pending`, `confirmed`, `received`, `received_partial`.

3. `purchase_order_items`
   - Detail bahan PO.
   - Memiliki `qty_ordered`, `qty_received`, `price_actual`, `source`.

4. `outlets`
   - Master outlet di sistem PO.

5. `purchase_item_branch_distribution`
   - Distribusi qty item PO per outlet.
   - Penting untuk menentukan cabang mana yang harus menerima stok.

6. `purchase_report`
   - Catatan barang masuk per outlet di sistem PO.
   - Perlu dievaluasi apakah akan tetap berdiri sendiri atau ikut masuk pipeline sync stok.

### 10.3 Tabel Baru yang Disarankan

Tabel baru sebaiknya ditempatkan di database POS/MySQL untuk bagian yang mengubah stok, karena update stok dan pencatatan sync harus berjalan dalam satu transaksi dengan `branch_inventory` dan `inventory_logs`.

1. `po_outlet_branch_mappings`
   - Fungsi: memetakan outlet PO ke branch POS.
   - Kolom penting:
     - `id`
     - `po_outlet_id`
     - `po_outlet_name`
     - `pos_branch_id`
     - `pos_branch_name`
     - `is_active`
     - `created_by`
     - `created_at`
     - `updated_at`

2. `po_material_pos_mappings`
   - Fungsi: memetakan bahan PO ke bahan POS.
   - Kolom penting:
     - `id`
     - `po_material_id`
     - `po_material_name`
     - `pos_ingredient_id`
     - `pos_ingredient_name`
     - `pos_branch_id` nullable untuk mapping global/per cabang
     - `conversion_factor`
     - `conversion_note`
     - `match_type` (`manual`, `exact_name`)
     - `is_active`
     - `created_by`
     - `updated_by`
     - `created_at`
     - `updated_at`

3. `po_ignored_materials`
   - Fungsi: menyimpan bahan PO yang tidak perlu masuk stok POS.
   - Kolom penting:
     - `id`
     - `po_material_id`
     - `po_material_name`
     - `pos_branch_id` nullable
     - `reason`
     - `is_active`
     - `created_by`
     - `created_at`

4. `po_stock_sync_runs`
   - Fungsi: mencatat satu proses sinkronisasi.
   - Kolom penting:
     - `id`
     - `po_id`
     - `trigger_type` (`po_received`, `po_revised`, `po_cancelled`, `manual_retry`)
     - `status` (`success`, `partial_success`, `failed`)
     - `started_at`
     - `finished_at`
     - `triggered_by`
     - `triggered_by_role`
     - `summary`

5. `po_stock_sync_items`
   - Fungsi: menyimpan status sinkronisasi per PO item, per cabang, per bahan POS.
   - Kolom penting:
     - `id`
     - `sync_run_id`
     - `po_id`
     - `po_item_id`
     - `po_material_id`
     - `po_material_name`
     - `po_status`
     - `po_item_source`
     - `po_qty_received`
     - `pos_branch_id`
     - `pos_ingredient_id`
     - `pos_ingredient_name`
     - `target_sync_qty`
     - `previous_synced_qty`
     - `delta_qty`
     - `inventory_log_id`
     - `sync_status`
     - `error_message`
     - `idempotency_key`
     - `created_at`
     - `updated_at`

   Unique key wajib:

   ```text
   UNIQUE(po_id, po_item_id, pos_branch_id)
   ```

6. `po_stock_sync_errors`
   - Fungsi: log error teknis dan bisnis.
   - Kolom penting:
     - `id`
     - `sync_run_id`
     - `po_id`
     - `po_item_id`
     - `error_code`
     - `error_message`
     - `payload_snapshot`
     - `created_at`

7. `role_permissions`
   - Opsional jika ingin permission granular.
   - Jika belum dibuat, aturan role bisa ditanam di backend dahulu.

### 10.4 Kolom Tambahan yang Disarankan di `inventory_logs`

Untuk audit yang lebih mudah, `inventory_logs` sebaiknya ditambah kolom:

1. `action_type`
2. `source_system`
3. `source_po_id`
4. `source_po_item_id`
5. `actor_role`
6. `sync_status`
7. `metadata` JSON jika MySQL versi mendukung

Jika tidak ingin mengubah `inventory_logs` terlalu besar, detail tambahan dapat disimpan di `po_stock_sync_items` dan `po_stock_sync_errors`, dengan `inventory_logs.reference_type = purchase_order` dan `reference_id = po_id:po_item_id`.

## 11. Relasi antara Purchase Order dan POS/Inventori

Relasi data yang dibutuhkan:

1. `purchase_orders.id` -> `po_stock_sync_runs.po_id`
2. `purchase_order_items.id` -> `po_stock_sync_items.po_item_id`
3. `materials.id` -> `po_material_pos_mappings.po_material_id`
4. `ingredients.id` -> `po_material_pos_mappings.pos_ingredient_id`
5. `outlets.id` -> `po_outlet_branch_mappings.po_outlet_id`
6. `branches.id` -> `po_outlet_branch_mappings.pos_branch_id`
7. `inventory_logs.id` -> `po_stock_sync_items.inventory_log_id`

Sumber kebenaran:

1. PO adalah sumber kebenaran pembelian dan jumlah diterima.
2. POS adalah sumber kebenaran stok berjalan.
3. Tabel sync adalah sumber kebenaran berapa qty dari PO yang sudah pernah mempengaruhi stok POS.

## 12. Logika Sinkronisasi Stok dari PO

### Saat PO Diterima

1. Sistem menerima event atau perintah sync untuk PO.
2. Ambil data PO dari Supabase.
3. Validasi status PO:
   - boleh sync jika `received` atau `received_partial`,
   - tidak boleh sync jika `pending` atau `confirmed`,
   - tidak boleh sync jika status cancel/reset.
4. Ambil item PO.
5. Untuk setiap item:
   - jika `qty_received` kosong atau 0, tandai `tidak_ada_qty_diterima`;
   - jika material ignored, tandai `diabaikan_dari_stok_pos`;
   - jika mapping bahan tidak ada, tandai `butuh_mapping_admin`;
   - jika target cabang tidak jelas, tandai `butuh_alokasi_cabang`;
   - jika mapping valid, hitung target qty POS.
6. Cari record sync lama berdasarkan `po_id`, `po_item_id`, dan `pos_branch_id`.
7. Hitung:

   ```text
   delta_qty = target_sync_qty - previous_synced_qty
   ```

8. Jika `delta_qty = 0`, jangan ubah stok.
9. Jika `delta_qty > 0`, tambah stok POS.
10. Jika `delta_qty < 0`, kurangi stok POS sesuai aturan revisi.
11. Simpan `inventory_logs`.
12. Simpan/update `po_stock_sync_items`.
13. Simpan `po_stock_sync_runs`.

### Syarat Transaksi

Perubahan berikut harus atomik di POS:

1. Update `branch_inventory`.
2. Insert `inventory_logs`.
3. Insert/update `po_stock_sync_items`.
4. Insert error jika gagal.

Jika salah satu gagal, semua perubahan stok untuk item tersebut harus rollback.

## 13. Logika Bahan PO yang Diabaikan dari Stok POS

Flow:

1. Sistem menemukan bahan PO yang tidak ada di POS.
2. Sistem tidak langsung error total.
3. Sistem menampilkan pilihan ke admin:
   - abaikan bahan ini dari stok POS,
   - mapping ke bahan POS,
   - tandai butuh review.
4. Jika admin memilih abaikan:
   - simpan ke `po_ignored_materials`,
   - sync item menjadi `diabaikan_dari_stok_pos`,
   - jangan ubah `branch_inventory`,
   - catat riwayat ignored.
5. Jika PO direvisi/cancel:
   - item ignored tetap tidak mempengaruhi stok POS,
   - status history tetap berubah sesuai PO.

Catatan penting:

1. Ignored bukan error.
2. Ignored harus bisa dilihat kembali oleh admin.
3. Ignored harus memiliki alasan agar audit jelas.

## 14. Logika Mapping Bahan PO ke Bahan POS

Flow:

1. Sistem menampilkan daftar item dengan status `butuh_mapping_admin`.
2. Admin memilih bahan POS yang sesuai.
3. Admin mengisi conversion factor jika satuan berbeda.
4. Admin menyimpan mapping.
5. Sistem mencatat riwayat mapping dibuat.
6. Sistem menjalankan sync ulang untuk item yang menunggu mapping.
7. PO berikutnya dengan material yang sama memakai mapping tersebut otomatis.

Validasi mapping:

1. `po_material_id` wajib.
2. `pos_ingredient_id` wajib.
3. `conversion_factor` wajib dan harus lebih dari 0.
4. Mapping tidak boleh aktif ganda untuk material dan cabang yang sama.
5. Jika mapping global dan mapping cabang sama-sama ada, mapping cabang menang.
6. Mapping yang sudah pernah dipakai tidak boleh dihapus permanen; gunakan nonaktif agar audit tetap aman.

## 15. Logika Input Stok Masuk Manual oleh Admin

Admin tetap boleh input stok masuk manual untuk:

1. Stok tambahan di luar PO.
2. Koreksi stok.
3. Bonus bahan baku dari supplier.
4. Kesalahan pencatatan sebelumnya.
5. Penyesuaian stok awal.
6. Kondisi darurat saat data PO belum dibuat.

Ketentuan:

1. Role wajib `admin` atau `owner`.
2. Branch wajib valid.
3. Bahan POS wajib valid.
4. Qty wajib angka lebih dari 0.
5. Catatan/alasan wajib.
6. `reference_type` wajib `stok_masuk_manual_admin`.
7. `action_type` wajib `stok_masuk_manual_admin`.
8. Simpan stok sebelum dan stok sesudah.
9. Simpan user admin dan role admin.

## 16. Logika Transfer Stok oleh Staff

Flow existing transfer stok dapat dipertahankan dengan penguatan validasi:

1. Staff memilih outlet tujuan.
2. Staff memilih bahan dan qty.
3. Backend validasi cabang asal adalah cabang staff.
4. Backend validasi cabang tujuan aktif dan berbeda.
5. Backend validasi stok asal cukup.
6. Saat transfer dibuat:
   - stok cabang asal berkurang,
   - status transfer `pending`,
   - log `transfer_out` dibuat.
7. Saat outlet tujuan menerima:
   - stok cabang tujuan bertambah,
   - status transfer `confirmed`,
   - log `transfer_in` dibuat.
8. Jika ditolak/dibatalkan:
   - stok kembali ke cabang asal,
   - log rollback transfer dibuat.

Transfer tidak boleh memakai `reference_type = manual` dan tidak boleh tercampur dengan stok masuk PO.

## 17. Logika Stok Keluar oleh Staff

Flow baru stok keluar staff:

1. Staff klik `Stok Keluar`.
2. Staff memilih bahan.
3. Staff mengisi qty.
4. Staff mengisi alasan wajib.
5. Backend validasi role staff.
6. Backend validasi bahan ada di cabang staff.
7. Backend validasi qty lebih dari 0.
8. Backend mengurangi stok.
9. Backend membuat `inventory_logs`:
   - `type = out`
   - `reference_type = stok_keluar_staff`
   - `action_type = stok_keluar_staff`
   - `created_by = staff_id`
   - `actor_role = staff`

Staff tidak boleh memilih `in` atau `opname`.

## 18. Logika Revisi PO

Revisi PO terjadi jika qty diterima, item adjustment, supplier, atau distribusi cabang berubah setelah pernah disinkronkan.

Flow:

1. Ambil snapshot sync lama dari `po_stock_sync_items`.
2. Ambil data PO terbaru.
3. Untuk setiap item dan cabang, hitung target qty baru.
4. Jika item ignored, jangan ubah stok.
5. Jika item butuh mapping, jangan ubah stok.
6. Jika mapping valid:

   ```text
   delta_qty = target_sync_qty_baru - qty_yang_sudah_pernah_disync
   ```

7. Jika delta positif, tambah stok.
8. Jika delta negatif, kurangi stok.
9. Catat `action_type = po_revised`.
10. Update status sync item menjadi `direvisi` atau `sudah_disinkronkan`.
11. Jika revisi mengubah cabang distribusi, cabang lama harus dikurangi dan cabang baru harus ditambah berdasarkan delta per cabang.

Contoh:

1. PO roti sudah sync 5 pcs.
2. Revisi qty diterima menjadi 4 pcs.
3. Delta = 4 - 5 = -1.
4. POS mengurangi stok roti 1 pcs.
5. Riwayat mencatat revisi PO.

## 19. Logika Cancel PO

Istilah cancel pada sistem existing bisa berarti:

1. Delete PO yang masih `pending` atau `confirmed`.
2. Reset PO yang sudah diterima kembali ke `pending`.
3. Cancel bisnis yang perlu ditambahkan sebagai status baru, misalnya `cancelled`.

Ketentuan:

1. PO yang belum pernah sync tidak perlu mengubah stok.
2. PO yang sudah pernah sync harus rollback ke target qty 0.
3. Item ignored tidak mempengaruhi stok.
4. Item yang belum mapping dan belum sync tidak mempengaruhi stok.
5. Sistem harus mengecek `previous_synced_qty`.
6. Jika stok cabang cukup:
   - kurangi stok sesuai qty yang pernah ditambahkan,
   - update status sync menjadi `dibatalkan`.
7. Jika stok cabang tidak cukup:
   - jangan kurangi stok setengah jalan,
   - tandai status `rollback_butuh_review_admin`,
   - beri peringatan admin,
   - catat error detail.
8. Cancel/reset tidak boleh mengurangi stok dua kali.

## 20. Logika Mencegah Stok Double Masuk

Pencegahan double stock wajib dilakukan di backend, bukan hanya UI.

Mekanisme:

1. Buat `idempotency_key`:

   ```text
   purchase_order:{po_id}:{po_item_id}:{pos_branch_id}
   ```

2. `po_stock_sync_items` memiliki unique key:

   ```text
   UNIQUE(po_id, po_item_id, pos_branch_id)
   ```

3. Sync tidak pernah langsung menambah qty penuh tanpa membaca `previous_synced_qty`.
4. Semua sync memakai delta:

   ```text
   delta_qty = target_sync_qty - previous_synced_qty
   ```

5. Jika halaman refresh, tombol diklik ulang, atau job dijalankan ulang, delta menjadi 0.
6. Jika PO direvisi, delta hanya selisih.
7. Jika PO dibatalkan, target qty menjadi 0.
8. Semua proses sync menggunakan row lock/transaction di POS.

## 21. Logika Multi Cabang / Outlet

Sistem harus aman untuk banyak cabang:

1. POS memakai `branches.id`.
2. PO memakai `outlets.id`.
3. Harus ada mapping `po_outlet_branch_mappings`.
4. Sync tidak boleh jalan jika outlet belum dipetakan ke branch POS.
5. Jika PO item punya distribusi cabang, qty sync mengikuti distribusi.
6. Jika item tidak punya distribusi, admin harus menentukan cabang target.
7. Mapping bahan dapat global atau per cabang.
8. Ignored material dapat global atau per cabang.
9. Riwayat stok wajib mencatat cabang.
10. Laporan stok harus tetap membaca `branch_inventory` sebagai sumber stok berjalan.

## 22. Desain Riwayat Stok dan Riwayat Sinkronisasi

Setiap perubahan stok wajib memiliki data minimal:

1. Tanggal dan waktu perubahan.
2. Sumber perubahan:
   - PO
   - Manual admin
   - Transfer stok
   - Stok keluar staff
   - Koreksi sistem
3. ID PO jika berasal dari PO.
4. ID item PO.
5. ID transaksi stok jika manual/transfer/stok keluar.
6. Nama bahan di PO.
7. Nama bahan POS setelah mapping.
8. Cabang/outlet.
9. Stok sebelum.
10. Jumlah perubahan stok.
11. Stok setelah.
12. Jenis aksi:
    - PO diterima
    - PO direvisi
    - PO dibatalkan
    - Stok masuk manual admin
    - Transfer stok
    - Stok keluar
    - Mapping bahan dibuat
    - Bahan PO diabaikan dari stok POS
    - Sinkronisasi ulang
    - Koreksi sistem
13. User yang melakukan aksi.
14. Role user.
15. Catatan perubahan.
16. Status sinkronisasi.
17. Pesan error jika gagal.

Status sinkronisasi yang harus tersedia:

1. `belum_disinkronkan`
2. `sudah_disinkronkan`
3. `butuh_mapping_admin`
4. `butuh_alokasi_cabang`
5. `diabaikan_dari_stok_pos`
6. `direvisi`
7. `dibatalkan`
8. `gagal_sinkron`
9. `rollback_butuh_review_admin`

## 23. Validasi dan Error Handling

Validasi role:

1. Staff tidak boleh akses stok masuk manual.
2. Backend tetap menolak request stok masuk dari staff.
3. Admin/owner boleh stok masuk manual.
4. Sistem PO sync memakai akses sistem/admin, bukan akses staff.

Validasi data:

1. Qty tidak boleh kosong.
2. Qty tidak boleh minus.
3. Qty tidak boleh huruf.
4. Bahan POS harus terdaftar sebelum stok POS berubah.
5. Cabang POS harus valid.
6. Outlet PO harus mapped ke cabang POS.
7. Mapping bahan harus jelas sebelum sync.
8. Conversion factor harus lebih dari 0.
9. PO harus `received` atau `received_partial`.
10. PO `pending` atau `confirmed` tidak boleh menambah stok.
11. PO cancelled/reset tidak boleh menambah stok.
12. PO item yang sama tidak boleh diproses dua kali secara penuh.

Error handling:

1. Bahan PO tidak ada di POS tidak boleh membuat seluruh sync gagal.
2. Item tersebut masuk `butuh_mapping_admin` atau `diabaikan_dari_stok_pos`.
3. Jika satu item gagal, item lain yang valid boleh tetap sukses, tetapi run status menjadi `partial_success`.
4. Jika stok berubah tetapi log gagal, transaksi harus rollback.
5. Jika log tersimpan tetapi stok gagal, transaksi harus rollback.
6. Jika rollback cancel PO stok tidak cukup, beri warning admin dan status `rollback_butuh_review_admin`.
7. Semua error masuk `po_stock_sync_errors`.

## 24. Risiko Bug yang Harus Dicegah

Bug yang harus dicegah dan mitigasinya:

1. Staff masih bisa input stok masuk dari URL langsung.
   - Mitigasi: hapus UI dan validasi backend berdasarkan role.

2. Staff masih bisa memanggil API stok masuk.
   - Mitigasi: `adjust_stock_atomic` menolak role staff untuk `in` dan `opname`.

3. Menu stok masuk masih muncul di staff.
   - Mitigasi: ubah `pos.html` dan `pos.js`, test DOM.

4. PO yang sama menambah stok berkali-kali.
   - Mitigasi: unique key dan idempotency per `po_id`, `po_item_id`, `branch_id`.

5. Item PO yang sama menambah stok berkali-kali.
   - Mitigasi: sync memakai delta, bukan insert penuh.

6. Stok bertambah saat PO masih draft/pending.
   - Mitigasi: validasi status PO di backend sync.

7. Stok tidak berubah saat PO direvisi.
   - Mitigasi: simpan `previous_synced_qty` dan hitung delta.

8. Stok tidak kembali saat PO dibatalkan/reset.
   - Mitigasi: target qty menjadi 0 dan jalankan rollback.

9. Bahan tidak ada di POS membuat seluruh sync gagal.
   - Mitigasi: status item `butuh_mapping_admin` atau `diabaikan_dari_stok_pos`.

10. Plastik kresek ikut masuk POS padahal tidak dihitung.
    - Mitigasi: daftar ignored material.

11. Sistem salah menebak `box` sebagai bahan lain.
    - Mitigasi: fuzzy match tidak boleh auto-sync.

12. Mapping bahan salah.
    - Mitigasi: admin-only, audit mapping, mapping bisa dinonaktifkan, sync ulang memakai delta.

13. Cabang PO salah masuk ke cabang lain.
    - Mitigasi: outlet-branch mapping wajib dan status `butuh_alokasi_cabang`.

14. Riwayat stok tidak tercatat.
    - Mitigasi: update stok dan insert log dalam transaksi yang sama.

15. Transfer stok staff tercampur dengan stok masuk.
    - Mitigasi: reference/action type berbeda.

16. Laporan stok tidak akurat.
    - Mitigasi: `branch_inventory` tetap sumber stok berjalan, semua mutasi lewat backend atomik.

## 25. Acceptance Criteria

Fitur dianggap berhasil jika:

1. Fitur stok masuk di staff sudah dihapus.
2. Staff tidak bisa input stok masuk manual dari UI.
3. Staff tidak bisa input stok masuk manual dari API.
4. Staff hanya bisa input transfer stok dan stok keluar.
5. Admin tetap bisa input stok masuk manual.
6. Stok POS otomatis bertambah saat PO diterima dan bahan valid untuk POS.
7. Bahan PO yang tidak dihitung di POS bisa diabaikan.
8. Bahan PO yang tidak jelas masuk daftar `butuh_mapping_admin`.
9. Admin bisa mapping bahan PO ke bahan POS.
10. Sistem tidak menebak mapping bahan sembarangan.
11. Stok POS otomatis menyesuaikan saat PO direvisi.
12. Stok POS otomatis berkurang saat PO dibatalkan/reset jika item pernah masuk stok POS.
13. Item ignored tidak mempengaruhi stok saat revisi/cancel.
14. PO yang sama tidak bisa menambah stok dua kali.
15. Item PO yang sama tidak bisa menambah stok dua kali.
16. Semua perubahan stok memiliki riwayat jelas.
17. Semua item PO memiliki status sinkronisasi jelas.
18. Data stok tetap akurat meski ada edit, cancel, input manual admin, transfer, dan stok keluar.
19. Sistem bisa digunakan untuk beberapa cabang/outlet.
20. Error sync terlihat jelas oleh admin.
21. Flow stok keluar, transfer stok, penjualan, dan laporan existing tidak rusak.
22. Validasi role berjalan di frontend dan backend.

## 26. Test Case Lengkap

### Role dan UI Staff

| No | Test | Expected Result |
| --- | --- | --- |
| 1 | Login sebagai staff, buka tab stok | Tidak ada tombol stok masuk |
| 2 | Staff membuka modal stok keluar | Hanya ada pilihan stok keluar |
| 3 | Staff mencoba akses action stok masuk dari console/browser | Backend menolak |
| 4 | Staff memanggil `adjust_stock_atomic` dengan `p_type = in` | Error permission dengan pesan khusus |
| 5 | Staff memanggil `adjust_stock_atomic` dengan `p_type = opname` | Error permission |
| 6 | Staff input stok keluar tanpa alasan | Ditolak |
| 7 | Staff input stok keluar valid | Stok berkurang dan log `stok_keluar_staff` tercatat |

### Admin Manual

| No | Test | Expected Result |
| --- | --- | --- |
| 8 | Admin input stok masuk manual dengan alasan | Stok bertambah dan log `stok_masuk_manual_admin` tercatat |
| 9 | Admin input stok masuk manual tanpa alasan | Ditolak |
| 10 | Admin opname dengan alasan | Stok berubah ke qty fisik dan log opname tercatat |

### PO Sync Normal

| No | Test | Expected Result |
| --- | --- | --- |
| 11 | PO status `pending` disync | Ditolak, stok tidak berubah |
| 12 | PO status `received`, material mapped, outlet mapped | Stok bertambah sesuai qty diterima |
| 13 | PO `received_partial` dengan qty diterima lebih kecil | Stok bertambah sesuai `qty_received`, bukan `qty_ordered` |
| 14 | PO diterima dan tombol sync diklik dua kali | Sync kedua delta 0, stok tidak dobel |
| 15 | Halaman di-refresh setelah sync | Stok tidak dobel |

### Mapping dan Ignored

| No | Test | Expected Result |
| --- | --- | --- |
| 16 | PO item `plastik kresek` tidak ada di POS | Masuk butuh review, tidak mengubah stok |
| 17 | Admin tandai `plastik kresek` ignored | Status `diabaikan_dari_stok_pos`, stok tidak berubah |
| 18 | PO berikutnya berisi `plastik kresek` | Otomatis ignored |
| 19 | PO item `box`, POS punya `lunch box` | Tidak auto-sync, status `butuh_mapping_admin` |
| 20 | Admin mapping `box` ke `lunch box` | Sync ulang menambah stok `lunch box` |
| 21 | Mapping dengan conversion factor 12 | Qty POS = qty PO x 12 |
| 22 | Mapping dinonaktifkan | PO berikutnya kembali butuh mapping |

### Revisi PO

| No | Test | Expected Result |
| --- | --- | --- |
| 23 | PO roti sync 5, direvisi menjadi 4 | Stok dikurangi 1 |
| 24 | PO roti sync 5, direvisi menjadi 7 | Stok ditambah 2 |
| 25 | PO item ignored direvisi | Stok tidak berubah |
| 26 | PO item butuh mapping direvisi | Stok tidak berubah sampai mapping valid |
| 27 | Distribusi cabang berubah dari A ke B | Stok A dikurangi, stok B ditambah sesuai delta |

### Cancel atau Reset PO

| No | Test | Expected Result |
| --- | --- | --- |
| 28 | PO synced 5 lalu reset/cancel | Stok dikurangi 5 |
| 29 | Cancel PO diklik dua kali | Pengurangan hanya terjadi sekali |
| 30 | Cancel PO dengan ignored item | Ignored item tidak mengubah stok |
| 31 | Cancel PO stok tidak cukup untuk rollback | Status `rollback_butuh_review_admin`, stok tidak berubah setengah jalan |

### Multi Cabang

| No | Test | Expected Result |
| --- | --- | --- |
| 32 | Outlet PO belum mapped ke branch POS | Status `butuh_alokasi_cabang`, stok tidak berubah |
| 33 | Outlet PO mapped ke branch POS salah lalu diperbaiki sebelum sync | Sync masuk ke branch yang benar |
| 34 | PO item punya distribusi 3 cabang | Stok bertambah di 3 cabang sesuai distribusi |
| 35 | Mapping bahan khusus cabang tersedia | Mapping cabang dipakai sebelum mapping global |

### Atomicity dan Error

| No | Test | Expected Result |
| --- | --- | --- |
| 36 | Insert inventory log gagal | Update stok rollback |
| 37 | Update stok gagal | Sync item tidak ditandai sukses |
| 38 | Satu item PO gagal mapping, item lain valid | Valid item sync, run status `partial_success` |
| 39 | POS API timeout saat sync | Error tercatat, stok tidak dianggap sukses |
| 40 | Retry setelah error teknis | Sync melanjutkan berdasarkan delta terakhir |

### Regression Existing Flow

| No | Test | Expected Result |
| --- | --- | --- |
| 41 | Penjualan POS memotong bahan resep | Tetap berjalan |
| 42 | Void transaksi mengembalikan stok | Tetap berjalan |
| 43 | Transfer stok pending/confirm/reject/cancel | Tetap berjalan |
| 44 | Admin laporan inventory logs | Menampilkan PO/manual/transfer/stok keluar dengan label jelas |
| 45 | Portal keuangan membaca data PO | Tidak rusak |

## 27. Langkah Implementasi Bertahap

### Fase 1: Hardening Permission Staff

1. Ubah UI staff POS:
   - hapus tombol stok masuk,
   - hapus opsi `in` dan `opname`,
   - sediakan flow `Stok Keluar` saja.
2. Ubah backend `adjust_stock_atomic`:
   - staff hanya boleh `out`,
   - admin/owner boleh `in`, `out`, `opname`,
   - notes wajib.
3. Tambah test manual dan API untuk role staff.

### Fase 2: Tabel Mapping dan Sync

1. Buat tabel:
   - `po_outlet_branch_mappings`
   - `po_material_pos_mappings`
   - `po_ignored_materials`
   - `po_stock_sync_runs`
   - `po_stock_sync_items`
   - `po_stock_sync_errors`
2. Tambah UI admin untuk mapping outlet-cabang.
3. Tambah UI admin untuk mapping bahan.
4. Tambah UI admin untuk ignored materials.

### Fase 3: Backend Sync POS

1. Buat RPC/API POS khusus sync PO, jangan memakai `adjust_stock_atomic` generik secara langsung.
2. API menerima payload PO item yang sudah dinormalisasi.
3. API membaca mapping dan ignored.
4. API hitung delta.
5. API update stok, ledger, dan sync table dalam transaksi.
6. API mengembalikan status per item.

### Fase 4: Integrasi dari Sistem PO

1. Tambah service di `purchase_order/server` untuk memanggil POS sync API.
2. Panggil service setelah `PUT /api/purchase/:po_id/receive` sukses.
3. Panggil service saat reset/cancel PO.
4. Tambah endpoint admin `retry sync`.
5. Tambah tampilan status sync pada detail PO.

### Fase 5: Revisi dan Cancel Aman

1. Simpan snapshot qty sync sebelumnya.
2. Implement delta untuk revisi.
3. Implement target qty 0 untuk cancel/reset.
4. Tambah status `rollback_butuh_review_admin`.
5. Tambah UI admin untuk menyelesaikan rollback yang butuh review.

### Fase 6: Audit, Laporan, dan Cleanup

1. Perbaiki label inventory logs agar PO/manual/transfer/stok keluar jelas.
2. Tambah filter log berdasarkan sumber.
3. Tambah export laporan sync error.
4. Tambah dashboard admin:
   - butuh mapping,
   - failed sync,
   - ignored,
   - rollback butuh review.

## 28. Penjelasan Sederhana Non-Programmer

Cara kerja fitur ini:

1. Sistem PO tetap dipakai untuk mencatat bahan yang dibeli.
2. POS tetap menjadi tempat menghitung stok yang dipakai kasir dan outlet.
3. Saat PO sudah diterima, sistem melihat bahan apa saja yang datang.
4. Jika bahan itu memang bahan yang dihitung di POS, stok outlet otomatis bertambah.
5. Jika bahan itu tidak dihitung di POS, seperti plastik kresek, admin bisa memilih untuk mengabaikannya.
6. Jika nama bahan berbeda, sistem tidak menebak sendiri. Admin harus memasangkan dulu.
7. Setelah admin memasangkan bahan, sistem akan ingat untuk PO berikutnya.
8. Jika PO direvisi, sistem hanya menambah atau mengurangi selisihnya.
9. Jika PO dibatalkan, sistem mencoba mengembalikan stok seperti sebelum PO masuk.
10. Staff tidak bisa lagi menambah stok masuk sendiri. Staff hanya bisa memindahkan stok antar cabang atau mencatat stok keluar.

Contoh sederhana:

1. Admin menerima PO roti 5 pcs.
2. POS punya bahan `roti`.
3. Sistem menambah stok roti 5 pcs.
4. Jika besok PO direvisi menjadi 4 pcs, sistem mengurangi 1 pcs.
5. Jika PO dibatalkan, sistem mengurangi semua stok yang dulu masuk dari PO itu.
6. Jika admin membeli plastik kresek, sistem tidak menambah stok POS karena plastik kresek tidak dihitung sebagai bahan POS.

Dengan pola ini, stok masuk punya dasar pembelian yang jelas, staff tidak bisa menambah stok sembarangan, dan setiap perubahan stok punya riwayat yang bisa ditelusuri.

## Catatan Teknis untuk Implementasi

Rekomendasi penting:

1. Jangan gunakan `adjust_stock_atomic` sebagai endpoint langsung untuk sync PO tanpa idempotency.
2. Buat endpoint/RPC khusus `sync_purchase_order_to_inventory`.
3. Simpan tabel sync di POS agar update stok dan status sync bisa satu transaksi.
4. Gunakan Supabase PO sebagai sumber data pembelian, tetapi POS tetap sumber data stok.
5. Gunakan delta, bukan tambah qty penuh, untuk semua sync ulang.
6. Semua akses dari PO ke POS harus memakai API key/server credential khusus, bukan credential staff.
7. Semua error harus terlihat di UI admin, bukan hanya `console.error`.

