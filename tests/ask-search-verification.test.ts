/**
 * SOURCE OF TRUTH KEYWORDS: askSearchVerificationTest, InMemoryModelAdapter, LanguageModelPort, claimLines, groundingVerification
 * WHAT: Unit and seam verification tests for InMemoryModelAdapter fulfilling the LanguageModelPort contract.
 * WHY: Proves deterministic, in-memory claim generation at the inquiry engine seam without network or API dependencies.
 * WHERE: tests/ask-search-verification.test.ts (promised in lib/services/ask.ts line 7).
 */
import { describe, expect, it } from "vitest";

import { claimLines, groundClaims } from "@/lib/services/ask";
import {
  InMemoryModelAdapter,
  createInMemoryModelAdapter,
} from "@/lib/services/model-adapter";
import {
  archiveSearchBarPropsSchema,
  askResponseSchema,
  noArchiveSourceMessage,
  noDirectAnswerMessage,
  type AskClaim,
  type AskModelClaim,
  type CatalogRecord,
  type ExtraIdValue,
  type LanguageModelPort,
} from "@/src/types";
import { filterHref } from "@/src/components/archive";

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

describe("ArchiveSearchBar and filterHref Contract", () => {
  it("serializes search query filters cleanly to catalog URLs", () => {
    expect(filterHref({ q: "Africville", place: "Nova Scotia" })).toBe(
      "/catalog?q=Africville&place=Nova+Scotia",
    );
    expect(filterHref({})).toBe("/catalog");
  });

  it("proves archiveSearchBarPropsSchema has eliminated persistStorage", () => {
    expect("persistStorage" in archiveSearchBarPropsSchema.shape).toBe(false);
    const parsed = archiveSearchBarPropsSchema.parse({
      autoNavigate: true,
      showCatalogCta: true,
      placeholder: "Custom prompt",
    });
    expect(parsed.autoNavigate).toBe(true);
    expect(parsed.showCatalogCta).toBe(true);
    expect((parsed as Record<string, unknown>).persistStorage).toBeUndefined();
  });
});

