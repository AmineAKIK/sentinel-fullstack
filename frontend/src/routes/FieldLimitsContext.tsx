import React, { createContext, useContext, useState, useEffect } from 'react';
import { FIELD_LIMITS as STATIC_LIMITS } from '../utils/fieldLimits';
import { api } from '../api/client';

type FieldLimits = typeof STATIC_LIMITS;

const FieldLimitsContext = createContext<FieldLimits>(STATIC_LIMITS);

export function FieldLimitsProvider({ children }: { children: React.ReactNode }) {
  const [limits, setLimits] = useState<FieldLimits>(STATIC_LIMITS);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .get<{ fieldLimits: FieldLimits }>('/api/config', controller.signal)
      .then((data) => setLimits(data.fieldLimits))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return <FieldLimitsContext.Provider value={limits}>{children}</FieldLimitsContext.Provider>;
}

export function useFieldLimits(): FieldLimits {
  return useContext(FieldLimitsContext);
}
