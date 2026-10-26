import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { imageReviewSchema } from "@/lib/server/schemas";
import { reviewImage } from "@/lib/server/services/virtual";

export const POST = handler(
  { auth: "staff", permission: "virtual.review", body: imageReviewSchema, rateLimit: [{ limit: LIMITS.staffWrite, by: "user" }] },
  async ({ staff, params, body, correlationId }) => {
    const id = uuidParam.safeParse(params.id);
    if (!id.success) throw Errors.notFound();
    return reviewImage(staff!, id.data, body, correlationId);
  },
);
