import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogQuery } from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogFilters, publisher, search form, catalog query
 * WHAT: GET form for catalog text search and publisher filter.
 * WHY: Testers can narrow the Postgres records without a client data store.
 * WHERE: Catalog index page.
 */
export function CatalogFilters({
  publishers,
  query,
}: {
  publishers: string[];
  query: CatalogQuery;
}) {
  return (
    <form action="/catalog" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm text-muted-foreground">
        Search title, description, or creator
        <Input
          name="q"
          defaultValue={query.q}
          placeholder="Search the catalog"
        />
      </label>
      <label className="flex w-full flex-col gap-1 text-sm text-muted-foreground sm:w-72">
        Publisher
        <select
          name="publisher"
          defaultValue={query.publisher}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm"
        >
          <option value="">All publishers</option>
          {publishers.map((publisher) => (
            <option key={publisher} value={publisher}>
              {publisher}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit">Search</Button>
    </form>
  );
}
