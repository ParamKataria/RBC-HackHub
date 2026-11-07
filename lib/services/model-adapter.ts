/**
 * SOURCE OF TRUTH KEYWORDS: InMemoryModelAdapter, LanguageModelPort, LanguageModelInput, createInMemoryModelAdapter, inquirySeam
 * WHAT: In-memory test double implementing LanguageModelPort for deterministic claim generation during automated testing.
 * WHY: Decouples inquiry engine testing from live Gemini network calls, API keys, latency, and costs.
 * WHERE: tests/ask-search-verification.test.ts, lib/services/ask.ts, and automated test suites.
 */
import type {
  AskModelClaim,
  InMemoryModelAdapterInput,
  LanguageModelHandler,
  LanguageModelInput,
  LanguageModelPort,
  ModelClaims,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: isClaimsArray, AskModelClaim, ModelClaims, typeGuard, claimsArrayCheck
 * WHAT: Type guard checking whether an input is a readonly array of AskModelClaim.
 * WHY: Discriminates claim arrays from ModelClaims objects without resorting to type-system bypasses.
 * WHERE: InMemoryModelAdapter in lib/services/model-adapter.ts.
 */
function isClaimsArray(
  value:
    | InMemoryModelAdapterInput
    | ModelClaims
    | readonly AskModelClaim[]
    | ModelClaims["claims"],
): value is readonly AskModelClaim[] {
  return Array.isArray(value);
}

export class InMemoryModelAdapter implements LanguageModelPort {
  private claims: ModelClaims = { claims: [] };
  private handler: LanguageModelHandler | null = null;
  private error: Error | null = null;
  private calls: LanguageModelInput[] = [];

  constructor(initial?: InMemoryModelAdapterInput) {
    if (!initial) {
      return;
    }
    if (typeof initial === "function") {
      this.handler = initial;
      return;
    }
    if (isClaimsArray(initial)) {
      this.claims = { claims: [...initial] };
      return;
    }
    if ("handler" in initial && typeof initial.handler === "function") {
      this.handler = initial.handler;
    }
    if (
      "error" in initial &&
      initial.error !== undefined &&
      initial.error !== null
    ) {
      this.error =
        typeof initial.error === "string"
          ? new Error(initial.error)
          : initial.error;
    }
    if (
      "claims" in initial &&
      initial.claims !== undefined &&
      initial.claims !== null
    ) {
      const claimsInput = initial.claims;
      if (isClaimsArray(claimsInput)) {
        this.claims = { claims: [...claimsInput] };
      } else {
        this.claims = claimsInput;
      }
    }
  }

  setClaims(claims: ModelClaims | readonly AskModelClaim[]): this {
    if (isClaimsArray(claims)) {
      this.claims = { claims: [...claims] };
    } else {
      this.claims = claims;
    }
    this.handler = null;
    this.error = null;
    return this;
  }

  setHandler(handler: LanguageModelHandler | null): this {
    this.handler = handler;
    this.error = null;
    return this;
  }

  setError(error: Error | string | null): this {
    this.error = typeof error === "string" ? new Error(error) : error;
    return this;
  }

  getCalls(): readonly LanguageModelInput[] {
    return [...this.calls];
  }

  resetCalls(): this {
    this.calls = [];
    return this;
  }

  reset(): this {
    this.claims = { claims: [] };
    this.handler = null;
    this.error = null;
    this.calls = [];
    return this;
  }

  async generateClaims(
    input: LanguageModelInput | string,
    options?: { maxOutputTokens?: number },
  ): Promise<ModelClaims> {
    const normalizedInput: LanguageModelInput =
      typeof input === "string"
        ? {
            prompt: input,
            ...(options?.maxOutputTokens !== undefined
              ? { maxOutputTokens: options.maxOutputTokens }
              : {}),
          }
        : {
            prompt: input.prompt,
            ...(input.maxOutputTokens !== undefined ||
            options?.maxOutputTokens !== undefined
              ? {
                  maxOutputTokens:
                    input.maxOutputTokens ?? options?.maxOutputTokens,
                }
              : {}),
          };

    this.calls.push(normalizedInput);

    if (this.error) {
      throw this.error;
    }

    if (this.handler) {
      return await this.handler(normalizedInput);
    }

    return this.claims;
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: createInMemoryModelAdapter, InMemoryModelAdapter, testFactory, LanguageModelPort, testDouble
 * WHAT: Factory function creating an InMemoryModelAdapter instance.
 * WHY: Fluent, single-line instantiation for test doubles without verbose class instantiation.
 * WHERE: Unit tests and test harnesses.
 */
export function createInMemoryModelAdapter(
  initial?: InMemoryModelAdapterInput,
): InMemoryModelAdapter {
  return new InMemoryModelAdapter(initial);
}
