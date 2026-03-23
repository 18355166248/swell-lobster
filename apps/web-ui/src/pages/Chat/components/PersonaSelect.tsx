import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { fetchPersonas, updateSession } from '../api';
import type { PersonaInfo } from '../types';

interface Props {
  sessionId: string;
  value?: string | null;
  onUpdate: (personaPath: string | null) => void;
}

export function PersonaSelect({ sessionId, value, onUpdate }: Props) {
  const { t } = useTranslation();
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);

  useEffect(() => {
    fetchPersonas()
      .then(setPersonas)
      .catch(() => {});
  }, []);

  const handleChange = async (val: string | undefined) => {
    const personaPath = val ?? null;
    try {
      await updateSession(sessionId, { persona_path: personaPath });
      onUpdate(personaPath);
    } catch {
      // ignore
    }
  };

  return (
    <Select
      size="middle"
      value={value ?? undefined}
      placeholder={t('persona.select')}
      allowClear
      options={personas.map((p) => ({
        value: p.path,
        label: p.name,
        title: p.description,
      }))}
      onChange={handleChange}
      className="w-36"
      notFoundContent={t('persona.noPersonas')}
    />
  );
}
