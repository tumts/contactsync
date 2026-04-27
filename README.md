# ContactSync  
  
Aplikasi Google Apps Script untuk sinkronisasi data siswa & orang tua dari Google Sheets ke Google Contacts menggunakan People API.  
  
ContactSync berjalan sebagai **project terpisah** dari SiswaHub, di spreadsheet sendiri, tetapi membaca data sumber dari spreadsheet SiswaHub via `openById()`.  
```
## Arsitektur  
  
```  
┌─────────────────────────┐     ┌─────────────────────────┐  
│  Spreadsheet SiswaHub   │     │ Spreadsheet ContactSync │  
│  (Data Populasi MTs     │ READ│   (spreadsheet baru)    │  
│   Al Amin 2026)         │◄────│                         │  
│                         │     │  Sheet: Config          │  
│  Sheet: DataSiswa       │     │  Sheet: Contacts        │  
│  Sheet: DataWali        │     │  Sheet: SyncLog         │  
│  Sheet: AppSettings     │     │  Sheet: Duplicates      │  
└─────────────────────────┘     └──────────┬──────────────┘  
                                           │  
                                           │ SYNC (People API)  
                                           ▼  
                                ┌─────────────────────────┐  
                                │    Google Contacts       │  
                                │    (akun pengguna)       │  
                                └──────────┬──────────────┘  
                                           │  
                                           │ CHECK (GoWA API)  
                                           ▼  
                                ┌─────────────────────────┐  
                                │  go-whatsapp-web         │  
                                │  -multidevice            │  
                                └─────────────────────────┘  
```

## Fitur Utama  
  
### Data Management  
- **Scan DataSiswa**: Import dan normalisasi data dari sheet DataSiswa (spreadsheet SiswaHub) ke sheet Contacts lokal  
- **Parent Contact Mode**: Konsolidasi (info parent di kontak siswa) atau terpisah (kontak ayah/ibu sendiri)  
- **Validasi Data**: Validasi format nomor HP, email, kelengkapan data, dan status siswa  
- **Deteksi Duplikat**: Temukan duplikat berdasarkan email, telepon, atau nama+organisasi  
- **Data Quality Report**: Daftar kontak invalid dengan filter per kategori error dan export CSV  
  
### Naming & Labels  
- **3 Naming Presets**: First Last, Last First, Full Name — nama murni tanpa metadata  
- **Google Contacts Labels**: Pengelompokan otomatis via labels (Kelas, Tahun Ajaran, Status)  
- **Student Status**: Aktif, Berhenti, Lulus — bisa diubah per kontak dari Dashboard  
  
### Sync  
- **Preview Sync**: Dry-run untuk melihat kontak mana yang akan dibuat/diupdate/skip  
- **Test Sync**: Uji coba sync 2 kontak pertama sebelum bulk  
- **Execute Sync**: Sinkronisasi via People API dengan rate limiting, timeout guard, dan auto-resume  
- **Cancel Sync**: Hentikan proses sync yang sedang berjalan  
- **Clear Errors & Reset**: Hapus error logs dan reset kontak error ke pending  
- **Refresh dari Google Contacts**: Import balik data dari Google Contacts ke sheet  
- **Schema Migration**: Migrasi data kontak ke schema baru  
  
### WhatsApp Verification  
- **Test Connection**: Cek koneksi ke GoWA API server  
- **Test WA Check**: Uji coba cek 2 nomor pertama dengan detail (pushName, verifiedName)  
- **Check by Filter**: Cek nomor per kelas/rombel  
- **Check All Numbers**: Cek semua nomor dengan daily limit dan recheck protection  
- **User Info & Avatar**: Ambil pushName dan avatar dari WhatsApp (opsional)  
  
### Dashboard UI  
- **Popup Dashboard**: Modeless dialog di atas spreadsheet (900x600)  
- **Sidebar Shortcut**: Panel ringkas dengan overview, quick actions, dan settings  
- **Config Dialog**: Modal terpisah untuk pengaturan lengkap  
- **5 Tab**: Overview, Contacts, WA Check, Logs, Data Quality  
- **Custom Dialog Forms**: Prompt dan konfirmasi menggunakan modal kustom (bukan native alert)  
- **Filter Pills**: Filter kontak per kelas (7/8/9) dan rombel (A/B/C/...)  
- **Contact Detail Modal**: Lihat detail kontak lengkap dengan opsi ubah status  
  
## Setup  
  
### 1. Buat spreadsheet baru untuk ContactSync  
  
- Buat spreadsheet baru di Google Drive (misalnya "ContactSync MTs Al Amin")  
- Klik **Extensions > Apps Script**  
  
### 2. Enable People API di Google Cloud Console  
  
- Buka [Google Cloud Console](https://console.cloud.google.com)  
- Pilih project yang terkait dengan Apps Script (project number: lihat di Apps Script > Project Settings)  
- Buka **APIs & Services > Library**  
- Cari "People API" dan klik **Enable**  
  
> **PENTING**: Ini hanya perlu dilakukan SEKALI. Setelah diaktifkan di GCP, People API akan tetap aktif meskipun `clasp push` dilakukan berulang kali.  
  
### 3. Enable People API Advanced Service di Apps Script editor  
  
- Di Apps Script editor, klik **Services** (ikon +) di sidebar kiri  
- Cari "People API" dan klik **Add**  
- Pastikan identifier-nya "People" dan version "v1"  
  
### 4. Deploy kode ke Apps Script  
  
Menggunakan `clasp`:  

bash  
npm install -g @google/clasp  
clasp login  
clasp clone <SCRIPT_ID> --rootDir .  
clasp push --force
Atau copy manual semua file .gs dan .html ke Apps Script editor.

5. Pastikan appsscript.json sudah benar
Di Apps Script editor, klik Project Settings (ikon gear) > centang "Show 'appsscript.json' manifest file in editor". Pastikan isinya sesuai dengan appsscript.json di repository.

6. Jalankan onOpen() untuk otorisasi
Jalankan fungsi onOpen() sekali dari editor
Google akan minta otorisasi — klik Review Permissions > pilih akun > Allow
Refresh spreadsheet — menu "ContactSync" akan muncul
7. Initialize Workspace
Klik menu ContactSync > Initialize Workspace
Ini akan membuat sheet Config, Contacts, SyncLog, dan Duplicates
8. Konfigurasi
Di sheet Config atau via Sidebar > All Settings, pastikan:

SOURCE_SPREADSHEET_ID = ID spreadsheet SiswaHub
SOURCE_SHEET = DataSiswa
DEFAULT_ORGANIZATION = Nama sekolah
DEFAULT_GROUP_NAME = Nama grup kontak siswa
DEFAULT_YEAR_LABEL = Tahun ajaran (misal: 2026)
PENTING: Akun Google yang menjalankan ContactSync harus memiliki akses baca ke spreadsheet SiswaHub.

9. Mulai sinkronisasi
Scan DataSiswa — Import data dari spreadsheet SiswaHub
Validate — Validasi format data
Test Sync (2) — Uji coba sync 2 kontak pertama
Preview Sync — Dry-run, lihat create/update/skip
Execute Sync — Eksekusi sinkronisasi ke Google Contacts
Catatan Penting
ContactSync TIDAK boleh di-deploy ke spreadsheet yang sama dengan SiswaHub karena konflik fungsi (doGet, include)
ContactSync hanya MEMBACA data dari spreadsheet SiswaHub, tidak menulis
Perubahan data siswa tetap dilakukan melalui SiswaHub
Setiap kali data siswa berubah di SiswaHub, jalankan "Scan DataSiswa" ulang di ContactSync
Data WA check dan sync status dipertahankan saat re-scan (berdasarkan phone number atau dedupeKey)
WA API Setup
ContactSync mendukung verifikasi nomor WhatsApp menggunakan go-whatsapp-web-multidevice.

Di sheet Config atau via Sidebar > All Settings, atur:

WA_API_ENABLED: true untuk mengaktifkan
WA_API_BASE_URL: URL server WA API (contoh: https://wa.example.com)
WA_API_BASIC_AUTH_USER / WA_API_BASIC_AUTH_PASS: Basic Auth credentials
WA_API_DEVICE_ID: Device ID (opsional, untuk multi-device)
WA_API_TIMEOUT_MS: Timeout per request (default: 10000)
Endpoint yang digunakan:

GET /app/status — Cek status koneksi device
GET /devices — Fallback cek koneksi
GET /user/check?phone=62xxx — Cek apakah nomor terdaftar di WhatsApp
GET /user/info?phone=62xxx — Ambil pushName dan verified name
GET /user/avatar?phone=62xxx — Ambil URL avatar
Catatan: GoWA API mengembalikan body.code = "SUCCESS" (string), bukan 200 (number). Field registrasi adalah body.results.is_on_whatsapp (boolean).

Keamanan
Kredensial
Jangan commit ID spreadsheet, password, atau API credentials ke repository
Semua nilai sensitif disimpan di sheet Config (bukan di kode)
Pastikan sheet Config tidak di-share ke publik
Mitigasi Anti-Blokir WhatsApp
PERINGATAN: go-whatsapp-web-multidevice bukan layanan resmi WhatsApp.
Penggunaan berlebihan dapat menyebabkan nomor WhatsApp diblokir permanen.

Rekomendasi penggunaan:

Gunakan nomor khusus — Jangan gunakan nomor pribadi/utama
Batasi pengecekan — Maksimal 100 nomor per hari (default)
Jeda antar cek — Minimum 5 detik + jitter acak (default)
Jeda antar batch — 1 menit setiap 10 nomor (default)
Hindari cek ulang — Nomor yang sudah dicek tidak akan dicek ulang selama 7 hari
Monitor log — Periksa SyncLog untuk error berturut-turut (tanda rate limiting)
Parameter yang bisa diatur di Config:
```
Key	Default	Keterangan
WA_API_BATCH_DELAY_MS	5000	Jeda minimum antar cek (ms)
WA_API_JITTER_MS	3000	Randomisasi tambahan (ms)
WA_API_BATCH_SIZE	10	Jumlah cek per batch
WA_API_BATCH_PAUSE_MS	60000	Jeda antar batch (ms)
WA_API_DAILY_LIMIT	100	Maksimal cek per hari
WA_API_RECHECK_DAYS	7	Jangan cek ulang dalam X hari
```
People API Quota
Google People API memiliki rate limit:

Read requests: 90 queries per minute per user
Write requests: 60 queries per minute per user
ContactSync menerapkan:

Delay 1 detik antar setiap API call saat sync
Batch 50 kontak, pause 3 detik antar batch
Timeout guard 4.5 menit (sebelum GAS 5-minute limit)
Auto-resume dari progress yang tersimpan
Stop otomatis setelah 5 error berturut-turut
Clasp & Deployment
.claspignore
File .claspignore mencegah file non-kode ter-push ke Apps Script:

```
*.md  
.git/**  
.gitignore  
.clasp.json  
.claspignore  
docs/**  
node_modules/**  
LICENSE
```
Deploy workflow
```
# Pull perubahan dari GitHub  
git pull origin main  
  
# Push ke Apps Script (skip manifest prompt)  
clasp push --force  
  
# Verifikasi di Apps Script editor  
# Run > Run function > testPeopleAPI (opsional)
```
File Structure
```
contactsync/  
├── appsscript.json          # Project manifest + OAuth scopes  
├── Code.gs                  # Entry point, menu, dashboard data, migration  
├── Config.gs                # Config loader/saver (key-value dari sheet Config)  
├── Utils.gs                 # Phone/email normalization, labels, helpers  
├── Logger.gs                # Structured logging ke SyncLog sheet  
├── Sheets.gs                # Sheet CRUD + readSourceSheetAsObjects (openById)  
├── NamingService.gs         # 3 naming presets (pure names)  
├── Validation.gs            # Data validation & duplicate detection  
├── PeopleService.gs         # Google Contacts via People API  
├── SyncService.gs           # Sync orchestrator (scan, preview, run)  
├── WaApi.gs                 # WhatsApp number verification via GoWA  
├── Dashboard.html           # Main HTML template (5 tabs)  
├── Dashboard.css.html       # CSS styles  
├── Dashboard.js.html        # JavaScript (vanilla, string concatenation)  
├── Sidebar.html             # Sidebar shortcut panel  
├── ConfigDialog.html        # Full config modal dialog  
├── README.md                # Dokumentasi  
└── ROADMAP.md               # Rencana pengembangan
```
Proyek Terkait
SiswaHub Pro 2026 — Sistem Informasi Manajemen Data Siswa (sumber data)
