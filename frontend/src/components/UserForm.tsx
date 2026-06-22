import { Role } from '../types';
import { ROLE_LABELS } from '../utils/labels';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import SelectField from './ui/SelectField';

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

const ROLES: { value: Role; label: string }[] = Object.entries(ROLE_LABELS).map(
  ([value, label]) => ({ value: value as Role, label })
);

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
          maxLength={FIELD_LIMITS.NAME}
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
          maxLength={FIELD_LIMITS.NAME}
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
          maxLength={FIELD_LIMITS.BADGE}
        />
        {badgeError && <div className="field-error">{badgeError}</div>}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="role">Rôle *</label>
        <SelectField
          id="role"
          value={data.role}
          onChange={(value) => handleChange('role', value)}
          disabled={disabled}
          ariaLabel="Rôle"
          options={[
            { value: '', label: '-- Sélectionner un rôle --' },
            ...ROLES.map((role) => ({ value: role.value, label: role.label })),
          ]}
        />
      </div>
      {showStatus && (
        <div className="form-group">
          <fieldset className="radio-fieldset">
            <legend className="form-label">Statut *</legend>
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
          </fieldset>
        </div>
      )}
    </>
  );
}
