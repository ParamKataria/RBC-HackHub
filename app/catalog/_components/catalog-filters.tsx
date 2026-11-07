import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  catalogFiltersPropsSchema,
  recordTypeValues,
  type CatalogFiltersProps,
} from "@/src/types";

const fieldClassName =
  "flex h-10 w-full rounded-full border border-input bg-background px-4 text-sm text-foreground shadow-none transition-colors duration-150 hover:border-primary/60 focus-visible:border-primary motion-reduce:transition-none";

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogFilters, CatalogFiltersProps, hiddenQueryParam, facetFilters, dateIntervals, secondarySearch
 * WHAT: GET form with secondary facet controls (institution, type, creator, subject, place, date range) and hidden query preservation.
 * WHY: Enables facet refinement while preserving the primary keyword search parameter across filter submissions.
 * WHERE: app/catalog/_components/catalog-results.tsx.
 */
export function CatalogFilters(rawProps: CatalogFiltersProps) {
  const { publishers, query } = catalogFiltersPropsSchema.parse(rawProps);

  return (
    <form
      action="/catalog"
      className="grid grid-cols-1 items-end gap-x-4 gap-y-4 rounded-[20px] border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-6"
    >
      <input type="hidden" name="q" defaultValue={query.q ?? ""} />
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-3">
        Institution
        <select
          name="institution"
          defaultValue={query.institution ?? ""}
          className={fieldClassName}
        >
          <option value="">All institutions</option>
          {publishers.map((publisher) => (
            <option key={publisher} value={publisher}>
              {publisher}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-3">
        Type
        <select
          name="type"
          defaultValue={query.type ?? ""}
          className={fieldClassName}
        >
          <option value="">All types</option>
          {recordTypeValues.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
        Creator
        <Input
          name="creator"
          defaultValue={query.creator ?? ""}
          placeholder="Creator or contributor"
          className={fieldClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
        Subject
        <Input
          name="subject"
          defaultValue={query.subject ?? ""}
          placeholder="Subject"
          className={fieldClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
        Place
        <Input
          name="place"
          defaultValue={query.place ?? ""}
          placeholder="Place"
          className={fieldClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
        From
        <Input
          name="from"
          type="text"
          inputMode="numeric"
          placeholder="YYYY or YYYY-MM-DD"
          defaultValue={query.from ?? ""}
          className={fieldClassName}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-foreground lg:col-span-2">
        To
        <Input
          name="to"
          type="text"
          inputMode="numeric"
          placeholder="YYYY or YYYY-MM-DD"
          defaultValue={query.to ?? ""}
          className={fieldClassName}
        />
      </label>
      <div className="sm:col-span-2 lg:col-span-2">
        <Button
          type="submit"
          className="h-10 w-full rounded-full shadow-none transition-colors duration-150 motion-reduce:transition-none"
        >
          Search
        </Button>
      </div>
    </form>
  );
}
