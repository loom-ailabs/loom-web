import { getUser } from "@/server/auth";
import { getPurchaseOrderForUser } from "@/server/purchases";
import { ApiError, jsonError, jsonSuccess } from "@/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) throw new ApiError(401, "unauthenticated", "请先登录。");
    const { id } = await params;
    return jsonSuccess({ order: await getPurchaseOrderForUser(id, user.id) });
  } catch (error) {
    return jsonError(error);
  }
}
