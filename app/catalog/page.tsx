import Link from "next/link";
import { Suspense } from "react";

import { CatalogResults } from "@/app/catalog/_components/catalog-results";
import { ThemeSwitcher } from "@/components/theme-switcher";

type CatalogPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    publisher?: string | string[];
    page?: string | string[];
  }>;
};

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogPage, /catalog, sample frontend, Postgres records
 * WHAT: Public test page for the loaded Black history records.
 * WHY: Gives a browser entry point to search the Supabase Postgres catalog.
 * WHERE: Route /catalog.
 */
export default function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="flex h-16 items-center justify-center border-b border-border">
        <div className="flex w-full max-w-5xl items-center justify-between px-5 text-sm">
          <Link href="/catalog" className="font-semibold">
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
