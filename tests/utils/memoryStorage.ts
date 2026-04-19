// tests/utils/memoryStorage.ts
// in-memory Storage polyfill — shared across tests that stub localStorage
// (cloud merge, board storage, local board session)

export const createMemoryStorage = (): Storage =>
{
  const values = new Map<string, string>()

  return {
    get length()
    {
      return values.size
    },
    clear: () =>
    {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) =>
    {
      values.delete(key)
    },
    setItem: (key, value) =>
    {
      values.set(key, value)
    },
  } as Storage
}

// memory storage that throws QuotaExceededError on setItem for blocked keys —
// used by tests that exercise the quota-failure branches of local persistence
export const createFailingStorage = (blockedKeys: Set<string>): Storage =>
{
  const storage = createMemoryStorage()

  return {
    ...storage,
    setItem: (key, value) =>
    {
      if (blockedKeys.has(key))
      {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      storage.setItem(key, value)
    },
  } as Storage
}
