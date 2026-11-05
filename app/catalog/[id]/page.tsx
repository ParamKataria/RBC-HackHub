import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { catalogService } from "@/lib/services";
import type { CatalogRecordDetail } from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: RecordFields, CatalogRecordDetail, dc_identifier, raw_metadata
 * WHAT: Renders stored columns and the untouched source metadata.
 * WHY: A tester can compare one Postgres row with the original CSV fields.
 * WHERE: /catalog/[id].
 */
async function RecordFields({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let record: CatalogRecordDetail | null;
  try {
    record = await catalogService.getCatalogRecord(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Record query failed";
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {message}
      </p>
    );
  }

  if (!record) {
    notFound();
  }

  const fields = [
    ["Title", record.dc_title],
    ["Identifier", record.dc_identifier],
    ["Publisher", record.dc_publisher],
    ["Source", record.dc_source],
    ["Type", record.dc_type],
    ["Creator", record.dc_creator],
    ["Date", record.dc_date],
    ["Date text", record.date_text],
    ["Subjects", record.dc_subject.join(" | ")],
    ["Place", record.dcterms_spatial],
    ["Time period", record.dcterms_temporal],
    ["Rights", record.dc_rights],
    ["Access rights", record.dcterms_access_rights],
    ["Provenance", record.dcterms_provenance],
    ["Communities", record.bccns_community.join(" | ")],
    ["Access status", record.bccns_access_status],
    ["Digitized", record.bccns_digitized ? "true" : "false"],
  ] as const;

  const linkedPeople = record.record_people.map(
    (link) => `${link.people.name} (${link.role})`,
  );
  const linkedPlaces = record.record_places.map((link) => link.places.name);
  const linkedSubjects = record.record_subjects.map((link) => link.subjects.name);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/catalog" className="text-sm text-primary hover:underline">
          Back to catalog
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{record.dc_title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{record.dc_type}</Badge>
          <Badge variant="outline">{record.dc_publisher}</Badge>
        </div>
      </div>

      {record.dc_description ? (
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {record.dc_description}
        </p>
      ) : null}

      <a
        href={record.dc_identifier}
        target="_blank"
        rel="noreferrer"
        className="break-all text-sm text-primary underline-offset-4 hover:underline"
      >
        {record.dc_identifier}
      </a>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Stored fields</h2>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {fields.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground sm:col-span-2">
                {value && value.length > 0 ? value : "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <LinkedList title="People" items={linkedPeople} />
        <LinkedList title="Places" items={linkedPlaces} />
        <LinkedList title="Subjects" items={linkedSubjects} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Original metadata</h2>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {Object.entries(record.raw_metadata).map(([key, value]) => (
            <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
              <dt className="text-sm text-muted-foreground">{key}</dt>
              <dd className="break-words text-sm text-foreground sm:col-span-2">
                {value.length > 0 ? value : "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: LinkedList, people, places, subjects
 * WHAT: Shows names linked to a record through a join table.
 * WHY: Empty join lists stay visible so missing links are obvious.
 * WHERE: Record detail page.
 */
function LinkedList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-card-foreground">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">None linked</p>
      )}
    </div>
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: CatalogRecordPage, record detail, raw_metadata
 * WHAT: Detail route for one catalog record.
 * WHY: Opens a single Postgres row for field-by-field checking.
 * WHERE: Route /catalog/[id].
 */
export default function CatalogRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading record…</p>}>
          <RecordFields params={params} />
        </Suspense>
      </div>
    </main>
  );
}
