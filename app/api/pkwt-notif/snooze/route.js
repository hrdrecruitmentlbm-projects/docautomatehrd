import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { snoozeContractNotification } from "@/lib/pkwt-notifications";

export async function POST(req) {
  try {
    const session = await auth();
    if (session?.error) {
      return Response.json(
        { error: "Sesi Google berakhir, silakan login ulang" },
        { status: 401 }
      );
    }
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const namaKey = body?.nama_key;
    const tanggalBerakhir = body?.tanggal_berakhir;
    const days = parseInt(body?.days, 10) || 7;

    if (!namaKey || !tanggalBerakhir) {
      return Response.json(
        { error: "nama_key dan tanggal_berakhir wajib diisi" },
        { status: 400 }
      );
    }

    const result = await snoozeContractNotification({
      nama_key: namaKey,
      tanggal_berakhir: tanggalBerakhir,
      user_email: session.user.email,
      days,
    });

    // Revalidasi layout agar daftar notifikasi terbarui
    try {
      revalidatePath("/", "layout");
      revalidatePath("/dashboard");
    } catch (e) {
      console.warn("Revalidation warning:", e?.message);
    }

    return Response.json({
      success: true,
      message: `Notifikasi ditunda selama ${days} hari`,
      snoozed_until: result.snoozed_until,
      data: result.data,
    });
  } catch (err) {
    console.error("pkwt-notif snooze error:", err);
    return Response.json(
      { error: err.message || "Gagal menunda notifikasi" },
      { status: 500 }
    );
  }
}
