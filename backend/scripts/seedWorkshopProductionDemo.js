require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const shifts = ['MATIN', 'APRES_MIDI', 'NUIT', 'WEEKEND'];
const states = ['SKIPEE_PAR_MACHINE', 'SKIPEE_PAR_CONDUCTEUR', 'DEGRADEE', 'INDISPONIBLE'];
const products = [
  'Ref A12', 'Ref B07', 'Ref C03', 'Ref D20', 'Ref E02',
  'Ref F11', 'Ref G05', 'Ref H30', 'Ref J14', 'Ref L09',
  'Ref M22', 'Ref P18', 'Ref R44', 'Ref T31', 'Ref X08',
];
const commentsByState = {
  SKIPEE_PAR_MACHINE: [
    'Cycle saute par intermittence sur la même tête.',
    'Skip machine après changement de bobine.',
    'Défaut de prise produit détecté au contrôle.',
  ],
  SKIPEE_PAR_CONDUCTEUR: [
    'Signalement conducteur après dérive de cadence.',
    'Conducteur signale un comportement irrégulier.',
    'Skip déclaré après contrôle visuel du poste.',
  ],
  DEGRADEE: [
    'Production possible mais qualité instable.',
    'Ralentissement machine et micro-arrêts répétés.',
    'Dégradation progressive constatée sur plusieurs cycles.',
  ],
  INDISPONIBLE: [
    'Machine arrêtée, redémarrage impossible.',
    'Poste indisponible après défaut sécurité.',
    'Blocage complet sur la séquence robot.',
  ],
};
const diagnostics = [
  'Contrôle connectique et test de relance effectués.',
  'Vérification capteur, nettoyage zone et essai cycle.',
  'Contrôle mécanique réalisé, défaut reproduit partiellement.',
  'Analyse maintenance : dérive liée au réglage tête.',
  'Diagnostic confirmé après comparaison avec poste voisin.',
];
const interventions = [
  'Nettoyage complet, recalage tête et validation sur trois cycles.',
  'Remplacement capteur, test production conforme.',
  'Réglage robot et contrôle produit validé avec le responsable.',
  'Reprise paramétrage machine et surveillance renforcée.',
  'Déblocage mécanique, graissage et redémarrage contrôlé.',
  'Remplacement consommable, défaut non reproduit après essai.',
];
const responsibleComments = [
  'À surveiller au prochain changement de série.',
  'Prioriser si le défaut revient sur le même produit.',
  'Tracer tout nouveau symptôme avant relance.',
  'Informer le chef de ligne si répétition sur le poste.',
  'Contrôle qualité demandé en sortie de ligne.',
];

function daysAgo(days, hour = 8, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function pick(items, index) {
  return items[index % items.length];
}

function normalizeMachines(machineSequence) {
  const raw = Array.isArray(machineSequence) ? machineSequence : [];
  return raw.flatMap((machine) => {
    if (machine.hasDoubleRobot) {
      return [
        {
          machineId: machine.machineId,
          brand: machine.brand || 'Marque non renseignée',
          robotLabel: `Gauche ${machine.leftRobotNumber || 1}`,
          heads: Number(machine.leftRobotHeads || 1),
        },
        {
          machineId: machine.machineId,
          brand: machine.brand || 'Marque non renseignée',
          robotLabel: `Droite ${machine.rightRobotNumber || 2}`,
          heads: Number(machine.rightRobotHeads || 1),
        },
      ];
    }
    return [{
      machineId: machine.machineId,
      brand: machine.brand || 'Marque non renseignée',
      robotLabel: String(machine.robotNumber || '1'),
      heads: Number(machine.robotHeads || 1),
    }];
  }).filter((machine) => machine.machineId && machine.heads > 0);
}

async function insertEvent(client, incidentId, actorId, eventType, payload, createdAt) {
  await client.query(
    `INSERT INTO workshop_incident_events (incident_id, actor_user_id, event_type, payload, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [incidentId, actorId, eventType, JSON.stringify(payload || {}), createdAt]
  );
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: users } = await client.query(
      `SELECT id, first_name, last_name, role
       FROM sentinel_users
       WHERE is_deleted = FALSE AND is_active = TRUE
       ORDER BY id`
    );
    const { rows: lines } = await client.query(
      `SELECT id, line_number, machine_sequence
       FROM production_lines
       WHERE is_deleted = FALSE AND is_active = TRUE
       ORDER BY line_number`
    );

    const operators = users.filter((user) => user.role === 'OPERATOR');
    const maintenances = users.filter((user) => user.role === 'MAINTENANCE');
    const responsables = users.filter((user) => user.role === 'RESPONSABLE');

    if (operators.length === 0 || maintenances.length === 0 || responsables.length === 0) {
      throw new Error('Seed impossible : il faut au moins un utilisateur actif OPERATOR, MAINTENANCE et RESPONSABLE.');
    }

    const lineRefs = lines.map((line) => ({
      ...line,
      machines: normalizeMachines(line.machine_sequence),
    })).filter((line) => line.machines.length > 0);

    if (lineRefs.length === 0) {
      throw new Error('Seed impossible : aucune ligne active avec machines référencées.');
    }

    await client.query('DELETE FROM workshop_incident_events');
    await client.query('DELETE FROM workshop_incidents');
    await client.query('ALTER SEQUENCE workshop_incidents_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE workshop_incident_events_id_seq RESTART WITH 1');

    let closedCount = 0;
    let pendingCount = 0;
    let canceledCount = 0;
    let openCount = 0;
    let priorityCount = 0;

    for (let index = 0; index < 50; index += 1) {
      const line = pick(lineRefs, index);
      const machine = pick(line.machines, index + Math.floor(index / 3));
      const operator = pick(operators, index);
      const maintenance = pick(maintenances, index + 1);
      const responsable = pick(responsables, index + 2);
      const state = pick(states, index);
      const createdAt = daysAgo(index % 16, 5 + (index % 14), (index * 7) % 60);
      const isClosed = index < 18;
      const isPending = index >= 18 && index < 28;
      const isCanceled = index >= 28 && index < 34;
      const status = isClosed ? 'CLOSED' : isPending ? 'PENDING' : isCanceled ? 'CANCELED' : 'OPEN';
      const isTaken = isClosed || isPending || (index % 4 === 0) || (index % 7 === 0);
      const takenAt = isTaken ? addMinutes(createdAt, 20 + (index % 9) * 17) : null;
      const closedAt = isClosed ? addMinutes(createdAt, 180 + (index % 8) * 65) : null;
      const canceledAt = isCanceled ? addMinutes(createdAt, 35 + (index % 5) * 20) : null;
      const updatedAt = closedAt || canceledAt || (isPending ? addMinutes(createdAt, 210 + (index % 4) * 45) : addMinutes(createdAt, 30));
      const isPriority = [2, 5, 7, 12, 18, 21, 34, 37, 41, 46].includes(index);
      const deleteRequest = status === 'OPEN' && [35, 43].includes(index);
      const editRequest = status === 'OPEN' && [36, 44].includes(index)
        ? {
            shift: pick(shifts, index + 1),
            currentProduct: `${pick(products, index)} corrigée`,
            comment: 'Correction demandée par l’opérateur après relecture du signalement.',
          }
        : null;
      const diagnostic = isPending || isClosed
        ? pick(diagnostics, index)
        : null;
      const interventionNote = isClosed
        ? pick(interventions, index)
        : null;
      const responsibleComment = (isPriority || index % 6 === 0)
        ? pick(responsibleComments, index)
        : null;
      const headNumber = 1 + (index % machine.heads);
      const displayOrder = status === 'OPEN' || status === 'PENDING' ? 1000 - index * 10 : 0;

      if (status === 'OPEN') openCount += 1;
      if (status === 'PENDING') pendingCount += 1;
      if (status === 'CLOSED') closedCount += 1;
      if (status === 'CANCELED') canceledCount += 1;
      if (isPriority) priorityCount += 1;

      const { rows } = await client.query(
        `INSERT INTO workshop_incidents (
          user_id, shift, line_id, line_number, machine_id, machine_brand,
          robot_label, head_number, state, comment, current_product,
          is_taken, is_priority, updated_at, status, diagnostic, intervention_note,
          responsible_comment, edit_request, delete_request, delete_request_reason,
          taken_by_user_id, taken_at, display_order, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24, $25
        )
        RETURNING id`,
        [
          operator.id,
          pick(shifts, index),
          line.id,
          line.line_number,
          machine.machineId,
          machine.brand,
          machine.robotLabel,
          headNumber,
          state,
          pick(commentsByState[state], index),
          pick(products, index),
          isTaken,
          isPriority,
          updatedAt,
          status,
          diagnostic,
          interventionNote,
          responsibleComment,
          editRequest ? JSON.stringify(editRequest) : null,
          deleteRequest,
          deleteRequest ? 'Doublon probable avec un signalement déjà actif.' : null,
          isTaken ? maintenance.id : null,
          takenAt,
          displayOrder,
          createdAt,
        ]
      );

      const incidentId = rows[0].id;
      await insertEvent(client, incidentId, operator.id, 'INCIDENT_CREATED', {
        state,
        lineNumber: line.line_number,
        machineId: machine.machineId,
        currentProduct: pick(products, index),
      }, createdAt);

      if (isPriority) {
        await insertEvent(client, incidentId, responsable.id, 'PRIORITY_CHANGED', {
          from: false,
          to: true,
        }, addMinutes(createdAt, 12));
      }

      if (responsibleComment) {
        await insertEvent(client, incidentId, responsable.id, 'RESPONSIBLE_COMMENT_UPDATED', {
          responsibleComment,
        }, addMinutes(createdAt, 18));
      }

      if (isTaken && takenAt) {
        await insertEvent(client, incidentId, maintenance.id, 'TAKEN_CHANGED', {
          isTaken: true,
          by: `${maintenance.first_name} ${maintenance.last_name}`.trim(),
        }, takenAt);
      }

      if (editRequest) {
        await insertEvent(client, incidentId, operator.id, 'EDIT_REQUESTED', editRequest, addMinutes(createdAt, 28));
      }

      if (deleteRequest) {
        await insertEvent(client, incidentId, operator.id, 'DELETE_REQUESTED', {
          reason: 'Doublon probable avec un signalement déjà actif.',
        }, addMinutes(createdAt, 30));
      }

      if (isPending) {
        await insertEvent(client, incidentId, maintenance.id, 'STATUS_CHANGED', {
          from: 'OPEN',
          to: 'PENDING',
          diagnostic,
        }, updatedAt);
      }

      if (isClosed && closedAt) {
        await insertEvent(client, incidentId, maintenance.id, 'STATUS_CHANGED', {
          from: 'OPEN',
          to: 'CLOSED',
          diagnostic,
          interventionNote,
        }, closedAt);
      }

      if (isCanceled && canceledAt) {
        await insertEvent(client, incidentId, responsable.id, 'STATUS_CHANGED', {
          from: 'OPEN',
          to: 'CANCELED',
          reason: 'Signalement invalidé : erreur de saisie ou doublon confirmé.',
        }, canceledAt);
      }
    }

    await client.query('COMMIT');
    console.log('Seed atelier production terminé.');
    console.table([{ total: 50, open: openCount, pending: pendingCount, closed: closedCount, canceled: canceledCount, priority: priorityCount }]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
