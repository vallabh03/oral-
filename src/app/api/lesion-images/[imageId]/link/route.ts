import { handler, uuidParam } from "@/lib/server/http";
import { Errors } from "@/lib/server/errors";
import { LIMITS } from "@/lib/server/security/rateLimit";
import { lesionLinkSchema } from "@/lib/server/schemas";
import { issueLesionLink } from "@/lib/server/services/lesionImages";

// POST (not GET): issuing a link is an audited, CSRF-protected action.
export const POST = handler(
  { auth: "staff", permission: "clinical_image.view", body: lesionLinkSchema, rateLimit: [{ limit: LIMITS.clinicalLink, by: "user" }] },
  async ({ staff, params, body, correlationId }) => {
    const id = uuidParam.safeParse(params.imageId);
    if (!id.success) throw Errors.notFound();
    return issueLesionLink(staff!, id.data, body.variant, correlationId);
  },
);
