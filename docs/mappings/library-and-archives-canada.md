<!--
SOURCE OF TRUTH KEYWORDS: LibraryAndArchivesCanada, MappingSheet, DublinCore, schemaFieldMap, Postgres
WHAT: Field mapping from Library and Archives Canada rows onto the shared Dublin Core profile.
WHY: Issue 6 is done only when this source sheet is filled beside Nova Scotia Archives and BCCNS.
WHERE: docs/mappings, using labels from src/types/schema-map.ts. Postgres schema public.
-->

# Mapping sheet: Library and Archives Canada

Status: filled. These rows are already loaded in Postgres.

PostgreSQL target: Supabase project `fmpcwlorierjtcnanfmk`, schema `public`.

Sample: 11 rows in `black_history_metadata.csv` where `dc_publisher` is `Library and Archives Canada`. Every row is a research guide. `dc_source` is present on every row. There are no creators and no `dc_date` values.

Identifier rule: four distinct URLs cover the 11 rows. Eight sections share `https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html#expand-collapse`. The first of those keeps that URL in `records.dc_identifier`. The other seven append `#` plus a title slug so the column stays unique. `raw_metadata` keeps the original URL.

Date rule: `dc_date` is empty on all 11 rows, so `records.dc_date` and `records.date_text` stay null. Three rows have a time period such as `1931-1949`. That text stays in `records.dcterms_temporal` and is not parsed into a date.

Access rule: every row says the page is publicly viewable online, so `bccns_access_status` is `online`.

Digitized rule: `media_url` is empty on all 11 rows, so `bccns_digitized` is `false`.

Community rule: this source has no community field. `records.bccns_community` stays empty.

Display rule: catalog titles come from `schemaFieldMap`. `dc_title` is shown as Title, and `dcterms_accessRights` is shown as Access rights.

| Source field | Dublin Core field | Supabase column | Example value | Required or optional |
| --- | --- | --- | --- | --- |
| dc_publisher | Publisher | sources.name, and records.dc_publisher (text) | Library and Archives Canada | Required |
| dc_publisher | Publisher | records.source_id (uuid, foreign key to sources.id) | matched from sources.name | Required |
| dc_title | Title | records.dc_title (text) | Black Canadians | Required |
| dc_identifier | Identifier | records.dc_identifier (text, unique) | https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html | Required |
| dc_source | Source | records.dc_source (text) | Library and Archives Canada | Required |
| dc_type | Type | records.dc_type (text, controlled) | Research guide -> research guide | Required |
| dc_description | Description | records.dc_description (text) | Black history in Canada dates back at least as far as 1608, with the arrival of Mathieu de Coste, a Black African interpreter. | Optional |
| dc_creator | Creator | records.dc_creator (text) | empty on all 11 rows | Optional |
| dc_creator | Creator | people.name, via record_people.role = creator | no person row from this source | Optional |
| dc_subject | Subject | records.dc_subject (text[]) | {Black Canadians, Genealogy, Family history} | Optional |
| dc_subject | Subject | subjects.name, via record_subjects | Black Canadians | Optional |
| dc_date | Date | records.dc_date (date) | empty | Optional |
| dc_date | Date | records.date_text (text) | empty | Optional |
| dcterms_created | Created | records.raw_metadata (jsonb) | empty; original key is still stored | Optional |
| dcterms_issued | Issued | records.raw_metadata (jsonb) | empty; original key is still stored | Optional |
| dcterms_spatial | Coverage, spatial | records.dcterms_spatial (text) | Africville \| Birchtown \| Shelburne \| Halifax \| Upper Canada \| Elgin \| Ontario \| Nova Scotia | Optional |
| dcterms_spatial | Coverage, spatial | places.name, via record_places | Africville | Optional |
| dcterms_temporal | Coverage, temporal | records.dcterms_temporal (text) | 1931-1949 | Optional |
| dc_coverage | Coverage | records.raw_metadata (jsonb) | empty on the Black Canadians row | Optional |
| dc_rights | Rights | records.dc_rights (text) | Published by Library and Archives Canada. | Optional |
| dcterms_accessRights | Access rights | records.dcterms_access_rights (text) | Publicly viewable online at the link in dc_identifier. | Optional |
| dcterms_accessRights | Access rights | records.bccns_access_status (text, controlled) | online | Optional |
| dcterms_provenance | Provenance | records.dcterms_provenance (text) | Held online by Library and Archives Canada. Library and Archives Canada. | Optional |
| (no source field) | Coverage | records.bccns_community (text[]) | {} | Optional |
| media_url | Format | records.bccns_digitized (boolean) | false | Optional |
| media_url | Format | records.raw_metadata (jsonb) | empty | Optional |
| dc_relation | Relation | records.raw_metadata (jsonb) | https://www.canada.ca/en/library-archives/collection/research-help/genealogy-family-history/ethno-cultural/black-canadians.html | Optional |
| dc_language | Language | records.raw_metadata (jsonb) | eng | Optional |
| dc_format | Format | records.raw_metadata (jsonb) | text/html | Optional |
| collection | Relation | records.raw_metadata (jsonb) | Library and Archives Canada: Black Canadians | Optional |
| entire original row | — | records.raw_metadata (jsonb) | original keys and values stored unchanged | Required on the column; value is the untouched source object |
