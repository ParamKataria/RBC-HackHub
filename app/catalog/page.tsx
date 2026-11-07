import Link from "next/link";
import { Suspense } from "react";

import { CatalogResults } from "@/app/catalog/_components";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { CatalogPageProps } from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogPage, CatalogPageProps, CatalogResults, stickyCatalogNav, bccnsCatalogWordmark, /catalog
 * WHAT: Public catalog explorer page with sticky navigation and archival search interface.
 * WHY: Gives visitors and researchers a persistent, branded header to browse records and explore historical lineages.
 * WHERE: Route /catalog.
 */
export default function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 text-sm">
          <Link
            href="/catalog"
            className="font-serif text-xl tracking-tight text-foreground transition-colors hover:text-foreground/80"
          >
            BCCNS Catalog
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
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
