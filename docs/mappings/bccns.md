<!--
SOURCE OF TRUTH KEYWORDS: BCCNS, MappingSheet, DublinCore, schemaFieldMap, Postgres
WHAT: Field mapping from BCCNS rows onto the shared Dublin Core profile.
WHY: Issue 6 is done only when this source sheet is filled beside Nova Scotia Archives and Library and Archives Canada.
WHERE: docs/mappings, using labels from src/types/schema-map.ts. Postgres schema public.
-->

# Mapping sheet: BCCNS

Status: filled. These rows are already loaded in Postgres.

PostgreSQL target: Supabase project `fmpcwlorierjtcnanfmk`, schema `public`.

This is the BCCNS source in the metadata file. The CSV publisher is `A Black People's History of Canada`, the Black Cultural Centre for Nova Scotia public-history site at `blackpeopleshistory.ca`. There is no separate `BCCNS` publisher string.

Sample: 36 rows. Identifiers are unique page URLs. `dc_source` matches the publisher on every row. Every row has a creator, an ISO date, and a media URL.

Controlled `records.dc_type` values used by this source: `educational resource`, `poster`, `magazine`.

Date rule: all 36 `dc_date` values are `YYYY-MM-DD`, for example `2024-02-07`, and that value is stored in `records.dc_date`. `records.date_text` stays null. `dcterms_temporal` is empty on every row.

Access rule: every row says the page is publicly viewable online, so `bccns_access_status` is `online`.

Digitized rule: every row has `media_url`, so `bccns_digitized` is `true`.

Community rule: this source has no community field. `records.bccns_community` stays empty. Do not infer a community from a subject or a place.

Creator rule: `dc_creator` is the named contributor, such as `Crystal Sherrah` on the Roots and Rhythms poster. Link that name as a person with role `creator`.

Display rule: catalog titles come from `schemaFieldMap`. `dc_title` is shown as Title, and `dcterms_accessRights` is shown as Access rights.

| Source field | Dublin Core field | Supabase column | Example value | Required or optional |
| --- | --- | --- | --- | --- |
| dc_publisher | Publisher | sources.name, and records.dc_publisher (text) | A Black People's History of Canada | Required |
| dc_publisher | Publisher | records.source_id (uuid, foreign key to sources.id) | matched from sources.name | Required |
| dc_title | Title | records.dc_title (text) | Roots and Rhythms Poster | Required |
| dc_identifier | Identifier | records.dc_identifier (text, unique) | https://www.blackpeopleshistory.ca/roots-and-rhythms-poster/ | Required |
| dc_source | Source | records.dc_source (text) | A Black People's History of Canada | Required |
| dc_type | Type | records.dc_type (text, controlled) | Poster -> poster. Also Educational resource -> educational resource, Magazine -> magazine | Required |
| dc_description | Description | records.dc_description (text) | View the poster from out Roots & Rhythms: Connecting the Past and Future event, held on February 7th 2024. | Optional |
| dc_creator | Creator | records.dc_creator (text) | Crystal Sherrah | Optional |
| dc_creator | Creator | people.name, via record_people.role = creator | Crystal Sherrah | Optional |
| dc_subject | Subject | records.dc_subject (text[]) | {Black history in Canada, African Canadians, Arts / Entertainment, poster} | Optional |
| dc_subject | Subject | subjects.name, via record_subjects | Black history in Canada | Optional |
| dc_date | Date | records.dc_date (date) | 2024-02-07 | Optional |
| dc_date | Date | records.date_text (text) | empty when dc_date is already YYYY-MM-DD | Optional |
| dcterms_created | Created | records.raw_metadata (jsonb) | empty; original key is still stored | Optional |
| dcterms_issued | Issued | records.raw_metadata (jsonb) | 2024-02-07 | Optional |
| dcterms_spatial | Coverage, spatial | records.dcterms_spatial (text) | Ontario | Optional |
| dcterms_spatial | Coverage, spatial | places.name, via record_places | Ontario | Optional |
| dcterms_temporal | Coverage, temporal | records.dcterms_temporal (text) | empty on all 36 rows | Optional |
| dc_coverage | Coverage | records.raw_metadata (jsonb) | empty on the Roots and Rhythms row | Optional |
| dc_rights | Rights | records.dc_rights (text) | Published by A Black People's History of Canada. | Optional |
| dcterms_accessRights | Access rights | records.dcterms_access_rights (text) | Publicly viewable online at the link in dc_identifier. | Optional |
| dcterms_accessRights | Access rights | records.bccns_access_status (text, controlled) | online | Optional |
| dcterms_provenance | Provenance | records.dcterms_provenance (text) | Held online by A Black People's History of Canada. A Black People's History of Canada. | Optional |
| (no source field) | Coverage | records.bccns_community (text[]) | {} | Optional |
| media_url | Format | records.bccns_digitized (boolean) | true | Optional |
| media_url | Format | records.raw_metadata (jsonb) | https://www.blackpeopleshistory.ca/storage/2024/01/BPHC-BHM-Event_FB_1200-x-628-768x402.jpg | Optional |
| dc_relation | Relation | records.raw_metadata (jsonb) | https://www.blackpeopleshistory.ca/ | Optional |
| dc_language | Language | records.raw_metadata (jsonb) | eng | Optional |
| dc_format | Format | records.raw_metadata (jsonb) | text/html | Optional |
| collection | Relation | records.raw_metadata (jsonb) | A Black People's History of Canada | Optional |
| entire original row | — | records.raw_metadata (jsonb) | original keys and values stored unchanged | Required on the column; value is the untouched source object |
