import { archiveImageProxyQuerySchema } from "@/src/types";
import { type NextRequest } from "next/server";
import { ZodError } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: /api/image-proxy, archival scan proxy, CORS CanvasTexture, Nova Scotia Archives, BCCNS
 * WHAT: Same-origin image proxy route for external archival scans used in 3D WebGL CanvasTextures and record modals.
 * WHY: External holding institutions (such as archives.novascotia.ca) do not send Access-Control-Allow-Origin headers required by WebGL CanvasTexture crossOrigin="anonymous" image loads.
 * WHERE: Called by createStationScanTexture, createArchPreviewTexture, and BccnsArchiveExperience.
 */

const ALLOWED_ARCHIVAL_HOSTS = new Set([
  "archives.novascotia.ca",
  "novascotia.ca",
  "www.novascotia.ca",
  "blackloyalist.com",
  "www.blackloyalist.com",
  "blackpeopleshistory.ca",
  "www.blackpeopleshistory.ca",
  "d3d0lqu00lnqvz.cloudfront.net",
  "thecanadianencyclopedia.ca",
  "www.thecanadianencyclopedia.ca",
  "canada.ca",
  "www.canada.ca",
  "bac-lac.gc.ca",
  "www.bac-lac.gc.ca",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "bccns.com",
  "www.bccns.com",
]);

export async function GET(request: NextRequest) {
  try {
    const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
    const { url } = archiveImageProxyQuerySchema.parse({ url: rawUrl });

    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed =
      ALLOWED_ARCHIVAL_HOSTS.has(hostname) ||
      Array.from(ALLOWED_ARCHIVAL_HOSTS).some((allowed) =>
        hostname.endsWith(`.${allowed}`),
      );

    if (!isAllowed) {
      return Response.json(
        { error: "Host is not in the approved archival institution allowlist." },
        { status: 403 },
      );
    }

    const upstream = await fetch(parsed.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "BCCNS-Digital-Archive/1.0 (+https://bccns.com)",
      },
      next: { revalidate: 86400 },
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `Upstream archival image returned ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await upstream.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? "Invalid archival image URL";
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json(
      { error: "Unable to proxy archival scan" },
      { status: 502 },
    );
  }
}
