// src/shared/overlay/layerStack.ts
// tiny LIFO token stack for topmost overlay coordination

export const createLayerStack = <TEntry>() =>
{
  const entries: TEntry[] = []

  return {
    push: (entry: TEntry) =>
    {
      entries.push(entry)
    },
    remove: (predicate: (entry: TEntry) => boolean) =>
    {
      const index = entries.findIndex(predicate)
      if (index >= 0) entries.splice(index, 1)
    },
    top: (): TEntry | undefined => entries[entries.length - 1],
  }
}
