

# Every Rule Must Be Followed
Every rule in this file is compulsory, not optional advice.

## Project setup

- Stack: TypeScript, Next.js (App Router), Supabase (PostgreSQL), Tailwind CSS / React
- Source directory (for keyword grep): `src/` (or `app/` if not using `src` directory)
- Typecheck command: `npm run typecheck` (or `npx tsc --noEmit`)
- Lint command: `npm run lint` 
- Test command: `npm run test`
- Dev server command: `npm run dev`
- Shared types: `src/types/database.types.ts` (Supabase generated) and `src/types/`
- Shared components: `src/components/`
- Protected entry point (auth, gates, permissions): `src/middleware.ts` (route gates) and `src/utils/supabase/server.ts` (server auth client)
- Service / data layer: `src/app/actions/` (Server Actions) and `src/lib/services/`
- Where permissions are defined: Supabase RLS (Row Level Security in DB) and `src/utils/auth/` (App-level roles)

## 1. Build from existing patterns, not new ones

You are building this app as a pattern-recognition model: everything you write should come from patterns and coding practices already in this codebase. Never invent your own architecture, pull in your own libraries, or start a new pattern without first confirming that a similar one doesn't already exist.

The app runs on a SOURCE OF TRUTH global architecture, which is already established. Your job is to build into it. Globalize what you write so the app stays modular and future features are a plug-in rather than a rewrite. Nothing should be tightly coupled, and swapping a tech stack, a business rule, or a strategy should be easy. That applies to configuration, state management, and layered code where each layer is an independent task (the same way the existing endpoints or handlers are built).

But don't create blindly. You have to know whether something that already facilitates your work exists. Only when no existing architecture can support the new feature should you build something new.

If the codebase is new or empty, there are no patterns yet. Set one up once, in one place, label it with SOURCE OF TRUTH KEYWORDS, and follow it from then on.

## 2. How to search: `grep -l` first

The whole codebase carries a `SOURCE OF TRUTH KEYWORDS` line at the top of each file and code block precisely so you can find things without reading everything. This is what keeps context pollution at zero and stops us from burning through session limits.

Before creating any type, function, constant, or component, grep for it by keyword, and you must grep with `-l` (for example `grep -rl "keyword" src/`, skipping dependency and build folders). That gives you the list of *files* where the thing could live; you then narrow to where it's most likely to be and read only those files. It's the fastest path that also protects the context window. If the keyword search turns up nothing, search the codebase normally. If you find it, follow what's already there.

If you do have to create something new, give it its own `SOURCE OF TRUTH KEYWORDS` line with 5-6 specific keywords so the next agent can find it and understand how it works.

Never create a duplicate type, function, component, or block of code just because grep felt like work.

## 3. The layered architecture

Use these layers whatever the stack. Rename them to match the framework, but keep the separation.

1. **Protected entry point: the heart of the app.** Every important endpoint or handler must go through it. It already does a ton of heavy lifting: feature gates, usage checks, permissions, and authorization are all handled server-side, so don't re-check any of it. The type checker or the entry point's signature will show you what it needs. Next.js `middleware.ts` handles initial route protection, while `createServerClient` from `@supabase/ssr` handles the session.
​2. **Handlers / routers** consume the protected entry point and hold business logic: validation, orchestration, decisions. Because the entry point already covered gates, usage, permissions, and auth, the handler should only contain logic specific to the task at hand. In Next.js App Router, these are typically Server Actions or Route Handlers (`route.ts`).
3. **Service layer** is the only layer that touches the database directly. Every service file must be marked server-only using the framework's mechanism (`import 'server-only'` in Next.js). Without it, customers can invoke the function directly and bypass security, which violates our security guidelines. Import services into handlers as a namespace or object (for example `import * as userService`) so you get object references. Database interactions should utilize the typed Supabase client.
4. Remember to wire up any permission the feature requires. For Supabase, ensure Row Level Security (RLS) policies are configured for new tables.

Don't create framework-reserved files (middleware, config, entry points) from memory. Check the framework's current docs first, because names change between versions.

## 4. Production-grade typing

If the language has a type system, never bypass it. No `any`, `unknown`, hardcoded types, or any other type-system bypass (unchecked casts, ignore comments). This is a production application.

For types, work in this order so we save context: if the type relates to our database schema or ORM, use the existing generated type (from `database.types.ts` generated via Supabase CLI) and stop there. Otherwise, check the shared types location to see whether the custom type already exists, and only create one if it doesn't and it will genuinely be a reusable source of truth. Types are never written anywhere except the shared types location. Derive custom types from existing types and schemas instead of writing them by hand. Most likely a few types already exist, so leverage those and build your own from them.

Run the typecheck command every single time you hand something over, to prove the codebase is clean. Never report a false positive.

## 5. Validate every input with a schema

Every component, form, and endpoint that takes input is validated against a schema, every single time (for example Zod in TypeScript). Use the form library's recommended schema integration (like `react-hook-form` with `@hookform/resolvers/zod` or Next.js standard Server Action validation). This is what makes data corruption impossible.

## 6. Inline comment context injection

This is the most important part of your development process: it's how other AI devs grep the codebase and understand each block through its SOT keywords. Above every function or block, write the following, using the language's own comment syntax:

```typescript
/**
 * SOURCE OF TRUTH KEYWORDS: Symbol1, Symbol2, TypeA (5-6 keywords, to power the SOT keyword search)
 * WHAT:  What this block or function is.
 * WHY:   Why it's needed here and why it's done this way.
 * WHERE: Where it's being used.
 */
```
Add ordinary inline comments too, but keep them minimal and outcome based - don't just narrate what the code already says.

## 7. UI
Check for a reusable component before creating one; extend or compose what exists, and treat copying a component's pattern as a signal to generalize it. Components reused across routes or screens live in the shared global folder (src/components/); route-only components live in that route's components folder (e.g., src/app/(routes)/dashboard/_components). Design components for reuse: no hardcoded logic, layouts, or data inside them, with variable parts coming in as slots or props. Simple components follow the app's existing themes. For a complex component, take an external UI block only as a reference, adapt it to the app's folder structure and naming, generalize it if needed, and rewrite any copy that does not match the app's branding. Theme colors always come from the app's theme tokens (Tailwind config); hardcoded color values are not allowed, so light and dark mode keep working.

## 8. Delivery
Keep everything production-grade: never create scripts, database scripts, seed files, or probe/tester files, or anything else that couldn't be pushed to production. Ask my permission before creating any script that performs a manual action.

Use barrel exports (index files that re-export a module) wherever the language supports them, exporting as a single object where that makes sense.

Never skip a feature or leave it incomplete. If pieces are missing, because you forgot them or because the user never mentioned them, either finish them or tell the user about those outliers.

Don't use git unless told.

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature-slug>/` (untracked by git). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` at repo root and `docs/adr/`). See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
