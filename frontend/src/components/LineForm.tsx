import { LineMachine } from '../types';
import { emptyMachine, switchMachineRobotMode } from '../utils/lineMachines';

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

    updateMachine(index, { ...current, [field]: value } as LineMachine);
  }

  function addMachine() {
    if (data.machines.length >= 10) return;
    onChange({ ...data, machines: [...data.machines, emptyMachine()] });
  }

  function removeMachine(index: number) {
    if (data.machines.length <= 1) return;
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
          maxLength={40}
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
          <span className="form-label">Statut *</span>
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
        </div>
      )}

      <div className="line-machines-list">
        {data.machines.map((machine, index) => (
          <div className="line-machine-card" key={index}>
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
                <div className="form-group">
                  <label className="form-label" htmlFor={`leftRobotNumber-${index}`}>Robot gauche *</label>
                  <input
                    id={`leftRobotNumber-${index}`}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={machine.leftRobotNumber}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                      updateMachineField(index, 'leftRobotNumber', next);
                    }}
                    disabled={disabled}
                    placeholder=""
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`leftRobotHeads-${index}`}>Nombre de têtes *</label>
                  <input
                    id={`leftRobotHeads-${index}`}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={machine.leftRobotHeads ? String(machine.leftRobotHeads) : ''}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                      updateMachineField(index, 'leftRobotHeads', next === '' ? 0 : Number(next));
                    }}
                    disabled={disabled}
                    placeholder=""
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`rightRobotNumber-${index}`}>Robot droit *</label>
                  <input
                    id={`rightRobotNumber-${index}`}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={machine.rightRobotNumber}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                      updateMachineField(index, 'rightRobotNumber', next);
                    }}
                    disabled={disabled}
                    placeholder=""
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`rightRobotHeads-${index}`}>Nombre de têtes *</label>
                  <input
                    id={`rightRobotHeads-${index}`}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={machine.rightRobotHeads ? String(machine.rightRobotHeads) : ''}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                      updateMachineField(index, 'rightRobotHeads', next === '' ? 0 : Number(next));
                    }}
                    disabled={disabled}
                    placeholder=""
                  />
                </div>
              </div>
            ) : (
              <div className="line-machine-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor={`robotNumber-${index}`}>Numéro de robot *</label>
                  <input
                    id={`robotNumber-${index}`}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={machine.robotNumber}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                      updateMachineField(index, 'robotNumber', next);
                    }}
                    disabled={disabled}
                    placeholder=""
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`robotHeads-${index}`}>Nombre de têtes *</label>
                  <input
                    id={`robotHeads-${index}`}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={machine.robotHeads ? String(machine.robotHeads) : ''}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                      updateMachineField(index, 'robotHeads', next === '' ? 0 : Number(next));
                    }}
                    disabled={disabled}
                    placeholder=""
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
