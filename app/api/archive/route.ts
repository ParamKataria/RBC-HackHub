import { archiveService } from "@/lib/services";
import { archiveFilterSchema } from "@/src/types";
import { type NextRequest } from "next/server";
import { ZodError } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: /api/archive, ArchivePayload, CollectionKey, DublinCore, BCCNS
 * WHAT: GET /api/archive returns the 6 BCCNS historical chapter collections and their ordered Dublin Core archival stations.
 * WHY: Gives client interactions and deep links a validated JSON endpoint backed by archiveService.
 * WHERE: /api/archive?collection=&record=
 */
export async function GET(request: NextRequest) {
  try {
    const rawParams = {
      collection: request.nextUrl.searchParams.get("collection") ?? undefined,
      record: request.nextUrl.searchParams.get("record") ?? undefined,
    };
    const filters = archiveFilterSchema.parse(rawParams);
    const payload = await archiveService.getArchivePayload();

    if (filters.collection) {
      const filtered = payload.collections.filter(
        (col) => col.key === filters.collection,
      );
      return Response.json({
        ...payload,
        collections: filtered,
      });
    }

    return Response.json(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? "Invalid archive filter";
      return Response.json({ error: message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Archive read failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
