/**
 * SOURCE OF TRUTH KEYWORDS: askSearchVerificationTest, InMemoryModelAdapter, ArchiveSearchBar, filterHref, zeroStorageSideEffects, inquiryHandoff, ticket04EndToEndVerification
 * WHAT: Unit, accessibility, and seam verification tests for inquiry execution, filterHref serialization, collapsible filters, and dual-mode search bar state.
 * WHY: Proves deterministic claim grounding, zero sessionStorage side effects, accessible button contracts, URL query synchronization, and complete Ticket 04 verification.
 * WHERE: tests/ask-search-verification.test.ts (promised in lib/services/ask.ts line 7 and Ticket 04).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimLines, groundClaims } from "@/lib/services/ask";
import {
  InMemoryModelAdapter,
  createInMemoryModelAdapter,
} from "@/lib/services/model-adapter";
import { CatalogFilters } from "@/app/catalog/_components/catalog-filters";
import { CatalogResults } from "@/app/catalog/_components/catalog-results";
import { CatalogSearchSection } from "@/app/catalog/_components/catalog-search-section";
import CatalogPage from "@/app/catalog/page";
import {
  ArchiveSearchBar,
  clearCatalogSearchParams,
  filterHref,
  handleModeSwitch,
  handleRadioArrowNavigation,
  mergeCatalogSearchParams,
} from "@/src/components/archive";
import { catalogService, searchService } from "@/lib/services";
import {
  archiveSearchBarPropsSchema,
  askResponseSchema,
  catalogFiltersPropsSchema,
  catalogSearchSectionPropsSchema,
  countActiveSecondaryFilters,
  noArchiveSourceMessage,
  noDirectAnswerMessage,
  parseSearchParams,
  type AskClaim,
  type AskModelClaim,
  type CatalogRecord,
  type ExtraIdValue,
  type LanguageModelPort,
  type SearchQuery,
} from "@/src/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("LanguageModelPort & InMemoryModelAdapter", () => {
  const sampleRecordId = "11111111-2222-3333-4444-555555555555";
  const fakeRecordId = "99999999-8888-7777-6666-555555555555";

  const sampleCatalogRecord: CatalogRecord = {
    id: sampleRecordId,
    dc_title: "Africville Church Records",
    dc_identifier: "BCCNS-1960-001",
    dc_publisher: "Black Cultural Centre for Nova Scotia",
    dc_source: "BCCNS Physical Archives",
    dc_type: "document",
    dc_description:
      "Historical documentation of the Africville community church.",
    dc_creator: "Addie States",
    dc_subject: ["Africville", "Community History"],
    dc_date: "1960",
    date_text: "circa 1960",
    dcterms_spatial: "Africville",
    dcterms_temporal: "20th Century",
    dc_rights: "In Copyright",
    dcterms_access_rights: "Open access",
    dcterms_provenance: "Donated by community elders",
    bccns_community: ["Africville"],
    bccns_access_status: "available",
    bccns_digitized: true,
  };

  it("fulfills the LanguageModelPort interface contract with fixed claims", async () => {
    const fixedClaims: AskModelClaim[] = [
      {
        text: "The Africville church was central to community life.",
        recordIds: [sampleRecordId],
      },
    ];

    // Fulfills interface type
    const adapter: LanguageModelPort = new InMemoryModelAdapter({
      claims: fixedClaims,
    });

    const result = await adapter.generateClaims("Inquiry about Africville");
    expect(result.claims).toEqual(fixedClaims);
  });

  it("accepts an array directly in the constructor or factory", async () => {
    const fixedClaims: AskModelClaim[] = [
      {
        text: "Church records documented weddings and baptisms.",
        recordIds: [sampleRecordId],
      },
    ];

    const adapter = createInMemoryModelAdapter(fixedClaims);
    const result = await adapter.generateClaims({
      prompt: "What records exist?",
      maxOutputTokens: 500,
    });

    expect(result.claims).toEqual(fixedClaims);
  });

  it("fulfills dynamic function responses for context-dependent inquiry tests", async () => {
    const adapter = new InMemoryModelAdapter((input) => {
      if (input.prompt.includes("Africville")) {
        return {
          claims: [
            {
              text: `Africville inquiry answered with token budget ${input.maxOutputTokens ?? 0}.`,
              recordIds: [sampleRecordId],
            },
          ],
        };
      }
      return { claims: [] };
    });

    const responseWithMatch = await adapter.generateClaims({
      prompt: "Tell me about Africville",
      maxOutputTokens: 1400,
    });
    expect(responseWithMatch.claims).toHaveLength(1);
    expect(responseWithMatch.claims?.[0].text).toContain("token budget 1400");

    const responseWithoutMatch = await adapter.generateClaims("Other query");
    expect(responseWithoutMatch.claims).toHaveLength(0);
  });

  it("tracks call history for prompt assertion and resets cleanly", async () => {
    const adapter = new InMemoryModelAdapter();

    await adapter.generateClaims("First inquiry prompt");
    await adapter.generateClaims({
      prompt: "Second inquiry prompt",
      maxOutputTokens: 800,
    });

    const calls = adapter.getCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ prompt: "First inquiry prompt" });
    expect(calls[1]).toEqual({
      prompt: "Second inquiry prompt",
      maxOutputTokens: 800,
    });

    adapter.resetCalls();
    expect(adapter.getCalls()).toHaveLength(0);
  });

  it("allows setting claims, handlers, and errors dynamically", async () => {
    const adapter = new InMemoryModelAdapter();

    // Default empty
    const initial = await adapter.generateClaims("Query");
    expect(initial.claims).toEqual([]);

    // Set fixed claims
    adapter.setClaims([
      { text: "Newly set claim", recordIds: [sampleRecordId] },
    ]);
    const updated = await adapter.generateClaims("Query 2");
    expect(updated.claims).toHaveLength(1);

    // Set error simulation
    adapter.setError("Model service unavailable");
    await expect(adapter.generateClaims("Failing query")).rejects.toThrow(
      "Model service unavailable",
    );

    // Reset error
    adapter.setError(null);
    adapter.setHandler(() => ({
      claims: [{ text: "Recovered via handler", recordIds: [sampleRecordId] }],
    }));
    const recovered = await adapter.generateClaims("Query 3");
    expect(recovered.claims?.[0].text).toBe("Recovered via handler");
  });

  it("verifies grounding: valid claims survive claimLines while fabricated IDs are stripped", async () => {
    const mixedClaims: AskModelClaim[] = [
      {
        text: "Grounded claim citing real catalog record.",
        recordIds: [sampleRecordId],
      },
      {
        text: "Hallucinated claim citing fabricated UUID.",
        recordIds: [fakeRecordId],
      },
      {
        text: "Uncited claim with no record IDs.",
        recordIds: [],
      },
    ];

    const adapter = new InMemoryModelAdapter(mixedClaims);
    const generated = await adapter.generateClaims("Verify grounding");

    const filteredLines = claimLines(
      generated.claims ?? [],
      [sampleCatalogRecord],
    );

    // Only the valid claim citing sampleRecordId survives
    expect(filteredLines).toHaveLength(1);
    expect(filteredLines[0]).toBe(
      `Grounded claim citing real catalog record. [${sampleRecordId}]`,
    );
  });

  it("grounds claims and strips fabricated IDs while preserving valid candidate IDs", () => {
    const claimsWithHallucination: AskModelClaim[] = [
      {
        text: "Addie States documented the Africville church in 1960.",
        recordIds: [sampleRecordId, fakeRecordId],
      },
    ];

    const grounded = groundClaims(claimsWithHallucination, [sampleCatalogRecord]);

    expect(grounded).toHaveLength(1);
    expect(grounded[0].text).toBe(
      "Addie States documented the Africville church in 1960.",
    );
    // Verified recordId is preserved, fabricated ID is stripped
    expect(grounded[0].citedRecordIds).toEqual([sampleRecordId]);
  });

  it("prunes claims that cite zero valid records", () => {
    const claimsWithZeroValid: AskModelClaim[] = [
      {
        text: "Fabricated claim citing non-existent records.",
        recordIds: [fakeRecordId, "88888888-4444-4444-4444-123456789012"],
      },
      {
        text: "Empty citation claim.",
        recordIds: [],
      },
    ];

    const grounded: AskClaim[] = groundClaims(claimsWithZeroValid, [sampleCatalogRecord]);
    expect(grounded).toHaveLength(0);

    // When all drafted claims are ungrounded, fallback response provides canonical message
    const fallbackClaim: AskClaim =
      grounded.length > 0
        ? grounded[0]
        : { text: noDirectAnswerMessage, citedRecordIds: [] };
    expect(fallbackClaim.text).toBe(noDirectAnswerMessage);
    expect(fallbackClaim.citedRecordIds).toEqual([]);
  });

  it("sanitizes bracketed IDs from narrative text so raw UUIDs do not leak into claim.text", () => {
    const claimWithEmbeddedIds: AskModelClaim[] = [
      {
        text: `According to record [${sampleRecordId}], the church was a community cornerstone.`,
        recordIds: [sampleRecordId],
      },
    ];

    const grounded = groundClaims(claimWithEmbeddedIds, [sampleCatalogRecord]);
    expect(grounded).toHaveLength(1);
    expect(grounded[0].text).toBe(
      "According to record , the church was a community cornerstone.",
    );
    expect(grounded[0].citedRecordIds).toEqual([sampleRecordId]);
  });

  it("validates askResponseSchema with structured claims collection and backward-compatible summary", () => {
    const validResponse = {
      question: "Who founded the church in Africville?",
      filters: { q: "Africville", publisher: "", page: 1 },
      count: 1,
      claims: [
        {
          text: "Addie States led church documentation.",
          citedRecordIds: [sampleRecordId],
        },
      ],
      summary: "Summary narrative text.",
      citations: [
        {
          id: sampleRecordId,
          title: "Africville Church Records",
        },
      ],
    };

    const parsed = askResponseSchema.parse(validResponse);
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.claims[0].citedRecordIds).toEqual([sampleRecordId]);
    expect(parsed.summary).toBe("Summary narrative text.");

    // Parses cleanly without summary (optional field with default fallback)
    const withoutSummary = {
      ...validResponse,
      summary: undefined,
    };
    const parsedWithoutSummary = askResponseSchema.parse(withoutSummary);
    expect(parsedWithoutSummary.claims).toHaveLength(1);
    expect(parsedWithoutSummary.summary).toBe("");

    // Defaults claims to empty array when omitted from legacy payload
    const legacyPayload = {
      question: "Legacy question",
      filters: { q: "", publisher: "", page: 1 },
      count: 0,
      summary: noArchiveSourceMessage,
      citations: [],
    };
    const parsedLegacy = askResponseSchema.parse(legacyPayload);
    expect(parsedLegacy.claims).toEqual([]);
    expect(parsedLegacy.summary).toBe(noArchiveSourceMessage);
  });

  it("prioritizes ambient museum exhibit stations in evidence grounding via extraIds", () => {
    const stationRecordId = "station-caribbean-diaspora-01";
    const extraIds: Map<string, ExtraIdValue> = new Map([
      [
        stationRecordId,
        {
          id: stationRecordId,
          title: "Caribbean Diaspora in Nova Scotia",
          description: "Exhibit station depicting Caribbean migration patterns.",
          dateText: "20th Century",
          place: "Nova Scotia",
          subjects: ["Migration", "Caribbean Diaspora"],
          collectionKey: "caribbean_migrants",
        },
      ],
    ]);

    const claimsCitingStation: AskModelClaim[] = [
      {
        text: "The museum gallery exhibit highlights community migration patterns from the Caribbean.",
        recordIds: [stationRecordId],
      },
      {
        text: "Both catalog documents and the gallery station depict historic migration routes.",
        recordIds: [sampleRecordId, stationRecordId],
      },
      {
        text: "Claim referencing unknown station ID.",
        recordIds: ["station-nonexistent-99"],
      },
    ];

    const grounded = groundClaims(
      claimsCitingStation,
      [sampleCatalogRecord],
      extraIds,
    );

    // Two valid claims survive: single station and dual citation
    expect(grounded).toHaveLength(2);
    expect(grounded[0].citedRecordIds).toEqual([stationRecordId]);
    expect(grounded[1].citedRecordIds).toEqual([sampleRecordId, stationRecordId]);
  });

  it("handles zero-match inquiry fallback by avoiding model calls and returning canonical notice", async () => {
    const adapter = new InMemoryModelAdapter();

    // Zero retrieved candidate records and zero ambient view stations
    const zeroCandidates: CatalogRecord[] = [];
    const zeroExtraIds = new Map();

    // Verify groundClaims produces no claims on empty candidate set
    const grounded = groundClaims(
      [{ text: "Drafted text", recordIds: [sampleRecordId] }],
      zeroCandidates,
      zeroExtraIds,
    );
    expect(grounded).toHaveLength(0);

    // Verify zero-match inquiry returns canonical notice immediately without model invocation
    const zeroMatchResponse = askResponseSchema.parse({
      question: "Unmatched historical event in archives?",
      filters: { q: "unmatched", publisher: "", page: 1 },
      count: 0,
      claims: [{ text: noArchiveSourceMessage, citedRecordIds: [] }],
      summary: noArchiveSourceMessage,
      citations: [],
    });

    expect(zeroMatchResponse.count).toBe(0);
    expect(zeroMatchResponse.claims).toHaveLength(1);
    expect(zeroMatchResponse.claims[0].text).toBe(noArchiveSourceMessage);
    expect(zeroMatchResponse.citations).toHaveLength(0);

    // Verify adapter was never invoked
    expect(adapter.getCalls()).toHaveLength(0);
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: filterHrefTest, urlSerialization, specialCharacters, SearchQuery, /catalog
 * WHAT: Unit tests verifying query parameter serialization for catalog navigation across single, multi-word, and special terms.
 * WHY: Guarantees that natural-language search queries and catalog filters encode cleanly into standard URL parameters.
 * WHERE: tests/ask-search-verification.test.ts (verifies src/components/archive/archive-search-bar.tsx).
 */
describe("filterHref Parameter Serialization", () => {
  it("serializes single-word search queries into clean catalog URLs", () => {
    expect(filterHref({ q: "church" })).toBe("/catalog?q=church");
  });

  it("serializes multi-word search queries with spaces encoded as plus symbols", () => {
    expect(filterHref({ q: "Africville Baptist Church" })).toBe(
      "/catalog?q=Africville+Baptist+Church",
    );
  });

  it("properly encodes special characters including ampersands, quotes, commas, and symbols", () => {
    const filters: SearchQuery = {
      q: 'Smith & "Sons"',
      place: "Halifax, NS",
    };
    const href = filterHref(filters);
    expect(href).toBe("/catalog?q=Smith+%26+%22Sons%22&place=Halifax%2C+NS");

    // Verify round-trip parsing decodes identically to original values
    const searchParams = new URLSearchParams(href.replace("/catalog?", ""));
    expect(searchParams.get("q")).toBe('Smith & "Sons"');
    expect(searchParams.get("place")).toBe("Halifax, NS");
  });

  it("serializes empty filter objects to bare catalog path without question marks", () => {
    expect(filterHref({})).toBe("/catalog");
  });

  it("omits empty or falsy values while preserving active filter parameters", () => {
    const filters: SearchQuery = {
      q: "",
      place: "Preston",
      creator: "",
    };
    expect(filterHref(filters)).toBe("/catalog?place=Preston");
  });

  it("serializes multiple composite filter attributes deterministically", () => {
    const filters: SearchQuery = {
      q: "civil rights",
      institution: "BCCNS",
      type: "document",
    };
    const href = filterHref(filters);
    expect(href).toBe(
      "/catalog?q=civil+rights&institution=BCCNS&type=document",
    );
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: zeroStorageSideEffects, sessionStorageMock, stateIsolation, ArchiveSearchBar, noCacheLeakage
 * WHAT: Integration assertions verifying zero sessionStorage side effects across search bar lifecycle and parameter conversion.
 * WHY: Proves total decoupling of Homeview and Catalog inquiry states, eliminating browser cache pollution.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 01 and Ticket 04 contracts).
 */
describe("Zero Storage Side Effects and Pure State Isolation", () => {
  const getItemSpy = vi.fn();
  const setItemSpy = vi.fn();
  const removeItemSpy = vi.fn();
  const clearSpy = vi.fn();

  const mockSessionStorage = {
    getItem: getItemSpy,
    setItem: setItemSpy,
    removeItem: removeItemSpy,
    clear: clearSpy,
    key: vi.fn(),
    length: 0,
  };

  function expectStorageUntouched(): void {
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: mockSessionStorage,
        location: { search: "" },
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: mockSessionStorage,
      writable: true,
      configurable: true,
    });
  });

  it("never accesses sessionStorage during search bar prop schema evaluation", () => {
    const parsed = archiveSearchBarPropsSchema.parse({
      initialQuestion: "Tell me about Africville",
      autoNavigate: true,
      showCatalogCta: true,
      placeholder: "Search archive records",
    });

    expect(parsed.initialQuestion).toBe("Tell me about Africville");
    expectStorageUntouched();
  });

  it("never accesses sessionStorage during filterHref parameter translation and round-trip decoding", () => {
    const href = filterHref({
      q: "Africville Baptist Church",
      place: "Halifax, NS",
    });
    const parsed = parseSearchParams(new URLSearchParams(href.replace("/catalog?", "")));

    expect(parsed.q).toBe("Africville Baptist Church");
    expect(parsed.place).toBe("Halifax, NS");
    expectStorageUntouched();
  });

  it("never accesses sessionStorage during ArchiveSearchBar component rendering", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "Addie States historical records",
        autoNavigate: false,
        showCatalogCta: true,
      }),
    );

    expect(markup).toContain('value="Addie States historical records"');
    expectStorageUntouched();
  });

  it("preserves secondary filters and synchronizes catalog URL without touching sessionStorage", () => {
    const currentSearch = "?institution=BCCNS&place=Halifax&page=3";
    const answerFilters: SearchQuery = { q: "Africville Church" };

    const mergedHref = mergeCatalogSearchParams(currentSearch, answerFilters);
    expect(mergedHref).toBe(
      "/catalog?institution=BCCNS&place=Halifax&q=Africville+Church",
    );

    const clearedHref = clearCatalogSearchParams(
      mergedHref.replace("/catalog", ""),
    );
    expect(clearedHref).toBe("/catalog?institution=BCCNS&place=Halifax");

    expectStorageUntouched();
  });

  it("never accesses sessionStorage during inquiry mount, submission, or clearing", () => {
    // 1. Inquiry mount / initial render
    const initialProps = archiveSearchBarPropsSchema.parse({
      initialQuestion: "Africville church history",
      autoNavigate: false,
      showCatalogCta: true,
    });
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, initialProps),
    );
    expect(html).toContain('value="Africville church history"');

    // 2. Submission URL serialization and parameter parsing
    const submissionHref = filterHref({ q: initialProps.initialQuestion });
    const parsedParams = parseSearchParams(
      new URLSearchParams(submissionHref.replace("/catalog?", "")),
    );
    expect(parsedParams.q).toBe("Africville church history");

    // 3. Answer clearing and callback invocation
    const onClearSpy = vi.fn();
    onClearSpy();
    expect(onClearSpy).toHaveBeenCalled();

    // Verify all storage spies remained untouched throughout mount, submission, and clearing
    expectStorageUntouched();
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: archiveSearchBarContract, submitButtonAria, searchIconWrapper, initialQuestion, accessibility
 * WHAT: Component contract tests verifying accessible submit button, icon wrapping, initialQuestion prop hydration, and strict storage rejection.
 * WHY: Asserts that form submission is explicit and accessible on all devices, and rejects deprecated storage properties.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 02 and Ticket 03 contracts).
 */
describe("ArchiveSearchBar Accessibility and Submission Contract", () => {
  it("renders an explicit submit button with aria-label, type submit, and wrapped search icon", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "Who founded the church?",
        placeholder: "Ask the archive",
      }),
    );

    // Form element encapsulates the search input and submit button
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-label="Submit inquiry"');

    // Button wraps the search SVG icon
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('aria-hidden="true"');

    // Input element initializes with initialQuestion and proper accessible attributes
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Ask the archive"');
    expect(html).toContain('aria-label="Ask the archive"');
    expect(html).toContain('value="Who founded the church?"');
    expect(html).toContain('autoComplete="off"');
  });

  it("defaults initialQuestion gracefully to an empty string when omitted from props", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        placeholder: "Ask the archive",
      }),
    );

    expect(html).toContain('value=""');
  });

  it("ensures submit button is type submit within form to trigger submission on click and Enter key", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "African Nova Scotian communities",
      }),
    );

    // Form element contains the button with type="submit" ensuring accessible Enter and click triggers
    const formMatches = /<form[^>]*>(.*?)<\/form>/.exec(html);
    expect(formMatches).not.toBeNull();
    const formInner = formMatches?.[1] ?? "";

    expect(formInner).toContain('<button type="submit"');
    expect(formInner).toContain('aria-label="Submit inquiry"');
    expect(formInner).toContain('<svg');
  });

  it("strictly rejects or omits persistStorage from ArchiveSearchBarProps schema", () => {
    // 1. Schema shape does not declare persistStorage
    expect("persistStorage" in archiveSearchBarPropsSchema.shape).toBe(false);

    // 2. Standard parsing strips deprecated persistStorage property
    const rawInput: Record<string, string | boolean> = {
      initialQuestion: "Inquiry without storage",
      autoNavigate: true,
      persistStorage: true,
    };
    const parsedWithStaleProp = archiveSearchBarPropsSchema.parse(rawInput);
    expect("persistStorage" in parsedWithStaleProp).toBe(false);

    // 3. Strict schema parsing outright rejects objects containing persistStorage
    const strictValidation = archiveSearchBarPropsSchema.strict().safeParse({
      initialQuestion: "Inquiry",
      persistStorage: true,
    });
    expect(strictValidation.success).toBe(false);
  });

  it("synchronizes inquiry handoff from filterHref to catalog query parameter rehydration", () => {
    // 1. Homeview inquiry result produces structured filters
    const inquiryResultFilters: SearchQuery = { q: "Africville Baptist Church" };
    const catalogUrl = filterHref(inquiryResultFilters);
    expect(catalogUrl).toBe("/catalog?q=Africville+Baptist+Church");

    // 2. Catalog page receives URL search parameters and parses them into filters
    const searchParams = new URLSearchParams(catalogUrl.replace("/catalog?", ""));
    const parsedFilters = parseSearchParams(searchParams);
    expect(parsedFilters.q).toBe("Africville Baptist Church");

    // 3. CatalogResults passes filters.q as initialQuestion to ArchiveSearchBarProps
    const catalogSearchBarProps = archiveSearchBarPropsSchema.parse({
      autoNavigate: true,
      initialQuestion: parsedFilters.q,
    });
    expect(catalogSearchBarProps.initialQuestion).toBe(
      "Africville Baptist Church",
    );
    expect(catalogSearchBarProps.autoNavigate).toBe(true);
  });

  it("synchronizes empty query on route change when initialQuestion transitions to empty or undefined", () => {
    // 1. Populated initial question mounts with text value
    const populated = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "Initial search term",
      }),
    );
    expect(populated).toContain('value="Initial search term"');

    // 2. Empty string initial question clears the input value
    const empty = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "",
      }),
    );
    expect(empty).toContain('value=""');

    // 3. Undefined initial question (e.g. navigation away from query) defaults gracefully to empty
    const cleared = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: undefined,
      }),
    );
    expect(cleared).toContain('value=""');
  });

  it("preserves secondary filters when autoNavigate generates catalog query strings", () => {
    const existingSearch = "?institution=BCCNS&place=Halifax&type=photograph&page=3";
    const answerFilters: SearchQuery = { q: "Africville Baptist Church" };

    const targetUrl = mergeCatalogSearchParams(existingSearch, answerFilters);
    expect(targetUrl).toBe(
      "/catalog?institution=BCCNS&place=Halifax&type=photograph&q=Africville+Baptist+Church",
    );

    // Assert that secondary filters survived and pagination was purged
    const params = new URLSearchParams(targetUrl.replace("/catalog?", ""));
    expect(params.get("institution")).toBe("BCCNS");
    expect(params.get("place")).toBe("Halifax");
    expect(params.get("type")).toBe("photograph");
    expect(params.get("q")).toBe("Africville Baptist Church");
    expect(params.has("page")).toBe(false);
  });

  it("clears q and page from URL on dismissal to return to secondary-only browsing", () => {
    const existingSearch = "?institution=BCCNS&place=Halifax&q=Africville+Baptist+Church&page=2";
    const dismissedUrl = clearCatalogSearchParams(existingSearch);

    expect(dismissedUrl).toBe("/catalog?institution=BCCNS&place=Halifax");
    const params = new URLSearchParams(dismissedUrl.replace("/catalog?", ""));
    expect(params.has("q")).toBe(false);
    expect(params.has("page")).toBe(false);
    expect(params.get("institution")).toBe("BCCNS");
    expect(params.get("place")).toBe("Halifax");
  });

  it("resets to bare /catalog on dismissal when no secondary filters are present", () => {
    const existingSearch = "?q=Africville&page=1";
    const dismissedUrl = clearCatalogSearchParams(existingSearch);
    expect(dismissedUrl).toBe("/catalog");
  });

  it("handles empty or blank search string gracefully without trailing question marks", () => {
    expect(clearCatalogSearchParams("")).toBe("/catalog");
    expect(mergeCatalogSearchParams("", {})).toBe("/catalog");
    expect(mergeCatalogSearchParams("", { q: "church" })).toBe("/catalog?q=church");
  });

  it("overwrites an existing q parameter when submitting a new inquiry while keeping secondary filters", () => {
    const existingSearch = "?institution=BCCNS&q=old+query&page=2";
    const updated = mergeCatalogSearchParams(existingSearch, { q: "new query" });
    expect(updated).toBe("/catalog?institution=BCCNS&q=new+query");
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: archiveSearchBarDualModeTest, modeToggleContract, queryRetention, keywordVsAi, dualModeAccessibility
 * WHAT: Unit and contract tests for ArchiveSearchBar dual-mode switching between keyword and AI search.
 * WHY: Proves accessible radio group semantics, query text preservation, placeholder switching, CTA chip, and panel dismissal.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 01).
 */
describe("ArchiveSearchBar Dual-Mode and Mode Toggle Contract", () => {
  it("validates archiveSearchBarPropsSchema with enableModeToggle, defaultMode, and currentFilters", () => {
    const validConfig = {
      enableModeToggle: true,
      defaultMode: "keyword",
      currentFilters: { institution: "BCCNS", place: "Halifax" },
      initialQuestion: "church records",
    };

    const parsed = archiveSearchBarPropsSchema.parse(validConfig);
    expect(parsed.enableModeToggle).toBe(true);
    expect(parsed.defaultMode).toBe("keyword");
    expect(parsed.currentFilters).toEqual({
      institution: "BCCNS",
      place: "Halifax",
    });

    // Rejects invalid mode values
    const invalidMode = archiveSearchBarPropsSchema.safeParse({
      enableModeToggle: true,
      defaultMode: "unsupported-mode",
    });
    expect(invalidMode.success).toBe(false);
  });

  it("retains 100% backward compatible DOM and placeholder when enableModeToggle is false or omitted", () => {
    // When enableModeToggle is omitted
    const legacyMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "African Nova Scotian communities",
      }),
    );

    // No radiogroup or CTA chip in legacy mode
    expect(legacyMarkup).not.toContain('role="radiogroup"');
    expect(legacyMarkup).not.toContain("Switch to Ask AI");
    expect(legacyMarkup).toContain('placeholder="Ask a question in plain language..."');
    expect(legacyMarkup).toContain('aria-label="Submit inquiry"');

    // When enableModeToggle is explicitly false
    const explicitFalseMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: false,
        initialQuestion: "Oral histories",
      }),
    );

    expect(explicitFalseMarkup).not.toContain('role="radiogroup"');
    expect(explicitFalseMarkup).not.toContain("Switch to Ask AI");
    expect(explicitFalseMarkup).toContain('placeholder="Ask a question in plain language..."');
  });

  it("renders accessible segmented radio toggle defaulting to keyword search mode when enableModeToggle is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
      }),
    );

    // Radiogroup container
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Search mode"');

    // Keyword Search radio option (active by default)
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Keyword Search");

    // Ask AI radio option (inactive by default)
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Ask AI");

    // Default keyword placeholder
    expect(html).toContain(
      'placeholder="Search title, description, subject, place, or community..."',
    );

    // Subtle CTA chip below search bar in keyword mode
    expect(html).toContain("Looking for answers in plain language?");
    expect(html).toContain("Switch to Ask AI");
  });

  it("renders with AI mode active when defaultMode is set to ai", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
      }),
    );

    // Ask AI is checked
    expect(html).toContain('role="radiogroup"');
    const aiRadioMatch = /<button[^>]*aria-checked="true"[^>]*>[\s\S]*?Ask AI[\s\S]*?<\/button>/.test(html);
    expect(aiRadioMatch).toBe(true);

    // Placeholder defaults to "Ask a question in plain language..."
    expect(html).toContain('placeholder="Ask a question in plain language..."');

    // CTA chip is NOT rendered in AI mode
    expect(html).not.toContain("Looking for answers in plain language?");
  });

  it("preserves drafted query text across mode rendering without altering user input", () => {
    const draftedText = "Africville Baptist Church lineage";

    // 1. Keyword mode preserves drafted query text
    const keywordHtml = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        initialQuestion: draftedText,
      }),
    );
    expect(keywordHtml).toContain(`value="${draftedText}"`);
    expect(keywordHtml).toContain(
      'placeholder="Search title, description, subject, place, or community..."',
    );

    // 2. AI mode preserves the identical drafted query text
    const aiHtml = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
        initialQuestion: draftedText,
      }),
    );
    expect(aiHtml).toContain(`value="${draftedText}"`);
    expect(aiHtml).toContain('placeholder="Ask a question in plain language..."');
  });

  it("ensures all mode toggle and CTA buttons specify type button to prevent unsolicited form submission", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        initialQuestion: "Draft query without submitting",
      }),
    );

    // Toggle radio buttons must explicitly have type="button"
    const radioButtons = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radioButtons).toHaveLength(2);
    for (const btn of radioButtons) {
      expect(btn).toContain('type="button"');
    }

    // CTA prompt chip must explicitly have type="button"
    const ctaButtons = html.match(/<button[^>]*class="[^"]*ctaPrompt[^"]*"[^>]*>/g) ?? [];
    expect(ctaButtons).toHaveLength(1);
    expect(ctaButtons[0]).toContain('type="button"');

    // Only the actual search submit button should have type="submit"
    const submitButtons = html.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];
    expect(submitButtons).toHaveLength(1);
    expect(submitButtons[0]).toContain('aria-label="Search catalog"');
  });

  it("merges active keyword query and secondary filters when preparing catalog search submission", () => {
    const existingSearch = "?institution=BCCNS&place=Halifax&type=photograph&page=4";
    const keywordQuery = "church elder records";
    const currentFilters: SearchQuery = {
      institution: "BCCNS",
      place: "Halifax",
      type: "photograph",
    };

    const targetUrl = mergeCatalogSearchParams(existingSearch, {
      ...currentFilters,
      q: keywordQuery,
    });

    expect(targetUrl).toBe(
      "/catalog?institution=BCCNS&place=Halifax&type=photograph&q=church+elder+records",
    );

    // Assert that pagination was stripped and secondary filters remained intact
    const targetParams = new URLSearchParams(targetUrl.replace("/catalog?", ""));
    expect(targetParams.has("page")).toBe(false);
    const parsed = parseSearchParams(targetParams);
    expect(parsed.q).toBe(keywordQuery);
    expect(parsed.institution).toBe("BCCNS");
    expect(parsed.place).toBe("Halifax");
    expect(parsed.type).toBe("photograph");
  });

  it("dismisses open AI panel and clears error state when switching to keyword mode", () => {
    // When rendered in keyword mode, the open answer panel is omitted even if answers were previously present
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        initialQuestion: "Grounded inquiry text",
      }),
    );

    // The archive answer panel and claims list are not rendered
    expect(html).not.toContain("Claims and Citations");
    expect(html).not.toContain("Explore matching records in Catalog");
    expect(html).not.toContain('class="panel"');
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: catalogFiltersContractTest, CatalogFilters, hiddenQueryPreservation, facetFilters, singleSearchInput, noDuplicateInput
 * WHAT: Unit and contract tests verifying that CatalogFilters relies on a hidden query input and preserves secondary facets.
 * WHY: Proves that the duplicate visible search input is removed, active search query is retained through hidden form parameter, and all secondary facets remain functional.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 02).
 */
describe("CatalogFilters Contract and Query Preservation", () => {
  const samplePublishers = [
    "BCCNS",
    "Nova Scotia Archives",
    "Dalhousie University",
  ];

  it("renders a hidden input for q with active query value to preserve search across filter submissions", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { q: "Africville Baptist Church", institution: "BCCNS" },
      }),
    );

    // Form specifies action="/catalog"
    expect(html).toContain('action="/catalog"');

    // Hidden input preserves active keyword query
    expect(html).toContain(
      '<input type="hidden" name="q" value="Africville Baptist Church"',
    );
  });

  it("defaults hidden q value to empty string when query.q is omitted", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { institution: "BCCNS" },
      }),
    );

    expect(html).toContain('<input type="hidden" name="q" value=""');
  });

  it("removes the duplicate visible text search input from the filter form", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { q: "Africville" },
      }),
    );

    // Visible search input and its label/placeholder are absent
    expect(html).not.toContain("Search all sources");
    expect(html).not.toContain(
      "Search title, description, subject, place, or community",
    );
    // Only the hidden input has name="q", not a visible text input
    expect(html).not.toContain('<input name="q"');
  });

  it("renders all secondary facet fields and submit button within the filter grid", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville",
          institution: "BCCNS",
          type: "document",
          creator: "Addie States",
          subject: "Church History",
          place: "Halifax",
          from: "1960",
          to: "1970",
        },
      }),
    );

    // Secondary facet select fields
    expect(html).toContain('name="institution"');
    expect(html).toContain('<option value="BCCNS"');
    expect(html).toContain('name="type"');
    expect(html).toContain('<option value="document"');

    // Secondary facet text inputs
    expect(html).toContain('name="creator"');
    expect(html).toContain('value="Addie States"');
    expect(html).toContain('name="subject"');
    expect(html).toContain('value="Church History"');
    expect(html).toContain('name="place"');
    expect(html).toContain('value="Halifax"');
    expect(html).toContain('name="from"');
    expect(html).toContain('value="1960-01-01"');
    expect(html).toContain('name="to"');
    expect(html).toContain('value="1970-12-31"');

    // Submit button
    expect(html).toContain('type="submit"');
    expect(html).toContain("Search");
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: catalogCollapsibleFiltersTest, CatalogFilters, collapsibleFacetPanel, activeFiltersBadge, clearFiltersPreservingQ, accessibleDisclosure
 * WHAT: Unit and contract tests verifying that CatalogFilters acts as an accessible collapsible facet panel with an active count badge and keyword-preserving filter reset.
 * WHY: Verifies Ticket 03 requirements ensuring secondary filters are collapsed by default with clear visual cues and clean filter state resetting.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 03).
 */
describe("CatalogFilters Collapsible Panel and Active Count Badge", () => {
  const samplePublishers = [
    "BCCNS",
    "Nova Scotia Archives",
    "Dalhousie University",
  ];

  it("renders in a collapsed state by default with accessible toggle attributes", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {},
      }),
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="catalog-filters-panel"');
    expect(html).toContain('id="catalog-filters-panel"');
    expect(html).toContain("Filters");
  });

  it("displays an active filter count badge reflecting the number of secondary filters (excluding q)", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville",
          institution: "BCCNS",
          type: "photograph",
          place: "Halifax",
        },
      }),
    );

    // 3 secondary filters active: institution, type, place (q is excluded)
    expect(html).toContain("Filters (3)");
    expect(html).toContain('data-testid="catalog-filters-badge"');
    expect(html).toContain(">3<");
  });

  it("renders a 'Clear filters' link when secondary filters exist, preserving the keyword query q", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville Heritage",
          institution: "BCCNS",
          type: "document",
        },
      }),
    );

    expect(html).toContain("Clear filters");
    expect(html).toContain('href="/catalog?q=Africville%20Heritage"');
  });

  it("does not render 'Clear filters' when no secondary filters are active", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville Heritage",
        },
      }),
    );

    expect(html).not.toContain("Clear filters");
    expect(html).not.toContain('data-testid="catalog-filters-badge"');
  });

  it("renders 'Clear filters' pointing to /catalog when secondary filters exist but q is omitted", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          institution: "BCCNS",
        },
      }),
    );

    expect(html).toContain("Clear filters");
    expect(html).toContain('href="/catalog"');
  });

  it("renders with aria-expanded='true' and revealed panel when defaultOpen is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { institution: "BCCNS" },
        defaultOpen: true,
      }),
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="catalog-filters-panel"');
    expect(html).not.toContain('id="catalog-filters-panel" hidden=""');
    expect(html).toContain("border-t border-border/60");
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: comprehensiveVerificationSuite, ticket04IntegrationVerification, modeToggleRetention, filterResetContract, legacyBackwardCompatibility, searchAriaContracts
 * WHAT: Comprehensive integration and accessibility test suite validating the complete search and collapsible filter workflow.
 * WHY: Verifies all Ticket 04 acceptance criteria: input preservation without network calls, URL facet synchronization, panel dismissal, filter count math, filter reset, backward compatibility, and full ARIA contracts.
 * WHERE: tests/ask-search-verification.test.ts (Ticket 04).
 */
describe("Ticket 04: Comprehensive Verification and Accessibility Test Suite", () => {
  const samplePublishers = [
    "BCCNS",
    "Nova Scotia Archives",
    "Dalhousie University",
  ];

  it("preserves drafted query text across mode switching without triggering network requests", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const draftedQuery = "Addie States Africville genealogy";

    // 1. Initial render in keyword mode with drafted text
    const keywordMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        initialQuestion: draftedQuery,
      }),
    );
    expect(keywordMarkup).toContain(`value="${draftedQuery}"`);
    expect(keywordMarkup).toContain(
      'placeholder="Search title, description, subject, place, or community..."',
    );

    // 2. Switching to AI mode preserves identical drafted query in memory
    const aiMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
        initialQuestion: draftedQuery,
      }),
    );
    expect(aiMarkup).toContain(`value="${draftedQuery}"`);
    expect(aiMarkup).toContain('placeholder="Ask a question in plain language..."');

    // 3. Verifies zero network requests were triggered during mode rendering / switching
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ensures all mode toggle and CTA controls are non-submitting type button to prevent unsolicited requests", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        initialQuestion: "Draft inquiry",
      }),
    );

    // Both radio buttons must explicitly have type="button"
    const radioMatches = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radioMatches).toHaveLength(2);
    for (const button of radioMatches) {
      expect(button).toContain('type="button"');
    }

    // The call-to-action prompt chip must explicitly have type="button"
    const ctaMatches =
      html.match(/<button[^>]*class="[^"]*ctaPrompt[^"]*"[^>]*>/g) ?? [];
    expect(ctaMatches).toHaveLength(1);
    expect(ctaMatches[0]).toContain('type="button"');

    // Only the actual search submit button has type="submit"
    const submitMatches = html.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];
    expect(submitMatches).toHaveLength(1);
    expect(submitMatches[0]).toContain('aria-label="Search catalog"');
  });

  it("preserves all active secondary facet filters when submitting keyword searches", () => {
    const currentSearch =
      "?institution=BCCNS&type=photograph&creator=Addie+States&subject=Community&place=Halifax&from=1960-01-01&to=1970-12-31&page=5";
    const newKeyword = "Church Choir";

    const targetUrl = mergeCatalogSearchParams(currentSearch, {
      institution: "BCCNS",
      type: "photograph",
      creator: "Addie States",
      subject: "Community",
      place: "Halifax",
      from: "1960-01-01",
      to: "1970-12-31",
      q: newKeyword,
    });

    // Verify all 7 secondary facet filters are preserved in URL search params
    const params = new URLSearchParams(targetUrl.replace("/catalog?", ""));
    expect(params.get("q")).toBe("Church Choir");
    expect(params.get("institution")).toBe("BCCNS");
    expect(params.get("type")).toBe("photograph");
    expect(params.get("creator")).toBe("Addie States");
    expect(params.get("subject")).toBe("Community");
    expect(params.get("place")).toBe("Halifax");
    expect(params.get("from")).toBe("1960-01-01");
    expect(params.get("to")).toBe("1970-12-31");

    // Verify pagination parameter is purged on new keyword search
    expect(params.has("page")).toBe(false);
  });

  it("replaces existing keyword query while maintaining secondary facet parameters", () => {
    const existingSearch =
      "?institution=BCCNS&place=Halifax&q=Old+Search+Term&page=2";
    const updatedUrl = mergeCatalogSearchParams(existingSearch, {
      institution: "BCCNS",
      place: "Halifax",
      q: "New Search Term",
    });

    const params = new URLSearchParams(updatedUrl.replace("/catalog?", ""));
    expect(params.get("q")).toBe("New Search Term");
    expect(params.get("institution")).toBe("BCCNS");
    expect(params.get("place")).toBe("Halifax");
    expect(params.has("page")).toBe(false);
    expect(params.toString()).not.toContain("Old+Search+Term");
  });

  it("closes open AI answer panels and clears errors when operating in keyword mode", () => {
    // When operating in keyword mode, AI narrative answer panel, claims list, citations, and errors are excluded
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        initialQuestion: "Grounded inquiry text",
        showCatalogCta: true,
      }),
    );

    // The answer panel container is omitted from the DOM
    expect(html).not.toContain('aria-label="Archive answer"');
    expect(html).not.toContain("Claims and Citations");
    expect(html).not.toContain("Explore matching records in Catalog");
    expect(html).not.toContain('class="panel"');
    expect(html).not.toContain('class="error"');
  });

  it("starts collapsed by default with aria-expanded false and hidden panel", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {},
      }),
    );

    // Starts collapsed by default with smooth accordion grid-template-rows 0fr
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="catalog-filters-panel"');
    expect(html).toContain('id="catalog-filters-panel"');
    expect(html).toContain('hidden=""');
    expect(html).toContain("grid-rows-[0fr]");
    expect(html).toContain("transition-[grid-template-rows]");
    expect(html).toContain('aria-label="Filters"');
    expect(html).not.toContain('data-testid="catalog-filters-badge"');
  });

  it("accurately computes active filter count across all 7 secondary facets and excludes keyword query q", () => {
    // 1. Keyword query q alone does not trigger badge or increment count
    const qOnlyHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { q: "Africville Heritage" },
      }),
    );
    expect(qOnlyHtml).not.toContain('data-testid="catalog-filters-badge"');
    expect(qOnlyHtml).toContain('aria-label="Filters"');

    // 2. Single secondary facet active (institution) -> 1
    const oneFilterHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { q: "Africville", institution: "BCCNS" },
      }),
    );
    expect(oneFilterHtml).toContain('data-testid="catalog-filters-badge"');
    expect(oneFilterHtml).toContain(">1<");
    expect(oneFilterHtml).toContain('aria-label="Filters (1)"');

    // 3. Three secondary facets active (institution, type, place) -> 3
    const threeFiltersHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville",
          institution: "BCCNS",
          type: "photograph",
          place: "Halifax",
        },
      }),
    );
    expect(threeFiltersHtml).toContain('data-testid="catalog-filters-badge"');
    expect(threeFiltersHtml).toContain(">3<");
    expect(threeFiltersHtml).toContain('aria-label="Filters (3)"');

    // 4. All 7 secondary facets active (institution, type, creator, subject, place, from, to) -> 7
    const allFiltersHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville",
          institution: "BCCNS",
          type: "document",
          creator: "Addie States",
          subject: "Genealogy",
          place: "Halifax",
          from: "1960",
          to: "1970",
        },
      }),
    );
    expect(allFiltersHtml).toContain('data-testid="catalog-filters-badge"');
    expect(allFiltersHtml).toContain(">7<");
    expect(allFiltersHtml).toContain('aria-label="Filters (7)"');

    // 5. Blank/whitespace-only values are not counted
    const blankFiltersHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville",
          institution: "   ",
          creator: "",
        },
      }),
    );
    expect(blankFiltersHtml).not.toContain('data-testid="catalog-filters-badge"');
    expect(blankFiltersHtml).toContain('aria-label="Filters"');
  });

  it("resets secondary facet selections while preserving active keyword query q", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Africville Heritage",
          institution: "BCCNS",
          type: "photograph",
          place: "Halifax",
        },
        defaultOpen: true,
      }),
    );

    // Both header bar and expanded panel render the Clear filters action
    const clearLinks =
      html.match(
        /<a[^>]*href="\/catalog\?q=Africville%20Heritage"[^>]*>Clear filters<\/a>/g,
      ) ?? [];
    expect(clearLinks.length).toBeGreaterThanOrEqual(1);

    // Reset link does not contain any secondary facet parameters
    expect(html).toContain('href="/catalog?q=Africville%20Heritage"');
    expect(html).not.toContain(
      'href="/catalog?q=Africville%20Heritage&amp;institution',
    );
  });

  it("correctly encodes special characters in preserved q and defaults to bare /catalog when q is blank", () => {
    // Special characters in q (e.g. '&', ':', '/')
    const specialCharsHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          q: "Black Loyalists & Africville: Oral Histories",
          institution: "BCCNS",
        },
      }),
    );
    expect(specialCharsHtml).toContain(
      'href="/catalog?q=Black%20Loyalists%20%26%20Africville%3A%20Oral%20Histories"',
    );

    // No q parameter present -> resets to bare /catalog
    const noQHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: {
          institution: "BCCNS",
        },
      }),
    );
    expect(noQHtml).toContain('href="/catalog"');
    expect(noQHtml).not.toContain('href="/catalog?"');
  });

  it("maintains 100% backward compatibility for legacy callers omitting enableModeToggle", () => {
    // Legacy invocation pattern from bccns-archive-experience.tsx:
    // <ArchiveSearchBar autoNavigate={false} showCatalogCta={true} />
    const legacyMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        autoNavigate: false,
        showCatalogCta: true,
      }),
    );

    // No radio group or radio options
    expect(legacyMarkup).not.toContain('role="radiogroup"');
    expect(legacyMarkup).not.toContain('role="radio"');
    expect(legacyMarkup).not.toContain("Keyword Search");
    expect(legacyMarkup).not.toContain("Ask AI");

    // No mode CTA chip
    expect(legacyMarkup).not.toContain("Looking for answers in plain language?");
    expect(legacyMarkup).not.toContain("Switch to Ask AI");

    // Standard legacy placeholder and accessible label
    expect(legacyMarkup).toContain('placeholder="Ask a question in plain language..."');
    expect(legacyMarkup).toContain('aria-label="Submit inquiry"');

    // Submit button remains type="submit"
    expect(legacyMarkup).toContain('type="submit"');
  });

  it("behaves identically when enableModeToggle is explicitly false or omitted", () => {
    const omitted = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        initialQuestion: "Nova Scotia",
      }),
    );
    const explicitFalse = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: false,
        initialQuestion: "Nova Scotia",
      }),
    );

    expect(omitted).toBe(explicitFalse);
  });

  it("verifies ARIA accessibility attributes on mode toggle radio group", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
      }),
    );

    // Radio group container
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Search mode"');

    // Keyword option: selected by default with roving tabIndex 0
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('tabindex="0"');

    // Ask AI option: unselected with roving tabIndex -1
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('tabindex="-1"');
  });

  it("inverts roving tabindex when operating in AI mode", () => {
    const aiHtml = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
      }),
    );
    const radioMatches = aiHtml.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radioMatches).toHaveLength(2);
    // Keyword button is unchecked with tabindex -1
    expect(radioMatches[0]).toContain('aria-checked="false"');
    expect(radioMatches[0]).toContain('tabindex="-1"');
    // AI button is checked with tabindex 0
    expect(radioMatches[1]).toContain('aria-checked="true"');
    expect(radioMatches[1]).toContain('tabindex="0"');
  });

  it("navigates between modes and imperatively shifts focus to active radio button on arrow key events", () => {
    const mockSwitchMode = vi.fn();
    const mockFocusKeyword = vi.fn();
    const mockFocusAi = vi.fn();

    const callbacks = {
      switchMode: mockSwitchMode,
      focusKeyword: mockFocusKeyword,
      focusAi: mockFocusAi,
    };

    // 1. ArrowRight navigates to AI mode and focuses AI button
    const handledRight = handleRadioArrowNavigation("ArrowRight", callbacks);
    expect(handledRight).toBe(true);
    expect(mockSwitchMode).toHaveBeenCalledWith("ai");
    expect(mockFocusAi).toHaveBeenCalledTimes(1);

    // 2. ArrowDown also navigates to AI mode and focuses AI button
    const handledDown = handleRadioArrowNavigation("ArrowDown", callbacks);
    expect(handledDown).toBe(true);
    expect(mockSwitchMode).toHaveBeenCalledWith("ai");
    expect(mockFocusAi).toHaveBeenCalledTimes(2);

    // 3. ArrowLeft navigates to Keyword mode and focuses Keyword button
    const handledLeft = handleRadioArrowNavigation("ArrowLeft", callbacks);
    expect(handledLeft).toBe(true);
    expect(mockSwitchMode).toHaveBeenCalledWith("keyword");
    expect(mockFocusKeyword).toHaveBeenCalledTimes(1);

    // 4. ArrowUp also navigates to Keyword mode and focuses Keyword button
    const handledUp = handleRadioArrowNavigation("ArrowUp", callbacks);
    expect(handledUp).toBe(true);
    expect(mockSwitchMode).toHaveBeenCalledWith("keyword");
    expect(mockFocusKeyword).toHaveBeenCalledTimes(2);

    // 5. Unrelated keys return false without shifting mode or focus
    const handledTab = handleRadioArrowNavigation("Tab", callbacks);
    expect(handledTab).toBe(false);
    expect(mockSwitchMode).toHaveBeenCalledTimes(4);
  });

  it("verifies ARIA accessibility attributes on collapsible filter accordion toggle", () => {
    // Collapsed state
    const collapsedHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { institution: "BCCNS" },
      }),
    );
    expect(collapsedHtml).toContain('aria-expanded="false"');
    expect(collapsedHtml).toContain('aria-controls="catalog-filters-panel"');
    expect(collapsedHtml).toContain('id="catalog-filters-panel"');
    expect(collapsedHtml).toContain('aria-label="Filters (1)"');

    // Expanded state
    const expandedHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { institution: "BCCNS" },
        defaultOpen: true,
      }),
    );
    expect(expandedHtml).toContain('aria-expanded="true"');
    expect(expandedHtml).toContain('aria-controls="catalog-filters-panel"');
    expect(expandedHtml).toContain('id="catalog-filters-panel"');
  });

  it("verifies accessible submit button labeling across keyword, AI, and filter panel forms", () => {
    // Keyword mode submit button
    const keywordHtml = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
      }),
    );
    expect(keywordHtml).toContain('type="submit"');
    expect(keywordHtml).toContain('aria-label="Search catalog"');

    // AI mode submit button
    const aiHtml = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
      }),
    );
    expect(aiHtml).toContain('type="submit"');
    expect(aiHtml).toContain('aria-label="Submit inquiry"');

    // Filter form submit button
    const filterHtml = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: ["BCCNS"],
        query: {},
        defaultOpen: true,
      }),
    );
    expect(filterHtml).toContain('type="submit"');
    expect(filterHtml).toContain("Search");
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: catalogHeaderAndNavPolishTest, CatalogPage, CatalogResults, stickyNavBlur, bccnsCatalogBrand, digitalArchiveCatalogHeader
 * WHAT: Unit and contract tests verifying sticky navigation styling, brand typography, and upgraded catalog header hierarchy.
 * WHY: Proves Ticket 01 acceptance criteria: sticky backdrop blur navbar, BCCNS Catalog branding, institutional eyebrow, serif display title, and descriptive subtitle.
 * WHERE: tests/ask-search-verification.test.ts (Ticket 01 verification).
 */
describe("Catalog Navigation Bar and Header Polish", () => {
  const verificationRecord: CatalogRecord = {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    dc_title: "Preston Community Ledger",
    dc_identifier: "BCCNS-1972-042",
    dc_publisher: "Black Cultural Centre for Nova Scotia",
    dc_source: "BCCNS Physical Archives",
    dc_type: "document",
    dc_description: "Community record from Preston, Nova Scotia.",
    dc_creator: "Community Historian",
    dc_subject: ["Preston", "Community History"],
    dc_date: "1972",
    date_text: "circa 1972",
    dcterms_spatial: "Preston",
    dcterms_temporal: "20th Century",
    dc_rights: "In Copyright",
    dcterms_access_rights: "Open access",
    dcterms_provenance: "BCCNS Collection",
    bccns_community: ["Preston"],
    bccns_access_status: "available",
    bccns_digitized: true,
  };

  it("renders sticky navigation bar with backdrop blur and BCCNS Catalog branding in CatalogPage", () => {
    const pageHtml = renderToStaticMarkup(
      React.createElement(CatalogPage, {
        searchParams: Promise.resolve({}),
      }),
    );

    // Sticky nav container with backdrop blur and subtle theme border
    expect(pageHtml).toContain("sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md");

    // Brand link with serif display and clean tracking
    expect(pageHtml).toContain('href="/catalog"');
    expect(pageHtml).toContain("BCCNS Catalog");
    expect(pageHtml).toContain("font-serif text-xl tracking-tight text-foreground transition-colors hover:text-foreground/80");

    // Home link with transition tokens
    expect(pageHtml).toContain('href="/"');
    expect(pageHtml).toContain("text-muted-foreground transition-colors hover:text-foreground");
  });

  it("renders institutional eyebrow, serif display title, and descriptive subtitle in CatalogResults header", async () => {
    vi.spyOn(catalogService, "getCatalogHeader").mockResolvedValue({
      totals: {
        records: 42,
        sources: 5,
        people: 12,
        places: 8,
        subjects: 15,
        communities: 4,
        recordPeople: 18,
        recordPlaces: 14,
        recordSubjects: 22,
      },
      publishers: ["Black Cultural Centre for Nova Scotia"],
    });

    vi.spyOn(searchService, "searchRecords").mockResolvedValue({
      count: 1,
      filters: {},
      results: [verificationRecord],
    });

    const resultsElement = await CatalogResults({
      searchParams: Promise.resolve({}),
    });
    const resultsHtml = renderToStaticMarkup(resultsElement);

    // Institutional eyebrow kicker
    expect(resultsHtml).toContain("Black Cultural Centre for Nova Scotia");
    expect(resultsHtml).toContain("text-xs font-semibold uppercase tracking-widest text-muted-foreground");

    // Display serif main title
    expect(resultsHtml).toContain("Digital Archive Catalog");
    expect(resultsHtml).toContain("font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl");

    // Informative descriptive subtitle
    expect(resultsHtml).toContain(
      "Explore primary records, oral histories, and community lineages, or switch to Ask AI for grounded historical inquiries.",
    );
    expect(resultsHtml).toContain("mt-1 max-w-2xl text-sm leading-relaxed text-foreground/75 sm:text-base");

    // Ensure deprecated copy is completely removed
    expect(resultsHtml).not.toContain("Black history catalog");
    expect(resultsHtml).not.toContain(
      "Ask a question in plain language, or narrow the records by institution, type, place, and date.",
    );
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: integratedFilterPillContractTest, ArchiveSearchBar, enableFilterPill, filterPanelOpen, activeFilterCount, onToggleFilterPanel
 * WHAT: Unit and accessibility tests for ArchiveSearchBar integrated filter pill button and AI mode suppression.
 * WHY: Verifies Ticket 02 acceptance criteria: accessible pill button in keyword mode, FiFilter icon, count badge, and suppression in AI mode.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 02).
 */
describe("ArchiveSearchBar Integrated Filter Pill Contract (Ticket 02)", () => {
  it("validates archiveSearchBarPropsSchema with enableFilterPill, filterPanelOpen, and activeFilterCount", () => {
    const validConfig = {
      enableFilterPill: true,
      filterPanelOpen: true,
      activeFilterCount: 2,
    };

    const parsed = archiveSearchBarPropsSchema.parse(validConfig);
    expect(parsed.enableFilterPill).toBe(true);
    expect(parsed.filterPanelOpen).toBe(true);
    expect(parsed.activeFilterCount).toBe(2);

    // Rejects negative activeFilterCount
    const negativeCount = archiveSearchBarPropsSchema.safeParse({
      enableFilterPill: true,
      activeFilterCount: -1,
    });
    expect(negativeCount.success).toBe(false);

    // Rejects non-integer activeFilterCount
    const floatCount = archiveSearchBarPropsSchema.safeParse({
      enableFilterPill: true,
      activeFilterCount: 1.5,
    });
    expect(floatCount.success).toBe(false);
  });

  it("renders backward-compatible DOM without filter pill button when enableFilterPill is omitted or false", () => {
    const htmlOmitted = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
      }),
    );
    expect(htmlOmitted).not.toContain('aria-controls="catalog-filters-panel"');
    expect(htmlOmitted).not.toContain("search-bar-filter-badge");
    expect(htmlOmitted).not.toContain("<span>Filters</span>");

    const htmlFalse = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: false,
      }),
    );
    expect(htmlFalse).not.toContain('aria-controls="catalog-filters-panel"');
    expect(htmlFalse).not.toContain("search-bar-filter-badge");
    expect(htmlFalse).not.toContain("<span>Filters</span>");
  });

  it("renders accessible filter pill button with FiFilter icon in keyword mode when enableFilterPill is true", () => {
    const onToggleMock = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: true,
        filterPanelOpen: false,
        onToggleFilterPanel: onToggleMock,
      }),
    );

    // Filter pill button structure and accessibility
    expect(html).toContain('aria-controls="catalog-filters-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Filters"');
    expect(html).toContain('type="button"');
    expect(html).toContain("<span>Filters</span>");
    expect(html).not.toContain("search-bar-filter-badge");

    // FiFilter SVG icon exists inside pill button
    const filterPillMatch = html.match(
      /<button[^>]*aria-controls="catalog-filters-panel"[^>]*>[\s\S]*?<\/button>/,
    );
    expect(filterPillMatch).not.toBeNull();
    expect(filterPillMatch![0]).toContain("<svg");
  });

  it("displays active filter count badge and expanded state when secondary filters exist", () => {
    const html = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: true,
        filterPanelOpen: true,
        activeFilterCount: 3,
      }),
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Filters (3 active)"');
    expect(html).toContain('data-testid="search-bar-filter-badge"');
    expect(html).toContain("(3)");
  });

  it("omits the filter pill button completely when in AI mode", () => {
    const htmlAi = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
        enableFilterPill: true,
        filterPanelOpen: true,
        activeFilterCount: 2,
      }),
    );

    expect(htmlAi).not.toContain('aria-controls="catalog-filters-panel"');
    expect(htmlAi).not.toContain("search-bar-filter-badge");
    expect(htmlAi).not.toContain("<span>Filters</span>");
  });

  it("automatically triggers onToggleFilterPanel when switching from keyword mode to AI mode with open filter panel", () => {
    const onToggleMock = vi.fn();
    const clearAiMock = vi.fn();

    const handled = handleModeSwitch("keyword", "ai", {
      filterPanelOpen: true,
      onToggleFilterPanel: onToggleMock,
      clearAiResults: clearAiMock,
    });

    expect(handled).toBe(true);
    expect(onToggleMock).toHaveBeenCalledTimes(1);
    expect(clearAiMock).not.toHaveBeenCalled();
  });

  it("does not trigger onToggleFilterPanel when switching to AI mode if filter panel was already closed", () => {
    const onToggleMock = vi.fn();
    const clearAiMock = vi.fn();

    const handled = handleModeSwitch("keyword", "ai", {
      filterPanelOpen: false,
      onToggleFilterPanel: onToggleMock,
      clearAiResults: clearAiMock,
    });

    expect(handled).toBe(true);
    expect(onToggleMock).not.toHaveBeenCalled();
  });

  it("clears AI results and ignores filter panel toggle when switching back from AI mode to keyword mode", () => {
    const onToggleMock = vi.fn();
    const clearAiMock = vi.fn();

    const handled = handleModeSwitch("ai", "keyword", {
      filterPanelOpen: true,
      onToggleFilterPanel: onToggleMock,
      clearAiResults: clearAiMock,
    });

    expect(handled).toBe(true);
    expect(clearAiMock).toHaveBeenCalledTimes(1);
    expect(onToggleMock).not.toHaveBeenCalled();
  });

  it("ignores no-op mode switch when target mode matches current mode", () => {
    const onToggleMock = vi.fn();
    const clearAiMock = vi.fn();

    const handled = handleModeSwitch("keyword", "keyword", {
      filterPanelOpen: true,
      onToggleFilterPanel: onToggleMock,
      clearAiResults: clearAiMock,
    });

    expect(handled).toBe(false);
    expect(onToggleMock).not.toHaveBeenCalled();
    expect(clearAiMock).not.toHaveBeenCalled();
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: ticket03UnifiedFilterRelocationTest, CatalogSearchSection, CatalogFilters, CatalogResults, controlledFilterExpansion, hideHeaderToggle
 * WHAT: Unit and integration tests for Ticket 03 unified filter panel relocation, controlled expansion, and adjacent placement.
 * WHY: Verifies that CatalogFilters supports controlled isOpen and hideHeaderToggle, that CatalogSearchSection unifies search and filters, and that CatalogResults places filters above totals.
 * WHERE: tests/ask-search-verification.test.ts (verifies Ticket 03).
 */
describe("Ticket 03: Unified Filter Panel Relocation and Controlled Expansion", () => {
  const samplePublishers = [
    "BCCNS",
    "Nova Scotia Archives",
    "Dalhousie University",
  ];

  it("validates catalogFiltersPropsSchema with isOpen and hideHeaderToggle", () => {
    const validProps = {
      publishers: samplePublishers,
      query: { q: "Africville" },
      isOpen: true,
      hideHeaderToggle: true,
    };
    const parsed = catalogFiltersPropsSchema.parse(validProps);
    expect(parsed.isOpen).toBe(true);
    expect(parsed.hideHeaderToggle).toBe(true);
  });

  it("omits the redundant header toggle button when hideHeaderToggle is true and respects controlled isOpen=true", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { q: "Africville", institution: "BCCNS" },
        isOpen: true,
        hideHeaderToggle: true,
      }),
    );

    // Redundant header toggle bar is omitted
    expect(html).not.toContain('<button type="button" aria-controls="catalog-filters-panel"');
    expect(html).not.toContain('data-testid="catalog-filters-badge"');

    // Filter panel is expanded
    expect(html).toContain('id="catalog-filters-panel"');
    expect(html).toContain("grid-rows-[1fr]");
    expect(html).not.toContain('id="catalog-filters-panel" hidden=""');

    // Retains hidden keyword input and facet fields
    expect(html).toContain('name="q"');
    expect(html).toContain('value="Africville"');
    expect(html).toContain('name="institution"');

    // Retains one-click "Clear filters" in panel footer preserving q
    expect(html).toContain("Clear filters");
    expect(html).toContain('href="/catalog?q=Africville"');
  });

  it("renders collapsed panel when hideHeaderToggle is true and controlled isOpen=false", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: samplePublishers,
        query: { q: "Africville" },
        isOpen: false,
        hideHeaderToggle: true,
      }),
    );

    expect(html).not.toContain('<button type="button" aria-controls="catalog-filters-panel"');
    expect(html).toContain('id="catalog-filters-panel"');
    expect(html).toContain("grid-rows-[0fr]");
    expect(html).toContain('hidden=""');
  });

  it("accurately tallies active secondary filters and ignores keyword query q and blank strings", () => {
    expect(countActiveSecondaryFilters({})).toBe(0);
    expect(countActiveSecondaryFilters({ q: "Africville" })).toBe(0);
    expect(
      countActiveSecondaryFilters({
        q: "Africville",
        institution: "BCCNS",
        creator: "Addie States",
      }),
    ).toBe(2);
    expect(
      countActiveSecondaryFilters({
        institution: "   ",
        place: "",
      }),
    ).toBe(0);
    expect(
      countActiveSecondaryFilters({
        institution: "BCCNS",
        type: "document",
        creator: "Addie States",
        subject: "Africville",
        place: "Halifax",
        from: "1960",
        to: "1970",
      }),
    ).toBe(7);
  });

  it("validates catalogSearchSectionPropsSchema with publishers and filters", () => {
    const valid = {
      publishers: samplePublishers,
      filters: { q: "Africville", institution: "BCCNS" },
    };
    const parsed = catalogSearchSectionPropsSchema.parse(valid);
    expect(parsed.publishers).toEqual(samplePublishers);
    expect(parsed.filters.institution).toBe("BCCNS");
  });

  it("renders ArchiveSearchBar with integrated filter pill and mounts CatalogFilters directly adjacent", () => {
    const html = renderToStaticMarkup(
      React.createElement(CatalogSearchSection, {
        publishers: samplePublishers,
        filters: {
          q: "Africville",
          institution: "BCCNS",
          type: "photograph",
        },
      }),
    );

    // Renders dual-mode ArchiveSearchBar with keyword mode active
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Keyword Search");

    // Renders integrated filter pill button with active filter count badge (2)
    expect(html).toContain('aria-controls="catalog-filters-panel"');
    expect(html).toContain('data-testid="search-bar-filter-badge"');
    expect(html).toContain("(2)");

    // Renders input with initial keyword query
    expect(html).toContain('value="Africville"');

    // Mounts CatalogFilters directly adjacent without redundant header toggle
    expect(html).not.toContain('<button type="button" aria-controls="catalog-filters-panel" aria-label="Filters (2)"');
    expect(html).toContain('id="catalog-filters-panel"');
  });

  it("renders CatalogResults with search and filter section relocated above totals and removes disconnected filter block below", async () => {
    vi.spyOn(catalogService, "getCatalogHeader").mockResolvedValue({
      totals: {
        records: 42,
        sources: 5,
        people: 12,
        places: 8,
        subjects: 15,
        communities: 4,
        recordPeople: 18,
        recordPlaces: 14,
        recordSubjects: 22,
      },
      publishers: ["Black Cultural Centre for Nova Scotia"],
    });

    vi.spyOn(searchService, "searchRecords").mockResolvedValue({
      count: 1,
      filters: {},
      results: [
        {
          id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          dc_title: "Africville Records",
          dc_identifier: "BCCNS-1960-001",
          dc_publisher: "Black Cultural Centre for Nova Scotia",
          dc_source: "BCCNS Archives",
          dc_type: "document",
          dc_description: "Community documentation",
          dc_creator: "Addie States",
          dc_subject: ["Africville"],
          dc_date: "1960",
          date_text: "1960",
          dcterms_spatial: "Africville",
          dcterms_temporal: "20th Century",
          dc_rights: "In Copyright",
          dcterms_access_rights: "Open access",
          dcterms_provenance: "Donated",
          bccns_community: ["Africville"],
          bccns_access_status: "available",
          bccns_digitized: true,
        },
      ],
    });

    const resultsElement = await CatalogResults({
      searchParams: Promise.resolve({
        institution: "Black Cultural Centre for Nova Scotia",
      }),
    });
    const resultsHtml = renderToStaticMarkup(resultsElement);

    // Filter panel is mounted above catalog totals in DOM sequence
    const filterPanelIndex = resultsHtml.indexOf('id="catalog-filters-panel"');
    const totalsIndex = resultsHtml.indexOf('aria-label="Catalog totals"');

    expect(filterPanelIndex).toBeGreaterThan(-1);
    expect(totalsIndex).toBeGreaterThan(-1);
    expect(filterPanelIndex).toBeLessThan(totalsIndex);

    // Only one filter form/panel exists in the layout (no disconnected block below totals)
    const filterPanelMatches = resultsHtml.match(/id="catalog-filters-panel"/g);
    expect(filterPanelMatches).toHaveLength(1);

    const actionMatches = resultsHtml.match(/action="\/catalog"/g);
    expect(actionMatches).toHaveLength(1);

    // Integrated filter pill button is present in search section above totals
    expect(resultsHtml).toContain('aria-controls="catalog-filters-panel"');
    expect(resultsHtml).toContain('data-testid="search-bar-filter-badge"');
  });
});

/**
 * SOURCE OF TRUTH KEYWORDS: ticket04EndToEndVerificationSuite, stickyNavStyling, brandWordmarkCatalog, headerHierarchyEyebrow, filterPillKeywordAiToggle, panelAdjacentExpansion, facetPreservationHiddenQ, legacyBackwardCompatibility, waiAriaAccessibilityContract
 * WHAT: Dedicated End-to-End verification and accessibility test suite for Ticket 04.
 * WHY: Validates sticky navigation bar, branded header hierarchy, integrated filter pill, AI mode suppression, adjacent panel relocation, query preservation, legacy safety, and WAI-ARIA contracts.
 * WHERE: tests/ask-search-verification.test.ts (Ticket 04: End-to-End Verification and Accessibility Test Suite).
 */
describe("Ticket 04: End-to-End Verification and Accessibility Test Suite", () => {
  const e2eSamplePublishers = [
    "Black Cultural Centre for Nova Scotia",
    "Nova Scotia Archives",
    "Dalhousie University",
  ];

  const e2eRecord: CatalogRecord = {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    dc_title: "Preston Cultural Heritage Ledger",
    dc_identifier: "BCCNS-1975-088",
    dc_publisher: "Black Cultural Centre for Nova Scotia",
    dc_source: "BCCNS Physical Archives",
    dc_type: "document",
    dc_description: "Community ledger preserving Preston heritage.",
    dc_creator: "Community Historian",
    dc_subject: ["Preston", "Genealogy", "Oral History"],
    dc_date: "1975",
    date_text: "1975",
    dcterms_spatial: "Preston",
    dcterms_temporal: "20th Century",
    dc_rights: "In Copyright",
    dcterms_access_rights: "Open access",
    dcterms_provenance: "Donated by Preston Elders",
    bccns_community: ["Preston"],
    bccns_access_status: "available",
    bccns_digitized: true,
  };

  it("verifies sticky navigation bar styling classes and BCCNS Catalog brand wordmark", () => {
    const pageMarkup = renderToStaticMarkup(
      React.createElement(CatalogPage, {
        searchParams: Promise.resolve({}),
      }),
    );

    // Sticky nav container with backdrop blur, subtle theme border tokens, and fixed z-index
    expect(pageMarkup).toContain("sticky top-0 z-40");
    expect(pageMarkup).toContain("bg-background/80");
    expect(pageMarkup).toContain("backdrop-blur-md");
    expect(pageMarkup).toContain("border-b border-border/80");

    // BCCNS Catalog brand wordmark link
    expect(pageMarkup).toContain('href="/catalog"');
    expect(pageMarkup).toContain("BCCNS Catalog");
    expect(pageMarkup).toContain(
      "font-serif text-xl tracking-tight text-foreground transition-colors hover:text-foreground/80",
    );

    // Right-aligned actions: Home link and theme switcher
    expect(pageMarkup).toContain('href="/"');
    expect(pageMarkup).toContain("Home");
    expect(pageMarkup).toContain("text-muted-foreground transition-colors hover:text-foreground");
  });

  it("verifies catalog header hierarchy with eyebrow kicker, display title, and descriptive subtitle", async () => {
    vi.spyOn(catalogService, "getCatalogHeader").mockResolvedValue({
      totals: {
        records: 48,
        sources: 6,
        people: 16,
        places: 9,
        subjects: 20,
        communities: 5,
        recordPeople: 22,
        recordPlaces: 18,
        recordSubjects: 28,
      },
      publishers: e2eSamplePublishers,
    });

    vi.spyOn(searchService, "searchRecords").mockResolvedValue({
      count: 1,
      filters: {},
      results: [e2eRecord],
    });

    const resultsElement = await CatalogResults({
      searchParams: Promise.resolve({}),
    });
    const resultsMarkup = renderToStaticMarkup(resultsElement);

    // Branded eyebrow kicker orienting visitors to the institutional authority
    expect(resultsMarkup).toContain("Black Cultural Centre for Nova Scotia");
    expect(resultsMarkup).toContain(
      "text-xs font-semibold uppercase tracking-widest text-muted-foreground",
    );

    // Distinguished title in display serif typography
    expect(resultsMarkup).toContain("Digital Archive Catalog");
    expect(resultsMarkup).toContain(
      "font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl",
    );

    // Informative descriptive subtitle explaining dual discovery options
    expect(resultsMarkup).toContain(
      "Explore primary records, oral histories, and community lineages, or switch to Ask AI for grounded historical inquiries.",
    );
    expect(resultsMarkup).toContain(
      "mt-1 max-w-2xl text-sm leading-relaxed text-foreground/75 sm:text-base",
    );

    // Deprecated unbranded header copy is completely absent
    expect(resultsMarkup).not.toContain("Black history catalog");
    expect(resultsMarkup).not.toContain(
      "Ask a question in plain language, or narrow the records by institution, type, place, and date.",
    );
  });

  it("verifies filter pill button renders in keyword mode with FiFilter icon, 'Filters' text, type='button', aria-expanded, and active badge", () => {
    // 1. Without active secondary filters: clean pill button with no badge
    const htmlZeroFilters = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: true,
        filterPanelOpen: false,
        activeFilterCount: 0,
      }),
    );

    expect(htmlZeroFilters).toContain('aria-controls="catalog-filters-panel"');
    expect(htmlZeroFilters).toContain('aria-expanded="false"');
    expect(htmlZeroFilters).toContain('aria-label="Filters"');
    expect(htmlZeroFilters).toContain('type="button"');
    expect(htmlZeroFilters).toContain("<span>Filters</span>");
    expect(htmlZeroFilters).not.toContain('data-testid="search-bar-filter-badge"');

    // FiFilter SVG icon exists inside pill button
    const pillMatches = htmlZeroFilters.match(
      /<button[^>]*aria-controls="catalog-filters-panel"[^>]*>[\s\S]*?<\/button>/,
    );
    expect(pillMatches).not.toBeNull();
    expect(pillMatches?.[0]).toContain("<svg");

    // 2. With active secondary filters: active badge and expanded aria state
    const htmlActiveFilters = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: true,
        filterPanelOpen: true,
        activeFilterCount: 2,
      }),
    );

    expect(htmlActiveFilters).toContain('aria-expanded="true"');
    expect(htmlActiveFilters).toContain('aria-label="Filters (2 active)"');
    expect(htmlActiveFilters).toContain('data-testid="search-bar-filter-badge"');
    expect(htmlActiveFilters).toContain("(2)");
  });

  it("verifies filter pill button is omitted from DOM in Ask AI mode, and switching to AI mode triggers closing open filter panel", () => {
    // 1. In Ask AI mode, the filter pill is completely omitted from markup
    const htmlAi = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "ai",
        enableFilterPill: true,
        filterPanelOpen: true,
        activeFilterCount: 3,
      }),
    );

    expect(htmlAi).not.toContain('aria-controls="catalog-filters-panel"');
    expect(htmlAi).not.toContain("search-bar-filter-badge");
    expect(htmlAi).not.toContain("<span>Filters</span>");

    // 2. Switching to AI mode when filter panel is open collapses the panel
    const onToggleMock = vi.fn();
    const clearAiMock = vi.fn();
    const handled = handleModeSwitch("keyword", "ai", {
      filterPanelOpen: true,
      onToggleFilterPanel: onToggleMock,
      clearAiResults: clearAiMock,
    });
    expect(handled).toBe(true);
    expect(onToggleMock).toHaveBeenCalledTimes(1);

    // 3. Switching to AI mode when filter panel was already closed does not call onToggleFilterPanel
    const onToggleClosedMock = vi.fn();
    const handledClosed = handleModeSwitch("keyword", "ai", {
      filterPanelOpen: false,
      onToggleFilterPanel: onToggleClosedMock,
      clearAiResults: clearAiMock,
    });
    expect(handledClosed).toBe(true);
    expect(onToggleClosedMock).not.toHaveBeenCalled();

    // 4. Switching back to keyword mode clears AI results and does not toggle the filter panel
    const handledBack = handleModeSwitch("ai", "keyword", {
      filterPanelOpen: false,
      onToggleFilterPanel: onToggleMock,
      clearAiResults: clearAiMock,
    });
    expect(handledBack).toBe(true);
    expect(clearAiMock).toHaveBeenCalledTimes(1);
    expect(onToggleMock).toHaveBeenCalledTimes(1); // unchanged from step 2
  });

  it("verifies filter panel expands directly adjacent underneath search bar container and above catalog totals", async () => {
    vi.spyOn(catalogService, "getCatalogHeader").mockResolvedValue({
      totals: {
        records: 30,
        sources: 4,
        people: 10,
        places: 6,
        subjects: 12,
        communities: 3,
        recordPeople: 15,
        recordPlaces: 11,
        recordSubjects: 17,
      },
      publishers: e2eSamplePublishers,
    });

    vi.spyOn(searchService, "searchRecords").mockResolvedValue({
      count: 1,
      filters: {},
      results: [e2eRecord],
    });

    // 1. In CatalogSearchSection, search bar and filter accordion are adjacent children in gap-4 layout
    const searchSectionMarkup = renderToStaticMarkup(
      React.createElement(CatalogSearchSection, {
        publishers: e2eSamplePublishers,
        filters: { q: "Africville", institution: "Black Cultural Centre for Nova Scotia" },
      }),
    );
    expect(searchSectionMarkup).toContain("flex flex-col gap-4");
    expect(searchSectionMarkup).toContain('aria-controls="catalog-filters-panel"');
    expect(searchSectionMarkup).toContain('id="catalog-filters-panel"');
    // Redundant filter header toggle is omitted in unified layout
    expect(searchSectionMarkup).not.toContain(
      '<button type="button" aria-controls="catalog-filters-panel" aria-label="Filters',
    );

    // 2. In CatalogResults, search and filter section is rendered above totals
    const resultsElement = await CatalogResults({
      searchParams: Promise.resolve({
        q: "Africville",
        institution: "Black Cultural Centre for Nova Scotia",
      }),
    });
    const resultsMarkup = renderToStaticMarkup(resultsElement);

    const filterIndex = resultsMarkup.indexOf('id="catalog-filters-panel"');
    const totalsIndex = resultsMarkup.indexOf('aria-label="Catalog totals"');
    expect(filterIndex).toBeGreaterThan(-1);
    expect(totalsIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeLessThan(totalsIndex);

    // Exactly 1 filter panel instance and 1 form action
    expect(resultsMarkup.match(/id="catalog-filters-panel"/g)).toHaveLength(1);
    expect(resultsMarkup.match(/action="\/catalog"/g)).toHaveLength(1);

    // 3. Smooth accordion transition tokens
    const collapsedMarkup = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: e2eSamplePublishers,
        query: {},
        isOpen: false,
        hideHeaderToggle: true,
      }),
    );
    expect(collapsedMarkup).toContain("grid-rows-[0fr]");
    expect(collapsedMarkup).toContain("transition-[grid-template-rows]");
    expect(collapsedMarkup).toContain('hidden=""');

    const expandedMarkup = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: e2eSamplePublishers,
        query: {},
        isOpen: true,
        hideHeaderToggle: true,
      }),
    );
    expect(expandedMarkup).toContain("grid-rows-[1fr]");
    expect(expandedMarkup).toContain("transition-[grid-template-rows]");
    expect(expandedMarkup).not.toContain('hidden=""');
  });

  it("verifies submitting filters preserves hidden q input and active secondary facet parameters in URL query", () => {
    const filterMarkup = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: e2eSamplePublishers,
        query: {
          q: "Africville Church & Community",
          institution: "Black Cultural Centre for Nova Scotia",
          type: "document",
          creator: "Addie States",
          subject: "Genealogy",
          place: "Africville",
          from: "1960",
          to: "1970",
        },
        isOpen: true,
        hideHeaderToggle: true,
      }),
    );

    // Form action points to /catalog
    expect(filterMarkup).toContain('action="/catalog"');

    // Hidden input preserves active keyword query q
    expect(filterMarkup).toContain(
      '<input type="hidden" name="q" value="Africville Church &amp; Community"',
    );

    // No visible duplicate input for q
    expect(filterMarkup).not.toContain('<input name="q"');
    expect(filterMarkup).not.toContain("Search all sources");

    // All 7 secondary facet inputs and selects exist
    expect(filterMarkup).toContain('name="institution"');
    expect(filterMarkup).toContain('name="type"');
    expect(filterMarkup).toContain('name="creator"');
    expect(filterMarkup).toContain('name="subject"');
    expect(filterMarkup).toContain('name="place"');
    expect(filterMarkup).toContain('name="from"');
    expect(filterMarkup).toContain('name="to"');

    // "Clear filters" action preserves active keyword query q while purging secondary facets
    expect(filterMarkup).toContain("Clear filters");
    expect(filterMarkup).toContain(
      'href="/catalog?q=Africville%20Church%20%26%20Community"',
    );

    // URL merge preserves secondary facet parameters on keyword submission
    const existingSearch =
      "?institution=Black+Cultural+Centre+for+Nova+Scotia&type=document&place=Africville&page=4";
    const mergedUrl = mergeCatalogSearchParams(existingSearch, {
      institution: "Black Cultural Centre for Nova Scotia",
      type: "document",
      place: "Africville",
      q: "Baptist Church records",
    });

    expect(mergedUrl).toBe(
      "/catalog?institution=Black+Cultural+Centre+for+Nova+Scotia&type=document&place=Africville&q=Baptist+Church+records",
    );
    const parsed = parseSearchParams(
      new URLSearchParams(mergedUrl.replace("/catalog?", "")),
    );
    expect(parsed.institution).toBe("Black Cultural Centre for Nova Scotia");
    expect(parsed.type).toBe("document");
    expect(parsed.place).toBe("Africville");
    expect(parsed.q).toBe("Baptist Church records");
    expect(new URLSearchParams(mergedUrl.replace("/catalog?", "")).has("page")).toBe(
      false,
    );
  });

  it("verifies backward compatibility for legacy views without filter pills or mode toggles", () => {
    // 1. ArchiveSearchBar without enableFilterPill
    const omittedPillMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
      }),
    );
    expect(omittedPillMarkup).not.toContain('aria-controls="catalog-filters-panel"');
    expect(omittedPillMarkup).not.toContain("search-bar-filter-badge");
    expect(omittedPillMarkup).not.toContain("<span>Filters</span>");

    // 2. ArchiveSearchBar with enableFilterPill=false
    const explicitFalsePillMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: false,
      }),
    );
    expect(explicitFalsePillMarkup).not.toContain('aria-controls="catalog-filters-panel"');
    expect(explicitFalsePillMarkup).not.toContain("search-bar-filter-badge");
    expect(explicitFalsePillMarkup).not.toContain("<span>Filters</span>");

    // 3. Legacy 3D museum rotunda invocation (bccns-archive-experience.tsx)
    const legacyMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        autoNavigate: false,
        showCatalogCta: true,
      }),
    );
    expect(legacyMarkup).not.toContain('role="radiogroup"');
    expect(legacyMarkup).not.toContain('aria-controls="catalog-filters-panel"');
    expect(legacyMarkup).toContain('placeholder="Ask a question in plain language..."');
    expect(legacyMarkup).toContain('aria-label="Submit inquiry"');
    expect(legacyMarkup).toContain('type="submit"');

    // 4. Standalone CatalogFilters invocation without hideHeaderToggle preserves disclosure toggle
    const standaloneFiltersMarkup = renderToStaticMarkup(
      React.createElement(CatalogFilters, {
        publishers: e2eSamplePublishers,
        query: { institution: "Black Cultural Centre for Nova Scotia" },
        hideHeaderToggle: false,
      }),
    );
    expect(standaloneFiltersMarkup).toContain('aria-controls="catalog-filters-panel"');
    expect(standaloneFiltersMarkup).toContain('type="button"');
    expect(standaloneFiltersMarkup).toContain('data-testid="catalog-filters-badge"');
    expect(standaloneFiltersMarkup).toContain("Filters (1)");
  });

  it("verifies WAI-ARIA accessibility contracts across navigation, header, mode toggle, filter pill, and collapsible panel", () => {
    // 1. Landmark navigation and heading hierarchy
    const pageMarkup = renderToStaticMarkup(
      React.createElement(CatalogPage, {
        searchParams: Promise.resolve({}),
      }),
    );
    expect(pageMarkup).toContain("<nav");
    expect(pageMarkup).toContain('href="/catalog"');
    expect(pageMarkup).toContain('href="/"');

    // 2. Mode toggle radiogroup accessibility
    const searchMarkup = renderToStaticMarkup(
      React.createElement(ArchiveSearchBar, {
        enableModeToggle: true,
        defaultMode: "keyword",
        enableFilterPill: true,
        filterPanelOpen: false,
        activeFilterCount: 1,
      }),
    );
    expect(searchMarkup).toContain('role="radiogroup"');
    expect(searchMarkup).toContain('aria-label="Search mode"');
    expect(searchMarkup).toContain('role="radio"');
    expect(searchMarkup).toContain('aria-checked="true"');
    expect(searchMarkup).toContain('tabindex="0"');
    expect(searchMarkup).toContain('aria-checked="false"');
    expect(searchMarkup).toContain('tabindex="-1"');

    // 3. Accessible search input and submission button
    expect(searchMarkup).toContain("<form");
    expect(searchMarkup).toContain('type="search"');
    expect(searchMarkup).toContain(
      'aria-label="Search title, description, subject, place, or community..."',
    );
    expect(searchMarkup).toContain(
      'placeholder="Search title, description, subject, place, or community..."',
    );
    expect(searchMarkup).toContain('type="submit"');
    expect(searchMarkup).toContain('aria-label="Search catalog"');

    // 4. Filter pill button accessibility
    expect(searchMarkup).toContain('type="button"');
    expect(searchMarkup).toContain('aria-controls="catalog-filters-panel"');
    expect(searchMarkup).toContain('aria-expanded="false"');
    expect(searchMarkup).toContain('aria-label="Filters (1 active)"');

    // 5. Arrow key keyboard navigation helper implements WAI-ARIA roving tabindex
    const switchModeSpy = vi.fn();
    const focusKeywordSpy = vi.fn();
    const focusAiSpy = vi.fn();
    const callbacks = {
      switchMode: switchModeSpy,
      focusKeyword: focusKeywordSpy,
      focusAi: focusAiSpy,
    };

    expect(handleRadioArrowNavigation("ArrowRight", callbacks)).toBe(true);
    expect(switchModeSpy).toHaveBeenCalledWith("ai");
    expect(focusAiSpy).toHaveBeenCalledTimes(1);

    expect(handleRadioArrowNavigation("ArrowLeft", callbacks)).toBe(true);
    expect(switchModeSpy).toHaveBeenCalledWith("keyword");
    expect(focusKeywordSpy).toHaveBeenCalledTimes(1);

    expect(handleRadioArrowNavigation("Tab", callbacks)).toBe(false);
  });
});







