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

type GroupableIncident = {
  line_id: number;
  line_number: string;
};

export interface IncidentLineGroup<T> {
  lineId: number;
  lineNumber: string;
  incidents: T[];
}

const lineNumberComparator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Regroupement purement d'affichage : ne re-trie jamais les incidents entre
// eux (l'ordre de sortIncidents/du tri manuel est préservé à l'intérieur de
// chaque groupe), seuls les groupes-ligne sont ordonnés, en 1-9/A-Z fixe et
// indépendant du tri actif, pour que chaque ligne garde une position stable.
export function groupIncidentsByLine<T extends GroupableIncident>(
  items: T[]
): IncidentLineGroup<T>[] {
  const groups = new Map<number, IncidentLineGroup<T>>();
  for (const incident of items) {
    const existing = groups.get(incident.line_id);
    if (existing) {
      existing.incidents.push(incident);
    } else {
      groups.set(incident.line_id, {
        lineId: incident.line_id,
        lineNumber: incident.line_number,
        incidents: [incident],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    lineNumberComparator.compare(a.lineNumber, b.lineNumber)
  );
}
