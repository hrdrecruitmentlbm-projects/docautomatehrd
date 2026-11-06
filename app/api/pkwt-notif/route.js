import { auth } from "@/auth";
import { getContractNotifications } from "@/lib/pkwt-notifications";

export async function GET() {
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

    const data = await getContractNotifications({
      now: new Date(),
      userEmail: session.user.email,
    });

    return Response.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("pkwt-notif GET error:", err);
    return Response.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
