import { useState } from 'react';
import NavBar from './NavBar';
import EditLineModal from './EditLineModal';
import ArchiveLineConfirmModal from './ArchiveLineConfirmModal';
import EditMachineModal from './EditMachineModal';
import LinePlanModal from './LinePlanModal';
import DetailField from './ui/DetailField';
import ErrorBanner from './ui/ErrorBanner';
import { LineMachine, ProductionLine } from '../types';
import { formatDate } from '../utils/date';

interface LineDetailViewProps {
  line: ProductionLine;
  successMsg: string;
  error: string;
  onBack: () => void;
  onLineUpdated: (updated: ProductionLine, message: string) => void;
  onLineDeleted: (line: ProductionLine) => void;
}

function robotLabel(machine: LineMachine): string {
  if (machine.hasDoubleRobot) {
    return `Gauche ${machine.leftRobotNumber} (${machine.leftRobotHeads} têtes) / Droite ${machine.rightRobotNumber} (${machine.rightRobotHeads} têtes)`;
  }
  return `${machine.robotNumber} (${machine.robotHeads} têtes)`;
}

export default function LineDetailView({
  line,
  successMsg,
  error,
  onBack,
  onLineUpdated,
  onLineDeleted,
}: LineDetailViewProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [editMachineIndex, setEditMachineIndex] = useState<number | null>(null);

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <button className="back-link" onClick={onBack}>
          Retour à la liste
        </button>

        <div className="page-header">
          <h1>Ligne {line.line_number}</h1>
          <div className="action-bar" style={{ marginTop: 0 }}>
            <button className="btn btn-outline" onClick={() => setShowPlan(true)}>Plan de la ligne</button>
            <button className="btn btn-outline" onClick={() => setShowEdit(true)}>Modifier</button>
            <button className="btn btn-danger" onClick={() => setShowDelete(true)}>Supprimer</button>
          </div>
        </div>

        {successMsg && <div className="success-message" style={{ marginBottom: 16 }}>{successMsg}</div>}
        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <div className="card">
          <div className="card-body">
            <div className="detail-grid" style={{ marginBottom: 20 }}>
              <DetailField label="Numéro de ligne">{line.line_number}</DetailField>
              <DetailField label="Machines">{line.machines.length}</DetailField>
              <DetailField label="Statut">
                <span className={`badge-status ${line.is_active ? 'active' : 'inactive'}`}>
                  {line.is_active ? 'Actif' : 'Inactif'}
                </span>
              </DetailField>
              <DetailField label="Date de création">{formatDate(line.created_at)}</DetailField>
            </div>

            <div className="notice" style={{ marginBottom: 16 }}>
              Ordre d'affichage : de la SPI vers le four.
            </div>

            <div className="line-detail-list">
              {line.machines.map((machine, index) => (
                <div
                  className="line-detail-item"
                  key={`${machine.machineId}-${index}`}
                  onClick={() => setEditMachineIndex(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditMachineIndex(index); } }}
                >
                  <span className="line-detail-order">{index + 1}</span>
                  <div>
                    <strong>{machine.machineId}</strong>
                    <div className="line-detail-meta">
                      {machine.brand} · {machine.hasDoubleRobot ? 'Double robot' : 'Robot unique'} · {robotLabel(machine)}
                    </div>
                  </div>
                  <span className="line-detail-edit" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
                    </svg>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {showEdit && (
        <EditLineModal
          line={line}
          onClose={() => setShowEdit(false)}
          onSuccess={(updated) => {
            setShowEdit(false);
            onLineUpdated(updated, `Ligne ${updated.line_number} modifiée avec succès.`);
          }}
        />
      )}
      {showDelete && (
        <ArchiveLineConfirmModal
          line={line}
          onClose={() => setShowDelete(false)}
          onSuccess={() => {
            setShowDelete(false);
            onLineDeleted(line);
          }}
        />
      )}
      {showPlan && (
        <LinePlanModal
          line={line}
          onClose={() => setShowPlan(false)}
          onSuccess={(updated) => {
            setShowPlan(false);
            onLineUpdated(updated, 'Ordre des machines mis à jour.');
          }}
        />
      )}
      {editMachineIndex !== null && (
        <EditMachineModal
          line={line}
          machineIndex={editMachineIndex}
          onClose={() => setEditMachineIndex(null)}
          onSuccess={(updated) => {
            setEditMachineIndex(null);
            onLineUpdated(updated, 'Machine modifiée avec succès.');
          }}
        />
      )}
    </>
  );
}
