<!--
SOURCE OF TRUTH KEYWORDS: CanadianEncyclopedia, MappingSheet, DublinCore, Records, Postgres
WHAT: Field mapping from The Canadian Encyclopedia rows in black_history_metadata.csv into the PostgreSQL records model.
WHY: Ingest is blocked until this sheet is filled. It records one example from the file and whether each column is required.
WHERE: Reviewed before any insert into Supabase Postgres tables sources, records, people, places, communities, and subjects.
-->

# Mapping sheet: The Canadian Encyclopedia

Status: filled. Rows from this source are loaded in Postgres.

PostgreSQL target: Supabase project `fmpcwlorierjtcnanfmk`, schema `public`.

Sample: 196 rows in `black_history_metadata.csv` where `dc_publisher` is `The Canadian Encyclopedia`. Identifiers in this slice are unique article URLs. `dc_source` is present on every row and is the same string as the publisher.

Controlled `records.dc_type` values used by this source: `biography`, `article`, `timeline`, `educational resource`.

Date rule: `dc_date` is already `YYYY-MM-DD` on 194 rows, for example `2021-01-18`, and that value is stored in `records.dc_date`. Two rows have an empty date. Empty stays null in both `records.dc_date` and `records.date_text`. This source has no circa or prose dates.

Access rule: every row says the page is publicly viewable online at `dc_identifier`, so `bccns_access_status` is `online`.

Digitized rule: a non-empty `media_url` sets `bccns_digitized` to `true` (194 rows). An empty `media_url` sets it to `false` (2 rows). Some image URLs are the encyclopedia placeholder `TCE_placeholder.png`; the boolean still follows the non-empty rule, and the original URL remains in `raw_metadata` for review.

Community rule: this source has no community field. `records.bccns_community` stays empty. Do not infer a community from a subject or a place.

Creator rule: `dc_creator` is the article author, such as `Tom Hawthorn` for the Anne Cools biography. Link that name as a person with role `creator`. Do not treat the article title as a person during ingest.

| Source field | Dublin Core field | Supabase column | Example value | Required or optional |
| --- | --- | --- | --- | --- |
| dc_publisher | Publisher | sources.name, and records.dc_publisher (text) | The Canadian Encyclopedia | Required |
| dc_publisher | Publisher | records.source_id (uuid, foreign key to sources.id) | matched from sources.name | Required |
| dc_title | Title | records.dc_title (text) | Anne Cools | Required |
| dc_identifier | Identifier | records.dc_identifier (text, unique) | https://thecanadianencyclopedia.ca/en/article/anne-cools | Required |
| dc_source | Source | records.dc_source (text) | The Canadian Encyclopedia | Required |
| dc_type | Type | records.dc_type (text, controlled) | Biography -> biography. Also Article -> article, Timeline -> timeline, Educational resource -> educational resource | Required |
| dc_description | Description | records.dc_description (text) | Anne Clare Cools, administrator, community worker, senator (born on 12 August 1943 in Barbados, British West Indies). | Optional |
| dc_creator | Creator | records.dc_creator (text) | Tom Hawthorn | Optional |
| dc_creator | Creator | people.name, via record_people.role = creator | Tom Hawthorn | Optional |
| dc_subject | Subject | records.dc_subject (text[]) | {Black history in Canada, African Canadians} | Optional |
| dc_subject | Subject | subjects.name, via record_subjects | Black history in Canada | Optional |
| dc_date | Date | records.dc_date (date) | 2021-01-18 | Optional |
| dc_date | Date | records.date_text (text) | empty when dc_date is already YYYY-MM-DD | Optional |
| dcterms_created | Date | records.raw_metadata (jsonb) | empty in this slice; original key is still stored | Optional |
| dcterms_issued | Date | records.raw_metadata (jsonb) | 2021-01-18 | Optional |
| dcterms_spatial | Coverage, spatial | records.dcterms_spatial (text) | Dartmouth \| Halifax \| Nova Scotia | Optional |
| dcterms_spatial | Coverage, spatial | places.name, via record_places | Dartmouth | Optional |
| dcterms_temporal | Coverage, temporal | records.dcterms_temporal (text) | empty on the Anne Cools row; 66 of 196 rows have a value | Optional |
| dc_coverage | Coverage | records.raw_metadata (jsonb) | empty on the Anne Cools row | Optional |
| dc_rights | Rights | records.dc_rights (text) | Published by The Canadian Encyclopedia. | Optional |
| dcterms_accessRights | Access rights | records.dcterms_access_rights (text) | Publicly viewable online at the link in dc_identifier. | Optional |
| dcterms_accessRights | Access rights | records.bccns_access_status (text, controlled) | online | Optional |
| dcterms_provenance | Provenance | records.dcterms_provenance (text) | Held online by The Canadian Encyclopedia. The Canadian Encyclopedia. | Optional |
| (no source field) | — | records.bccns_community (text[]) | {} | Optional |
| media_url | — | records.bccns_digitized (boolean) | true | Optional |
| media_url | — | records.raw_metadata (jsonb) | https://d3d0lqu00lnqvz.cloudfront.net/media/media/204b2826-d374-4434-a290-9ba509d383bc.jpg | Optional |
| dc_relation | Relation | records.raw_metadata (jsonb) | https://thecanadianencyclopedia.ca/en/collection/black-history-in-canada | Optional |
| dc_language | Language | records.raw_metadata (jsonb) | eng | Optional |
| dc_format | Format | records.raw_metadata (jsonb) | text/html | Optional |
| collection | — | records.raw_metadata (jsonb) | Black History in Canada | Optional |
| entire original row | — | records.raw_metadata (jsonb) | original keys and values, including dc_title and dc_type, stored unchanged | Required on the column; value is the untouched source object |
