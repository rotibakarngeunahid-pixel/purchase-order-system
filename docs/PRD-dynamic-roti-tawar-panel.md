# PRD: Panel Roti Tawar Dinamis Saat Quantity Diubah Manual

## 1. Ringkasan

Dokumen ini mendefinisikan kebutuhan produk untuk memperbaiki perilaku panel kanan **Roti Tawar** pada halaman **Input Order**.

Masalah utama: ketika user mengubah jumlah Roti Tawar di area input tengah, angka pada panel kanan **Hasil Kalkulasi** tidak ikut berubah secara dinamis. Akibatnya user melihat angka yang berbeda antara input aktual dan ringkasan kalkulasi, misalnya input Nusa Kambangan sudah menjadi `21`, tetapi panel kanan masih menampilkan kebutuhan cabang tersebut `27`.

Perubahan yang diinginkan: panel kanan harus langsung mencerminkan quantity Roti Tawar yang sedang ada di input order, tanpa menunggu refresh, review, atau klik ulang tombol **Hitung Otomatis Roti Tawar**.

## 2. Latar Belakang Masalah

Halaman Input Order saat ini memiliki dua sumber informasi yang berbeda:

1. Area input order di tengah menggunakan state `matrix` sebagai data live quantity per outlet dan material.
2. Panel kanan `RotiTawarPanel` menampilkan `rotiDetail`, yaitu snapshot hasil terakhir dari endpoint preview Roti Tawar.

Ketika user menekan tombol **Hitung Otomatis Roti Tawar**, sistem mengisi quantity Roti Tawar ke `matrix` dan menyimpan `rotiDetail` sebagai hasil kalkulasi. Namun setelah itu, jika user mengubah quantity secara manual melalui tombol minus, plus, input matrix, mode per outlet, mode per bahan, atau modal distribusi tambahan, `matrix` berubah tetapi `rotiDetail` tidak berubah.

Dampak:

1. User melihat angka panel kanan yang tidak sesuai dengan input terbaru.
2. User bisa mengira perubahan manual belum masuk.
3. Angka **Order Supplier**, **Bonus Supplier**, dan **Terpenuhi** terlihat masih berdasarkan rekomendasi awal, bukan quantity aktual yang akan masuk ke review.
4. Perbandingan cabang menjadi membingungkan karena kolom **Butuh** masih angka rekomendasi, sedangkan input aktual sudah berbeda.

## 3. Tujuan

1. Membuat panel Roti Tawar ikut berubah secara real-time saat quantity Roti Tawar diubah manual.
2. Menjadikan `matrix` sebagai sumber kebenaran untuk angka **order saat ini**.
3. Tetap mempertahankan hasil preview API sebagai **rekomendasi awal** atau **baseline kebutuhan**.
4. Membedakan dengan jelas antara:
   - kebutuhan rekomendasi sistem,
   - quantity yang sedang diinput user,
   - selisih antara rekomendasi dan input aktual.
5. Mengurangi risiko user salah membaca angka sebelum lanjut ke review order.
6. Menjaga formula bonus supplier tetap sama dengan formula backend.

## 4. Non-Goals

1. Tidak mengubah formula minimum stock Roti Tawar.
2. Tidak mengubah formula bonus supplier `20 beli + 1 bonus`.
3. Tidak mengubah kontrak database.
4. Tidak mengubah proses pembuatan session order.
5. Tidak mengubah proses review, PO, laporan, email, atau distribusi.
6. Tidak membuat kalkulasi ulang stok dari API setiap kali user menekan plus/minus.
7. Tidak menghapus kemampuan user untuk mengubah quantity Roti Tawar secara manual.

## 5. Current Behavior

Berdasarkan kode saat ini:

1. User membuka halaman Input Order di `client/src/pages/OrderEntry.jsx`.
2. User memilih mode input, misalnya `Per Outlet`.
3. User menekan **Hitung Otomatis Roti Tawar**.
4. Frontend memanggil `previewRotiOrder({ orderDate, referenceDate })`.
5. Backend mengembalikan `rotiDetail` dengan data:
   - `total_needed`
   - `optimal_order`
   - `bonus`
   - `fulfilled`
   - `branches`
   - `warnings`
6. Frontend mengisi quantity Roti Tawar ke `matrix`.
7. Panel kanan menampilkan `rotiDetail`.
8. User mengubah quantity Roti Tawar manual, misalnya dari `27` menjadi `21`.
9. `matrix` berubah dan autosave berjalan.
10. Panel kanan tetap menampilkan angka lama dari `rotiDetail`.

Contoh masalah:

```text
Input tengah:
Nusa Kambangan, Roti Tawar = 21

Panel kanan:
Nusa Kambangan, Butuh = 27
Total Kebutuhan = 133
Order Supplier = 127
Bonus Supplier = 6
Terpenuhi = 133
```

Panel kanan belum memberi tahu user bahwa input aktual sudah berkurang `6` dari rekomendasi awal.

## 6. Expected Behavior

Saat user mengubah quantity Roti Tawar di area input:

1. Panel kanan harus update langsung pada render berikutnya.
2. Update tidak perlu menunggu autosave selesai.
3. Update tidak perlu memanggil API preview ulang.
4. Angka rekomendasi awal dari API tetap tersedia sebagai pembanding.
5. Angka order aktual dihitung dari `matrix`.
6. Formula supplier order dan bonus dihitung ulang dari total Roti Tawar aktual.
7. Setiap cabang menampilkan minimal:
   - kebutuhan rekomendasi,
   - quantity input saat ini,
   - selisih input terhadap rekomendasi.

Contoh expected setelah Nusa Kambangan diubah dari `27` menjadi `21`:

```text
Rekomendasi total kebutuhan: 133
Total input saat ini: 127
Order Supplier saat ini: 121
Bonus Supplier: 6
Terpenuhi saat ini: 127
Selisih: -6

Nusa Kambangan:
Butuh rekomendasi: 27
Input saat ini: 21
Selisih: -6
```

Catatan: angka `Total Kebutuhan` boleh tetap berarti rekomendasi awal dari stok dan minimum stock, tetapi labelnya harus jelas. Angka yang berubah dinamis harus diberi label seperti **Total Input Saat Ini**, **Order Supplier Saat Ini**, atau **Terpenuhi Saat Ini**.

## 7. User Flow

### 7.1 Flow Hitung Otomatis Lalu Edit Manual

1. User membuka halaman Input Order.
2. User klik **Hitung Otomatis Roti Tawar**.
3. Sistem mengisi quantity Roti Tawar per outlet.
4. Panel kanan menampilkan rekomendasi dan order saat ini.
5. User mengubah quantity Roti Tawar salah satu outlet.
6. Sistem langsung memperbarui:
   - total input Roti Tawar,
   - order supplier,
   - bonus supplier,
   - terpenuhi,
   - selisih per cabang,
   - status apakah input kurang, pas, atau lebih dari rekomendasi.
7. Autosave tetap berjalan seperti saat ini.
8. User lanjut ke review.
9. Review menggunakan quantity dari `matrix` yang sudah disimpan.

### 7.2 Flow Edit Tanpa Hitung Otomatis

1. User langsung mengisi Roti Tawar manual tanpa klik **Hitung Otomatis**.
2. Panel kanan tetap boleh menampilkan ringkasan **Order Roti Saat Ini** berdasarkan `matrix`.
3. Jika belum ada `rotiDetail`, panel tidak menampilkan stok, min, atau rekomendasi per cabang.
4. Jika user kemudian klik **Hitung Otomatis**, panel menampilkan rekomendasi lengkap dan tetap dinamis terhadap perubahan manual berikutnya.

### 7.3 Flow Distribusi Roti Tambahan

1. User klik **Distribusi Roti Tambahan**.
2. User memasukkan tambahan quantity per cabang.
3. Sistem menambahkan quantity ke `matrix`.
4. Panel kanan langsung menghitung ulang ringkasan Roti Tawar dari `matrix`.
5. Selisih per cabang ikut berubah sesuai quantity akhir.

## 8. Business Rules

1. `matrix` adalah sumber kebenaran untuk quantity order saat ini.
2. `rotiDetail` dari API adalah snapshot rekomendasi berdasarkan stok referensi dan minimum stock.
3. Perubahan manual user tidak boleh mengubah `rotiDetail.branches[].need`, karena nilai itu adalah rekomendasi awal.
4. Perubahan manual user harus mengubah derived summary dari `matrix`.
5. Formula supplier order untuk Roti Tawar harus sama dengan backend:

```text
Jika total <= 0:
  order = 0, bonus = 0, fulfilled = 0

Jika total < 20:
  order = total, bonus = 0, fulfilled = total

Jika total >= 20:
  cari order minimum sehingga order + floor(order / 20) >= total
  bonus = floor(order / 20)
  fulfilled = order + bonus
```

6. Jika input aktual lebih kecil dari rekomendasi, panel harus menandai selisih kurang.
7. Jika input aktual sama dengan rekomendasi, panel harus menandai status pas.
8. Jika input aktual lebih besar dari rekomendasi, panel harus menandai selisih lebih.
9. Outlet yang ditutup dan memiliki quantity Roti Tawar `0` tetap dihitung sebagai input aktual `0`.
10. Input kosong diperlakukan sebagai `0` untuk ringkasan dinamis.
11. Perubahan material selain Roti Tawar tidak boleh mengubah ringkasan Roti Tawar.

## 9. Functional Requirements

### 9.1 Ringkasan Dinamis

1. Sistem harus menghitung `currentRotiTotal` dari `matrix`.
2. `currentRotiTotal` adalah total quantity Roti Tawar semua outlet.
3. Panel kanan harus menampilkan `currentRotiTotal`.
4. Panel kanan harus menghitung ulang:
   - `current_supplier_order`
   - `current_bonus`
   - `current_fulfilled`
5. Perhitungan ulang terjadi otomatis setiap kali `matrix`, `outlets`, atau material Roti Tawar berubah.
6. Perhitungan ulang tidak boleh melakukan request API.

### 9.2 Tabel Cabang Dinamis

Jika `rotiDetail` tersedia, tabel cabang harus menampilkan:

1. `Cabang`
2. `Stok`
3. `Min`
4. `Butuh`
5. `Input`
6. `Selisih`

Definisi:

```text
Butuh = rotiDetail.branches[].need
Input = quantity Roti Tawar dari matrix untuk outlet yang cocok dengan cabang
Selisih = Input - Butuh
```

Visual state:

1. `Selisih < 0`: tampil merah atau warning, contoh `-6`.
2. `Selisih = 0`: tampil netral atau hijau, contoh `Pas`.
3. `Selisih > 0`: tampil biru/hijau, contoh `+3`.

### 9.3 Panel Tanpa rotiDetail

Jika user belum menjalankan **Hitung Otomatis Roti Tawar** tetapi sudah menginput Roti Tawar manual:

1. Panel tetap menampilkan **Order Roti Saat Ini**.
2. Panel menampilkan total input, order supplier, bonus, dan terpenuhi.
3. Panel tidak perlu menampilkan kolom stok/min/butuh.
4. Panel menampilkan pesan singkat bahwa rekomendasi stok belum dihitung.

### 9.4 Label UI

Label harus menghindari ambigu antara rekomendasi dan input aktual.

Rekomendasi label:

1. `Kebutuhan Rekomendasi`
2. `Input Saat Ini`
3. `Order Supplier Saat Ini`
4. `Bonus Supplier`
5. `Terpenuhi Saat Ini`
6. `Selisih Input`

Label lama `Total Kebutuhan`, `Order Supplier`, dan `Terpenuhi` boleh tetap dipakai hanya jika konteksnya jelas. Jika tidak jelas, label harus diganti agar user paham angka mana yang dinamis.

### 9.5 Responsivitas

1. Di desktop, panel kanan tetap muat di lebar sidebar saat ini.
2. Jika tabel cabang menjadi terlalu lebar, gunakan layout compact:
   - desktop: tabel 6 kolom,
   - mobile: setiap cabang menjadi row/card compact.
3. Teks tidak boleh terpotong pada nama cabang panjang seperti `Nusa Kambangan`.
4. Angka harus memakai `tabular-nums` agar stabil saat berubah.

### 9.6 Autosave

1. Panel kanan harus update optimistis saat `matrix` berubah, bukan menunggu API save berhasil.
2. Jika autosave gagal, panel tetap menunjukkan input lokal terbaru.
3. Banner error save tetap muncul seperti behavior existing.
4. Jika user refresh setelah save gagal, data akan kembali ke data tersimpan. Ini acceptable selama error save terlihat jelas.

## 10. Technical Requirements

### 10.1 File yang Perlu Dicek atau Direvisi

1. `client/src/pages/OrderEntry.jsx`
   - Tambahkan derived value untuk ringkasan Roti Tawar live.
   - Kirim derived value tersebut ke `RotiTawarPanel`.
   - Gunakan `useMemo` agar perhitungan tidak tersebar dan tidak boros render.

2. `client/src/lib/orderHelpers.js`
   - Tambahkan helper `calcRotiTawarSupplierOrder(totalNeeded)`.
   - Tambahkan helper `buildRotiTawarLiveSummary(...)` jika diperlukan.
   - Helper harus aman untuk nilai kosong, string angka, `null`, dan `undefined`.

3. `client/src/components/order/RotiTawarPanel.jsx`
   - Render ringkasan dinamis dari `rotiLiveSummary`.
   - Tetap render `rotiDetail` sebagai baseline rekomendasi.
   - Tambahkan kolom atau tampilan `Input` dan `Selisih`.

4. `server/services/calculator.js`
   - Tidak wajib diubah.
   - Formula client harus sama dengan fungsi `calcRotiTawarSupplierOrder` di backend.

5. `server/routes/rotiTawar.js`
   - Tidak perlu dipanggil ulang untuk setiap edit manual.
   - Endpoint preview tetap dipakai untuk mengambil baseline stok dan minimum stock.

### 10.2 Contoh Struktur Derived Data

```js
const rotiLiveSummary = {
  hasRotiMaterial: true,
  currentTotal: 127,
  supplierOrder: 121,
  bonus: 6,
  fulfilled: 127,
  recommendationTotal: 133,
  deltaTotal: -6,
  branches: [
    {
      outlet_id: '...',
      display_name: 'Nusa Kambangan',
      current_stock: 0,
      min_stock: 27,
      recommended_need: 27,
      input_qty: 21,
      delta: -6,
      status: 'less'
    }
  ]
};
```

### 10.3 Pseudocode

```js
const rotiMaterial = materials.find(isRotiTawar);

const rotiLiveSummary = useMemo(() => {
  if (!rotiMaterial) {
    return { hasRotiMaterial: false };
  }

  const currentTotal = outlets.reduce((sum, outlet) => {
    const key = getMatrixKey(outlet.id, rotiMaterial.id);
    return sum + (Number(matrix[key]) || 0);
  }, 0);

  const supplier = calcRotiTawarSupplierOrder(Math.ceil(currentTotal));
  const recommendationTotal = rotiDetail?.total_needed ?? null;

  return {
    hasRotiMaterial: true,
    currentTotal,
    supplierOrder: supplier.order,
    bonus: supplier.bonus,
    fulfilled: supplier.fulfilled,
    recommendationTotal,
    deltaTotal:
      recommendationTotal == null ? null : currentTotal - recommendationTotal,
    branches: buildBranchRows(rotiDetail, outlets, matrix, rotiMaterial),
  };
}, [materials, outlets, matrix, rotiDetail]);
```

## 11. Acceptance Criteria

1. Setelah user klik **Hitung Otomatis Roti Tawar**, panel kanan menampilkan rekomendasi dan input saat ini.
2. Saat user menekan tombol minus pada Roti Tawar di mode `Per Outlet`, panel kanan langsung berubah.
3. Saat user menekan tombol plus pada Roti Tawar di mode `Per Outlet`, panel kanan langsung berubah.
4. Saat user mengubah Roti Tawar di mode `Per Bahan`, panel kanan langsung berubah.
5. Saat user mengubah Roti Tawar di mode `Matrix`, panel kanan langsung berubah.
6. Saat user memakai **Distribusi Roti Tambahan**, panel kanan langsung berubah.
7. Perubahan material selain Roti Tawar tidak mengubah ringkasan Roti Tawar.
8. Jika Nusa Kambangan berubah dari `27` ke `21`, row Nusa Kambangan menampilkan input `21` dan selisih `-6`.
9. Jika total input Roti Tawar berubah dari `133` ke `127`, **Order Supplier Saat Ini** berubah sesuai formula bonus.
10. Panel tidak memanggil API preview ulang saat user hanya menekan plus/minus.
11. Autosave tetap berjalan dan status save tetap tampil.
12. Jika autosave gagal, user melihat error save.
13. Setelah refresh, angka panel mengikuti data yang berhasil tersimpan.
14. Session read-only tetap tidak dapat diedit.
15. Pada session read-only, panel tetap menampilkan ringkasan dari quantity tersimpan.
16. Jika material Roti Tawar tidak ditemukan, panel menampilkan error existing dan tidak crash.
17. Jika `rotiDetail` belum tersedia, panel tetap dapat menampilkan total Roti Tawar saat ini dari `matrix`.
18. Build frontend berhasil.
19. Tidak ada error JavaScript di console pada flow utama.

## 12. Edge Cases

1. User menghapus input Roti Tawar menjadi kosong.
   - Ringkasan membaca nilai sebagai `0`.

2. User memasukkan angka negatif.
   - Input existing harus tetap menolak atau mengubah menjadi `0`.

3. User mengganti outlet buka/tutup setelah auto-fill.
   - Jika quantity berubah karena auto-fill ulang, panel ikut berubah.
   - Jika hanya status buka/tutup berubah tanpa quantity berubah, panel tidak perlu mengubah input aktual.

4. Mapping cabang `rotiDetail.branches[].display_name` tidak cocok dengan `outlet.name`.
   - Row tetap tampil dengan rekomendasi.
   - `input_qty` dapat menjadi `0` atau `null`.
   - Tampilkan warning mapping jika sudah tersedia dari response.

5. User menutup detail panel dengan tombol `X`.
   - Jika desain tetap mengizinkan dismiss, ringkasan order saat ini sebaiknya tetap bisa terlihat atau muncul kembali setelah input Roti Tawar berubah.

6. User menjalankan **Hitung Otomatis** ulang setelah edit manual.
   - Sistem boleh menimpa quantity Roti Tawar dengan rekomendasi terbaru.
   - Panel kembali menunjukkan input yang sama dengan rekomendasi terbaru.

7. User mengubah tanggal order.
   - `rotiDetail` dan ringkasan stok lama harus dibersihkan seperti behavior existing.
   - Ringkasan input mengikuti `matrix` untuk session tanggal baru.

## 13. UX Requirements

1. Panel kanan harus memberi sinyal jelas bahwa angka berubah karena input user.
2. Gunakan label yang mudah dipahami user operasional.
3. Jangan memakai istilah teknis seperti `matrix`, `derived`, atau `state` di UI.
4. Gunakan warna warning untuk input kurang dari rekomendasi.
5. Gunakan warna netral atau sukses untuk input sesuai rekomendasi.
6. Gunakan warna informasi untuk input lebih dari rekomendasi.
7. Angka yang berubah harus mudah dipindai.
8. Jangan membuat panel kanan terlalu tinggi sampai tombol penting sulit ditemukan.
9. Tetap gunakan style existing seperti `card`, `btn-outline`, dan warna brand yang sudah ada.

## 14. QA Checklist

### Smoke Test

1. Buka halaman `/order`.
2. Pilih tanggal order.
3. Klik **Hitung Otomatis Roti Tawar**.
4. Pastikan panel kanan menampilkan hasil.
5. Ubah quantity Roti Tawar satu outlet.
6. Pastikan panel kanan langsung berubah.

### Mode Per Outlet

1. Pilih outlet Nusa Kambangan.
2. Ubah Roti Tawar dari `27` ke `21`.
3. Pastikan badge material berubah ke `21`.
4. Pastikan panel kanan menampilkan input `21`.
5. Pastikan selisih cabang menjadi `-6`.
6. Pastikan total input dan order supplier berubah.

### Mode Per Bahan

1. Pindah ke mode `Per Bahan`.
2. Pilih material Roti Tawar.
3. Ubah quantity beberapa outlet.
4. Pastikan panel kanan berubah sesuai total terbaru.

### Mode Matrix

1. Pindah ke mode `Matrix`.
2. Ubah cell Roti Tawar untuk salah satu outlet.
3. Pastikan total baris matrix dan panel kanan sama-sama berubah.

### Distribusi Tambahan

1. Klik **Distribusi Roti Tambahan**.
2. Tambahkan quantity untuk satu atau lebih outlet.
3. Klik terapkan.
4. Pastikan panel kanan berubah sesuai quantity akhir.

### Autosave dan Refresh

1. Ubah quantity Roti Tawar.
2. Tunggu status `Tersimpan`.
3. Refresh halaman.
4. Pastikan panel mengikuti quantity tersimpan.

### Read-only

1. Buka session yang sudah `sent` atau `completed`.
2. Pastikan input disabled.
3. Pastikan panel kanan tetap menghitung ringkasan dari data tersimpan.

## 15. Success Metrics

1. User tidak lagi melihat perbedaan membingungkan antara input tengah dan panel kanan.
2. User bisa mengetahui total order Roti Tawar aktual sebelum review.
3. User bisa melihat cabang mana yang kurang atau lebih dari rekomendasi.
4. Tidak ada laporan bahwa angka panel kanan "tidak berubah" setelah quantity diedit.
5. Tidak ada regresi pada hasil review PO Roti Tawar.

## 16. Rekomendasi Tahapan Implementasi

### Phase 1: Helper dan Derived Summary

1. Tambahkan helper formula supplier order di client.
2. Tambahkan helper build live summary dari `matrix`.
3. Kirim `rotiLiveSummary` dari `OrderEntry.jsx` ke `RotiTawarPanel`.

### Phase 2: Update UI Panel

1. Tambahkan card **Input Saat Ini**.
2. Tambahkan label pembeda rekomendasi dan input aktual.
3. Tambahkan kolom `Input` dan `Selisih` pada tabel cabang.

### Phase 3: QA dan Hardening

1. Test semua mode input.
2. Test distribusi tambahan.
3. Test refresh setelah save.
4. Test read-only session.
5. Jalankan build frontend.

## 17. Out of Scope untuk Implementasi Pertama

1. Audit log perubahan manual Roti Tawar.
2. Approval khusus jika input kurang dari rekomendasi.
3. Realtime multi-user update.
4. Grafik historis kebutuhan Roti Tawar.
5. Export detail selisih ke Excel atau PDF.
