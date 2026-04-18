// tests/typeHelpers.ts
// shared type-cheat helpers for tests that intentionally pass invalid input

// cast a value to T at the test boundary. use only when the test exists
// specifically to prove the production code rejects malformed input — the
// named helper makes the intent explicit instead of an opaque `as never`
export const asInvalid = <T>(value: unknown): T => value as T
