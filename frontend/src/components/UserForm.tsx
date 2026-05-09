import { Role } from '../types';

export interface UserFormData {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  role: Role | '';
  isActive?: boolean;
}

interface UserFormProps {
  data: UserFormData;
  onChange: (data: UserFormData) => void;
  disabled?: boolean;
  showStatus?: boolean;
  badgeError?: string;
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'OPERATOR', label: 'Opérateur' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'RESPONSABLE', label: 'Responsable' },
];

export default function UserForm({
  data,
  onChange,
  disabled,
  showStatus,
  badgeError,
}: UserFormProps) {
  function handleChange(field: keyof UserFormData, value: string | boolean) {
    onChange({ ...data, [field]: value });
  }

  return (
    <>
      <div className="form-group">
        <label className="form-label" htmlFor="lastName">Nom *</label>
        <input
          id="lastName"
          className="form-input"
          type="text"
          value={data.lastName}
          onChange={(e) => handleChange('lastName', e.target.value)}
          disabled={disabled}
          placeholder="Dupont"
          autoComplete="family-name"
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="firstName">Prénom *</label>
        <input
          id="firstName"
          className="form-input"
          type="text"
          value={data.firstName}
          onChange={(e) => handleChange('firstName', e.target.value)}
          disabled={disabled}
          placeholder="Jean"
          autoComplete="given-name"
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="badgeNumber">Numéro de badge *</label>
        <input
          id="badgeNumber"
          className="form-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={data.badgeNumber}
          onChange={(e) => handleChange('badgeNumber', e.target.value.replace(/\D/g, ''))}
          disabled={disabled}
          placeholder="0001"
          maxLength={40}
        />
        {badgeError && <div className="field-error">{badgeError}</div>}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="role">Rôle *</label>
        <select
          id="role"
          className="form-select"
          value={data.role}
          onChange={(e) => handleChange('role', e.target.value)}
          disabled={disabled}
        >
          <option value="">-- Sélectionner un rôle --</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      {showStatus && (
        <div className="form-group">
          <span className="form-label">Statut *</span>
          <div className="radio-group">
            <label className="radio-row">
              <input
                type="radio"
                name="userStatus"
                checked={data.isActive === true}
                onChange={() => handleChange('isActive', true)}
                disabled={disabled}
              />
              Actif
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="userStatus"
                checked={data.isActive === false}
                onChange={() => handleChange('isActive', false)}
                disabled={disabled}
              />
              Inactif
            </label>
          </div>
        </div>
      )}
    </>
  );
}
