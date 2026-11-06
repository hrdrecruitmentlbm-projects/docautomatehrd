import { auth } from "@/auth";
import { getDriveClient, extractFolderId, isValidGoogleId } from "@/lib/sheets";

export async function POST(req) {
  const session = await auth();
  if (session?.error) {
    return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
  }
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session?.accessToken) {
    return Response.json({ error: "Token akses Google tidak tersedia, silakan login ulang" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawInput = String(body?.folderId || "").trim();

  if (!rawInput) {
    return Response.json({ error: "Folder ID atau URL wajib diisi" }, { status: 400 });
  }

  const cleanId = extractFolderId(rawInput);
  if (!cleanId || !isValidGoogleId(cleanId)) {
    return Response.json(
      { error: `Folder ID atau URL tidak valid ("${rawInput.slice(0, 80)}")` },
      { status: 400 }
    );
  }

  try {
    const drive = getDriveClient(session.accessToken);
    const res = await drive.files.get({
      fileId: cleanId,
      fields: "id, name, mimeType, trashed",
      supportsAllDrives: true,
    });

    const file = res.data;

    if (file.trashed) {
      return Response.json(
        { error: `Folder "${file.name || cleanId}" saat ini berada di tempat sampah (Trash) Google Drive.` },
        { status: 400 }
      );
    }

    if (file.mimeType !== "application/vnd.google-apps.folder") {
      return Response.json(
        {
          error: `Item ini bernama "${file.name}", namun bukan folder Google Drive (tipe file: ${file.mimeType}). Masukkan link atau ID folder.`,
        },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      id: file.id,
      name: file.name,
      message: `Akses berhasil! Folder: "${file.name}"`,
    });
  } catch (err) {
    const status = err?.status || err?.code || err?.response?.status;
    const originalMessage = err?.response?.data?.error?.message || err?.message || String(err);

    if (status === 404 || /not found/i.test(originalMessage)) {
      return Response.json(
        {
          error: `Folder dengan ID "${cleanId}" tidak ditemukan (404). Pastikan link/ID benar dan folder telah dibagikan ke akun ${session.user.email}.`,
        },
        { status: 404 }
      );
    }

    if (status === 403 || /forbidden|permission/i.test(originalMessage)) {
      return Response.json(
        {
          error: `Akses ditolak (403). Pastikan folder dibagikan ke akun ${session.user.email} dengan izin minimal Viewer (Pelihat). Pesan asli: ${originalMessage}`,
        },
        { status: 403 }
      );
    }

    return Response.json(
      { error: `Gagal mengakses folder di Google Drive: ${originalMessage}` },
      { status: status && status >= 400 && status < 600 ? status : 500 }
    );
  }
}
