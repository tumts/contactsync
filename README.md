# ContactSync  
  
Aplikasi Google Apps Script untuk sinkronisasi data siswa & orang tua dari Google Sheets ke Google Contacts menggunakan People API.  
  
ContactSync berjalan sebagai **project terpisah** dari SiswaHub, di spreadsheet sendiri, tetapi membaca data sumber dari spreadsheet SiswaHub via `openById()`.  
  
## Arsitektur  
  
## Arsitektur  
  
```  
┌───────────────────────────┐       ┌───────────────────────────┐  
│   Spreadsheet SiswaHub    │       │  Spreadsheet ContactSync  │  
│   (Data Populasi MTs      │ READ  │    (spreadsheet baru)     │  
│    Al Amin 2026)          │◄──────│                           │  
│                           │       │   Sheet: Config           │  
│   Sheet: DataSiswa        │       │   Sheet: Contacts         │  
│   Sheet: DataWali         │       │   Sheet: SyncLog          │  
│   Sheet: AppSettings      │       │   Sheet: Duplicates       │  
└───────────────────────────┘       └─────────────┬─────────────┘  
                                                  │  
                                                  │ SYNC  
                                                  │ (People API)  
                                                  ▼  
                                    ┌───────────────────────────┐  
                                    │      Google Contacts      │  
                                    │     (akun pengguna)       │  
                                    └─────────────┬─────────────┘  
                                                  │  
                                                  │ CHECK  
                                                  │ (GoWA API)  
                                                  ▼  
                                    ┌───────────────────────────┐  
                                    │    go-whatsapp-web        │  
                                    │    -multidevice           │  
                                    └───────────────────────────┘  
```
  
## Fitur Utama  
  
- **Scan DataSiswa**: Import dan normalisasi data dari sheet DataSiswa (spreadsheet SiswaHub) ke sheet Contacts lokal  
- **Naming Presets**: 3 format penamaan kontak (First Last, Last First, Full Name)  
- **Parent Contact Mode**: Konsolidasi (info parent di kontak siswa) atau terpisah  
- **Labels**: Pengelompokan kontak otomatis berdasarkan kelas, tahun ajaran, dan status siswa  
- **Student Status**: Tracking status siswa (Aktif, Berhenti, Lulus)  
- **Validasi Data**: Validasi format nomor HP, email, dan kelengkapan data  
- **Deteksi Duplikat**: Temukan duplikat berdasarkan email, telepon, atau nama+organisasi  
- **Preview Sync**: Dry-run untuk melihat kontak mana yang akan dibuat/diupdate  
- **Test Sync**: Uji coba sync sejumlah kecil kontak sebelum bulk sync  
- **Sync ke Google Contacts**: Sinkronisasi via People API dengan rate limiting & timeout guard  
- **Refresh dari Google Contacts**: Import balik data dari Google Contacts ke sheet  
- **WA Number Check**: Verifikasi nomor WhatsApp via go-whatsapp-web-multidevice API  
- **Dashboard**: UI admin popup dengan 5 tab (Overview, Contacts, WA Check, Logs, Data Quality)  
- **Sidebar**: Mini panel dengan overview ringkas, quick actions, dan pengaturan cepat  
  
## Setup  
  
### 1. Buat spreadsheet baru untuk ContactSync  
  
- Buat spreadsheet baru di Google Drive (misalnya "ContactSync MTs Al Amin")  
- Klik **Extensions > Apps Script**  
  
### 2. Enable People API di Google Cloud Console  
  
- Buka [Google Cloud Console](https://console.cloud.google.com)  
- Pilih project yang terkait dengan Apps Script (GCP Project ID: lihat di Apps Script > Project Settings)  
- Buka **APIs & Services > Library**  
- Cari "People API" dan klik **Enable**  
  
### 3. Enable People API Advanced Service di Apps Script editor  
  
- Di Apps Script editor, klik **Services** (ikon +) di sidebar kiri  
- Cari "People API" dan klik **Add**  
- Pastikan identifier-nya "People" dan version "v1"  
  
### 4. Copy semua file ke project  
  
Copy file-file berikut ke Apps Script editor:  
- `Code.gs`  
- `Config.gs`  
- `Utils.gs`  
- `Logger.gs`  
- `Sheets.gs`  
- `NamingService.gs`  
- `Validation.gs`  
- `PeopleService.gs`  
- `SyncService.gs`  
- `WaApi.gs`  
- `Dashboard.html`  
- `Dashboard.css.html` (buat sebagai HTML, nama: `Dashboard.css`)  
- `Dashboard.js.html` (buat sebagai HTML, nama: `Dashboard.js`)  
- `Sidebar.html`  
- `ConfigDialog.html`  
  
Atau gunakan `clasp`:  
```bash  
npm install -g @google/clasp  
clasp login  
clasp clone <SCRIPT_ID> --rootDir .  
clasp push  
```  
  
### 5. Copy appsscript.json  
  
- Di Apps Script editor, klik **Project Settings** (ikon gear)  
- Centang "Show 'appsscript.json' manifest file in editor"  
- Replace isi `appsscript.json` dengan file yang disediakan  
  
### 6. Jalankan onOpen() untuk otorisasi  
  
- Jalankan fungsi `onOpen()` sekali dari editor  
- Google akan minta otorisasi — klik **Review Permissions** > pilih akun > **Allow**  
- Refresh spreadsheet — menu "ContactSync" akan muncul  
  
### 7. Initialize Workspace  
  
- Klik menu **ContactSync > Initialize Workspace**  
- Ini akan membuat sheet Config, Contacts, SyncLog, dan Duplicates  
  
### 8. Konfigurasi Source Spreadsheet  
  
Di sheet **Config** atau via Sidebar/ConfigDialog, pastikan:  
- `SOURCE_SPREADSHEET_ID` = ID spreadsheet SiswaHub (set di sheet Config, jangan hardcode di kode)  
- `SOURCE_SHEET` = `DataSiswa`  
  
**PENTING**: Akun Google yang menjalankan ContactSync harus memiliki akses baca ke spreadsheet SiswaHub.  
  
### 9. Mulai sinkronisasi  
  
1. **Scan DataSiswa** — Import data dari spreadsheet SiswaHub  
2. **Validate** — Validasi format data  
3. **Preview Sync** — Dry-run, lihat create/update/skip  
4. **Test Sync** — Uji coba dengan 2 kontak pertama  
5. **Run Sync** — Eksekusi sinkronisasi ke Google Contacts  
  
## Catatan Penting  
  
- ContactSync **TIDAK boleh** di-deploy ke spreadsheet yang sama dengan SiswaHub karena konflik fungsi (`doGet`, `include`)  
- ContactSync hanya **MEMBACA** data dari spreadsheet SiswaHub, tidak menulis  
- Perubahan data siswa tetap dilakukan melalui SiswaHub  
- Setiap kali data siswa berubah di SiswaHub, jalankan "Scan DataSiswa" ulang di ContactSync  
  
## WA API Setup  
  
ContactSync mendukung verifikasi nomor WhatsApp menggunakan [go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice).  
  
Di sheet Config atau via Sidebar/ConfigDialog, atur:  
- `WA_API_ENABLED`: `true` untuk mengaktifkan  
- `WA_API_BASE_URL`: URL server WA API (default: `http://localhost:3000`)  
- `WA_API_BASIC_AUTH_USER` / `WA_API_BASIC_AUTH_PASS`: Opsional Basic Auth  
- `WA_API_TIMEOUT_MS`: Timeout per request (default: 10000)  
- `WA_API_BATCH_DELAY_MS`: Delay antar request batch (default: 5000)  
  
Endpoint yang digunakan:  
- `GET /app/devices` — Cek koneksi & status device  
- `GET /user/check?phone=628xxx` — Cek apakah nomor terdaftar di WhatsApp  
  
## Keamanan  
  
### Kredensial  
- Jangan commit ID spreadsheet, password, atau API credentials ke repository  
- Semua nilai sensitif disimpan di sheet Config (bukan di kode)  
- Pastikan sheet Config tidak di-share ke publik  
  
### Mitigasi Anti-Blokir WhatsApp  
  
> **PERINGATAN:** go-whatsapp-web-multidevice bukan layanan resmi WhatsApp.  
> Penggunaan berlebihan dapat menyebabkan nomor WhatsApp diblokir permanen.  
  
Rekomendasi penggunaan:  
- **Gunakan nomor khusus** — Jangan gunakan nomor pribadi/utama  
- **Batasi pengecekan** — Maksimal 100 nomor per hari (default)  
- **Jeda antar cek** — Minimum 5 detik + jitter acak (default)  
- **Jeda antar batch** — 1 menit setiap 10 nomor (default)  
- **Hindari cek ulang** — Nomor yang sudah dicek tidak akan dicek ulang selama 7 hari  
- **Jalankan di luar jam sibuk** — Gunakan trigger malam hari jika memungkinkan  
- **Monitor log** — Periksa SyncLog untuk error berturut-turut (tanda rate limiting)  
  
Parameter yang bisa diatur di Config:  
| Key | Default | Keterangan |  
|---|---|---|  
| `WA_API_BATCH_DELAY_MS` | 5000 | Jeda minimum antar cek (ms) |  
| `WA_API_JITTER_MS` | 3000 | Randomisasi tambahan (ms) |  
| `WA_API_BATCH_SIZE` | 10 | Jumlah cek per batch |  
| `WA_API_BATCH_PAUSE_MS` | 60000 | Jeda antar batch (ms) |  
| `WA_API_DAILY_LIMIT` | 100 | Maksimal cek per hari |  
| `WA_API_RECHECK_DAYS` | 7 | Jangan cek ulang dalam X hari |  
  
Jika nomor terkena blokir:  
1. Hentikan semua pengecekan segera  
2. Tunggu 24-48 jam sebelum mencoba lagi  
3. Naikkan nilai delay dan kurangi daily limit  
4. Pertimbangkan menggunakan nomor baru  
  
## People API Quota  
  
Google People API memiliki rate limit:  
- **Read requests**: 90 queries per minute per user  
- **Write requests**: 60 queries per minute per user  
  
ContactSync menerapkan:  
- Delay 1 detik antar setiap API call saat sync  
- Batch 50 kontak, pause 3 detik antar batch  
- Timeout guard 4.5 menit (sebelum GAS 5-minute limit)  
- Auto-resume dari progress yang tersimpan  
  
## File Structure  
  
```  
contactsync/  
├── appsscript.json        # Project manifest + OAuth scopes  
├── Code.gs                # Entry point, menu, dashboard data  
├── Config.gs              # Config loader/saver (key-value dari sheet Config)  
├── Utils.gs               # Phone/email normalization, helpers  
├── Logger.gs              # Structured logging ke SyncLog sheet  
├── Sheets.gs              # Sheet CRUD + readSourceSheetAsObjects (openById)  
├── NamingService.gs       # 3 naming presets (First Last, Last First, Full Name)  
├── Validation.gs          # Data validation & duplicate detection  
├── PeopleService.gs       # Google Contacts via People API  
├── SyncService.gs         # Sync orchestrator  
├── WaApi.gs               # WhatsApp number verification via GoWA  
├── Dashboard.html         # Main HTML template (popup dialog)  
├── Dashboard.css.html     # CSS styles  
├── Dashboard.js.html      # JavaScript (vanilla, string concatenation)  
├── Sidebar.html           # Mini sidebar panel  
├── ConfigDialog.html      # Config modal dialog  
├── README.md              # Dokumentasi  
└── ROADMAP.md             # Rencana pengembangan  
```  
  
## Proyek Terkait  
  
- [SiswaHub Pro 2026](https://github.com/tumts/siswahub) — Sistem Informasi Manajemen Data Siswa (sumber data)  
- [go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice) — WhatsApp API gateway
