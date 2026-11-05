<!--
SOURCE OF TRUTH KEYWORDS: NovaScotiaArchives, MappingSheet, DublinCore, Records, Postgres
WHAT: Field mapping from Nova Scotia Archives rows in black_history_metadata.csv into the PostgreSQL records model.
WHY: Ingest is blocked until this sheet is filled. It records one example from the file and whether each column is required.
WHERE: Reviewed before any insert into Supabase Postgres tables sources, records, people, places, communities, and subjects.
-->

# Mapping sheet: Nova Scotia Archives

Status: filled. Rows from this source are loaded in Postgres. The row with an empty `dc_source` uses the publisher name in that required column, and the empty original value stays in `raw_metadata`.

PostgreSQL target: Supabase project `fmpcwlorierjtcnanfmk`, schema `public`.

Sample: 747 rows in `black_history_metadata.csv` where `dc_publisher` is `Nova Scotia Archives`. Identifiers in this slice are unique URLs. One row has an empty `dc_source` (`https://archives.novascotia.ca/africanns/archives/?ID=114`). That required column stores the publisher name, and `raw_metadata.dc_source` keeps the empty original.

Controlled `records.dc_type` values used by this source: `photograph`, `document`, `map`, `newspaper`. The shared list also allows `oral history`, `artifact`, `audio`, `video`, `biography`, `article`, `educational resource`, `research guide`, `poster`, `timeline`, and `magazine`.

Date rule: only an existing `YYYY-MM-DD` value is stored in `records.dc_date`. Every other non-empty date string, including `ca. 1965`, `[between 1840 and 1846]`, and `22 September 1750`, is stored in `records.date_text`. The original string stays inside `records.raw_metadata`.

Access rule: `dcterms_accessRights` on every row in this slice says the item is publicly viewable on the Nova Scotia Archives website, so `bccns_access_status` is `online`.

Digitized rule: every row in this slice has `media_url`, so `bccns_digitized` is `true`.

Community rule: this source has no community field. `records.bccns_community` stays empty. Do not infer a community from a subject or a place.

| Source field | Dublin Core field | Supabase column | Example value | Required or optional |
| --- | --- | --- | --- | --- |
| dc_publisher | Publisher | sources.name, and records.dc_publisher (text) | Nova Scotia Archives | Required |
| dc_publisher | Publisher | records.source_id (uuid, foreign key to sources.id) | matched from sources.name | Required |
| dc_title | Title | records.dc_title (text) | A view of Halifax from the topmasthead | Required |
| dc_identifier | Identifier | records.dc_identifier (text, unique) | https://archives.novascotia.ca/africanns/archives/?ID=1 | Required |
| dc_source | Source | records.dc_source (text) | Nova Scotia Archives T. Jeffreys, Untitled Map of Halifax (London, 1750) negative number: OS N371 | Required |
| dc_type | Type | records.dc_type (text, controlled) | Map -> map. Also Document -> document, Photograph -> photograph, Newspaper -> newspaper | Required |
| dc_description | Description | records.dc_description (text) | This is the first known view of Halifax, sketched from the topmast of a ship in the harbour in 1749. | Optional |
| dc_creator | Creator | records.dc_creator (text) | Mary McKie | Optional |
| dc_creator | Creator | people.name, via record_people.role = creator | Mary McKie | Optional |
| dc_subject | Subject | records.dc_subject (text[]) | {African Nova Scotians, Slavery, Abolition, Black Loyalists, Black Refugees} | Optional |
| dc_subject | Subject | subjects.name, via record_subjects | African Nova Scotians | Optional |
| dc_date | Date | records.dc_date (date) | empty for this source; values are not YYYY-MM-DD | Optional |
| dc_date | Date | records.date_text (text) | [between 1840 and 1846] | Optional |
| dcterms_created | Date | records.raw_metadata (jsonb) | kept under the original key dcterms_created | Optional |
| dcterms_issued | Date | records.raw_metadata (jsonb) | 25 January 1750 | Optional |
| dcterms_spatial | Coverage, spatial | records.dcterms_spatial (text) | Halifax \| Nova Scotia | Optional |
| dcterms_spatial | Coverage, spatial | places.name, via record_places | Halifax | Optional |
| dcterms_temporal | Coverage, temporal | records.dcterms_temporal (text) | 25 January 1750 | Optional |
| dc_coverage | Coverage | records.raw_metadata (jsonb) | Halifax \| Nova Scotia; 25 January 1750 | Optional |
| dc_rights | Rights | records.dc_rights (text) | This page and all contents copyright © 2023, Province of Nova Scotia, all rights reserved. | Optional |
| dcterms_accessRights | Access rights | records.dcterms_access_rights (text) | Publicly viewable on the Nova Scotia Archives website. Reproduction or publication may require permission from the holding institution. | Optional |
| dcterms_accessRights | Access rights | records.bccns_access_status (text, controlled) | online | Optional |
| dcterms_provenance | Provenance | records.dcterms_provenance (text) | Held by Nova Scotia Archives. Archival citation: Nova Scotia Archives T. Jeffreys, Untitled Map of Halifax (London, 1750) negative number: OS N371 | Optional |
| (no source field) | — | records.bccns_community (text[]) | {} | Optional |
| media_url | — | records.bccns_digitized (boolean) | true | Optional |
| media_url | — | records.raw_metadata (jsonb) | https://archives.novascotia.ca/images/africanns/200402000.jpg | Optional |
| dc_relation | Relation | records.raw_metadata (jsonb) | https://archives.novascotia.ca/africanns/ | Optional |
| dc_language | Language | records.raw_metadata (jsonb) | eng | Optional |
| dc_format | Format | records.raw_metadata (jsonb) | image/jpeg | Optional |
| collection | — | records.raw_metadata (jsonb) | African Nova Scotians in the Age of Slavery and Abolition | Optional |
| entire original row | — | records.raw_metadata (jsonb) | original keys and values, including dc_title and dc_type, stored unchanged | Required on the column; value is the untouched source object |
