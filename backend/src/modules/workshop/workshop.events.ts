import pool from '../../db/pool';

export async function logIncidentEvent(
  incidentId: number,
  actorUserId: number | null,
  eventType: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO workshop_incident_events (incident_id, actor_user_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [incidentId, actorUserId, eventType, payload ? JSON.stringify(payload) : null]
  );
}
