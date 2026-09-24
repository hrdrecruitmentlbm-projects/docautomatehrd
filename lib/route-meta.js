/**
 * Single source of truth for the app shell's per-route chrome.
 * Consumed by components/AppShell/TopBar.jsx (client, via usePathname).
 *
 * headerMode invariant: EXACTLY ONE <h1> per route.
 *   - "shell" -> the TopBar renders the title block; the page must not.
 *   - "page"  -> the TopBar renders no title block; the page keeps its <h1>.
 * /dashboard is "page": the revamped layout owns an in-page header
 * (big title + filter controls, reference-dashboard style).
 *
 * Nav labels stay EN, page/top-bar titles keep existing ID copy (locked).
 */

const TITLES = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "",
    headerMode: "page",
    primary: { label: "New Document", href: "/input-dokumen" },
  },
  "/input-dokumen": {
    title: "Input Dokumen",
    subtitle: "Pilih jenis dokumen yang ingin Anda buat.",
    headerMode: "shell",
    primary: null, // the doc-type cards ARE the action (no self-link)
  },
  "/data": {
    title: "Data Karyawan & Payroll",
    subtitle:
      "Tempel link Google Sheet + folder Drive, lalu Sync agar PKWT terisi otomatis. Cukup ketik nama saat buat dokumen.",
    headerMode: "shell",
    primary: { label: "New Document", href: "/input-dokumen" },
  },
  "/history": {
    title: "Riwayat Dokumen",
    subtitle: "Daftar dokumen yang telah Anda buat sebelumnya.",
    headerMode: "shell",
    primary: { label: "New Document", href: "/input-dokumen" },
  },
  "/settings": {
    title: "Pengaturan",
    subtitle: "Konfigurasi template dokumen dan preferensi akun Anda.",
    headerMode: "shell",
    primary: { label: "New Document", href: "/input-dokumen" },
  },
};

const DOC_TYPE_LABELS = {
  pkwt: "PKWT",
  sk: "SK",
  memo: "Memo",
  sp: "SP",
};

/**
 * @param {string} pathname
 * @returns {{title: string, subtitle: string, headerMode: "shell"|"page",
 *            primary: {label: string, href: string}|null}}
 */
export function resolveRouteMeta(pathname) {
  // /generate/[type] is a child flow of Documents: no nav seat, no primary
  // (the form submit is the action), shell-rendered title with a back link.
  const generateMatch = pathname.match(/^\/generate\/([^/]+)/);
  if (generateMatch) {
    const type = generateMatch[1].toLowerCase();
    return {
      title: `Buat ${DOC_TYPE_LABELS[type] || type.toUpperCase()}`,
      // No subtitle: the page renders the per-type helper copy in-body
      // (subtitles hide on mobile; body copy must carry it).
      subtitle: "",
      headerMode: "shell",
      primary: null,
      backHref: "/input-dokumen",
      backLabel: "Input Dokumen",
    };
  }

  const exact = TITLES[pathname];
  if (exact) return { backHref: null, backLabel: null, ...exact };

  // Unknown route: render bare chrome so the shell never looks broken.
  return {
    title: "",
    subtitle: "",
    headerMode: "page",
    primary: { label: "New Document", href: "/input-dokumen" },
    backHref: null,
    backLabel: null,
  };
}
