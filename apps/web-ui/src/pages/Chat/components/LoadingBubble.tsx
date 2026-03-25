import { useTranslation } from 'react-i18next';

const DOT_DELAYS = ['0ms', '120ms', '240ms'];

export function LoadingBubble() {
  const { t } = useTranslation();
  return (
    <>
      <style>{`
        @keyframes typingWave {
          0%, 70%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.35;
          }
          35% {
            transform: translateY(-8px) scale(1.2);
            opacity: 1;
          }
        }
      `}</style>
      <div className="w-full min-w-0 flex items-center gap-2.5 py-1.5">
        <div className="flex items-center gap-2 text-accent" aria-hidden>
          {DOT_DELAYS.map((delay) => (
            <span
              key={delay}
              className="block size-2 shrink-0 rounded-full bg-current will-change-transform"
              style={{
                animation: `typingWave 0.95s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`,
                animationDelay: delay,
              }}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{t('chat.thinking')}</span>
      </div>
    </>
  );
}
