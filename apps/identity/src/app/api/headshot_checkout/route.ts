import { getUser } from "@/server/auth";
import { createHeadshotCheckout } from "@/server/headshot-billing";
import { getEnv } from "@/server/env";
import { ApiError, jsonError, jsonSuccess, requireSameOrigin } from "@/server/http";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request, (await getEnv()).APP_URL ?? "");
    const user = await getUser();
    if (!user) throw new ApiError(401, "unauthenticated", "请先登录。");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "invalid_json", "请求必须为 JSON。");
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("requestId" in body) ||
      typeof body.requestId !== "string"
    ) {
      throw new ApiError(400, "invalid_request_id", "请提供用于重试去重的 requestId。");
    }
    const locale = "locale" in body ? body.locale : "en";
    if (locale !== "en" && locale !== "zh") {
      throw new ApiError(400, "invalid_json", "locale 必须为 en 或 zh。");
    }
    return jsonSuccess(await createHeadshotCheckout(user, body.requestId, locale));
  } catch (error) {
    return jsonError(error);
  }
}
