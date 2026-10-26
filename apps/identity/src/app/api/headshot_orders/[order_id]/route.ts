import { getUser } from "@/server/auth";
import { getHeadshotOrder } from "@/server/headshot-billing";
import { ApiError, jsonError, jsonSuccess } from "@/server/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ order_id: string }> },
) {
  try {
    const user = await getUser();
    if (!user) throw new ApiError(401, "unauthenticated", "请先登录。");
    const { order_id } = await params;
    return jsonSuccess({ order: await getHeadshotOrder(order_id, user.id) });
  } catch (error) {
    return jsonError(error);
  }
}
