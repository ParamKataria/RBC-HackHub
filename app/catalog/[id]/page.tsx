import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ConnectionsGraphView } from "@/app/catalog/_components";
import { Badge } from "@/components/ui/badge";
import { catalogService } from "@/lib/services";
import {
  fieldLabel,
  linkedListPropsSchema,
  type CatalogRecord,
  type CatalogRecordDetail,
  type CatalogRecordPageProps,
  type LinkedListProps,
} from "@/src/types";

const storedFieldKeys = [
  "dc_title",
  "dc_identifier",
  "dc_publisher",
  "dc_source",
  "dc_type",
  "dc_creator",
  "dc_date",
  "date_text",
  "dc_subject",
  "dcterms_spatial",
  "dcterms_temporal",
  "dc_rights",
  "dcterms_access_rights",
  "dcterms_provenance",
  "bccns_community",
  "bccns_access_status",
  "bccns_digitized",
] as const satisfies readonly (keyof CatalogRecord)[];

/**
 * SOURCE OF TRUTH KEYWORDS: fieldText, fieldLabel, storedFieldKeys, CatalogRecord, CatalogRecordPage
 * WHAT: Turns one stored catalog value into text for the detail list.
 * WHY: The label comes from the schema map, so array and boolean columns still render.
 * WHERE: Record detail stored-fields section.
 */
function fieldText(
  record: CatalogRecord,
  key: (typeof storedFieldKeys)[number],
): string {
  const value = record[key];
  if (Array.isArray(value)) {
    return value.join(" | ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value ?? "";
}

/**
 * SOURCE OF TRUTH KEYWORDS: RecordFields, CatalogRecordDetail, CatalogRecordPageProps, ConnectionsGraphView, dc_identifier, raw_metadata
 * WHAT: Renders stored columns, the compact per-record Connection Graph alongside relational join lists, and untouched source metadata.
 * WHY: Lets visitors inspect one record's cross-archive connections side-by-side with its joined people, places, communities, and subjects.
 * WHERE: /catalog/[id].
 */
async function RecordFields({ params }: CatalogRecordPageProps) {
  const { id } = await params;
  let record: CatalogRecordDetail | null;
  try {
    record = await catalogService.getCatalogRecord(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Record query failed";
    return (
      <p className="rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {message}
      </p>
    );
  }

  if (!record) {
    notFound();
  }

  const fields = storedFieldKeys.map((key) => [fieldLabel(key), fieldText(record, key)] as const);

  const linkedPeople = record.record_people.map(
    (link) => `${link.people.name} (${link.role})`,
  );
  const linkedPlaces = record.record_places.map((link) => link.places.name);
  const linkedCommunities = Array.from(
    new Set([
      ...record.record_communities.map((link) => link.communities.name),
      ...record.bccns_community,
    ]),
  );
  const linkedSubjects = record.record_subjects.map((link) => link.subjects.name);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/catalog" className="text-sm text-primary hover:underline">
          Back to catalog
        </Link>
        <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight">
          {record.dc_title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-sm">
            {record.dc_type}
          </Badge>
          <Badge variant="outline" className="rounded-sm">
            {record.dc_publisher}
          </Badge>
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

      <section className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ConnectionsGraphView
            records={[record]}
            focalRecordId={record.id}
            compact
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
          <LinkedList title="People" items={linkedPeople} />
          <LinkedList title="Communities" items={linkedCommunities} />
          <LinkedList title="Places" items={linkedPlaces} />
          <LinkedList title="Subjects" items={linkedSubjects} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold">Stored fields</h2>
        <dl className="divide-y divide-border rounded-sm border border-border">
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

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold">Original metadata</h2>
        <dl className="divide-y divide-border rounded-sm border border-border">
          {Object.entries(record.raw_metadata).map(([key, value]) => (
            <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
              <dt className="text-sm text-muted-foreground">{fieldLabel(key)}</dt>
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
 * SOURCE OF TRUTH KEYWORDS: LinkedList, LinkedListProps, record_people, record_places, record_communities, record_subjects
 * WHAT: Shows names linked to a record through a join table.
 * WHY: Empty join lists stay visible so missing links are obvious, with props validated via Zod.
 * WHERE: Record detail page.
 */
function LinkedList(rawProps: LinkedListProps) {
  const { title, items } = linkedListPropsSchema.parse(rawProps);
  return (
    <div className="rounded-sm border border-border bg-card p-4">
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
 * SOURCE OF TRUTH KEYWORDS: CatalogRecordPage, CatalogRecordPageProps, RecordFields, CatalogRecordDetail, raw_metadata, dc_identifier
 * WHAT: Detail route for one catalog record.
 * WHY: Opens a single Postgres row for field-by-field checking.
 * WHERE: Route /catalog/[id].
 */
export default function CatalogRecordPage({ params }: CatalogRecordPageProps) {
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
