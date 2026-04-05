import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { getGlobalLoadingSnapshot, subscribeGlobalLoading } from '../store/globalLoading';

const SHOW_DELAY_MS = 120;
const MIN_VISIBLE_MS = 240;

export function GlobalLoading() {
  const { t } = useTranslation();
  const isBusy = useSyncExternalStore(subscribeGlobalLoading, getGlobalLoadingSnapshot);
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;

    if (isBusy) {
      timeoutId = window.setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, SHOW_DELAY_MS);
    } else if (visible) {
      const elapsed = shownAtRef.current == null ? 0 : Date.now() - shownAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      timeoutId = window.setTimeout(() => {
        shownAtRef.current = null;
        setVisible(false);
      }, remaining);
    }

    if (!isBusy && !visible) {
      shownAtRef.current = null;
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isBusy, visible]);

  if (!visible) return null;

  return (
    <div className="global-loading-mask" aria-live="polite" aria-busy="true">
      <div className="global-loading-panel">
        <Spin size="large" />
        <span>{t('common.loading')}</span>
      </div>
    </div>
  );
}
