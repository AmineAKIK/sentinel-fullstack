import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { listWorkshopHistoryEvents, listWorkshopLines } from '../../api/workshop';
import { WorkshopHistoryEvent } from '../../types';
import WorkshopJournalPage from '../WorkshopJournalPage';

vi.mock('../../api/workshop', () => ({
  listWorkshopHistoryEvents: vi.fn(),
  listWorkshopLines: vi.fn(),
}));

vi.mock('../../routes/AppAuthContext', () => ({
  useAppAuth: () => ({
    session: {
      accountType: 'workshop',
      user: {
        id: 3,
        first_name: 'Eden',
        last_name: 'AKIK',
        badge_number: 'RE-01',
        role: 'RESPONSABLE',
      },
    },
    loading: false,
    logoutPending: false,
    setSession: vi.fn(),
    logout: vi.fn(),
  }),
}));

function journalEvent(
  id: number,
  values: Pick<
    WorkshopHistoryEvent,
    'created_at' | 'event_type' | 'line_number' | 'machine_id' | 'first_name' | 'last_name' | 'role'
  >
): WorkshopHistoryEvent {
  return {
    id,
    incident_id: id,
    line_id: id,
    robot_label: `R-${id}`,
    head_number: id,
    current_state: 'DEGRADEE',
    current_status: 'OPEN',
    badge_number: `B-${id}`,
    payload: null,
    ...values,
  };
}

const EVENTS: WorkshopHistoryEvent[] = [
  journalEvent(2, {
    created_at: '2026-03-03T08:00:00.000Z',
    event_type: 'INCIDENT_CREATED',
    line_number: '010',
    machine_id: 'M-B',
    first_name: 'Alice',
    last_name: 'Alpha',
    role: 'OPERATOR',
  }),
  journalEvent(1, {
    created_at: '2026-03-02T08:00:00.000Z',
    event_type: 'INCIDENT_TAKEN',
    line_number: '030',
    machine_id: 'M-C',
    first_name: 'Zoé',
    last_name: 'Zulu',
    role: 'RESPONSABLE',
  }),
  journalEvent(3, {
    created_at: '2026-03-01T08:00:00.000Z',
    event_type: 'INCIDENT_CLOSED',
    line_number: '020',
    machine_id: 'M-A',
    first_name: 'Marc',
    last_name: 'Mike',
    role: 'MAINTENANCE',
  }),
];

const INCIDENT_LABELS = {
  newest: 'Ligne 010 · M-B',
  middle: 'Ligne 030 · M-C',
  oldest: 'Ligne 020 · M-A',
} as const;

type JournalPage = Awaited<ReturnType<typeof listWorkshopHistoryEvents>>;

let historyEventsResponse: Promise<JournalPage>;
let resolveHistoryEvents: (page: JournalPage) => void;

function incidentOrder(selector: string): string[] {
  const container = document.querySelector<HTMLElement>(selector);
  expect(container).not.toBeNull();
  return Array.from(
    (container as HTMLElement).querySelectorAll<HTMLButtonElement>('button.inline-link-button')
  )
    .map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

function expectDesktopAndMobileOrder(expected: string[]): void {
  expect(incidentOrder('.history-journal-table')).toEqual(expected);
  expect(incidentOrder('.history-journal-cards')).toEqual(expected);
}

function sortHeader(label: string): HTMLElement {
  return screen.getByRole('columnheader', { name: label });
}

async function renderJournal(): Promise<void> {
  render(
    <MemoryRouter
      initialEntries={['/workshop/journal']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <WorkshopJournalPage />
    </MemoryRouter>
  );

  expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveHistoryEvents({ items: EVENTS, nextCursor: null });
    await historyEventsResponse;
  });

  expectDesktopAndMobileOrder([
    INCIDENT_LABELS.newest,
    INCIDENT_LABELS.middle,
    INCIDENT_LABELS.oldest,
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listWorkshopLines).mockResolvedValue([]);
  historyEventsResponse = new Promise<JournalPage>((resolve) => {
    resolveHistoryEvents = resolve;
  });
  vi.mocked(listWorkshopHistoryEvents).mockReturnValue(historyEventsResponse);
});

describe('WorkshopJournalPage — parité du tri tableau/cartes mobiles', () => {
  it.each([
    [
      'Action',
      [INCIDENT_LABELS.oldest, INCIDENT_LABELS.newest, INCIDENT_LABELS.middle],
      [INCIDENT_LABELS.middle, INCIDENT_LABELS.newest, INCIDENT_LABELS.oldest],
    ],
    [
      'Incident',
      [INCIDENT_LABELS.newest, INCIDENT_LABELS.oldest, INCIDENT_LABELS.middle],
      [INCIDENT_LABELS.middle, INCIDENT_LABELS.oldest, INCIDENT_LABELS.newest],
    ],
    [
      'Acteur',
      [INCIDENT_LABELS.newest, INCIDENT_LABELS.oldest, INCIDENT_LABELS.middle],
      [INCIDENT_LABELS.middle, INCIDENT_LABELS.oldest, INCIDENT_LABELS.newest],
    ],
  ])(
    'applique aux cartes mobiles le tri %s ascendant puis descendant déclenché au clic',
    async (label, ascendingOrder, descendingOrder) => {
      const user = userEvent.setup();
      await renderJournal();
      const button = within(sortHeader(label)).getByRole('button', { name: label });

      await user.click(button);
      expect(sortHeader(label)).toHaveAttribute('aria-sort', 'ascending');
      expectDesktopAndMobileOrder(ascendingOrder);

      await user.click(button);
      expect(sortHeader(label)).toHaveAttribute('aria-sort', 'descending');
      expectDesktopAndMobileOrder(descendingOrder);
    }
  );

  it('applique aux cartes mobiles le tri Date ascendant puis descendant déclenché au clic', async () => {
    const user = userEvent.setup();
    await renderJournal();
    const button = within(sortHeader('Date')).getByRole('button', { name: 'Date' });

    await user.click(button);
    expect(sortHeader('Date')).toHaveAttribute('aria-sort', 'ascending');
    expectDesktopAndMobileOrder([
      INCIDENT_LABELS.oldest,
      INCIDENT_LABELS.middle,
      INCIDENT_LABELS.newest,
    ]);

    await user.click(button);
    expect(sortHeader('Date')).toHaveAttribute('aria-sort', 'descending');
    expectDesktopAndMobileOrder([
      INCIDENT_LABELS.newest,
      INCIDENT_LABELS.middle,
      INCIDENT_LABELS.oldest,
    ]);
  });

  it('expose quatre boutons de tri nommés et un seul aria-sort actif', async () => {
    const user = userEvent.setup();
    await renderJournal();

    for (const label of ['Date', 'Action', 'Incident', 'Acteur']) {
      expect(within(sortHeader(label)).getByRole('button', { name: label })).toBeEnabled();
    }
    expect(sortHeader('Date')).toHaveAttribute('aria-sort', 'descending');
    expect(sortHeader('Action')).toHaveAttribute('aria-sort', 'none');
    expect(sortHeader('Incident')).toHaveAttribute('aria-sort', 'none');
    expect(sortHeader('Acteur')).toHaveAttribute('aria-sort', 'none');

    await user.click(within(sortHeader('Action')).getByRole('button', { name: 'Action' }));

    expect(sortHeader('Date')).toHaveAttribute('aria-sort', 'none');
    expect(sortHeader('Action')).toHaveAttribute('aria-sort', 'ascending');
    expect(sortHeader('Incident')).toHaveAttribute('aria-sort', 'none');
    expect(sortHeader('Acteur')).toHaveAttribute('aria-sort', 'none');
  });
});
