<!--
SOURCE OF TRUTH KEYWORDS: BlackLoyalistHeritageCentre, MappingSheet, DublinCore, Records, Postgres
WHAT: Field mapping from Black Loyalist Heritage Centre rows in black_history_metadata.csv into the PostgreSQL records model.
WHY: Ingest is blocked until this sheet is filled. It records one example from the file and whether each column is required.
WHERE: Reviewed before any insert into Supabase Postgres tables sources, records, people, places, communities, and subjects.
-->

# Mapping sheet: Black Loyalist Heritage Centre

Status: filled. Rows from this source are loaded in Postgres.

PostgreSQL target: Supabase project `fmpcwlorierjtcnanfmk`, schema `public`.

Sample: 176 rows in `black_history_metadata.csv` where `dc_publisher` is `Black Loyalist Heritage Centre`. Identifiers in this slice are unique page URLs. `dc_source` is present on every row. 173 rows cite `Canada's Digital Collections: Black Loyalists: Our Story, Our People`. 3 rows cite `Black Loyalist Heritage Centre`.

Controlled `records.dc_type` values used by this source: `document`, `article`, `biography`.

Date rule: `dc_date`, `dcterms_created`, and `dcterms_issued` are empty on all 176 rows. `records.dc_date` and `records.date_text` stay null. Three rows have `dcterms_temporal`; that text stays in `records.dcterms_temporal` and is not copied into `dc_date`.

Access rule: every row says the page is publicly viewable online at `dc_identifier`, so `bccns_access_status` is `online`.

Digitized rule: `media_url` is empty on all 176 rows, and `dc_format` is `text/html`, so `bccns_digitized` is `false`. The page is online, and this slice does not include a digitized file.

Community rule: this source has no community field. Subject strings include place names such as `Birchtown`. Those stay subjects or, when they appear in `dcterms_spatial`, places. `records.bccns_community` stays empty.

Creator rule: `dc_creator` is empty on all 176 rows, so no person link is created from this source.

| Source field | Dublin Core field | Supabase column | Example value | Required or optional |
| --- | --- | --- | --- | --- |
| dc_publisher | Publisher | sources.name, and records.dc_publisher (text) | Black Loyalist Heritage Centre | Required |
| dc_publisher | Publisher | records.source_id (uuid, foreign key to sources.id) | matched from sources.name | Required |
| dc_title | Title | records.dc_title (text) | Revolution | Required |
| dc_identifier | Identifier | records.dc_identifier (text, unique) | https://blackloyalist.com/cdc/story/revolution/revolution.htm | Required |
| dc_source | Source | records.dc_source (text) | Canada's Digital Collections: Black Loyalists: Our Story, Our People | Required |
| dc_type | Type | records.dc_type (text, controlled) | Article -> article. Also Document -> document, Biography -> biography | Required |
| dc_description | Description | records.dc_description (text) | In the early 1770's the American colonies were filled with rebellion and conflict. | Optional |
| dc_creator | Creator | records.dc_creator (text) | empty on all 176 rows | Optional |
| dc_creator | Creator | people.name, via record_people.role = creator | no person row from this source | Optional |
| dc_subject | Subject | records.dc_subject (text[]) | {Black Loyalists, Birchtown, Nova Scotia, African Nova Scotians} | Optional |
| dc_subject | Subject | subjects.name, via record_subjects | Black Loyalists | Optional |
| dc_date | Date | records.dc_date (date) | empty | Optional |
| dc_date | Date | records.date_text (text) | empty | Optional |
| dcterms_created | Date | records.raw_metadata (jsonb) | empty; original key is still stored | Optional |
| dcterms_issued | Date | records.raw_metadata (jsonb) | empty; original key is still stored | Optional |
| dcterms_spatial | Coverage, spatial | records.dcterms_spatial (text) | Birchtown \| Shelburne | Optional |
| dcterms_spatial | Coverage, spatial | places.name, via record_places | Birchtown | Optional |
| dcterms_temporal | Coverage, temporal | records.dcterms_temporal (text) | empty on the Revolution row; 3 of 176 rows have a value | Optional |
| dc_coverage | Coverage | records.raw_metadata (jsonb) | empty on the Revolution row | Optional |
| dc_rights | Rights | records.dc_rights (text) | Published in Canada's Digital Collections and hosted by the Black Loyalist Heritage Centre. | Optional |
| dcterms_accessRights | Access rights | records.dcterms_access_rights (text) | Publicly viewable online at the link in dc_identifier. | Optional |
| dcterms_accessRights | Access rights | records.bccns_access_status (text, controlled) | online | Optional |
| dcterms_provenance | Provenance | records.dcterms_provenance (text) | Held online by Black Loyalist Heritage Centre. Canada's Digital Collections: Black Loyalists: Our Story, Our People. | Optional |
| (no source field) | — | records.bccns_community (text[]) | {} | Optional |
| media_url | — | records.bccns_digitized (boolean) | false | Optional |
| media_url | — | records.raw_metadata (jsonb) | empty | Optional |
| dc_relation | Relation | records.raw_metadata (jsonb) | https://blackloyalist.com/cdc/index.htm | Optional |
| dc_language | Language | records.raw_metadata (jsonb) | eng | Optional |
| dc_format | Format | records.raw_metadata (jsonb) | text/html | Optional |
| collection | — | records.raw_metadata (jsonb) | Black Loyalists: Our Story, Our People | Optional |
| entire original row | — | records.raw_metadata (jsonb) | original keys and values, including dc_title and dc_type, stored unchanged | Required on the column; value is the untouched source object |
