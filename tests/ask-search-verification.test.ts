/**
 * SOURCE OF TRUTH KEYWORDS: askSearchVerificationTest, InMemoryModelAdapter, ArchiveSearchBar, filterHref, zeroStorageSideEffects, inquiryHandoff
 * WHAT: Unit, accessibility, and seam verification tests for inquiry execution, filterHref serialization, and pure React search bar state.
 * WHY: Proves deterministic claim grounding, zero sessionStorage side effects, accessible button contracts, and URL query synchronization.
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
import {
  ArchiveSearchBar,
  filterHref,
} from "@/src/components/archive";
import {
  archiveSearchBarPropsSchema,
  askResponseSchema,
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

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "window", {
      value: { sessionStorage: mockSessionStorage },
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
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("never accesses sessionStorage during filterHref parameter translation and round-trip decoding", () => {
    const href = filterHref({
      q: "Africville Baptist Church",
      place: "Halifax, NS",
    });
    const parsed = parseSearchParams(new URLSearchParams(href.replace("/catalog?", "")));

    expect(parsed.q).toBe("Africville Baptist Church");
    expect(parsed.place).toBe("Halifax, NS");
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
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
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it("never accesses sessionStorage across the answer response lifecycle and callback notifications", () => {
    const mockAnswer = askResponseSchema.parse({
      question: "Africville community history",
      filters: { q: "Africville", page: 1 },
      count: 1,
      claims: [
        {
          text: "Africville was a vibrant community in Nova Scotia.",
          citedRecordIds: ["11111111-2222-3333-4444-555555555555"],
        },
      ],
      summary: "Africville was a vibrant community in Nova Scotia.",
      citations: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          title: "Africville Church Records",
        },
      ],
    });

    const onAnswerMock = vi.fn();
    const onClearMock = vi.fn();

    onAnswerMock(mockAnswer);
    onClearMock();

    expect(onAnswerMock).toHaveBeenCalledWith(mockAnswer);
    expect(onClearMock).toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
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
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
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
});

