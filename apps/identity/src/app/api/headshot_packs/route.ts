import { getUser } from "@/server/auth";
import { getHeadshotSummary } from "@/server/headshot-billing";
import { jsonError, jsonSuccess } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUser();
    return jsonSuccess({ ...(await getHeadshotSummary(user?.id)), user });
  } catch (error) {
    return jsonError(error);
  }
}
