import { useState } from 'react';
import { apiPost } from '../../api/base';

type Message = { role: 'user' | 'assistant'; content: string };

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-stone-200">
        <h1 className="text-xl font-bold text-stone-800">聊天</h1>
        <p className="text-sm text-stone-600">与 AI 助手对话</p>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-stone-500 text-sm">
            输入消息开始对话（当前为占位，需配置 LLM 后接入 Agent）
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {error && <div className="px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
      </div>
      <div className="p-4 border-t border-stone-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="输入消息... (Enter 发送)"
            className="flex-1 px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '发送中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
