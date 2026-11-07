# RBC HackHub

A discovery catalog for Black history records held by Nova Scotia Archives, Library and Archives Canada, and the Black Cultural Centre for Nova Scotia (BCCNS). Records live in Supabase Postgres. The app indexes metadata and links back to each source. It does not copy the collections.

## Routes

| Route | What it does |
| --- | --- |
| [`/`](app/page.tsx) | Home. Links to the catalog. |
| [`/catalog`](app/catalog/page.tsx) | Test page for full-text search. One search box covers every source. |
| [`/catalog/[id]`](app/catalog/[id]/page.tsx) | One record: stored fields, linked people, places, and subjects, and the original metadata. |
| [`/api/search`](app/api/search/route.ts) | JSON search across every source. |

`/catalog` and `/api/search` are public reads. Row Level Security still allows only `SELECT`.

Auth pages from the starter remain at `/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, and `/auth/update-password`. `/protected` requires a signed-in session.

## Search

`GET /api/search` reads the Postgres `search_vector` column. An empty `q` lists every record. `institution` limits the result to one publisher.

| Query param | Matches |
| --- | --- |
| `q` | Full text on title, description, subject, place, and community |
| `institution` | `dc_publisher` |
| `type` | Controlled `dc_type` value, such as `map` or `research guide` |
| `creator` | Text in `dc_creator` |
| `subject` | A value in `dc_subject` |
| `place` | Text in `dcterms_spatial` |
| `from` | Historical date interval (`dc_date`, `date_text`, or `dcterms_temporal`) overlapping on or after `YYYY` or `YYYY-MM-DD` |
| `to` | Historical date interval (`dc_date`, `date_text`, or `dcterms_temporal`) overlapping on or before `YYYY` or `YYYY-MM-DD` |

Examples:

- [http://localhost:3000/api/search](http://localhost:3000/api/search)
- [http://localhost:3000/api/search?q=halifax](http://localhost:3000/api/search?q=halifax)
- [http://localhost:3000/api/search?institution=Library%20and%20Archives%20Canada](http://localhost:3000/api/search?institution=Library%20and%20Archives%20Canada)
- [http://localhost:3000/catalog?q=halifax](http://localhost:3000/catalog?q=halifax)

The catalog form uses those same parameters and links to the JSON route for the current search.

`records.search_vector` is a `tsvector` maintained by a before-insert/update trigger, with a GIN index named `records_search_vector_gin`. Postgres will not store `to_tsvector` in a generated column.

## Mapping sheets

Field labels on the record page come from `schemaFieldMap` in [`src/types/schema-map.ts`](src/types/schema-map.ts). Each sheet maps source field, Dublin Core field, Supabase column, an example value, and whether the field is required.

The three source sheets:

- [Nova Scotia Archives](docs/mappings/nova-scotia-archives.md)
- [Library and Archives Canada](docs/mappings/library-and-archives-canada.md)
- [BCCNS](docs/mappings/bccns.md). In the CSV the publisher is `A Black People's History of Canada`.

Two more publishers are loaded and mapped:

- [The Canadian Encyclopedia](docs/mappings/canadian-encyclopedia.md)
- [Black Loyalist Heritage Centre](docs/mappings/black-loyalist-heritage-centre.md)

No source has a community field, so `bccns_community` stays empty.

## Run locally

1. Copy [`.env.example`](.env.example) to `.env`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project API settings. The example file already has the project URL.
3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000/catalog](http://localhost:3000/catalog).
