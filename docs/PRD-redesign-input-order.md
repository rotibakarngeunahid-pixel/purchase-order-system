# PRD: Redesign Tampilan Input Order

## 1. Ringkasan

Dokumen ini mendefinisikan kebutuhan produk untuk merapikan dan menyederhanakan tampilan halaman **Input Order** agar lebih mudah dipahami oleh user operasional, lebih nyaman digunakan di desktop maupun mobile, dan tetap aman dari bug/error pada proses input, autosave, kalkulasi Roti Tawar, serta review order.

Halaman yang menjadi fokus utama adalah `client/src/pages/OrderEntry.jsx`.

## 2. Latar Belakang Masalah

Halaman Input Order saat ini menggunakan tampilan matrix besar:

- baris = bahan baku,
- kolom = outlet,
- input angka berada di setiap persilangan bahan dan outlet,
- status buka/tutup outlet dan pilihan 1 hari/2 hari berada di header kolom outlet,
- tombol "Hitung Otomatis" Roti Tawar berada di baris material,
- total per bahan dan total per outlet berada di sisi kanan/bawah tabel.

Model matrix ini cukup efisien untuk user yang sudah terbiasa, tetapi berpotensi membingungkan untuk user baru karena terlalu banyak informasi tampil bersamaan. Pada layar kecil, tabel melebar dan membutuhkan scroll horizontal. Beberapa kontrol penting juga kurang terlihat jelas konteksnya, misalnya tombol "Besok", indikator autosave, status draft/read-only, dan hasil kalkulasi Roti Tawar.

Redesign diperlukan agar user dapat memahami urutan kerja dengan lebih mudah:

1. pilih tanggal order,
2. atur kondisi outlet,
3. isi kebutuhan bahan,
4. jalankan kalkulasi otomatis jika perlu,
5. cek ringkasan,
6. lanjut ke review.

## 3. Tujuan

1. Membuat tampilan Input Order lebih rapi, terstruktur, dan mudah dipahami.
2. Mengurangi kepadatan informasi pada satu tabel besar.
3. Memperjelas konteks tanggal order, status session, autosave, dan mode read-only.
4. Mempermudah user melihat progress input per outlet dan per bahan.
5. Mempertahankan semua fungsi existing:
   - load master data material dan outlet,
   - load/create session order,
   - autosave quantity,
   - edit draft only,
   - kalkulasi otomatis Roti Tawar,
   - status buka/tutup outlet,
   - mode order 1 hari/2 hari,
   - total per outlet dan total keseluruhan,
   - navigasi ke review.
6. Mencegah regresi bug pada data order, autosave, dan kalkulasi.

## 4. Non-Goals

1. Tidak mengubah formula kalkulasi PO.
2. Tidak mengubah formula bonus supplier Roti Tawar.
3. Tidak mengubah struktur database kecuali ada kebutuhan teknis terpisah.
4. Tidak mengubah proses review order, pengiriman email, catatan penerimaan, atau laporan.
5. Tidak mengubah master data material, outlet, supplier, atau harga.
6. Tidak membuat modul forecast atau rekomendasi order baru di luar kalkulasi existing.

## 5. Pengguna

### User Utama

Admin/operasional yang membuat order bahan baku harian untuk semua outlet.

### Kebutuhan User

1. Bisa cepat melihat tanggal order dan status session.
2. Bisa input quantity tanpa takut salah outlet atau salah bahan.
3. Bisa melihat apakah data sudah tersimpan.
4. Bisa tahu outlet mana yang buka/tutup.
5. Bisa tahu mode 1 hari/2 hari untuk setiap outlet.
6. Bisa menjalankan kalkulasi Roti Tawar dengan hasil yang jelas.
7. Bisa lanjut ke review setelah yakin input benar.

## 6. Current Behavior

1. User membuka halaman `/order`.
2. Sistem memuat material aktif dan outlet aktif.
3. Sistem menampilkan matrix input bahan baku x outlet.
4. User memilih tanggal order melalui input tanggal.
5. User bisa klik tombol "Besok" untuk memilih tanggal operasional besok.
6. User mengisi quantity pada cell matrix.
7. Setiap perubahan quantity disimpan otomatis dengan debounce.
8. User dapat menekan "Hitung Otomatis" pada baris Roti Tawar.
9. Sistem mengisi quantity Roti Tawar berdasarkan hasil preview.
10. User klik "Hitung & Review" untuk masuk ke halaman review.

Kelemahan current behavior:

1. Tabel terlalu padat saat jumlah outlet/material bertambah.
2. Kontrol outlet berada di header tabel sehingga sulit dipahami sebagai pengaturan outlet.
3. Tidak ada ringkasan progress yang jelas sebelum user lanjut review.
4. Autosave hanya berupa teks kecil "Menyimpan..." dan kurang memberi status berhasil/gagal.
5. Error save hanya tercatat di console, belum terlihat jelas oleh user.
6. Hasil kalkulasi Roti Tawar berada di bawah tabel sehingga bisa terlewat.
7. Penggunaan horizontal scroll tinggi, terutama di layar kecil.

## 7. Expected Experience

Halaman Input Order baru harus terasa seperti workflow operasional yang jelas, bukan hanya tabel mentah. Tampilan disarankan dibagi menjadi beberapa area:

1. **Header kerja**
   - judul halaman,
   - tanggal order,
   - tombol "Besok",
   - status session,
   - status simpan,
   - tombol "Review Order".

2. **Panel ringkasan**
   - jumlah outlet aktif,
   - jumlah material aktif,
   - total quantity yang sudah diinput,
   - jumlah outlet yang sudah memiliki input,
   - status kalkulasi Roti Tawar jika tersedia.

3. **Pengaturan outlet**
   - daftar outlet dalam bentuk card/row compact,
   - toggle buka/tutup,
   - pilihan 1 hari/2 hari,
   - total quantity outlet tersebut.

4. **Area input order**
   - mode input yang mudah dipahami,
   - material dan outlet tidak tertukar,
   - quantity jelas,
   - total tetap terlihat.

5. **Panel Roti Tawar**
   - tombol kalkulasi otomatis,
   - tanggal order dan tanggal referensi stok,
   - hasil total kebutuhan, order supplier, bonus, terpenuhi,
   - warning/error yang mudah dibaca.

6. **Footer aksi**
   - ringkasan perubahan,
   - tombol lanjut review,
   - kondisi disabled jika belum ada session atau sedang proses.

## 8. Rekomendasi Layout

### 8.1 Desktop

Gunakan layout dua kolom:

- kolom utama untuk input order,
- kolom samping untuk ringkasan, pengaturan outlet, dan status kalkulasi.

Struktur:

```text
Header: Input Order | Tanggal | Besok | Status | Review

Ringkasan cepat:
[Outlet aktif] [Material aktif] [Total qty] [Outlet terisi]

Main layout:
Kiri  : Tabel/input order yang lebih bersih
Kanan : Pengaturan outlet + panel Roti Tawar + status simpan
```

### 8.2 Tablet

Gunakan layout satu kolom dengan urutan:

1. header,
2. ringkasan,
3. pengaturan outlet,
4. input order,
5. panel Roti Tawar,
6. tombol review.

### 8.3 Mobile

Hindari matrix terlalu lebar sebagai pengalaman utama. Gunakan salah satu pendekatan berikut:

1. **Outlet-first input**
   - user pilih outlet,
   - sistem menampilkan daftar bahan untuk outlet tersebut,
   - user isi quantity bahan untuk outlet terpilih.

2. **Material-first input**
   - user pilih bahan,
   - sistem menampilkan daftar outlet untuk bahan tersebut,
   - user isi quantity per outlet.

Rekomendasi utama: gunakan **tab/segmented control** untuk memilih mode:

- `Per Outlet`
- `Per Bahan`
- `Matrix`

Mode `Matrix` boleh tetap tersedia untuk power user di desktop, tetapi mobile default sebaiknya `Per Outlet`.

## 9. Functional Requirements

### 9.1 Header

1. Header menampilkan judul `Input Order`.
2. Header menampilkan subtitle tanggal order dalam format Indonesia.
3. Input tanggal harus tetap tersedia.
4. Tombol `Besok` harus tetap tersedia saat session masih `draft`.
5. Status session harus terlihat jelas:
   - Draft,
   - Terkirim,
   - Selesai.
6. Jika session bukan `draft`, tampilkan banner read-only yang jelas.
7. Tombol `Review Order` harus menggantikan label teknis `Hitung & Review` agar lebih mudah dipahami.
8. Saat proses kalkulasi review berjalan, tombol menampilkan loading state.

### 9.2 Status Simpan

1. Saat ada perubahan quantity, tampilkan status `Menyimpan...`.
2. Setelah save berhasil, tampilkan status `Tersimpan`.
3. Jika save gagal, tampilkan pesan error yang terlihat oleh user.
4. Save gagal tidak boleh diam-diam hanya masuk `console.error`.
5. User harus bisa mencoba input ulang setelah save gagal.
6. Jika user klik Review saat masih ada debounce save tertunda, sistem harus menyelesaikan atau flush save terlebih dahulu.

### 9.3 Pengaturan Outlet

1. Setiap outlet aktif harus tampil dengan nama yang jelas.
2. Setiap outlet memiliki toggle `Buka/Tutup`.
3. Setiap outlet memiliki pilihan `1 Hari/2 Hari`.
4. Outlet yang ditutup harus tampil berbeda secara visual.
5. Quantity otomatis untuk outlet tutup harus menjadi 0 pada kalkulasi Roti Tawar.
6. Perubahan status outlet tidak boleh menghapus quantity manual material lain.
7. Total quantity per outlet harus mudah dilihat.

### 9.4 Input Quantity

1. Quantity hanya menerima angka 0 atau lebih.
2. Field kosong diperlakukan sebagai 0 saat disimpan.
3. User harus bisa menghapus angka dan mengetik ulang tanpa UI memaksa angka tertentu terlalu cepat.
4. Input harus disabled saat session bukan `draft`.
5. Setiap cell/field harus jelas konteks outlet dan materialnya.
6. Total per bahan dan total per outlet harus tetap tersedia.
7. Total keseluruhan harus terlihat sebelum lanjut review.
8. Tidak boleh ada perubahan data material/outlet yang tidak disengaja saat user mengganti tanggal.

### 9.5 Mode Per Outlet

Mode ini direkomendasikan sebagai tampilan default untuk mobile dan bisa juga tersedia di desktop.

1. User memilih satu outlet dari daftar/tabs.
2. Sistem menampilkan semua material aktif untuk outlet tersebut.
3. Setiap material memiliki:
   - kode material,
   - nama material,
   - satuan beli,
   - input quantity,
   - indikator jika termasuk Roti Tawar.
4. Bagian atas outlet menampilkan:
   - status buka/tutup,
   - mode 1 hari/2 hari,
   - total quantity outlet.
5. User dapat berpindah outlet tanpa kehilangan input.

### 9.6 Mode Per Bahan

Mode ini membantu ketika user ingin mengisi satu bahan untuk semua outlet.

1. User memilih satu material.
2. Sistem menampilkan semua outlet aktif.
3. Setiap outlet memiliki input quantity untuk material tersebut.
4. Untuk material Roti Tawar, tombol `Hitung Otomatis` tampil di area material.
5. Total material tampil di bagian atas/bawah.

### 9.7 Mode Matrix

Mode matrix boleh dipertahankan untuk user lama.

1. Matrix harus lebih rapi dari tampilan existing.
2. Header outlet harus sticky atau mudah dibaca.
3. Kolom material harus sticky.
4. Kontrol buka/tutup dan 1 hari/2 hari sebaiknya tidak membuat header terlalu tinggi.
5. Total baris dan total kolom tetap terlihat.
6. Horizontal scroll harus tetap usable.

### 9.8 Roti Tawar

1. Tombol `Hitung Otomatis Roti Tawar` harus mudah ditemukan.
2. Sistem menampilkan loading state saat kalkulasi berjalan.
3. Jika material `Roti Tawar` tidak ditemukan, tampilkan error yang mudah dipahami.
4. Hasil kalkulasi harus menampilkan:
   - total kebutuhan,
   - order ke supplier,
   - bonus supplier,
   - total terpenuhi,
   - stok saat ini per outlet,
   - minimum stok per outlet,
   - kebutuhan per outlet,
   - tanggal order,
   - tanggal referensi stok.
5. Jika ada warning dari backend, tampilkan dalam panel warning.
6. User tetap bisa mengubah quantity Roti Tawar secara manual setelah auto-fill.
7. Auto-fill hanya boleh menimpa quantity Roti Tawar, bukan material lain.
8. Auto-fill tidak boleh berjalan pada session read-only.

### 9.9 Tanggal Order

1. Tanggal default mengikuti tanggal operasional existing.
2. Tombol `Besok` mengubah tanggal order ke tanggal operasional besok.
3. Saat tanggal berubah, session yang sesuai harus dibuat atau dimuat.
4. Jika session tanggal tersebut sudah ada, quantity existing harus dimuat.
5. UI harus memberi sinyal bahwa user sedang melihat order untuk tanggal tertentu.
6. Untuk kalkulasi Roti Tawar, UI harus tetap membedakan tanggal order dan tanggal referensi stok.

### 9.10 Review Order

1. Tombol review harus disabled jika:
   - session belum siap,
   - data masih loading,
   - proses kalkulasi sedang berjalan.
2. Sebelum navigate ke review, semua save tertunda harus dibereskan.
3. Navigasi tetap menuju `/order/:sessionId/review`.
4. Tidak boleh ada quantity yang hilang karena user terlalu cepat klik review setelah input.

## 10. UX Requirements

1. Gunakan bahasa yang familiar bagi user operasional.
2. Hindari istilah teknis seperti `matrix`, `sessionId`, `request item`, atau `calculate`.
3. Gunakan label aksi yang jelas:
   - `Review Order`,
   - `Hitung Otomatis Roti Tawar`,
   - `Tersimpan`,
   - `Gagal menyimpan`.
4. Gunakan spacing yang konsisten.
5. Jangan menumpuk terlalu banyak tombol dalam satu area kecil.
6. Elemen penting harus mudah ditemukan tanpa scroll panjang.
7. Warna error, warning, dan sukses harus konsisten dengan style existing.
8. Gunakan icon dari `lucide-react` jika menambahkan icon.
9. UI harus tetap terbaca pada layar kecil.
10. Teks dalam tombol dan badge tidak boleh terpotong.
11. Fokus keyboard pada input harus jelas.
12. Loading state harus mencegah double click yang berisiko.

## 11. Data dan State yang Harus Dijaga

State existing yang harus tetap dipertahankan atau diganti dengan struktur setara:

1. `orderDate`
2. `rotiReferenceDate`
3. `session`
4. `materials`
5. `outlets`
6. `matrix`
7. `loading`
8. `saving`
9. `calculating`
10. `rotiLoading`
11. `rotiError`
12. `rotiDetail`
13. `rotiStockMap`
14. `outletOpen`
15. `outletDays`
16. `saveTimers`

Jika layout dipecah menjadi komponen baru, state harus tetap memiliki satu sumber kebenaran agar input antar mode tidak saling tidak sinkron.

## 12. Rekomendasi Komponen

Untuk membuat kode lebih rapi, `OrderEntry.jsx` sebaiknya dipecah menjadi beberapa komponen:

1. `OrderEntryHeader`
   - tanggal,
   - tombol Besok,
   - status session,
   - status simpan,
   - tombol review.

2. `OrderSummaryBar`
   - outlet aktif,
   - material aktif,
   - total quantity,
   - outlet terisi.

3. `OutletControlsPanel`
   - status buka/tutup,
   - pilihan 1 hari/2 hari,
   - total per outlet.

4. `OrderInputModes`
   - segmented control mode input.

5. `OutletOrderInput`
   - input per outlet.

6. `MaterialOrderInput`
   - input per bahan.

7. `OrderMatrixInput`
   - mode matrix existing yang dirapikan.

8. `RotiTawarPanel`
   - kalkulasi otomatis,
   - hasil,
   - warning/error.

9. `SaveStatus`
   - idle,
   - saving,
   - saved,
   - error.

## 13. Acceptance Criteria

1. User dapat membuka halaman Input Order tanpa error.
2. Material aktif dan outlet aktif tampil sesuai data API.
3. User dapat memilih tanggal order.
4. User dapat klik `Besok` dan session tanggal besok dibuat/dimuat.
5. User dapat mengisi quantity pada mode input utama.
6. Quantity tersimpan otomatis setelah user berhenti mengetik.
7. Status simpan berubah dari `Menyimpan...` menjadi `Tersimpan`.
8. Jika autosave gagal, user melihat pesan error di UI.
9. Quantity existing tetap muncul setelah halaman di-refresh.
10. User dapat mengubah status outlet buka/tutup.
11. User dapat mengubah mode outlet 1 hari/2 hari.
12. User dapat menjalankan kalkulasi otomatis Roti Tawar.
13. Hasil kalkulasi Roti Tawar mengisi quantity hanya untuk material Roti Tawar.
14. Quantity material lain tidak berubah setelah kalkulasi Roti Tawar.
15. User dapat mengubah quantity Roti Tawar secara manual setelah auto-fill.
16. Total per outlet, total per bahan, dan total keseluruhan sesuai isi input.
17. Tombol `Review Order` membawa user ke halaman review session yang benar.
18. Semua pending save selesai sebelum masuk review.
19. Session dengan status `sent` atau `completed` tampil read-only.
20. Pada session read-only, semua input dan tombol kalkulasi tidak bisa mengubah data.
21. Layout desktop tidak terlihat penuh sesak dan tetap rapi saat jumlah outlet banyak.
22. Layout mobile dapat digunakan tanpa harus mengandalkan matrix lebar sebagai pengalaman utama.
23. Tidak ada error JavaScript di console untuk flow utama.
24. Tidak ada request API berulang tidak perlu yang membuat UI lambat.
25. Build frontend berhasil.

## 14. Edge Cases

1. API material gagal.
   - Tampilkan error state dan tombol coba lagi.

2. API outlet gagal.
   - Tampilkan error state dan tombol coba lagi.

3. Session tanggal tertentu tidak ditemukan.
   - Sistem membuat session baru jika flow memang create/load by date.

4. User mengganti tanggal saat ada save tertunda.
   - Sistem harus menyelesaikan save atau mencegah pergantian sampai aman.

5. User mengetik angka lalu langsung klik Review.
   - Quantity terakhir tetap ikut tersimpan.

6. User menghapus isi input menjadi kosong.
   - UI boleh kosong saat editing, tetapi nilai tersimpan sebagai 0.

7. User memasukkan angka negatif.
   - Input harus menolak atau mengubah menjadi 0.

8. User memasukkan angka desimal.
   - Ikuti business rule existing. Jika quantity harus integer, cegah desimal.

9. User membuka session read-only dari link review.
   - Halaman input menampilkan data tetapi tidak bisa diedit.

10. Material Roti Tawar tidak ada atau nonaktif.
    - Panel Roti Tawar menampilkan pesan bahwa material tidak ditemukan.

11. Mapping outlet dengan cabang Roti Tawar tidak cocok.
    - Tampilkan warning agar user tahu outlet mana yang tidak terisi otomatis.

12. Kalkulasi Roti Tawar gagal dari backend.
    - Quantity existing tidak boleh dihapus.

13. User menekan `Hitung Otomatis Roti Tawar` berkali-kali.
    - Tombol disabled selama proses berjalan.

14. User menutup outlet lalu menjalankan auto-fill.
    - Quantity Roti Tawar outlet tersebut menjadi 0.

15. User mengubah 1 hari/2 hari lalu menjalankan auto-fill.
    - Quantity mengikuti mode terbaru.

## 15. Technical Requirements

1. Tetap gunakan React dan Tailwind sesuai struktur project existing.
2. Gunakan class design system existing seperti:
   - `page-shell`,
   - `page-shell-wide`,
   - `page-header`,
   - `card`,
   - `btn-primary`,
   - `btn-outline`,
   - `input`,
   - `badge-*`.
3. Jika perlu icon, gunakan dependency existing `lucide-react`.
4. Jangan mengubah kontrak backend kecuali memang diperlukan.
5. Jika mengubah struktur komponen, pastikan semua behavior existing tetap lolos test manual.
6. Hindari duplikasi logic save di banyak komponen.
7. Buat helper untuk key matrix agar tidak berulang, misalnya `getMatrixKey(outletId, materialId)`.
8. Gunakan derived value untuk total, bukan state manual yang rawan tidak sinkron.
9. Semua handler async harus memiliki error handling.
10. Komponen harus tetap aman saat data kosong.

## 16. Bug Prevention Requirements

1. Jangan memanggil save jika session bukan `draft`.
2. Jangan memanggil save jika `outlet_id` atau `material_id` kosong.
3. Jangan clear seluruh matrix kecuali benar-benar sedang mengganti session/tanggal dan data baru akan dimuat.
4. Jangan overwrite quantity manual material lain saat auto-fill Roti Tawar.
5. Jangan mengandalkan `console.error` sebagai satu-satunya error handling.
6. Jangan biarkan tombol review aktif saat save masih berjalan.
7. Jangan membuat state outlet open/days hilang saat data outlet reload.
8. Jangan membuat input controlled/uncontrolled warning.
9. Jangan membuat loop `useEffect` yang menyebabkan API terpanggil terus-menerus.
10. Jangan memformat angka input dengan format ribuan saat user sedang mengetik jika itu mengganggu editing.

## 17. QA Checklist

### Smoke Test

1. Buka `/order`.
2. Pastikan halaman tidak error.
3. Pastikan tanggal order tampil.
4. Pastikan daftar outlet dan material tampil.
5. Isi satu quantity.
6. Pastikan status simpan muncul.
7. Refresh halaman.
8. Pastikan quantity tetap ada.
9. Klik Review Order.
10. Pastikan masuk ke halaman review.

### Autosave Test

1. Isi quantity di beberapa outlet.
2. Ubah salah satu quantity menjadi kosong.
3. Ubah lagi menjadi angka.
4. Refresh halaman.
5. Pastikan nilai akhir yang tersimpan benar.

### Roti Tawar Test

1. Pilih tanggal order.
2. Jalankan `Hitung Otomatis Roti Tawar`.
3. Pastikan loading state muncul.
4. Pastikan hasil kalkulasi muncul.
5. Pastikan quantity Roti Tawar terisi.
6. Pastikan material selain Roti Tawar tidak berubah.
7. Ubah quantity Roti Tawar manual.
8. Refresh halaman.
9. Pastikan nilai manual tersimpan.

### Outlet Setting Test

1. Tutup salah satu outlet.
2. Jalankan auto-fill Roti Tawar.
3. Pastikan quantity outlet tersebut menjadi 0.
4. Ubah outlet menjadi buka.
5. Ubah mode 1 hari/2 hari.
6. Jalankan auto-fill lagi.
7. Pastikan quantity mengikuti aturan terbaru.

### Read-only Test

1. Buka session yang statusnya `sent` atau `completed`.
2. Pastikan semua input disabled.
3. Pastikan tombol `Besok` tidak bisa mengubah data.
4. Pastikan tombol auto-fill tidak bisa mengubah data.
5. Pastikan user tetap bisa menuju review.

### Responsive Test

1. Cek desktop lebar.
2. Cek laptop sedang.
3. Cek tablet.
4. Cek mobile.
5. Pastikan tidak ada teks/tombol yang saling bertumpuk.
6. Pastikan input quantity masih nyaman digunakan.

## 18. Success Metrics

1. User dapat menyelesaikan input order dengan langkah yang lebih jelas.
2. Jumlah kesalahan input outlet/material berkurang.
3. User tidak perlu mencari tombol atau informasi penting.
4. Tidak ada laporan quantity hilang setelah refresh atau saat lanjut review.
5. Tidak ada error JavaScript pada flow utama.
6. Tidak ada regresi pada pembuatan review order.

## 19. Rekomendasi Tahapan Implementasi

### Phase 1: Refactor Aman

1. Pecah `OrderEntry.jsx` menjadi komponen kecil tanpa mengubah behavior.
2. Tambahkan helper total dan matrix key.
3. Tambahkan status save berhasil/gagal.
4. Pastikan build dan flow existing tetap berjalan.

### Phase 2: Layout Baru

1. Tambahkan header baru.
2. Tambahkan summary bar.
3. Tambahkan panel pengaturan outlet.
4. Rapikan panel Roti Tawar.
5. Pertahankan matrix sebagai input utama sementara.

### Phase 3: Mode Input Lebih Mudah

1. Tambahkan mode `Per Outlet`.
2. Tambahkan mode `Per Bahan`.
3. Jadikan mode `Per Outlet` default untuk mobile.
4. Pertahankan mode `Matrix` untuk desktop/power user.

### Phase 4: QA dan Hardening

1. Jalankan build frontend.
2. Test semua flow manual pada QA checklist.
3. Perbaiki error handling save dan kalkulasi.
4. Cek responsive layout.
5. Pastikan tidak ada regresi session read-only dan review order.

## 20. Out of Scope untuk Implementasi Pertama

1. Drag and drop urutan outlet/material.
2. Bulk import dari Excel.
3. Permission per role.
4. Audit log perubahan quantity.
5. Offline mode.
6. Notifikasi real-time multi-user.

