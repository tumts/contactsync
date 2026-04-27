# ContactSync — Roadmap  
  
Dokumen ini mencatat rencana pengembangan fitur ContactSync berdasarkan hasil analisis dan brainstorming.  
Terakhir diperbarui: 2026-04-27.  
  
---  
  
## Status Legenda  
  
| Simbol | Arti |  
|--------|------|  
| ✅ | Selesai |  
| 🔧 | Sedang dikerjakan / perlu fix |  
| 📋 | Direncanakan |  
| ❌ | Dibatalkan |  
  
---  
  
## Fase 1 — Fondasi UI (✅ Selesai)  
  
Mengubah deployment dari web app ke popup dialog di atas spreadsheet.  
  
| Item | Status | PR |  
|------|--------|----|  
| Ubah `openDashboard()` ke `showModelessDialog()` | ✅ | #15 |  
| Buat `Sidebar.html` dengan mini overview + quick actions | ✅ | #15 |  
| Ubah menu `onOpen()` — tambah "Open Sidebar" | ✅ | #15 |  
| Hapus tab Sync dari Dashboard | ✅ | #15 |  
| Pindahkan sync settings ke Config | ✅ | #15 |  
| Gabung sync actions ke Quick Actions di Overview | ✅ | #15 |  
| Hapus `DEFAULT_CLASS_LABEL` dari config | ✅ | #15 |  
  
---  
  
## Fase 2 — Data Model & Naming (✅ Selesai)  
  
Mengubah skema penamaan dan menambah field baru.  
  
| Item | Status | PR |  
|------|--------|----|  
| Naming preset: First Last, Last First, Full Name | ✅ | #15 |  
| Tambah field: `studentStatus`, `birthday`, `labels` | ✅ | #15 |  
| Tambah field: `middleName`, `namePrefix`, `nameSuffix`, `nickname`, `fileAs` | ✅ | #15 |  
| `buildLabels()` — label dari classLabel + yearLabel + status | ✅ | #15 |  
| `buildParentLabels()` — label orangtua dengan role | ✅ | #15 |  
| Parent contact naming: `{parentRole} {studentName} - {classLabel}` | ✅ | #15 |  
| Fungsi `migrateToNewSchema()` untuk migrasi data lama | ✅ | #15 |  
| Preserve WA/sync data saat re-scan (phone key + dedupeKey fallback) | ✅ | #20 |  
  
---  
  
## Fase 3 — WA Check Enhancement (🔧 Sedang Dikerjakan)  
  
Memperbaiki dan menambah fitur pengecekan WhatsApp.  
  
| Item | Status | PR/Catatan |  
|------|--------|------------|  
| Fix `body.code === "SUCCESS"` (bukan 200) | 🔧 | GoWA returns string "SUCCESS" |  
| Fix `is_on_whatsapp` (bukan `is_registered`) | 🔧 | Ditemukan via curl test |  
| Test WA Check (2 nomor) | ✅ | #19 |  
| Check by class/rombel filter | 📋 | `checkNumbersByClass()` |  
| Dropdown filter Kelas + Rombel di tab WA Check | 📋 | Populate dari data kontak |  
| `getWaUserInfo()` — ambil pushName dari GoWA | 📋 | Endpoint: `GET /user/info` |  
| `getWaUserAvatar()` — ambil avatar URL | 📋 | Endpoint: `GET /user/avatar` |  
| Tampilkan sisa kuota di prompt sebelum cek | 📋 | |  
  
### Catatan Teknis WA API (GoWA)  
  
Response format dari `GET /user/check?phone=628xxx`:  
```
json  
{  
  "code": "SUCCESS",  
  "message": "Success check user",  
  "results": {  
    "is_on_whatsapp": true  
  }  
}
```
Parsing harus mengecek:

body.code === "SUCCESS" atau String(body.code).toUpperCase() === "SUCCESS" (bukan Number(body.code) === 200)
body.results.is_on_whatsapp (bukan is_registered)
## Fase 4 — Custom UI Components (🔧 Sedang Dikerjakan)  
  
Mengganti native browser dialogs dengan custom modal forms.  
  
| Item | Status | PR/Catatan |  
|------|--------|------------|  
| `showCustomDialog()` — prompt, confirm, danger | ✅ | #19 |  
| Ganti `prompt()` di Test Sync | ✅ | #19 |  
| Ganti `prompt()` di Test WA Check | ✅ | #19 |  
| Ganti `confirm()` di Clear Errors | ✅ | #19 |  
| Ganti `confirm()` di Check by Filter (no filter) | ✅ | #19 |  
| Ganti `confirm()` di Clear Logs | ✅ | #19 |  
| Toast notification (`showNotification()`) | 📋 | Ganti `showAlert()` untuk feedback singkat |  
| Edit student status per kontak di contact detail modal | 📋 | Dropdown di modal detail |  
  
## Fase 5 — Dashboard Enhancement (📋 Direncanakan)  
  
| Item | Status | Catatan |  
|------|--------|---------|  
| Filter pills per Kelas (7/8/9) dan Rombel (A/B/C) di tab Contacts | 📋 | Parse `classLabel` |  
| Pindahkan Quick Actions ke atas Ringkasan per Kelas | 📋 | Di tab Overview |  
| Sidebar settings (Year Label, Naming Preset, Default Status) | 📋 | Di `Sidebar.html` |  
| Tombol "All Settings..." di sidebar buka ConfigDialog | 📋 | `showModalDialog()` |  
| Loading progress animation untuk setiap proses | 📋 | Polling mechanism |  
| Cancel Sync button visibility fix | 📋 | Tampil di Overview + Sync |  
  
## Fase 6 — Data Quality (📋 Direncanakan)  
  
| Item | Status | Catatan |  
|------|--------|---------|  
| Daftar kontak invalid dengan fitur export CSV | 📋 | Untuk perbaikan di SiswaHub |  
| Daftar kontak kategori kosong | 📋 | `classLabel`/`yearLabel` kosong |  
| Deteksi duplikat: phone/email overlap siswa-orangtua | 📋 | Kemungkinan nomor milik orangtua |  
| Export invalid contacts ke CSV untuk catatan perbaikan | 📋 | Download dari Dashboard |  
  
## Keputusan Arsitektur  
  
Catatan keputusan yang sudah dibuat selama pengembangan:  
  
| Topik | Keputusan | Alasan |  
|-------|-----------|--------|  
| Deploy mode | Popup modeless dialog (`showModelessDialog`) | Hindari perubahan data tidak sengaja di spreadsheet |  
| Sidebar | Mini panel dengan overview + quick actions + settings | Akses cepat tanpa buka popup |  
| Naming | First/Last name + labels (bukan preset di `fullName`) | Sesuai struktur Google Contacts CSV |  
| Parent naming | `{role} {studentName} - {classLabel}` | Mudah dikenali di daftar kontak |  
| Labels | `classLabel ::: yearLabel ::: studentStatus` | Pengelompokan di Google Contacts |  
| GoWA response | `body.code="SUCCESS"`, field `is_on_whatsapp` | Ditemukan via curl test 2026-04-27 |  
| Duplikat | Cek phone/email overlap antara siswa dan orangtua | Nomor yang sama = kemungkinan milik orangtua |  
| Quota WA | 100/hari default, tampilkan sisa di prompt | Anti-blokir WhatsApp |  
| Config | Sidebar (ringkas) + ConfigDialog (lengkap) | Sidebar 300px tidak muat semua config |  
| GCP Project | ID: `245955761246` | Diubah 2026-04-27 |  
| Tab Sync | Dihapus, digabung ke Overview + Config | Tumpang tindih dengan Quick Actions |  
  
## Endpoint GoWA yang Digunakan  
  
| Endpoint | Method | Fungsi di Kode | Keterangan |  
|----------|--------|----------------|------------|  
| `/app/devices` | `GET` | `testWaConnection()` | Cek koneksi & status device |  
| `/user/check?phone=628xxx` | `GET` | `checkWhatsAppNumber()` | Cek nomor terdaftar di WA |  
| `/user/info?phone=628xxx` | `GET` | `getWaUserInfo()` (planned) | Ambil pushName, verified name |  
| `/user/avatar?phone=628xxx` | `GET` | `getWaUserAvatar()` (planned) | Ambil URL avatar |

Referensi
Google People API
Google Contacts CSV Structure
go-whatsapp-web-multidevice
clasp - Command Line Apps Script
