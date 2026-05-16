# PRD: Adjustment Bahan Saat Catat Penerimaan

## 1. Ringkasan

Dokumen ini mendefinisikan kebutuhan produk untuk menambahkan fitur **Adjustment Penerimaan** pada halaman **Catat Penerimaan**.

Fitur ini diperlukan agar user dapat mencatat bahan tambahan yang diterima dari supplier tetapi tidak ada di rencana input order atau Purchase Order awal. Saat ini modal penerimaan hanya menampilkan item yang sudah dibuat di `purchase_order_items`, sehingga user hanya bisa mengubah jumlah diterima, harga aktual, dan merk untuk bahan yang sudah ada di PO.

Halaman dan modul yang menjadi fokus utama:

1. `client/src/pages/PurchaseRecord.jsx`
2. `server/routes/purchase.js`
3. tabel `purchase_orders`
4. tabel `purchase_order_items`
5. tabel `materials`
6. tabel `material_variants`

## 2. Latar Belakang Masalah

Pada proses operasional, barang yang datang dari supplier tidak selalu sama persis dengan PO yang dibuat dari input order. Contoh kasus:

1. User memesan Selai Strawberry 1 kg, tetapi supplier juga mengirim Selai Coklat tambahan.
2. User memesan bahan tanpa merk tertentu, tetapi saat barang datang ternyata merk aktual berbeda.
3. Supplier mengganti merk karena stok merk awal kosong.
4. Ada bahan tambahan yang dibeli langsung atau ditambahkan oleh supplier di luar rencana order.
5. Barang tambahan tetap harus masuk ke total aktual penerimaan agar laporan pengeluaran tidak kurang.

Current UI pada modal **Catat Penerimaan** hanya menyediakan baris bahan yang sudah ada di PO. User tidak punya cara untuk:

1. menambahkan bahan baru ke penerimaan PO,
2. menambahkan merk/varian baru dari modal penerimaan,
3. mencatat bahan tambahan dengan `qty_ordered = 0`,
4. menandai item mana yang berasal dari PO dan mana yang merupakan adjustment,
5. menghitung total aktual yang mencakup item tambahan.

## 3. Tujuan

1. User dapat menambahkan bahan tambahan saat mencatat penerimaan PO.
2. User dapat memilih bahan dari master data pada baris adjustment.
3. User dapat menambahkan merk/varian baru untuk bahan terpilih tanpa keluar dari modal penerimaan.
4. User dapat membuat bahan baru secara cepat jika bahan belum ada di master data.
5. Total aktual PO menghitung item PO dan item adjustment.
6. Status PO tetap akurat:
   - `received` jika semua item order terpenuhi dan item adjustment valid,
   - `received_partial` jika ada item order yang diterima kurang dari jumlah dipesan.
7. Item adjustment dapat terlihat jelas di UI, laporan, dan detail penerimaan.
8. Reset PO tetap aman dan tidak meninggalkan data adjustment yatim.

## 4. Non-Goals

1. Tidak mengubah alur input order harian.
2. Tidak mengubah formula kalkulasi PO per supplier.
3. Tidak mengubah alur pengiriman email atau WhatsApp link ke supplier.
4. Tidak membuat modul inventory baru.
5. Tidak membuat alokasi bahan tambahan per outlet pada implementasi pertama.
6. Tidak mengubah data historis PO lama kecuali melalui migration default value.
7. Tidak membuat approval workflow multi-level.
8. Tidak membuat audit log detail per field pada implementasi pertama.

## 5. Pengguna

### User Utama

Admin atau operasional yang mencatat barang datang dari supplier pada halaman **Catat Penerimaan**.

### Kebutuhan User

1. Bisa mencatat barang yang benar-benar diterima walaupun tidak ada di PO awal.
2. Bisa memilih bahan tambahan dari master data.
3. Bisa membuat merk baru jika merk yang datang belum terdaftar.
4. Bisa membuat bahan baru jika bahan yang datang belum terdaftar.
5. Bisa membedakan item PO awal dan item tambahan.
6. Bisa melihat total aktual yang sudah termasuk item tambahan.
7. Bisa menyimpan penerimaan tanpa harus keluar ke halaman Master Data.

## 6. Current Behavior

Alur saat ini:

1. User membuka halaman `/purchase`.
2. User klik tombol `Catat Penerimaan` pada PO berstatus `pending` atau `confirmed`.
3. Frontend memanggil `GET /api/purchase/:po_id`.
4. Backend mengambil PO beserta `purchase_order_items`.
5. Modal `ReceiveModal` membangun state dari `po.items`.
6. Setiap item memiliki:
   - bahan,
   - merk/variant jika ada,
   - qty dipesan,
   - qty diterima,
   - harga aktual,
   - subtotal.
7. User mengubah qty diterima atau harga aktual.
8. User klik `Simpan Penerimaan`.
9. Frontend memanggil `PUT /api/purchase/:po_id/receive`.
10. Backend hanya mengupdate item yang memiliki `id`.
11. Backend menghitung `total_actual`.
12. Backend menentukan status `received` atau `received_partial`.

Kelemahan current behavior:

1. Baris penerimaan hanya berasal dari item PO awal.
2. Tidak ada tombol `Tambah Bahan`.
3. Tidak ada mode input item tambahan dengan `qty_ordered = 0`.
4. Jika merk belum ada, user harus keluar ke Master Data terlebih dahulu.
5. Jika bahan belum ada, user harus keluar ke Master Data terlebih dahulu.
6. Total aktual tidak dapat memasukkan barang tambahan dari supplier.
7. Catatan manual menjadi satu-satunya cara mencatat barang tambahan, tetapi nilainya tidak masuk ke perhitungan.

## 7. Expected Behavior

Saat user mencatat penerimaan:

1. Modal tetap menampilkan semua item dari PO awal.
2. Modal menyediakan tombol `Tambah Bahan`.
3. User dapat menambahkan baris adjustment di bawah item PO.
4. Pada baris adjustment, user dapat memilih:
   - bahan,
   - merk/varian,
   - qty diterima,
   - harga aktual,
   - catatan opsional.
5. Untuk item adjustment, kolom `Dipesan` menampilkan `0` atau badge `Tambahan`.
6. User dapat membuat merk baru untuk bahan terpilih dari modal yang sama.
7. User dapat membuat bahan baru dari modal yang sama jika bahan belum ada di master data.
8. Total aktual langsung menghitung semua item:
   - item PO awal,
   - item tambahan.
9. Setelah disimpan, detail PO tetap memuat item adjustment saat dibuka lagi.
10. Laporan pengeluaran dan analytics non-outlet ikut menghitung nilai item adjustment.

## 8. Business Rules

1. Item PO awal adalah item dengan `source = ordered`.
2. Item adjustment adalah item tambahan dengan `source = adjustment`.
3. Item adjustment harus memiliki `qty_ordered = 0`.
4. Item adjustment harus memiliki `qty_received > 0`.
5. Item adjustment harus memiliki `material_id`.
6. `variant_id` boleh kosong jika bahan tidak memiliki varian atau merk tidak perlu dicatat.
7. `price_actual` boleh 0 jika harga belum diketahui, tetapi UI harus memberi warning.
8. `total_estimated` PO tidak berubah karena tetap merepresentasikan rencana awal.
9. `total_actual` PO harus mencakup item PO awal dan item adjustment.
10. Status `received_partial` hanya ditentukan dari item `source = ordered` yang `qty_received < qty_ordered`.
11. Item adjustment tidak boleh membuat status menjadi `received_partial`.
12. Jika item PO awal diterima lebih banyak dari yang dipesan, user boleh mengisi `qty_received > qty_ordered`.
13. Jika item tambahan memakai bahan dan merk yang sama dengan item PO awal, UI harus memberi saran untuk menaikkan `qty_received` pada baris existing.
14. Jika user tetap ingin memisahkan baris, sistem boleh menyimpan sebagai adjustment selama tidak membuat perhitungan ganda tanpa disadari.
15. Supplier pada item adjustment mengikuti supplier PO yang sedang diterima.
16. Jika bahan terpilih memiliki supplier default berbeda dari supplier PO, UI harus menampilkan warning sebelum disimpan.
17. Untuk implementasi pertama, item adjustment tidak dialokasikan ke outlet tertentu.

## 9. Functional Requirements

### 9.1 Modal Catat Penerimaan

1. Modal menampilkan dua kelompok item:
   - `Item PO`,
   - `Adjustment / Tambahan`.
2. Jika belum ada item tambahan, kelompok adjustment boleh tersembunyi sampai user klik `Tambah Bahan`.
3. Tombol `Tambah Bahan` tersedia di area tabel penerimaan.
4. Item adjustment tampil sebagai baris tabel yang konsisten dengan item PO.
5. Baris adjustment memiliki badge visual `Tambahan`.
6. Kolom `Dipesan` untuk adjustment menampilkan `0` atau `Tambahan`.
7. Baris adjustment dapat dihapus sebelum atau setelah disimpan selama PO masih bisa diedit.
8. Modal menampilkan ringkasan:
   - total estimasi,
   - total aktual item PO,
   - total adjustment,
   - total aktual keseluruhan.
9. Tombol `Reset Form` mengembalikan item PO ke nilai awal dan menghapus adjustment yang belum tersimpan.
10. Saat membuka ulang PO yang sudah punya adjustment tersimpan, adjustment tetap tampil.

### 9.2 Tambah Baris Adjustment

1. User klik `Tambah Bahan`.
2. Sistem menambahkan baris kosong di kelompok adjustment.
3. User wajib memilih bahan.
4. Setelah bahan dipilih, sistem mengisi otomatis:
   - satuan beli,
   - harga default,
   - supplier default jika relevan,
   - daftar varian aktif.
5. User mengisi qty diterima.
6. User bisa mengubah harga aktual.
7. User bisa menambahkan catatan per baris adjustment.
8. Subtotal dihitung dari `qty_received * price_actual`.
9. Baris belum valid harus ditandai sebelum save.
10. Baris kosong tidak boleh terkirim ke backend.

### 9.3 Pilih atau Tambah Merk

1. Jika bahan memiliki varian aktif, user dapat memilih merk dari dropdown.
2. Dropdown merk menyediakan opsi `Tambah Merk Baru`.
3. Saat `Tambah Merk Baru` dipilih, tampil form kecil atau modal:
   - nama merk,
   - harga per satuan beli,
   - supplier, default ke supplier PO,
   - status aktif default `true`.
4. Setelah merk baru disimpan, merk langsung terpilih di baris adjustment.
5. Merk baru disimpan ke tabel `material_variants`.
6. Jika user membatalkan tambah merk, baris adjustment tetap ada tanpa mengubah data.
7. Sistem mencegah nama merk kosong.
8. Jika merk dengan nama sama sudah ada untuk bahan tersebut, sistem memberi pesan dan menyarankan memakai merk existing.

### 9.4 Tambah Bahan Baru Cepat

1. Dropdown bahan menyediakan opsi `Tambah Bahan Baru`.
2. Saat dipilih, tampil form cepat dengan field:
   - kode bahan,
   - nama bahan,
   - merk default opsional,
   - satuan beli,
   - isi kemasan,
   - satuan kemasan,
   - harga default,
   - supplier, default ke supplier PO.
3. Kode bahan harus unik.
4. Jika sistem dapat membuat kode otomatis, gunakan format seperti `ADJ-YYYYMMDD-###` dan tetap izinkan user mengubahnya.
5. Setelah bahan baru disimpan, bahan langsung terpilih di baris adjustment.
6. Bahan baru disimpan ke tabel `materials` dengan `is_active = true`.
7. Jika merk default diisi dan perlu dipakai sebagai varian, sistem dapat membuat `material_variants` pertama untuk bahan tersebut.
8. Jika user membatalkan tambah bahan, baris adjustment tetap kosong dan belum valid.

### 9.5 Simpan Penerimaan

1. Frontend mengirim item PO awal dan item adjustment dalam payload save.
2. Item PO awal memiliki `id`.
3. Item adjustment baru boleh tidak memiliki `id`.
4. Backend mengupdate item dengan `id`.
5. Backend membuat record baru untuk adjustment tanpa `id`.
6. Backend menghapus item adjustment yang ditandai deleted.
7. Backend tidak boleh menghapus item `source = ordered` dari PO awal.
8. Backend menghitung ulang `total_actual` dari semua item PO setelah update/insert/delete.
9. Backend menyimpan `notes` PO seperti behavior existing.
10. Backend menentukan status PO setelah semua item diproses.
11. Jika semua PO dalam session sudah `received` atau `received_partial`, session tetap diupdate menjadi `completed`.

### 9.6 Edit Penerimaan Setelah Disimpan

1. User dapat membuka PO yang sudah `received` atau `received_partial`.
2. Item adjustment tersimpan tetap tampil.
3. User dapat mengubah qty, harga, merk, dan catatan adjustment.
4. User dapat menghapus item adjustment.
5. User tidak dapat menghapus item PO awal.
6. Perubahan edit menghitung ulang `total_actual`.
7. Jika item PO awal diubah menjadi kurang dari pesanan, status berubah ke `received_partial`.
8. Jika item PO awal kembali terpenuhi, status berubah ke `received`.

### 9.7 Reset PO

1. Reset PO berstatus `received` atau `received_partial` mengembalikan PO ke `pending`.
2. Reset mengosongkan `qty_received` dan `price_actual` pada item `source = ordered`.
3. Reset menghapus semua item `source = adjustment`.
4. Reset mengosongkan `total_actual`.
5. Reset mengosongkan `notes`.
6. Jika session sudah `completed`, reset tetap mengembalikan session ke `sent` seperti behavior existing.

### 9.8 Laporan

1. Laporan harian harus menampilkan item adjustment.
2. Item adjustment diberi label `Tambahan`.
3. `total_actual` pada laporan supplier harus mencakup item adjustment.
4. Analytics global harus menghitung pengeluaran adjustment.
5. Analytics per outlet tidak wajib mengalokasikan adjustment pada implementasi pertama.
6. Jika filter outlet digunakan, item adjustment tanpa outlet tidak ditampilkan atau ditampilkan dalam kategori `Tidak dialokasikan`, sesuai keputusan implementasi.

## 10. UX Requirements

1. Gunakan bahasa yang familiar:
   - `Tambah Bahan`,
   - `Tambah Merk`,
   - `Tambahan`,
   - `Item PO`,
   - `Total Tambahan`.
2. Jangan memakai istilah teknis seperti `source`, `record`, atau `variant_id` di UI.
3. Item adjustment harus terlihat berbeda tetapi tetap tidak mengganggu tabel.
4. Warning supplier berbeda harus jelas tetapi tidak memblokir jika user memang yakin.
5. Error validasi harus muncul dekat baris terkait.
6. Tombol hapus baris adjustment memakai icon atau `x` dengan tooltip `Hapus baris`.
7. Pada layar kecil, tabel tetap bisa discroll horizontal seperti pola existing.
8. Total aktual di footer modal harus tetap terlihat sebelum user klik simpan.
9. Loading state wajib ada saat menyimpan bahan baru, merk baru, dan penerimaan.
10. Setelah berhasil tambah bahan/merk, user tidak kehilangan input baris adjustment.

## 11. Data Model Requirements

### 11.1 Perubahan `purchase_order_items`

Tambahkan kolom berikut:

```sql
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ordered',
  ADD COLUMN IF NOT EXISTS adjustment_note TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
```

Tambahkan constraint:

```sql
ALTER TABLE purchase_order_items
  ADD CONSTRAINT purchase_order_items_source_check
  CHECK (source IN ('ordered', 'adjustment'));
```

Rekomendasi index:

```sql
CREATE INDEX IF NOT EXISTS idx_poi_po_source
  ON purchase_order_items(po_id, source);
```

Aturan data:

1. Data lama otomatis menjadi `source = ordered`.
2. Adjustment baru disimpan dengan:
   - `source = adjustment`,
   - `qty_ordered = 0`,
   - `qty_received > 0`,
   - `material_id` wajib,
   - `variant_id` opsional,
   - `price_actual` wajib secara teknis, boleh 0 jika harga belum diketahui.
3. `subtotal_actual` tetap memakai generated column existing.

### 11.2 Field yang Tidak Diubah

1. `purchase_orders.total_estimated` tetap angka estimasi awal.
2. `purchase_orders.total_actual` tetap angka aktual final.
3. `purchase_orders.notes` tetap catatan level PO.
4. `materials` tetap master bahan utama.
5. `material_variants` tetap master merk/varian per bahan.

### 11.3 Opsional Untuk Phase Lanjutan

Jika audit detail dibutuhkan, tambahkan tabel baru:

```sql
CREATE TABLE IF NOT EXISTS purchase_receipt_adjustment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Tabel audit ini tidak wajib untuk MVP.

## 12. API Requirements

### 12.1 GET Detail PO

Endpoint existing:

```http
GET /api/purchase/:po_id
```

Response `items` harus menyertakan:

1. `source`
2. `adjustment_note`
3. `variant_id`
4. `variant`
5. data material

Item harus diurutkan:

1. item `ordered` sesuai urutan existing,
2. item `adjustment` berdasarkan `created_at`.

### 12.2 PUT Simpan Penerimaan

Endpoint existing:

```http
PUT /api/purchase/:po_id/receive
```

Payload baru:

```json
{
  "items": [
    {
      "id": "existing-item-id",
      "source": "ordered",
      "qty_received": 121,
      "price_actual": 4500,
      "variant_id": null
    },
    {
      "source": "adjustment",
      "material_id": "material-id",
      "variant_id": "variant-id",
      "qty_received": 2,
      "price_actual": 15000,
      "adjustment_note": "Tambahan dari supplier"
    }
  ],
  "deleted_adjustment_item_ids": ["adjustment-item-id"],
  "notes": "Catatan penerimaan barang"
}
```

Validasi backend:

1. `items` wajib array.
2. Item `ordered` wajib punya `id`.
3. Item `adjustment` baru wajib punya `material_id`.
4. Item `adjustment` wajib `qty_received > 0`.
5. Item `adjustment` disimpan dengan `qty_ordered = 0`.
6. Item yang dihapus hanya boleh `source = adjustment`.
7. Backend harus memastikan semua item berada pada `po_id` yang benar.
8. Backend harus menolak update jika PO tidak ditemukan.
9. Backend harus menghitung ulang `total_actual` dari database setelah mutasi berhasil.

### 12.3 POST Tambah Merk Baru

Gunakan endpoint existing:

```http
POST /api/materials/:id/variants
```

Payload:

```json
{
  "brand": "Nama Merk",
  "supplier_id": "supplier-po-id",
  "price_per_purchase_unit": 15000
}
```

Requirement:

1. Setelah sukses, frontend reload varian bahan terkait.
2. Varian baru langsung dipilih pada baris adjustment.

### 12.4 POST Tambah Bahan Baru

Gunakan endpoint existing:

```http
POST /api/materials
```

Payload:

```json
{
  "code": "ADJ-20260516-001",
  "name": "Selai Coklat",
  "brand": "Merk A",
  "supplier_id": "supplier-po-id",
  "package_qty": 1,
  "package_unit": "Kg",
  "purchase_unit": "Kg",
  "price_per_purchase_unit": 15000
}
```

Requirement:

1. Setelah sukses, frontend reload daftar bahan aktif.
2. Bahan baru langsung dipilih pada baris adjustment.
3. Jika create bahan gagal karena kode duplikat, UI menampilkan pesan yang bisa dipahami.

## 13. UI Recommendation

### 13.1 Struktur Modal

```text
Header:
Catat Penerimaan
Supplier

Content:
Error banner jika ada

Tabel Item PO:
Bahan | Merk | Dipesan | Diterima | Harga/Sat | Subtotal

Tabel / Section Adjustment:
[+ Tambah Bahan]
Bahan | Merk | Dipesan | Diterima | Harga/Sat | Catatan | Subtotal | Aksi

Catatan PO

Footer:
Est: Rp xxx
Item PO Aktual: Rp xxx
Tambahan: Rp xxx
Aktual: Rp xxx
[Reset Form] [Batal] [Simpan Penerimaan]
```

### 13.2 State Frontend

State yang disarankan:

1. `orderedItems`
2. `adjustmentItems`
3. `deletedAdjustmentItemIds`
4. `variantsMap`
5. `materials`
6. `suppliers`
7. `notes`
8. `saving`
9. `error`
10. `rowErrors`
11. `quickAddMaterialOpen`
12. `quickAddVariantFor`

### 13.3 Derived Values

Hitung sebagai derived value:

1. `orderedActualTotal`
2. `adjustmentTotal`
3. `totalActual`
4. `hasPartialOrderedItems`
5. `validAdjustmentItems`

Jangan menyimpan total sebagai state manual di frontend.

## 14. Acceptance Criteria

1. User dapat membuka modal `Catat Penerimaan` tanpa error.
2. Item PO awal tetap tampil seperti behavior existing.
3. User dapat klik `Tambah Bahan` dan melihat baris adjustment baru.
4. User dapat memilih bahan existing pada baris adjustment.
5. Setelah bahan dipilih, satuan dan harga default terisi.
6. User dapat memilih merk existing untuk bahan yang punya varian.
7. User dapat menambahkan merk baru dari modal penerimaan.
8. Merk baru langsung terpilih pada baris adjustment setelah disimpan.
9. User dapat menambahkan bahan baru dari modal penerimaan.
10. Bahan baru langsung terpilih pada baris adjustment setelah disimpan.
11. User dapat mengisi qty diterima dan harga aktual untuk adjustment.
12. Subtotal adjustment berubah saat qty atau harga berubah.
13. Total aktual mencakup item PO dan adjustment.
14. User tidak dapat menyimpan adjustment kosong.
15. User tidak dapat menyimpan adjustment tanpa bahan.
16. User tidak dapat menyimpan adjustment dengan qty diterima 0 atau negatif.
17. Setelah simpan, PO berpindah ke `received` jika semua item PO awal terpenuhi.
18. Setelah simpan, PO berpindah ke `received_partial` jika ada item PO awal kurang diterima.
19. Item adjustment tidak menyebabkan status `received_partial`.
20. Setelah modal ditutup dan dibuka kembali, item adjustment tetap tampil.
21. Laporan harian menampilkan total aktual yang sudah mencakup adjustment.
22. Reset PO menghapus item adjustment dan mengembalikan item PO awal ke kondisi pending.
23. Item `source = ordered` tidak dapat dihapus dari modal penerimaan.
24. Build frontend berhasil.
25. Tidak ada error JavaScript di console pada flow utama.

## 15. Edge Cases

1. User menambahkan bahan yang sama dengan item PO awal.
   - UI menampilkan warning bahwa item sudah ada di PO dan menyarankan update qty diterima pada baris existing.

2. User menambahkan bahan yang sama dan merk yang sama lebih dari sekali di adjustment.
   - UI menampilkan warning duplikasi dan menyarankan merge qty.

3. User memilih bahan dengan supplier default berbeda dari supplier PO.
   - UI menampilkan warning sebelum save.

4. User membuat merk baru dengan nama yang sudah ada.
   - Backend atau frontend menampilkan error/saran memakai merk existing.

5. User membuat bahan baru dengan kode yang sudah ada.
   - UI menampilkan error kode duplikat.

6. User menghapus adjustment tersimpan lalu klik simpan.
   - Backend menghapus item adjustment dari database dan menghitung ulang total aktual.

7. User klik reset pada PO yang punya adjustment.
   - Adjustment dihapus, item PO awal kembali belum diterima, PO kembali pending.

8. Harga aktual diisi 0.
   - UI menampilkan warning, tetapi tetap boleh disimpan jika bisnis mengizinkan harga belum diketahui.

9. Qty diterima lebih besar dari qty dipesan pada item PO awal.
   - Sistem menerima nilai tersebut dan tidak menjadikan PO partial.

10. Backend gagal saat sebagian item sudah diproses.
    - Implementasi ideal memakai transaksi atau urutan operasi yang aman. Jika transaksi Supabase RPC belum tersedia, backend harus return error dan frontend tidak menutup modal.

11. User menutup modal saat ada quick add bahan/merk yang belum disimpan.
    - Sistem meminta konfirmasi jika ada perubahan belum disimpan.

12. PO tidak ditemukan atau sudah dihapus.
    - UI menampilkan pesan error dan kembali reload daftar PO.

## 16. Technical Requirements

1. Tetap gunakan React dan Tailwind sesuai struktur project existing.
2. Gunakan class design system existing:
   - `card`
   - `input`
   - `btn-primary`
   - `btn-outline`
   - `btn-secondary`
   - `badge-*`
3. Perubahan frontend utama dilakukan di `client/src/pages/PurchaseRecord.jsx`.
4. Jika modal mulai terlalu besar, pecah menjadi komponen:
   - `ReceiveModal`
   - `ReceiveOrderedItemsTable`
   - `ReceiveAdjustmentItemsTable`
   - `QuickAddMaterialModal`
   - `QuickAddVariantModal`
5. Perubahan backend utama dilakukan di `server/routes/purchase.js`.
6. Buat migration SQL baru untuk kolom `source`, `adjustment_note`, dan `created_at`.
7. Jangan mengubah kontrak endpoint lama secara breaking; payload existing tanpa adjustment tetap harus jalan.
8. Backend harus tetap support item lama yang belum punya `source` melalui default `ordered`.
9. Hitung ulang total aktual dari database, bukan dari payload frontend.
10. Hindari menyimpan angka hasil format rupiah. Simpan numeric murni.

## 17. Saran Implementasi

### Phase 1: Data dan Backend

1. Tambah migration untuk `purchase_order_items.source`, `adjustment_note`, dan `created_at`.
2. Update `GET /api/purchase/:po_id` agar select field baru.
3. Update `PUT /api/purchase/:po_id/receive` agar bisa:
   - update item ordered,
   - insert item adjustment,
   - update item adjustment existing,
   - delete adjustment yang diminta,
   - hitung ulang total aktual.
4. Update endpoint reset agar menghapus adjustment.
5. Test API via request manual.

### Phase 2: UI Adjustment

1. Pisahkan state item ordered dan adjustment.
2. Tambah tombol `Tambah Bahan`.
3. Tambah tabel/section adjustment.
4. Tambah validasi row adjustment.
5. Tambah ringkasan total adjustment.
6. Pastikan save payload kompatibel dengan backend baru.

### Phase 3: Quick Add Merk dan Bahan

1. Tambah quick add merk memakai endpoint variants existing.
2. Tambah quick add bahan memakai endpoint materials existing.
3. Setelah create sukses, reload master data terkait.
4. Pilih data baru secara otomatis di row adjustment.

### Phase 4: Reports dan QA

1. Pastikan laporan harian menampilkan item adjustment.
2. Tambahkan badge `Tambahan` di laporan jika field `source` tersedia.
3. Jalankan build frontend.
4. Jalankan smoke test penerimaan.
5. Test reset PO.

## 18. QA Checklist

### Smoke Test

1. Buka `/purchase`.
2. Pilih PO pending.
3. Klik `Catat Penerimaan`.
4. Pastikan item PO awal tampil.
5. Klik `Tambah Bahan`.
6. Pilih bahan existing.
7. Isi qty dan harga.
8. Simpan penerimaan.
9. Buka ulang PO.
10. Pastikan item tambahan masih tampil.

### Merk Baru

1. Tambah baris adjustment.
2. Pilih bahan.
3. Klik `Tambah Merk Baru`.
4. Isi nama merk dan harga.
5. Simpan merk.
6. Pastikan merk baru terpilih.
7. Simpan penerimaan.
8. Buka ulang PO.
9. Pastikan merk tetap tampil.

### Bahan Baru

1. Tambah baris adjustment.
2. Pilih `Tambah Bahan Baru`.
3. Isi form bahan baru.
4. Simpan bahan.
5. Pastikan bahan baru terpilih pada row adjustment.
6. Isi qty dan harga.
7. Simpan penerimaan.
8. Cek Master Data bahwa bahan baru tercatat.

### Status Partial

1. Pada item PO awal, isi qty diterima lebih kecil dari dipesan.
2. Tambahkan adjustment valid.
3. Simpan.
4. Pastikan status PO menjadi `Diterima Sebagian`.
5. Edit PO dan penuhi qty item PO awal.
6. Simpan.
7. Pastikan status PO menjadi `Diterima`.

### Reset

1. Simpan PO dengan item adjustment.
2. Klik reset PO.
3. Buka lagi modal penerimaan.
4. Pastikan adjustment hilang.
5. Pastikan qty/harga item PO awal kembali default.

### Laporan

1. Simpan PO dengan adjustment bernilai harga.
2. Buka laporan pengeluaran harian.
3. Pastikan total aktual PO mencakup adjustment.
4. Pastikan item adjustment dapat dikenali sebagai `Tambahan`.

## 19. Success Metrics

1. User tidak perlu keluar ke Master Data hanya untuk mencatat barang tambahan saat penerimaan.
2. Barang tambahan masuk ke total aktual PO.
3. Selisih antara barang datang dan data sistem berkurang.
4. Catatan penerimaan tidak lagi dipakai sebagai satu-satunya tempat mencatat barang tambahan.
5. Reset PO tetap bersih dan tidak menyisakan item tambahan.
6. Tidak ada regresi pada flow penerimaan existing.

## 20. Out of Scope Untuk Implementasi Pertama

1. Alokasi adjustment per outlet.
2. Approval supervisor untuk bahan tambahan.
3. Audit log lengkap per perubahan field.
4. Upload foto nota atau invoice.
5. Scan barcode bahan.
6. Integrasi stok inventory otomatis.
7. Import adjustment dari Excel.
