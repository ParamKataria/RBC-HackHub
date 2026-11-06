import { Suspense } from "react";

import { archiveService } from "@/lib/services";
import { BccnsArchiveExperience } from "@/src/components/archive";

/**
 * SOURCE OF TRUTH KEYWORDS: ArchiveLoader, getArchivePayload, BccnsArchiveExperience, Home
 * WHAT: Server component that loads the 6 BCCNS historical collections and renders the interactive 3D rotunda and gallery walk.
 * WHY: Connects the root landing experience directly to the Next.js / Supabase Postgres archive layer.
 * WHERE: Route / (app/page.tsx).
 */
async function ArchiveLoader() {
  const payload = await archiveService.getArchivePayload();
  return <BccnsArchiveExperience payload={payload} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bccns-paper text-bccns-ink">
          <p className="font-serif text-xl">
            Preparing Black Cultural Centre for Nova Scotia Digital Archive…
          </p>
        </main>
      }
    >
      <ArchiveLoader />
    </Suspense>
  );
}
