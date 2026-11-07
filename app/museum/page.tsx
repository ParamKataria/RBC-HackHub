import { Suspense, ViewTransition } from "react";

import { archiveService } from "@/lib/services";
import { BccnsArchiveExperience } from "@/src/components/archive";

/**
 * SOURCE OF TRUTH KEYWORDS: MuseumPage, ArchiveLoader, /museum, BccnsArchiveExperience
 * WHAT: Dedicated /museum route rendering the 3D BCCNS rotunda and collection galleries.
 * WHY: Supports direct links to /museum alongside the root archive route.
 * WHERE: Route /museum (app/museum/page.tsx).
 */
async function MuseumArchiveLoader() {
  const payload = await archiveService.getArchivePayload();
  return <BccnsArchiveExperience payload={payload} />;
}

export default function MuseumPage() {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="slide-down" default="none">
          <main className="flex min-h-screen items-center justify-center bg-bccns-paper text-bccns-ink">
            <p className="font-serif text-xl">
              Preparing Black Cultural Centre for Nova Scotia Digital Archive…
            </p>
          </main>
        </ViewTransition>
      }
    >
      <ViewTransition enter="slide-up" default="none">
        <MuseumArchiveLoader />
      </ViewTransition>
    </Suspense>
  );
}
