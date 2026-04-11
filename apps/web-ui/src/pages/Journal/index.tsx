import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Typography } from 'antd';
import dayjs from 'dayjs';
import { JournalTab } from './components/JournalTab';
import { LogsTab } from './components/LogsTab';

export function JournalPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);

  const handleDateChange = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-4">
        <Typography.Title level={4} className="!mb-0">
          {t('journal.title')}
        </Typography.Title>
      </div>

      <Tabs
        defaultActiveKey="diary"
        className="flex-1 min-h-0"
        items={[
          {
            key: 'diary',
            label: t('journal.tabDiary'),
            children: <JournalTab year={year} month={month} onDateChange={handleDateChange} />,
          },
          {
            key: 'logs',
            label: t('journal.tabLogs'),
            children: <LogsTab />,
          },
        ]}
      />
    </div>
  );
}
