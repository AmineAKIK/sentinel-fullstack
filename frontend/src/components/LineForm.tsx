import { useRef } from 'react';
import { LineMachine } from '../types';
import { emptyMachine, switchMachineRobotMode } from '../utils/lineMachines';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import RobotFieldsGroup from './RobotFieldsGroup';

export interface LineFormData {
  lineNumber: string;
  isActive?: boolean;
  machines: LineMachine[];
}

interface LineFormProps {
  data: LineFormData;
  onChange: (data: LineFormData) => void;
  disabled?: boolean;
  showStatus?: boolean;
  lineError?: string;
}

export const EMPTY_LINE_FORM: LineFormData = {
  lineNumber: '',
  machines: [emptyMachine()],
};

export default function LineForm({
  data,
  onChange,
  disabled,
  showStatus,
  lineError,
}: LineFormProps) {
  // Clés stables par position : évite key={index}, qui réattribue mal les
  // inputs lors d'une suppression de machine au milieu de la liste.
  const nextKeyRef = useRef(0);
  const machineKeysRef = useRef<number[]>([]);
  // Complète si des machines ont été ajoutées hors de ce composant (init/édition).
  while (machineKeysRef.current.length < data.machines.length) {
    machineKeysRef.current.push(nextKeyRef.current++);
  }
  machineKeysRef.current.length = data.machines.length;
  const machineKey = (index: number): number => machineKeysRef.current[index];

  function updateMachine(index: number, machine: LineMachine) {
    onChange({
      ...data,
      machines: data.machines.map((item, currentIndex) =>
        currentIndex === index ? machine : item
      ),
    });
  }

  function updateMachineField(index: number, field: string, value: string | number | boolean) {
    const current = data.machines[index];

    if (field === 'hasDoubleRobot') {
      updateMachine(index, switchMachineRobotMode(current, Boolean(value)));
      return;
    }

    updateMachine(index, { ...current, [field]: value });
  }

  function addMachine() {
    if (data.machines.length >= 10) return;
    machineKeysRef.current.push(nextKeyRef.current++);
    onChange({ ...data, machines: [...data.machines, emptyMachine()] });
  }

  function removeMachine(index: number) {
    if (data.machines.length <= 1) return;
    machineKeysRef.current.splice(index, 1);
    onChange({ ...data, machines: data.machines.filter((_, currentIndex) => currentIndex !== index) });
  }


  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor="lineNumber">Numéro de la ligne *</label>
        <input
          id="lineNumber"
          className="form-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={data.lineNumber}
          onChange={(e) => onChange({ ...data, lineNumber: e.target.value.replace(/\D/g, '') })}
          disabled={disabled}
          placeholder=""
          maxLength={FIELD_LIMITS.LINE_NUMBER}
        />
        {lineError && <div className="field-error">{lineError}</div>}
      </div>

      <div className="line-machines-header">
        <span className="form-label">Consigne machines : dans l'ordre de la SPI vers le four *</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={addMachine}
          disabled={disabled || data.machines.length >= 10}
        >
          + Ajouter une machine
        </button>
      </div>

      {showStatus && (
        <div className="form-group">
          <fieldset className="radio-fieldset">
            <legend className="form-label">Statut *</legend>
            <div className="radio-group">
              <label className="radio-row">
                <input
                  type="radio"
                  name="lineStatus"
                  checked={data.isActive === true}
                  onChange={() => onChange({ ...data, isActive: true })}
                  disabled={disabled}
                />
                Actif
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="lineStatus"
                  checked={data.isActive === false}
                  onChange={() => onChange({ ...data, isActive: false })}
                  disabled={disabled}
                />
                Inactif
              </label>
            </div>
          </fieldset>
        </div>
      )}

      <div className="line-machines-list">
        {data.machines.map((machine, index) => (
          <div className="line-machine-card" key={machineKey(index)}>
            <div className="line-machine-title">
              <strong>Machine {index + 1}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeMachine(index)}
                disabled={disabled || data.machines.length <= 1}
              >
                Supprimer
              </button>
            </div>

            <div className="line-machine-grid">
              <div className="form-group">
                <label className="form-label" htmlFor={`machineId-${index}`}>ID machine *</label>
                <input
                  id={`machineId-${index}`}
                  className="form-input"
                  type="text"
                  value={machine.machineId}
                  onChange={(e) => updateMachineField(index, 'machineId', e.target.value)}
                  disabled={disabled}
                  placeholder="MCH-001"
                  maxLength={FIELD_LIMITS.MACHINE_ID}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor={`brand-${index}`}>Marque *</label>
                <input
                  id={`brand-${index}`}
                  className="form-input"
                  type="text"
                  value={machine.brand}
                  onChange={(e) => updateMachineField(index, 'brand', e.target.value)}
                  disabled={disabled}
                  placeholder="Marque"
                  maxLength={FIELD_LIMITS.BRAND}
                />
              </div>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={machine.hasDoubleRobot}
                onChange={(e) => updateMachineField(index, 'hasDoubleRobot', e.target.checked)}
                disabled={disabled}
              />
              Machine à double robot
            </label>

            {machine.hasDoubleRobot ? (
              <div className="line-machine-grid">
                <RobotFieldsGroup
                  side="left"
                  idPrefix={`left-${index}`}
                  robotNumber={machine.leftRobotNumber}
                  robotHeads={machine.leftRobotHeads}
                  disabled={disabled}
                  onChangeNumber={(v) => updateMachineField(index, 'leftRobotNumber', v)}
                  onChangeHeads={(v) => updateMachineField(index, 'leftRobotHeads', v)}
                />
                <RobotFieldsGroup
                  side="right"
                  idPrefix={`right-${index}`}
                  robotNumber={machine.rightRobotNumber}
                  robotHeads={machine.rightRobotHeads}
                  disabled={disabled}
                  onChangeNumber={(v) => updateMachineField(index, 'rightRobotNumber', v)}
                  onChangeHeads={(v) => updateMachineField(index, 'rightRobotHeads', v)}
                />
              </div>
            ) : (
              <div className="line-machine-grid">
                <RobotFieldsGroup
                  side="single"
                  idPrefix={`single-${index}`}
                  robotNumber={machine.robotNumber}
                  robotHeads={machine.robotHeads}
                  disabled={disabled}
                  onChangeNumber={(v) => updateMachineField(index, 'robotNumber', v)}
                  onChangeHeads={(v) => updateMachineField(index, 'robotHeads', v)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
