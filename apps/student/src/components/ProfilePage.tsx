import { useState, useEffect } from 'react';
import { User, Mail, Phone, Save, Loader2, Award } from 'lucide-react';
import { useAuth } from '@baiqautest/shared';
import { useLanguage } from '@baiqautest/shared';
import { getUserBadges, BADGE_META } from '@baiqautest/shared';
import { AppSettingsCard } from './AppSettingsCard';

export function ProfilePage() {
  const { profile, user, updateProfile } = useAuth();
  const { t, language } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      getUserBadges()
        .then(setBadges)
        .catch(() => {});
    }
  }, [user]);

  const [formData, setFormData] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    middle_name: profile?.middle_name || '',
    phone: profile?.phone || '',
    gender: profile?.gender || '',
  });

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error } = await updateProfile({
      first_name: formData.first_name,
      last_name: formData.last_name,
      middle_name: formData.middle_name || null,
      phone: formData.phone || null,
      gender: (formData.gender || null) as 'male' | 'female' | null,
    });

    setSaving(false);
    if (error) {
      setError(t('saveError'));
    } else {
      setSuccess(true);
      setEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  function handleCancel() {
    setFormData({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      middle_name: profile?.middle_name || '',
      phone: profile?.phone || '',
      gender: profile?.gender || '',
    });
    setEditing(false);
    setError(null);
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('greeting')}, {profile?.first_name}!
        </h1>
        <p className="text-gray-500">{t('profile')}</p>
      </div>

      <div className="card overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#2563eb] to-[#1e3a8a] px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="text-white">
              <h2 className="text-xl font-bold">
                {[profile?.last_name, profile?.first_name, profile?.middle_name].filter(Boolean).join(' ') || t('student')}
              </h2>
              <p className="text-blue-100">{profile?.role === 'admin' ? t('admin') : t('student')}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl">
              {t('save')}!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('firstName')}</label>
              <input
                disabled={!editing}
                value={formData.first_name}
                onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl transition-colors ${
                  editing
                    ? 'border-gray-200 focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50'
                    : 'border-gray-100 bg-gray-50 text-gray-600'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('lastName')}</label>
              <input
                disabled={!editing}
                value={formData.last_name}
                onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl transition-colors ${
                  editing
                    ? 'border-gray-200 focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50'
                    : 'border-gray-100 bg-gray-50 text-gray-600'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('middleName')}</label>
            <input
              disabled={!editing}
              value={formData.middle_name}
              onChange={e => setFormData({ ...formData, middle_name: e.target.value })}
              className={`w-full px-4 py-3 border rounded-xl transition-colors ${
                editing
                  ? 'border-gray-200 focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50'
                  : 'border-gray-100 bg-gray-50 text-gray-600'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="inline w-4 h-4 mr-1" />
              {t('email')}
            </label>
            <div className="w-full px-4 py-3 border border-gray-100 bg-gray-50 text-gray-600 rounded-xl flex items-center">
              {user?.email || '—'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="inline w-4 h-4 mr-1" />
              {t('phone')}
            </label>
            <input
              disabled={!editing}
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+7 (777) 123-45-67"
              className={`w-full px-4 py-3 border rounded-xl transition-colors ${
                editing
                  ? 'border-gray-200 focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] bg-gray-50'
                  : 'border-gray-100 bg-gray-50 text-gray-600'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('gender')}</label>
            <select
              disabled={!editing}
              value={formData.gender}
              onChange={e => setFormData({ ...formData, gender: e.target.value })}
              className={`w-full px-4 py-3 border rounded-xl transition-colors bg-gray-50 ${
                editing
                  ? 'border-gray-200 focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb]'
                  : 'border-gray-100 text-gray-600'
              }`}
            >
              <option value="">{t('gender')}</option>
              <option value="male">{t('male')}</option>
              <option value="female">{t('female')}</option>
            </select>
          </div>

          <div className="pt-4 flex gap-3">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('saveChanges')}
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-5 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-5 py-3 bg-[#2563eb] hover:bg-[#1e3a8a] text-white font-medium rounded-xl transition-colors"
              >
                {t('editProfile')}
              </button>
            )}
          </div>
        </div>

        {/* Achievements */}
        {badges.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold text-gray-900">
                {language === 'kz' ? 'Жетістіктер' : 'Достижения'}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {badges.map(id => {
                const meta = BADGE_META[id];
                if (!meta) return null;
                return (
                  <div key={id} className={`card p-4 text-center border ${meta.color}`}>
                    <div className="text-3xl mb-2">{meta.icon}</div>
                    <p className="text-sm font-semibold text-gray-800">
                      {language === 'kz' ? meta.label.kz : meta.label.ru}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AppSettingsCard />
    </div>
  );
}
