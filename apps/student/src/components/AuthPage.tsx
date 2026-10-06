import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, User, Phone, ArrowRight, Check, Smartphone } from 'lucide-react';
import { useAuth, AccountBlockedError, getAuthProviders } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { LanguageSwitcher } from '@baiqautest/shared';
import type { AuthProviders } from '@baiqautest/shared';

// Номер в формате E.164 для Казахстана: «8 777 123 45 67» и «777 123 45 67» → «+77771234567»
function normalizePhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  return digits.length >= 11 && digits.length <= 15 ? '+' + digits : null;
}

function GoogleIcon() {
  return (
    <span
      aria-hidden="true"
      className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[13px] font-bold leading-none text-[#4285F4]"
    >
      G
    </span>
  );
}

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const { signIn, signUp, resetPassword, signInWithGoogle, sendPhoneCode, verifyPhoneCode, blocked } = useAuth();
  const { t } = useLanguage();
  const { t: tRet } = useTranslation('retention');
  // Кнопки показываются только для способов входа, включённых в проекте Supabase
  const [providers, setProviders] = useState<AuthProviders>({ google: false, phone: false });
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  // номер, на который отправлен код; null — код ещё не запрашивали
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAuthProviders().then(p => { if (active) setProviders(p); });
    return () => { active = false; };
  }, []);

  async function handleGoogle() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const { error } = await signInWithGoogle();
    // при успехе браузер уходит на страницу Google, сюда попадаем только при ошибке
    if (error) {
      setError(tRet('googleError'));
      setLoading(false);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError(tRet('phoneInvalid'));
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await sendPhoneCode(normalized);
    if (error) setError(tRet('phoneSendError'));
    else setCodeSentTo(normalized);
    setLoading(false);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !codeSentTo) return;
    setLoading(true);
    setError(null);
    const { error } = await verifyPhoneCode(codeSentTo, phoneCode.trim());
    if (error) setError(tRet('phoneCodeError'));
    setLoading(false);
  }

  function leavePhoneMode() {
    setPhoneMode(false);
    setCodeSentTo(null);
    setPhoneCode('');
    setError(null);
  }

  const socialButtons = (providers.google || providers.phone) && (
    <div className="mt-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 uppercase">{tRet('or')}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <div className="space-y-2.5">
        {providers.google && (
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {tRet('continueWithGoogle')}
          </button>
        )}
        {providers.phone && (
          <button
            type="button"
            onClick={() => { setPhoneMode(true); setError(null); }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            <Smartphone className="w-5 h-5 text-gray-500" />
            {tRet('continueWithPhone')}
          </button>
        )}
      </div>
    </div>
  );

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
    if (error) {
      setError(error instanceof AccountBlockedError ? t('accountBlocked') : t('invalidCredentials'));
    }
    setLoading(false);
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (recoveryLoading) return;
    setRecoveryLoading(true);
    await resetPassword(recoveryEmail);
    // Показываем одно и то же сообщение, не раскрывая существование аккаунта
    setRecoverySent(true);
    setRecoveryLoading(false);
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
            {(error || blocked) && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
                {error || t('accountBlocked')}
              </div>
            )}

            {phoneMode ? (
              <form onSubmit={codeSentTo ? handleVerifyCode : handleSendCode} className="space-y-4">
                {codeSentTo ? (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">{tRet('phoneCodeSent', { phone: codeSentTo })}</p>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{tRet('phoneCode')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={8}
                      value={phoneCode}
                      onChange={e => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50 text-center text-xl tracking-[0.4em] font-bold"
                      placeholder="000000"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('phone')}</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="tel"
                        autoComplete="tel"
                        required
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                        placeholder="+7 (777) 123-45-67"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{tRet('phoneHint')}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? '...' : tRet(codeSentTo ? 'phoneVerify' : 'phoneSend')}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={leavePhoneMode} className="text-sm text-[#2563eb] hover:underline">
                    {t('backToLogin')}
                  </button>
                  {codeSentTo && (
                    <button
                      type="button"
                      onClick={() => { setCodeSentTo(null); setPhoneCode(''); setError(null); }}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      {tRet('phoneChange')}
                    </button>
                  )}
                </div>
              </form>
            ) : recoveryMode ? (
              <form onSubmit={handleRecovery} className="space-y-4">
                {recoverySent && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl">
                    {t('recoveryEmailSent')}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={recoveryEmail}
                      onChange={e => setRecoveryEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] transition-colors bg-gray-50"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {recoveryLoading ? '...' : t('send')}
                </button>
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => { setRecoveryMode(false); setRecoverySent(false); setError(null); }}
                    className="text-sm text-[#2563eb] hover:underline"
                  >
                    {t('backToLogin')}
                  </button>
                </div>
              </form>
            ) : mode === 'login' ? (
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
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => { setRecoveryMode(true); setError(null); }}
                    className="text-sm text-[#2563eb] hover:underline"
                  >
                    {t('forgotPassword')}
                  </button>
                </div>
                {socialButtons}
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
                {socialButtons}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
