export function inflect(count: number, singular: string, plural: string): string {
  return count > 1 ? plural : singular;
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${inflect(count, singular, plural)}`;
}
