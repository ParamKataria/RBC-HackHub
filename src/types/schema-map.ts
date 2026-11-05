/**
 * SOURCE OF TRUTH KEYWORDS: schemaFieldMap, fieldLabel, DublinCore, source field, Supabase column
 * WHAT: One map from each metadata key to its display title, Dublin Core name, and Postgres column.
 * WHY: Catalog titles stay readable, and every source sheet uses the same profile.
 * WHERE: Record detail page and docs/mappings.
 */

export type SchemaField = {
  sourceField: string;
  label: string;
  dublinCore: string;
  column: string;
  required: boolean;
};

export const schemaFieldMap = {
  dc_title: {
    sourceField: "dc_title",
    label: "Title",
    dublinCore: "Title",
    column: "records.dc_title",
    required: true,
  },
  dc_identifier: {
    sourceField: "dc_identifier",
    label: "Identifier",
    dublinCore: "Identifier",
    column: "records.dc_identifier",
    required: true,
  },
  dc_publisher: {
    sourceField: "dc_publisher",
    label: "Publisher",
    dublinCore: "Publisher",
    column: "records.dc_publisher",
    required: true,
  },
  dc_source: {
    sourceField: "dc_source",
    label: "Source",
    dublinCore: "Source",
    column: "records.dc_source",
    required: true,
  },
  dc_type: {
    sourceField: "dc_type",
    label: "Type",
    dublinCore: "Type",
    column: "records.dc_type",
    required: true,
  },
  dc_description: {
    sourceField: "dc_description",
    label: "Description",
    dublinCore: "Description",
    column: "records.dc_description",
    required: false,
  },
  dc_creator: {
    sourceField: "dc_creator",
    label: "Creator",
    dublinCore: "Creator",
    column: "records.dc_creator",
    required: false,
  },
  dc_subject: {
    sourceField: "dc_subject",
    label: "Subject",
    dublinCore: "Subject",
    column: "records.dc_subject",
    required: false,
  },
  dc_date: {
    sourceField: "dc_date",
    label: "Date",
    dublinCore: "Date",
    column: "records.dc_date",
    required: false,
  },
  date_text: {
    sourceField: "dc_date",
    label: "Date text",
    dublinCore: "Date",
    column: "records.date_text",
    required: false,
  },
  dcterms_created: {
    sourceField: "dcterms_created",
    label: "Created",
    dublinCore: "Date",
    column: "records.raw_metadata",
    required: false,
  },
  dcterms_issued: {
    sourceField: "dcterms_issued",
    label: "Issued",
    dublinCore: "Date",
    column: "records.raw_metadata",
    required: false,
  },
  dcterms_spatial: {
    sourceField: "dcterms_spatial",
    label: "Place",
    dublinCore: "Coverage, spatial",
    column: "records.dcterms_spatial",
    required: false,
  },
  dcterms_temporal: {
    sourceField: "dcterms_temporal",
    label: "Time period",
    dublinCore: "Coverage, temporal",
    column: "records.dcterms_temporal",
    required: false,
  },
  dc_coverage: {
    sourceField: "dc_coverage",
    label: "Coverage",
    dublinCore: "Coverage",
    column: "records.raw_metadata",
    required: false,
  },
  dc_rights: {
    sourceField: "dc_rights",
    label: "Rights",
    dublinCore: "Rights",
    column: "records.dc_rights",
    required: false,
  },
  dcterms_accessRights: {
    sourceField: "dcterms_accessRights",
    label: "Access rights",
    dublinCore: "Access rights",
    column: "records.dcterms_access_rights",
    required: false,
  },
  dcterms_access_rights: {
    sourceField: "dcterms_accessRights",
    label: "Access rights",
    dublinCore: "Access rights",
    column: "records.dcterms_access_rights",
    required: false,
  },
  dcterms_provenance: {
    sourceField: "dcterms_provenance",
    label: "Provenance",
    dublinCore: "Provenance",
    column: "records.dcterms_provenance",
    required: false,
  },
  dc_relation: {
    sourceField: "dc_relation",
    label: "Relation",
    dublinCore: "Relation",
    column: "records.raw_metadata",
    required: false,
  },
  dc_language: {
    sourceField: "dc_language",
    label: "Language",
    dublinCore: "Language",
    column: "records.raw_metadata",
    required: false,
  },
  dc_format: {
    sourceField: "dc_format",
    label: "Format",
    dublinCore: "Format",
    column: "records.raw_metadata",
    required: false,
  },
  collection: {
    sourceField: "collection",
    label: "Collection",
    dublinCore: "Relation",
    column: "records.raw_metadata",
    required: false,
  },
  media_url: {
    sourceField: "media_url",
    label: "Media URL",
    dublinCore: "Format",
    column: "records.bccns_digitized",
    required: false,
  },
  bccns_community: {
    sourceField: "bccns_community",
    label: "Community",
    dublinCore: "Coverage",
    column: "records.bccns_community",
    required: false,
  },
  bccns_access_status: {
    sourceField: "dcterms_accessRights",
    label: "Access status",
    dublinCore: "Access rights",
    column: "records.bccns_access_status",
    required: false,
  },
  bccns_digitized: {
    sourceField: "media_url",
    label: "Digitized",
    dublinCore: "Format",
    column: "records.bccns_digitized",
    required: false,
  },
} as const satisfies Record<string, SchemaField>;

export type SchemaFieldKey = keyof typeof schemaFieldMap;

/**
 * SOURCE OF TRUTH KEYWORDS: fieldLabel, schemaFieldMap, Title, display label
 * WHAT: Returns the readable title for a metadata key.
 * WHY: Pages should show Title and Access rights, never the dc_ or dcterms_ prefix.
 * WHERE: Catalog record detail, for stored columns and original metadata.
 */
export function fieldLabel(sourceField: string): string {
  if (Object.prototype.hasOwnProperty.call(schemaFieldMap, sourceField)) {
    return schemaFieldMap[sourceField as SchemaFieldKey].label;
  }

  const stripped = sourceField.replace(/^(dc_|dcterms_|bccns_)/, "");
  const words = stripped
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();

  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
