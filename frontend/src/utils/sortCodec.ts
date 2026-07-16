type SortState = { sort: string; order: string };

export function makeSortCodec(entries: Array<{ key: string; sort: string; order: string }>) {
  function encode(state: SortState): string {
    return (
      entries.find((e) => e.sort === state.sort && e.order === state.order)?.key ??
      entries[entries.length - 1].key
    );
  }

  function decode(key: string): SortState {
    const entry = entries.find((e) => e.key === key);
    if (!entry)
      return { sort: entries[entries.length - 1].sort, order: entries[entries.length - 1].order };
    return { sort: entry.sort, order: entry.order };
  }

  return { encode, decode };
}
