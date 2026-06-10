type SortableIncident = {
  is_priority: boolean;
  display_order: number;
  is_taken: boolean;
  created_at: string;
};

export function sortIncidents<T extends SortableIncident>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
    if (a.display_order !== b.display_order) return b.display_order - a.display_order;
    if (a.is_taken !== b.is_taken) return a.is_taken ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
