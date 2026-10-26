import { handleCreemWebhook } from "@/server/headshot-billing";
import { jsonError, jsonSuccess } from "@/server/http";

export async function POST(request: Request) {
  try {
    return jsonSuccess(await handleCreemWebhook(request));
  } catch (error) {
    return jsonError(error);
  }
}
