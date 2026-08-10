/**
 * Environment defaults for tests.
 *
 * `env.ts` parses at import time and requires an Anthropic key, so any test
 * that imports a module touching `env` would otherwise fail at load with a
 * Zod error rather than a useful message. Nothing here calls a model; the key
 * only has to be present.
 *
 * `??=` so a real environment always wins: running the suite against a live
 * configuration should use that configuration, not this.
 */
process.env.ANTHROPIC_API_KEY ??= "test-key-no-model-is-called";
