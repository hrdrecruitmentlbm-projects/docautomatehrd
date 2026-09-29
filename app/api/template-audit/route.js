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
        .select("lini_bisnis,company_code,legal_name,pkwt_template_id")
        .not("pkwt_template_id", "is", null),
      supabase
        .from("settings")
        .select("pkwt_template_id,sk_template_id,memo_template_id,sp_template_id")
        .eq("user_email", session.user.email)
        .maybeSingle(),
    ]);

    // Kumpulkan target unik: satu baris company_map per template PKWT,
    // lalu template SK/Memo/SP sebagai target terpisah.
    const targets = [];
    for (const row of companyMap || []) {
      if (!isValidGoogleId(row.pkwt_template_id)) continue;
      targets.push({
        key: `company:${row.lini_bisnis}`,
        label: `PKWT — ${row.lini_bisnis}${row.company_code ? ` (${row.company_code})` : " (tanpa KOP)"}`,
        templateId: row.pkwt_template_id,
      });
    }
    for (const [type, label] of [
      ["sk", "SK"],
      ["memo", "Memo"],
      ["sp", "Surat Peringatan"],
    ]) {
      const id = settings?.[`${type}_template_id`];
      if (id && isValidGoogleId(id)) {
        targets.push({ key: `settings:${type}`, label: `${label}`, templateId: id });
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
      const audit = await auditTemplate(session.accessToken, templateId);
      for (const u of users) {
        results.push({
          key: u.key,
          label: u.label,
          templateId,
          ...audit,
          problems: audit.ok
            ? audit.tidakDikenal.length + (audit.adaPenandaKop ? 0 : 1)
            : 1,
        });
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
