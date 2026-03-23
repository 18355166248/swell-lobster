import { RobotOutlined } from '@ant-design/icons';
import { Avatar } from 'antd';
import { useTranslation } from 'react-i18next';

const DOT_DELAYS = ['0ms', '160ms', '320ms'];

export function LoadingBubble() {
  const { t } = useTranslation();
  return (
    <>
      <style>{`
        @keyframes typingWave {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
      <div className="flex items-start gap-3 justify-start">
        <Avatar size="small" icon={<RobotOutlined />} className="shrink-0" />
        <div className="bg-muted rounded-lg rounded-bl-none px-4 py-3">
          <div className="flex items-center gap-1.5">
            {DOT_DELAYS.map((delay) => (
              <span
                key={delay}
                className="block w-1.5 h-1.5 bg-muted-foreground rounded-full"
                style={{ animation: `typingWave 1.2s ease-in-out infinite`, animationDelay: delay }}
              />
            ))}
            <span className="ml-1 text-muted-foreground text-xs">{t('chat.thinking')}</span>
          </div>
        </div>
      </div>
    </>
  );
}
