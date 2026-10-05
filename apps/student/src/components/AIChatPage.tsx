import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, MessageSquare, Lightbulb } from 'lucide-react';
import { useLanguage, MathText } from '@baiqautest/shared';
import { chatWithAI } from '@baiqautest/shared';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIChatPage() {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Add welcome message
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: t('aiWelcome'),
        timestamp: new Date(),
      }]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggestions = [
    t('aiSuggestion1'),
    t('aiSuggestion2'),
    t('aiSuggestion3'),
    t('aiSuggestion4'),
  ];

  async function handleSend(text?: string) {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const allMessages = [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await chatWithAI(allMessages, language);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('aiError'),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  // Simple markdown renderer
  function renderMarkdown(text: string) {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let listItems: string[] = [];

    function flushList() {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} style={{ paddingLeft: '1.25rem', margin: '0.5rem 0', listStyleType: 'disc' }}>
            {listItems.map((item, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>{formatInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    }

    function formatInline(text: string) {
      // Bold
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <MathText key={i} text={part} />;
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('- ') || line.startsWith('• ') || /^\d+\.\s/.test(line)) {
        const content = line.replace(/^[-•]\s|^\d+\.\s/, '');
        listItems.push(content);
        continue;
      }

      flushList();

      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={i} style={{ fontWeight: 700, fontSize: '0.95rem', margin: '0.75rem 0 0.25rem' }}>
            {formatInline(line.slice(4))}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} style={{ fontWeight: 700, fontSize: '1.05rem', margin: '0.75rem 0 0.25rem' }}>
            {formatInline(line.slice(3))}
          </h3>
        );
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} style={{ fontWeight: 700, fontSize: '1.15rem', margin: '0.75rem 0 0.25rem' }}>
            {formatInline(line.slice(2))}
          </h2>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={i} style={{ height: '0.5rem' }} />);
      } else {
        elements.push(
          <p key={i} style={{ margin: '0.25rem 0', lineHeight: 1.6 }}>
            {formatInline(line)}
          </p>
        );
      }
    }

    flushList();
    return elements;
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('aiChatTitle')}</h1>
            <p className="text-sm text-gray-500">{t('aiChatSubtitle')}</p>
          </div>
        </div>
      </div>

      {/* Chat messages */}
      <div
        className="flex-1 overflow-y-auto rounded-2xl bg-white border border-gray-100 shadow-sm"
        style={{ minHeight: 0 }}
      >
        <div className="p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                msg.role === 'user'
                  ? 'bg-[#2563eb]'
                  : 'bg-gradient-to-br from-violet-500 to-indigo-600'
              }`}>
                {msg.role === 'user'
                  ? <User className="w-5 h-5 text-white" />
                  : <Bot className="w-5 h-5 text-white" />
                }
              </div>

              {/* Message bubble */}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#2563eb] text-white rounded-tr-md'
                    : 'bg-gray-50 text-gray-800 rounded-tl-md border border-gray-100'
                }`} style={{ textAlign: 'left' }}>
                  {msg.role === 'assistant'
                    ? renderMarkdown(msg.content)
                    : msg.content
                  }
                </div>
                <p className="text-xs text-gray-400 mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString(language === 'kz' ? 'kk-KZ' : 'ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-md border border-gray-100 px-4 py-3.5">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full bg-gray-400 typing-dot"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggestion chips — only show when few messages */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSend(suggestion)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-all disabled:opacity-50"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 mt-3">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 flex items-end gap-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
          <div className="flex items-center px-2 pb-1 text-gray-400">
            <MessageSquare className="w-5 h-5" />
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={t('aiPlaceholder')}
            rows={1}
            disabled={loading}
            className="flex-1 resize-none border-0 outline-none text-sm text-gray-800 placeholder-gray-400 py-2 bg-transparent disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              input.trim() && !loading
                ? 'bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-200 hover:shadow-lg hover:scale-105'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : <Send className="w-5 h-5" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
