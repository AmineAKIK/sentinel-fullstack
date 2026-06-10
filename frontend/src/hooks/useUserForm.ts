import { useState } from 'react';
import { checkBadgeAvailability } from '../api/accounts';
import { ApiResponseError } from '../api/client';
import { UserFormData } from '../components/UserForm';

export type UserFormStep = 'form' | 'preview' | 'created';

interface UseUserFormReturn {
  form: UserFormData;
  setForm: (data: UserFormData) => void;
  error: string;
  badgeError: string;
  setBadgeError: (err: string) => void;
  loading: boolean;
  step: UserFormStep;
  setStep: (step: UserFormStep) => void;
  handlePreview: () => Promise<void>;
  handleBack: () => void;
  isDirty: boolean;
}

const EMPTY: UserFormData = { firstName: '', lastName: '', badgeNumber: '', role: '' };

export function useUserForm(): UseUserFormReturn {
  const [form, setForm] = useState<UserFormData>(EMPTY);
  const [error, setError] = useState('');
  const [badgeError, setBadgeError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<UserFormStep>('form');

  async function handlePreview() {
    setError('');
    setBadgeError('');

    const issues: string[] = [];

    if (!form.firstName.trim()) {
      issues.push('Le prénom est obligatoire.');
    } else if (form.firstName.trim().length < 2) {
      issues.push('Le prénom doit contenir au moins 2 caractères.');
    }

    if (!form.lastName.trim()) {
      issues.push('Le nom est obligatoire.');
    } else if (form.lastName.trim().length < 2) {
      issues.push('Le nom doit contenir au moins 2 caractères.');
    }

    if (!form.badgeNumber.trim()) {
      issues.push('Le numéro de badge est obligatoire.');
    } else if (form.badgeNumber.trim().length < 2) {
      issues.push('Le numéro de badge doit contenir au moins 2 caractères.');
    }

    if (!form.role) {
      issues.push('Veuillez sélectionner un rôle.');
    }

    if (issues.length > 1) {
      setError('Merci de compléter les champs obligatoires.');
      return;
    }
    if (issues.length === 1) {
      setError(issues[0]);
      return;
    }

    setLoading(true);
    try {
      const badgeCheck = await checkBadgeAvailability(form.badgeNumber.trim());
      if (badgeCheck.exists) {
        setBadgeError('Ce numéro de badge existe déjà.');
        return;
      }
      setStep('preview');
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError('');
    setBadgeError('');
    setStep('form');
  }

  const isDirty = step === 'form' && (
    form.firstName.trim() !== '' ||
    form.lastName.trim() !== '' ||
    form.badgeNumber.trim() !== '' ||
    form.role !== ''
  );

  return { form, setForm, error, badgeError, setBadgeError, loading, step, setStep, handlePreview, handleBack, isDirty };
}
