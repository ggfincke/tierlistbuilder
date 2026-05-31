// tests/shared-lib/async.ts
// async test helpers for queued Promise continuations

export const flushPromises = async (turns = 2): Promise<void> =>
{
  for (let i = 0; i < turns; i += 1)
  {
    await Promise.resolve()
  }
}
