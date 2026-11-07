import Link from "next/link";
import { Suspense } from "react";

import { CatalogResults } from "@/app/catalog/_components";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { CatalogPageProps } from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogPage, CatalogPageProps, CatalogResults, /catalog, sampleFrontend, PostgresRecords
 * WHAT: Public test page for the loaded Black history records.
 * WHY: Gives a browser entry point to search the Supabase Postgres catalog.
 * WHERE: Route /catalog.
 */
export default function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 text-sm">
          <Link href="/catalog" className="font-serif text-xl text-foreground">
            BCCNS catalog
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Home
            </Link>
            <ThemeSwitcher />
          </div>
        </div>
      </nav>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8">
        <Suspense
          fallback={<p className="text-sm text-muted-foreground">Loading catalog…</p>}
        >
          <CatalogResults searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
