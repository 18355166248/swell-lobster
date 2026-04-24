import { useState, useRef } from 'react';
import { Button, Tooltip } from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

type SpeechRecognitionResultLike = {
  transcript?: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type VoiceInputButtonProps = {
  onResult: (text: string) => void;
  disabled?: boolean;
};

// 检测浏览器是否支持 Web Speech API
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
        .webkitSpeechRecognition)
    : undefined;

export function VoiceInputButton({ onResult, disabled }: VoiceInputButtonProps) {
  const { t } = useTranslation();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // 不支持时不渲染
  if (!SpeechRecognitionAPI) return null;

  const start = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: SpeechRecognitionEventLike) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) onResult(transcript);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <Tooltip title={listening ? t('chat.voiceListening') : t('chat.voiceInput')}>
      <Button
        type="text"
        icon={<AudioOutlined className={listening ? 'text-red-500 animate-pulse' : undefined} />}
        onClick={start}
        disabled={disabled}
        size="small"
      />
    </Tooltip>
  );
}
