import { auth } from "@/auth";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { auditTemplate } from "@/lib/template-scan";
import { isValidGoogleId } from "@/lib/sheets";

export const maxDuration = 60;

/**
 * GET /api/template-audit — pemeriksaan sebelum membuat.
 *
 * Untuk setiap template PKWT yang terdaftar di company_map (plus template
 * SK/Memo/SP di settings), buka dokumennya dan cari penanda {{…}} yang TIDAK
 * bisa diisi aplikasi.
 *
 * Penanda yang tidak dikenal ini akan terkirim apa adanya ke SETIAP kontrak
 * untuk perusahaan tersebut. Contoh nyata di repo ini: {{T, Fungsional}}
 * dengan koma, sementara engine hanya mengisi {{T. Fungsional}} dan
 * {{T Fungsional}}. Tidak ada yang sadar sampai kontraknya dicetak.
 *
 * Dijalankan atas permintaan, bukan otomatis: setiap target dibaca satu
 * dokumen Google.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email || !session?.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: companyMap }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from("company_map")
        .select("lini_bisnis,company_code,legal_name,pkwt_template_id,paklaring_template_id"),
      // Sengaja TIDAK memfilter pkwt_template_id di query: baris yang punya
      // template Paklaring tapi tidak punya template PKWT tetap harus diaudit.
      supabase
        .from("settings")
        .select("pkwt_template_id,sk_template_id,memo_template_id,sp_template_id")
        .eq("user_email", session.user.email)
        .maybeSingle(),
    ]);

    // Kumpulkan target unik: satu baris company_map per template, lalu
    // template SK/Memo/SP sebagai target terpisah. Setiap target membawa
    // docType-nya, karena himpunan penanda yang valid berbeda per jenis —
    // template Paklaring yang di-audit dengan key PKWT akan dilaporkan
    // rusak padahal isinya lengkap.
    const targets = [];
    for (const row of companyMap || []) {
      if (isValidGoogleId(row.pkwt_template_id)) {
        targets.push({
          key: `company:${row.lini_bisnis}`,
          label: `PKWT — ${row.lini_bisnis}${row.company_code ? ` (${row.company_code})` : " (tanpa KOP)"}`,
          templateId: row.pkwt_template_id,
          docType: "pkwt",
          needsMark: "kop",
        });
      }
      if (isValidGoogleId(row.paklaring_template_id)) {
        targets.push({
          key: `company:${row.lini_bisnis}:paklaring`,
          label: `Paklaring — ${row.lini_bisnis}${row.company_code ? ` (${row.company_code})` : " (tanpa KOP)"}`,
          templateId: row.paklaring_template_id,
          docType: "paklaring",
          // Paklaring butuh DUA penanda gambar: KOP di atas, TTD di bawah.
          // Keduanya optional (bisa disisipkan manual), jadi tidak dihitung
          // sebagai masalah — hanya ditampilkan supaya terlihat.
          needsMark: null,
        });
      }
    }
    for (const [type, label] of [
      ["sk", "SK"],
      ["memo", "Memo"],
      ["sp", "Surat Peringatan"],
    ]) {
      const id = settings?.[`${type}_template_id`];
      if (id && isValidGoogleId(id)) {
        targets.push({ key: `settings:${type}`, label: `${label}`, templateId: id, docType: type, needsMark: "kop" });
      }
    }

    // Template yang sama bisa dipakai beberapa lini bisnis — cukup diperiksa
    // sekali, hasilnya dibagikan ke semua baris yang memakainya.
    const byTemplate = new Map();
    for (const t of targets) {
      if (!byTemplate.has(t.templateId)) byTemplate.set(t.templateId, []);
      byTemplate.get(t.templateId).push(t);
    }

    const results = [];
    for (const [templateId, users] of byTemplate) {
      // Satu template bisa dipakai dua jenis (mis. yang sama untuk PKWT dan
      // Paklaring) — audit sekali per jenis, jangan saling menimpa.
      const byDocType = new Map();
      for (const u of users) {
        if (!byDocType.has(u.docType)) byDocType.set(u.docType, []);
        byDocType.get(u.docType).push(u);
      }
      for (const [docType, group] of byDocType) {
        const audit = await auditTemplate(session.accessToken, templateId, docType);
        for (const u of group) {
          // Penanda gambar yang WAJIB ada hanya menambah satu masalah kalau
          // hilang. Kalau needsMark null, tidak ada yang dihitung.
          const missingMark =
            u.needsMark && audit.ok && !audit[`adaPenanda${u.needsMark === "kop" ? "Kop" : "Ttd"}`] ? 1 : 0;
          results.push({
            key: u.key,
            label: u.label,
            templateId,
            ...audit,
            problems: audit.ok ? audit.tidakDikenal.length + missingMark : 1,
          });
        }
      }
    }

    results.sort((a, b) => b.problems - a.problems || a.label.localeCompare(b.label));

    return Response.json({
      results,
      summary: {
        total: results.length,
        bermasalah: results.filter((r) => r.problems > 0).length,
        tidakDikenal: results.reduce((n, r) => n + (r.tidakDikenal?.length || 0), 0),
        tanpaKop: results.filter((r) => r.ok && !r.adaPenandaKop).length,
      },
    });
  } catch (error) {
    console.error("Template audit error:", error);
    return Response.json(
      { error: error?.message || "Gagal memeriksa template" },
      { status: 500 }
    );
  }
}
