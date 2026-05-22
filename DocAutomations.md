# HR Document Automation — Comprehensive Product Specification

> A web-based HR document automation platform for Indonesian HR professionals.
> Input only the unique fields per document type (PKWT, SK, Memo, SP, etc.),
> and the app automatically generates a filled Google Doc and saves it to the correct Google Drive folder.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [App Architecture](#app-architecture)
3. [Database Schema](#database-schema)
4. [Authentication & Google OAuth](#authentication--google-oauth)
5. [Document Types & Field Definitions](#document-types--field-definitions)
6. [Google Docs & Drive Integration](#google-docs--drive-integration)
7. [Core Document Generation Engine](#core-document-generation-engine)
8. [UI — Dashboard & Document Form](#ui--dashboard--document-form)
9. [Document History & Log](#document-history--log)
10. [Auto Numbering System](#auto-numbering-system)
11. [Settings & Template Management](#settings--template-management)
12. [API Routes](#api-routes)
13. [Deployment](#deployment)
14. [Future Features](#future-features)

---

## Tech Stack

| Layer            | Technology                                                        |
| ---------------- | ----------------------------------------------------------------- |
| Framework        | Next.js 15 (App Router, Server Components, Server Actions)        |
| Language         | JavaScript (no TypeScript for simplicity)                         |
| Styling          | Tailwind CSS 4 + shadcn/ui component library                      |
| Auth             | NextAuth.js v5 (Google OAuth 2.0)                                 |
| Database         | Supabase (Postgres) — stores document logs and settings           |
| Google APIs      | Google Docs API v1 + Google Drive API v3                          |
| State Management | React useState / useReducer (client), Server Actions (server)     |
| Forms            | React Hook Form + Zod validation                                  |
| Date Handling    | date-fns with Indonesian locale (id)                              |
| Notifications    | Sonner (toast notifications)                                      |
| Icons            | Lucide React                                                      |
| Deployment       | Vercel (free tier)                                                |
| Env Variables    | .env.local for local, Vercel dashboard for production             |

---

## App Architecture

```
/
├── app/
│   ├── page.tsx                        # Landing / login page
│   ├── layout.tsx                      # Root layout with SessionProvider
│   ├── (auth)/
│   │   └── login/page.tsx              # Google login page
│   ├── (app)/
│   │   ├── layout.tsx                  # App shell with sidebar
│   │   ├── dashboard/page.tsx          # Main dashboard — choose document type
│   │   ├── generate/
│   │   │   └── [type]/page.tsx         # Dynamic form page per document type
│   │   ├── history/page.tsx            # Document generation history
│   │   └── settings/page.tsx           # Template IDs, folder IDs, preferences
├── components/
│   ├── ui/                             # shadcn/ui base components
│   ├── DocumentCard.tsx                # Card to select document type
│   ├── DynamicForm.tsx                 # Renders form fields based on doc type
│   ├── HistoryTable.tsx                # Table of generated documents
│   └── Sidebar.tsx                     # App navigation
├── lib/
│   ├── google.ts                       # Google Docs + Drive API helpers
│   ├── document-configs.ts             # All document types, fields, placeholders
│   ├── auto-numbering.ts               # Document number generator
│   └── supabase.ts                     # Supabase client
├── app/api/
│   ├── auth/[...nextauth]/route.ts     # NextAuth Google OAuth handler
│   └── generate-document/route.ts     # POST — core document generation endpoint
├── .env.local                          # Environment variables (never commit)
└── middleware.ts                       # Protect app routes (redirect if not authed)
```

---

## Database Schema

### Table: `document_logs`

Stores every generated document for history and audit purposes.

```sql
create table document_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  user_email text not null,
  document_type text not null,           -- 'pkwt' | 'sk' | 'memo' | 'sp'
  document_number text not null,         -- e.g. '0033/ SPK/HRD-LBM/INT.24/I/2026'
  sequence_number integer not null,      -- numeric only (e.g. 33) — global, never resets
  company_code text not null,            -- e.g. 'LBM' — which holding company this doc belongs to
  employee_name text,                    -- nama_karyawan for quick display in history table
  google_doc_id text not null,           -- ID of the generated Google Doc
  google_doc_url text not null,          -- Full URL to the generated doc
  form_data jsonb                        -- Full snapshot of all form values used
);
```

### Table: `settings`

Stores per-user configuration (template IDs, folder IDs, company info).

```sql
create table settings (
  id uuid primary key default gen_random_uuid(),
  user_email text unique not null,
  signatory_name text,                   -- nama_penandatangan (default for all docs)
  signatory_title text,                  -- jabatan_penandatangan
  pkwt_template_id text,
  pkwt_folder_id text,
  sk_template_id text,
  sk_folder_id text,
  memo_template_id text,
  memo_folder_id text,
  sp_template_id text,
  sp_folder_id text
);

-- Separate table for holding company codes (editable by user in Settings)
create table company_codes (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  code text not null,                    -- 'LBM' | 'LKM' | 'DGL' | 'Numeta' | 'Tunet' | 'MSH'
  name text not null,                    -- Full company name (editable)
  sort_order integer default 0
);

-- Seed data (run after table creation):
-- INSERT INTO company_codes (user_email, code, name, sort_order) VALUES
--   ('your@email.com', 'LBM',    'LBM',    1),
--   ('your@email.com', 'LKM',    'LKM',    2),
--   ('your@email.com', 'DGL',    'DGL',    3),
--   ('your@email.com', 'Numeta', 'Numeta', 4),
--   ('your@email.com', 'Tunet',  'Tunet',  5),
--   ('your@email.com', 'MSH',    'MSH',    6);
```

---

## Authentication & Google OAuth

### Strategy
- Use **NextAuth.js v5** with the Google provider
- Request the following OAuth scopes on login:
  - `openid email profile`
  - `https://www.googleapis.com/auth/documents`
  - `https://www.googleapis.com/auth/drive`
- Store `access_token` in the JWT session so it can be passed to Google APIs server-side
- Protect all `/app/*` routes via `middleware.ts` — redirect unauthenticated users to `/login`

### Google Cloud Setup Required (document for user in README)
1. Create project at console.cloud.google.com
2. Enable: Google Docs API, Google Drive API
3. Create OAuth 2.0 Client ID (Web Application)
4. Add redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR_APP.vercel.app/api/auth/callback/google`
5. Add scopes: `documents`, `drive`
6. Add test users (Gmail accounts)

---

## Document Types & Field Definitions

Defined in `lib/document-configs.ts`. Each document type has:
- `id` — unique key used in routes (`/generate/pkwt`)
- `label` — display name in Indonesian
- `description` — short description shown on dashboard card
- `color` — accent color for the card
- `fields` — array of form field definitions
- `placeholders` — map of `{{placeholder}}` → form field key (for template replacement)

### PKWT (Perjanjian Kerja Waktu Tertentu)

```ts
{
  id: 'pkwt',
  label: 'PKWT',
  description: 'Perjanjian Kerja Waktu Tertentu',
  color: 'blue',
  fields: [
    { key: 'nomor_surat',    label: 'Nomor Surat',          type: 'text',   required: true },
    { key: 'nama_karyawan',  label: 'Nama Karyawan',        type: 'text',   required: true },
    { key: 'nik',            label: 'NIK',                  type: 'text',   required: true },
    { key: 'tempat_lahir',   label: 'Tempat Lahir',         type: 'text',   required: true },
    { key: 'tanggal_lahir',  label: 'Tanggal Lahir',        type: 'date',   required: true },
    { key: 'alamat',         label: 'Alamat',               type: 'textarea', required: true },
    { key: 'jabatan',        label: 'Jabatan / Posisi',     type: 'text',   required: true },
    { key: 'departemen',     label: 'Departemen',           type: 'text',   required: true },
    { key: 'tanggal_mulai',  label: 'Tanggal Mulai Kerja',  type: 'date',   required: true },
    { key: 'lama_kontrak',   label: 'Lama Kontrak (bulan)', type: 'number', required: true },
    { key: 'gaji_pokok',     label: 'Gaji Pokok (Rp)',      type: 'currency', required: true },
  ],
  // Auto-computed fields (not shown in form, computed in the API):
  // tanggal_selesai → calculated from tanggal_mulai + lama_kontrak
  // tanggal_surat   → today's date formatted in Indonesian
}
```

### SK (Surat Keputusan)

```ts
{
  id: 'sk',
  label: 'SK',
  description: 'Surat Keputusan',
  color: 'green',
  fields: [
    { key: 'nomor_sk',        label: 'Nomor SK',             type: 'text', required: true },
    { key: 'nama_karyawan',   label: 'Nama Karyawan',        type: 'text', required: true },
    { key: 'nik',             label: 'NIK',                  type: 'text', required: true },
    { key: 'jabatan_lama',    label: 'Jabatan Lama',         type: 'text', required: false },
    { key: 'jabatan_baru',    label: 'Jabatan Baru',         type: 'text', required: true },
    { key: 'departemen',      label: 'Departemen',           type: 'text', required: true },
    { key: 'tanggal_berlaku', label: 'Tanggal Berlaku',      type: 'date', required: true },
    { key: 'alasan',          label: 'Alasan / Pertimbangan',type: 'textarea', required: false },
  ]
}
```

### Memo

```ts
{
  id: 'memo',
  label: 'Memo',
  description: 'Memo Internal',
  color: 'yellow',
  fields: [
    { key: 'nomor_memo',  label: 'Nomor Memo',   type: 'text',     required: true },
    { key: 'kepada',      label: 'Kepada',        type: 'text',     required: true },
    { key: 'dari',        label: 'Dari',          type: 'text',     required: true },
    { key: 'perihal',     label: 'Perihal',       type: 'text',     required: true },
    { key: 'isi_memo',    label: 'Isi Memo',      type: 'textarea', required: true },
  ]
}
```

### SP (Surat Peringatan)

```ts
{
  id: 'sp',
  label: 'Surat Peringatan',
  description: 'SP 1 / SP 2 / SP 3',
  color: 'red',
  fields: [
    { key: 'nomor_sp',       label: 'Nomor SP',            type: 'text',   required: true },
    { key: 'tingkat_sp',     label: 'Tingkat SP',          type: 'select', options: ['SP 1', 'SP 2', 'SP 3'], required: true },
    { key: 'nama_karyawan',  label: 'Nama Karyawan',       type: 'text',   required: true },
    { key: 'nik',            label: 'NIK',                 type: 'text',   required: true },
    { key: 'jabatan',        label: 'Jabatan',             type: 'text',   required: true },
    { key: 'departemen',     label: 'Departemen',          type: 'text',   required: true },
    { key: 'pelanggaran',    label: 'Jenis Pelanggaran',   type: 'textarea', required: true },
    { key: 'tanggal_sp',     label: 'Tanggal SP',          type: 'date',   required: true },
  ]
}
```

---

## Google Docs & Drive Integration

All logic lives in `lib/google.ts`.

### Core Functions

```ts
// 1. Copy a template Google Doc and place it in a target folder
async function copyTemplate(auth, templateId, fileName, folderId): Promise<string>
// Returns: new document ID

// 2. Replace all {{placeholders}} in the copied doc with real values
async function replacePlaceholders(auth, docId, replacements: Record<string, string>): Promise<void>
// Uses docs.documents.batchUpdate with replaceAllText requests

// 3. Get the public URL of the generated doc
function buildDocUrl(docId: string): string
// Returns: `https://docs.google.com/document/d/${docId}/edit`
```

### Template Placeholder Format

All placeholders in Google Doc templates must follow this format exactly:
```
{{placeholder_key}}
```

Examples used in PKWT template:
```
{{nama_karyawan}}
{{nik}}
{{jabatan}}
{{departemen}}
{{tanggal_mulai}}
{{tanggal_selesai}}
{{lama_kontrak}}
{{gaji_pokok}}
{{nomor_surat}}
{{tanggal_surat}}
{{tempat_lahir}}
{{tanggal_lahir}}
{{alamat}}
```

---

## Core Document Generation Engine

Lives in `app/api/generate-document/route.ts`.

### POST `/api/generate-document`

**Request body:**
```json
{
  "documentType": "pkwt",
  "formData": {
    "nama_karyawan": "Budi Santoso",
    "nik": "3201234567890001",
    "tanggal_mulai": "2025-06-01",
    "lama_kontrak": "12",
    ...
  }
}
```

**Server-side logic:**
1. Validate session — reject if unauthenticated
2. Load user settings from Supabase (get template ID + folder ID for document type)
3. Compute derived fields:
   - `tanggal_selesai` = tanggal_mulai + lama_kontrak months (formatted in Indonesian)
   - `tanggal_surat` = today formatted as "1 Januari 2025"
   - `gaji_pokok` = formatted as "Rp 5.000.000,-"
4. Set up Google OAuth client using session access_token
5. Copy template doc → place in correct Drive folder
6. Replace all placeholders via batchUpdate
7. Log the generation to Supabase `document_logs`
8. Return `{ success: true, docUrl, docId }`

**Response:**
```json
{
  "success": true,
  "docUrl": "https://docs.google.com/document/d/XXXXX/edit",
  "docId": "XXXXX"
}
```

---

## UI — Dashboard & Document Form

### Dashboard (`/dashboard`)

- Clean grid of **DocumentCards** — one per document type (PKWT, SK, Memo, SP)
- Each card shows: icon, label, description, color accent, "Buat Dokumen" button
- Top bar shows logged-in user's name + avatar + logout button
- Sidebar navigation: Dashboard | Riwayat Dokumen | Pengaturan

### Document Form (`/generate/[type]`)

- Rendered dynamically from `document-configs.ts` field definitions
- Field types supported: `text`, `number`, `date`, `select`, `textarea`, `currency`
- For PKWT: show a live preview box that auto-calculates and displays `tanggal_selesai` as soon as `tanggal_mulai` and `lama_kontrak` are filled
- Validation via Zod — show inline errors per field
- Submit button states: idle → loading ("Membuat dokumen...") → success
- On success: show a toast + a green result card with "Buka Dokumen →" link

### Design Direction

- Clean, professional, government/corporate feel
- Color palette: white background, navy/dark blue primary, soft gray secondary
- Typography: Readable, formal — suitable for HR context
- Indonesian language throughout the UI
- Responsive (works on laptop and tablet)

---

## Document History & Log

### History Page (`/history`)

- Table showing all documents generated by the logged-in user
- Columns: Tanggal Dibuat | Jenis Dokumen | Nama Karyawan | Nomor Dokumen | Aksi
- "Aksi" column: "Buka" button → opens Google Doc in new tab
- Sorted by newest first
- Fetched from Supabase `document_logs` filtered by `user_email`
- Pagination: 20 rows per page

---

## Auto Numbering System

Logic in `lib/auto-numbering.ts`.

### Format

```
{SEQUENCE}/ {DOC_CODE}/{DEPT}-{COMPANY}/{DATE_CODE}/{ROMAN_MONTH}/{YEAR}

Real example:
  0033/ SPK/HRD-LBM/INT.24/I/2026
```

### Segment Breakdown

| Segment        | Example   | Description                                                                 |
| -------------- | --------- | --------------------------------------------------------------------------- |
| `SEQUENCE`     | `0033`    | Global running count of ALL documents ever created — never resets. Zero-padded to 4 digits. |
| `DOC_CODE`     | `SPK`     | Short code for the document type (see mapping table below)                  |
| `DEPT`         | `HRD`     | Department that creates the document — fixed as `HRD`                       |
| `COMPANY`      | `LBM`     | Company code within the holding — selected by user via **dropdown** in the form |
| `DATE_CODE`    | `INT.24`  | `INT.` prefix + the **date (day)** the document was created (e.g. created on the 24th → `INT.24`) |
| `ROMAN_MONTH`  | `I`       | Month the document was created, written in **Roman numerals** (I–XII)       |
| `YEAR`         | `2026`    | Full 4-digit year the document was created                                  |

### Document Code Mapping

| Document Type | DOC_CODE |
| ------------- | -------- |
| PKWT          | `SPK`    |
| PKWTT         | `SPK`    |
| SK            | `SK`     |
| Memo          | `MEMO`   |
| Surat Peringatan | `SP`  |

> Both PKWT and PKWTT share the code `SPK` (Surat Perjanjian Kerja) as they are both employment agreements.

### Company Codes (Dropdown Options)

Stored in `lib/company-codes.ts`. User selects one from a dropdown on every form.
This list must be editable in the Settings page so new companies can be added.

```ts
export const COMPANY_CODES = [
  { code: 'LBM',    name: 'LBM' },
  { code: 'LKM',    name: 'LKM' },
  { code: 'DGL',    name: 'DGL' },
  { code: 'Numeta', name: 'Numeta' },
  { code: 'Tunet',  name: 'Tunet' },
  { code: 'MSH',    name: 'MSH' },
];
```

> Full company names can be updated later in the Settings page once confirmed.
> The `code` value is what appears in the document number (e.g. `HRD-LBM`).

### Roman Numeral Month Mapping

```ts
const ROMAN_MONTHS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
// Usage: ROMAN_MONTHS[new Date().getMonth()] → e.g. month index 0 = 'I' (January)
```

### Generation Logic

```ts
async function generateDocumentNumber(docType: string, companyCode: string, date: Date): Promise<string> {
  // 1. Get global sequence: COUNT(*) of all rows in document_logs + 1
  const { count } = await supabase
    .from('document_logs')
    .select('*', { count: 'exact', head: true });

  const sequence = String((count ?? 0) + 1).padStart(4, '0');

  // 2. Resolve document code from type
  const docCode = DOC_CODE_MAP[docType]; // e.g. 'pkwt' → 'SPK'

  // 3. Build date parts
  const day         = date.getDate();                    // e.g. 24
  const romanMonth  = ROMAN_MONTHS[date.getMonth()];     // e.g. 'I'
  const year        = date.getFullYear();                // e.g. 2026
  const dateCode    = `INT.${day}`;                      // e.g. 'INT.24'

  // 4. Assemble
  return `${sequence}/ ${docCode}/HRD-${companyCode}/${dateCode}/${romanMonth}/${year}`;
  // Result: '0033/ SPK/HRD-LBM/INT.24/I/2026'
}
```

### Integration in the Form

- Add a **required dropdown field** to ALL document forms: `Perusahaan (Kode)`
  - This drives the `{COMPANY}` segment
  - Options come from `COMPANY_CODES` array in `lib/company-codes.ts`
- The document number is **auto-generated server-side** when the form is submitted
- Display the generated number prominently in the success result card
- Also store it in the `document_number` column in `document_logs`
- User can **NOT manually override** the sequence number — it is always system-generated
  to guarantee uniqueness and audit integrity

---

## Settings & Template Management

### Settings Page (`/settings`)

Allow user to configure per-document-type:
- **Template Google Doc ID** — paste from Drive URL
- **Target Folder ID** — paste from Drive URL

Also configure:
- **Company Name** — used as a default replacement for `{{nama_perusahaan}}`
- **Company Address** — used as `{{alamat_perusahaan}}`
- **Signatory Name** — used as `{{nama_penandatangan}}`
- **Signatory Title** — used as `{{jabatan_penandatangan}}`

All settings saved to Supabase `settings` table per user.

Show helper text under each ID field:
> "Ambil ID dari URL Google Drive: `drive.google.com/drive/folders/**INI_ID_NYA**`"

---

## API Routes

| Method | Route                        | Description                              |
| ------ | ---------------------------- | ---------------------------------------- |
| GET    | `/api/auth/[...nextauth]`    | NextAuth Google OAuth handler            |
| POST   | `/api/auth/[...nextauth]`    | NextAuth callback                        |
| POST   | `/api/generate-document`     | Core: copy template + replace + save log |
| GET    | `/api/history`               | Fetch document logs for current user     |
| GET    | `/api/settings`              | Fetch user settings                      |
| POST   | `/api/settings`              | Save/update user settings                |

---

## Environment Variables

```env
# .env.local

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Deployment

### Vercel
1. Push project to GitHub
2. Import repo in vercel.com
3. Add all environment variables in Vercel dashboard
4. Add production URL to Google OAuth authorized redirect URIs
5. Deploy — app is live

### Post-deploy checklist
- [ ] Test Google login
- [ ] Test PKWT generation end-to-end
- [ ] Confirm generated doc appears in correct Drive folder
- [ ] Confirm log entry appears in Supabase

---

## Future Features

| Feature                        | Priority | Notes                                              |
| ------------------------------ | -------- | -------------------------------------------------- |
| PDF export of generated doc    | High     | Use Google Drive export API                        |
| Multi-user / team access       | Medium   | Add role: admin / viewer                           |
| E-signature integration        | Medium   | Integrate with Privy (Indonesian e-sign platform)  |
| Bulk generation (CSV import)   | Medium   | Upload CSV → generate one doc per row              |
| WhatsApp notification          | Low      | Notify employee via WA when doc is ready           |
| Template editor in-app         | Low      | Edit placeholder positions without opening Drive   |
| BPJS / Payroll document types  | Low      | Expand beyond HR contracts                         |