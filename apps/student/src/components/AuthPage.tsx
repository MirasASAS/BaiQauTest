import { useState } from 'react';
import { Mail, Lock, User, Phone, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { LanguageSwitcher } from '@baiqautest/shared';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signUp } = useAuth();
  const { t } = useLanguage();

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    middle_name: '',
    phone: '',
    gender: '' as 'male' | 'female' | '',
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error } = await signIn(loginData.email, loginData.password);
    if (error) setError('Неверный email или пароль');
    setLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (registerData.password !== registerData.confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (registerData.password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    if (!registerData.first_name || !registerData.last_name) {
      setError('Заполните обязательные поля');
      return;
    }

    setLoading(true);
    const { error } = await signUp(registerData.email, registerData.password, {
      first_name: registerData.first_name,
      last_name: registerData.last_name,
      middle_name: registerData.middle_name || null,
      phone: registerData.phone || null,
      gender: registerData.gender || null,
    });
    if (error) setError(error.message || 'Ошибка регистрации');
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-[#1e3a8a] px-8 py-8 text-center relative">
            <div className="absolute top-4 right-4">
              <LanguageSwitcher />
            </div>
            <div className="inline-flex items-center justify-center w-20 h-20 bg-[#2563eb] rounded-2xl mb-4 shadow-lg">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">BaiQAUTest</h1>
            <p className="text-blue-200 text-sm mt-1">{t('appSubtitle')}</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-4 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'text-[#2563eb] border-b-2 border-[#2563eb] bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('login')}
            </button>
            <button
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-4 text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'text-[#2563eb] border-b-2 border-[#2563eb] bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('register')}
            </button>
          </div>

          {/* Form */}
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={loginData.email}
                      onChange={e => setLoginData({ ...loginData, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('password')}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="password"
                      required
                      value={loginData.password}
                      onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder={t('password')}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? '...' : t('loginButton')}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('firstName')} *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={registerData.first_name}
                        onChange={e => setRegisterData({ ...registerData, first_name: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                        placeholder={t('firstName')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('lastName')} *</label>
                    <input
                      type="text"
                      required
                      value={registerData.last_name}
                      onChange={e => setRegisterData({ ...registerData, last_name: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder={t('lastName')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('middleName')}</label>
                  <input
                    type="text"
                    value={registerData.middle_name}
                    onChange={e => setRegisterData({ ...registerData, middle_name: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                    placeholder={t('middleName')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('email')} *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={registerData.email}
                      onChange={e => setRegisterData({ ...registerData, email: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('phone')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={registerData.phone}
                      onChange={e => setRegisterData({ ...registerData, phone: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder="+7 (777) 123-45-67"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('gender')}</label>
                  <select
                    value={registerData.gender}
                    onChange={e => setRegisterData({ ...registerData, gender: e.target.value as 'male' | 'female' | '' })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                  >
                    <option value="">{t('gender')}</option>
                    <option value="male">{t('male')}</option>
                    <option value="female">{t('female')}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('password')} *</label>
                    <input
                      type="password"
                      required
                      value={registerData.password}
                      onChange={e => setRegisterData({ ...registerData, password: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder="6+"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('confirmPassword')} *</label>
                    <input
                      type="password"
                      required
                      value={registerData.confirmPassword}
                      onChange={e => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder={t('confirmPassword')}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? '...' : t('registerButton')}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
