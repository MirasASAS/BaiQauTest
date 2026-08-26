import { useState } from 'react';
import { useAuth, LanguageSwitcher } from '@baiqautest/shared';

export default function AdminAuthPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    if (err) setError('Неверный email или пароль');
    setLoading(false);
  };

  return (
    <div
      style={{
        fontFamily: 'system-ui',
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg,#f1f5f9,#e2e8f0)',
        padding: 16,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 10px 30px rgba(0,0,0,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>BaiQAUTest — Админ</h1>
          <LanguageSwitcher />
        </div>
        <p style={{ color: '#64748b', marginTop: 0 }}>Вход в панель управления</p>

        {error && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <input
            type="email"
            required
            placeholder="email@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#f8fafc' }}
          />
          <input
            type="password"
            required
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#f8fafc' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff',
              fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}