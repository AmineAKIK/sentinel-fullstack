import { act, renderHook, waitFor } from '@testing-library/react';
import { getIncidentMetrics, listWorkshopIncidents, listWorkshopLines } from '../../api/workshop';
import { ProductionLine, WorkshopIncident, WorkshopIncidentMetrics } from '../../types';
import { useIncidentsData } from '../useIncidentsData';

vi.mock('../../api/workshop', () => ({
  getIncidentMetrics: vi.fn(),
  listWorkshopIncidents: vi.fn(),
  listWorkshopLines: vi.fn(),
}));

const line: ProductionLine = {
  id: 1,
  line_number: '117',
  machines: [],
  is_active: true,
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-01T10:00:00.000Z',
};
const metrics: WorkshopIncidentMetrics = {
  total: 2,
  open: 2,
  pending: 0,
  priority: 1,
  taken: 0,
  not_taken: 2,
  open_over_7d: 0,
  closed_today: 0,
  followed: 0,
  followed_resolved: 0,
  arbitration_unread: 0,
};

function incident(id: number, priority: boolean): WorkshopIncident {
  return {
    id,
    is_priority: priority,
    display_order: 0,
    is_taken: false,
    created_at: `2026-07-${String(id).padStart(2, '0')}T10:00:00.000Z`,
  } as WorkshopIncident;
}

function mockSuccessfulDashboard(incidents = [incident(1, false), incident(2, true)]): void {
  vi.mocked(listWorkshopLines).mockResolvedValue([line]);
  vi.mocked(listWorkshopIncidents).mockResolvedValue(incidents);
  vi.mocked(getIncidentMetrics).mockResolvedValue(metrics);
}

describe('useIncidentsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes one coherent dashboard snapshot and sorts incidents', async () => {
    mockSuccessfulDashboard();
    const { result } = renderHook(() => useIncidentsData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lines).toEqual([line]);
    expect(result.current.incidents.map(({ id }) => id)).toEqual([2, 1]);
    expect(result.current.metrics).toEqual(metrics);
    expect(result.current.error).toBe('');
    expect(vi.mocked(listWorkshopLines).mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it('keeps the last valid snapshot when a refresh fails', async () => {
    mockSuccessfulDashboard();
    const { result } = renderHook(() => useIncidentsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listWorkshopLines).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(listWorkshopIncidents).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(getIncidentMetrics).mockRejectedValueOnce(new Error('offline'));

    await act(() => result.current.refreshData());

    expect(result.current.incidents.map(({ id }) => id)).toEqual([2, 1]);
    expect(result.current.metrics).toEqual(metrics);
    expect(result.current.error).toBe('Impossible de charger le tableau de bord.');
  });

  it('aborts in-flight dashboard requests when the screen unmounts', () => {
    let requestSignal: AbortSignal | undefined;
    vi.mocked(listWorkshopLines).mockImplementation((signal) => {
      requestSignal = signal;
      return new Promise<ProductionLine[]>(() => {});
    });
    vi.mocked(listWorkshopIncidents).mockImplementation(
      () => new Promise<WorkshopIncident[]>(() => {})
    );
    vi.mocked(getIncidentMetrics).mockImplementation(
      () => new Promise<WorkshopIncidentMetrics>(() => {})
    );
    const { unmount } = renderHook(() => useIncidentsData());

    expect(requestSignal?.aborted).toBe(false);
    unmount();
    expect(requestSignal?.aborted).toBe(true);
  });
});
