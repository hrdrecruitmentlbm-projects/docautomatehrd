import { auth } from "@/auth";
import { getUnifiedContracts } from "@/lib/pkwt-unified";

export async function GET(req) {
  try {
    const session = await auth();
    if (session?.error) {
      return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
    }
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const periode = searchParams.get("periode") || undefined;
    const perusahaan = searchParams.get("perusahaan") || undefined;
    const status = searchParams.get("status") || undefined;
    const sumber = searchParams.get("sumber") || undefined;
    const search = searchParams.get("search") || searchParams.get("q") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = searchParams.has("limit")
      ? parseInt(searchParams.get("limit") || "50", 10)
      : 50;
    const sortBy = searchParams.get("sortBy") || "tanggal_berakhir";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const result = await getUnifiedContracts({
      periode,
      perusahaan,
      status,
      sumber,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      now: new Date(),
    });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("GET /api/unified-contracts error:", err);
    return Response.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
