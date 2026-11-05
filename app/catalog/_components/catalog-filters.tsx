import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordTypeValues, type SearchQuery } from "@/src/types";

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogFilters, /api/search, institution, SearchQuery
 * WHAT: GET form whose fields match the full-text search route.
 * WHY: The catalog page is the test screen for /api/search.
 * WHERE: Catalog index page.
 */
export function CatalogFilters({
  publishers,
  query,
}: {
  publishers: string[];
  query: SearchQuery;
}) {
  return (
    <form action="/catalog" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
        Search title, description, subject, place, or community
        <Input name="q" defaultValue={query.q ?? ""} placeholder="Search all sources" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        Institution
        <select name="institution" defaultValue={query.institution ?? ""} className={selectClassName}>
          <option value="">All institutions</option>
          {publishers.map((publisher) => (
            <option key={publisher} value={publisher}>
              {publisher}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        Type
        <select name="type" defaultValue={query.type ?? ""} className={selectClassName}>
          <option value="">All types</option>
          {recordTypeValues.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        Subject
        <Input name="subject" defaultValue={query.subject ?? ""} placeholder="Subject" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        Place
        <Input name="place" defaultValue={query.place ?? ""} placeholder="Place" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        From
        <Input name="from" type="date" defaultValue={query.from ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        To
        <Input name="to" type="date" defaultValue={query.to ?? ""} />
      </label>
      <div className="flex items-end">
        <Button type="submit">Search</Button>
      </div>
    </form>
  );
}
