import { useEffect, useRef, useState } from 'react';
import { Button, Alert } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiPost } from '../../api/base';

type Message = { role: 'user' | 'assistant'; content: string };

export function ChatPage() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ message: string; conversation_id?: string }>('/api/chat', {
        message: text,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.message }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('chat.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in-50 duration-200">
      <div className="px-6 py-4 border-b border-border bg-background/95">
        <h1 className="text-lg font-semibold text-foreground">{t('chat.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('chat.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
              <SendOutlined className="text-accent text-xl" />
            </div>
            <p className="text-muted-foreground text-sm max-w-xs">{t('chat.emptyHint')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-accent text-accent-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        {error && <Alert type="error" message={error} showIcon />}
        <div ref={bottomRef} />
      </div>

      <div className="px-6 py-4 border-t border-border bg-background/95">
        <div className="flex gap-2 items-end">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t('chat.placeholder')}
            className="flex-1 px-3 py-2 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={send}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 h-9 w-9 flex items-center justify-center"
          />
        </div>
      </div>
    </div>
  );
}
