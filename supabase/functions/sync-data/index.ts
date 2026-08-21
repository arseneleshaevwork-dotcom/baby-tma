import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { authenticateAppRequest } from '../_shared/auth.ts';
import { corsHeaders, isAllowedOrigin, json } from '../_shared/http.ts';
import { sanitizeDeletedDiaryDay, sanitizeDiaryEntry, sanitizeSyncProfile, sanitizeSyncSettings } from './policy.mjs';

Deno.serve(async req => {
  const headers = corsHeaders(req);
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, headers);
  if (origin && !isAllowedOrigin(origin)) return json({ ok: false, error: 'origin_not_allowed' }, 403, headers);
  if (Number(req.headers.get('content-length') || 0) > 1_000_000) return json({ ok: false, error: 'payload_too_large' }, 413, headers);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!botToken || !supabaseUrl || !serviceRoleKey) return json({ ok: false, error: 'server_not_configured' }, 503, headers);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > 1_000_000) return json({ ok: false, error: 'payload_too_large' }, 413, headers);
  const body = parseBody(rawBody);
  const auth = await authenticateAppRequest({ req, body, supabase, botToken });
  if (!auth.ok) return json({ ok: false, error: auth.error || 'auth_failed' }, 401, headers);

  if (String(body?.action || 'pull') === 'push') {
    const now = new Date();
    const profile = sanitizeSyncProfile(body?.profile, now);
    const profileUpdatedAt = safeTimestamp(body?.profile_updated_at, now);
    const { data: storedProfile, error: profileReadError } = await supabase.from('babies')
      .select('updated_at').eq('user_id', auth.user.id).maybeSingle();
    if (profileReadError) throw profileReadError;
    if (body?.profile && (!storedProfile || new Date(profileUpdatedAt) >= new Date(storedProfile.updated_at))) {
      const { error } = await supabase.from('babies').upsert({
        user_id: auth.user.id,
        name: profile.name || null,
        birthdate: profile.birthdate || null,
        age_months: profile.age_months,
        updated_at: profileUpdatedAt
      }, { onConflict: 'user_id' });
      if (error) throw error;
    }

    const settings = sanitizeSyncSettings(body?.settings);
    const settingsUpdatedAt = safeTimestamp(body?.settings_updated_at, now);
    const { data: storedSettings, error: settingsReadError } = await supabase.from('user_app_settings')
      .select('client_updated_at').eq('user_id', auth.user.id).maybeSingle();
    if (settingsReadError) throw settingsReadError;
    if (!storedSettings || new Date(settingsUpdatedAt) >= new Date(storedSettings.client_updated_at)) {
      const { error } = await supabase.from('user_app_settings').upsert({
        user_id: auth.user.id,
        telegram_id: auth.telegramId,
        settings,
        client_updated_at: settingsUpdatedAt,
        updated_at: now.toISOString()
      }, { onConflict: 'user_id' });
      if (error) throw error;
    }

    const entries = (Array.isArray(body?.diary) ? body.diary : []).slice(0, 400)
      .map((entry: any) => sanitizeDiaryEntry(entry, now)).filter(Boolean);
    const deleted = (Array.isArray(body?.deleted_diary_days) ? body.deleted_diary_days : []).slice(0, 400)
      .map((entry: any) => sanitizeDeletedDiaryDay(entry, now)).filter(Boolean);
    await applyDiaryChanges(supabase, auth, entries, deleted, now);
  }

  const snapshot = await loadSnapshot(supabase, auth.user.id);
  return json({ ok: true, ...snapshot }, 200, headers);
});

async function applyDiaryChanges(supabase: any, auth: any, entries: any[], deleted: any[], now: Date) {
  const candidates = [
    ...entries.map(entry => ({ date: entry.date, at: entry._updatedAt, data: entry, deletedAt: null })),
    ...deleted.map(entry => ({ date: entry.date, at: entry._updatedAt, data: {}, deletedAt: entry._updatedAt }))
  ];
  const newestByDate = new Map<string, any>();
  for (const item of candidates) {
    const current = newestByDate.get(item.date);
    if (!current || new Date(item.at).getTime() >= new Date(current.at).getTime()) newestByDate.set(item.date, item);
  }
  const incoming = [...newestByDate.values()];
  if (!incoming.length) return;
  const dates = [...new Set(incoming.map(item => item.date))];
  const { data: currentRows, error: readError } = await supabase.from('diary_days')
    .select('entry_date,client_updated_at').eq('user_id', auth.user.id).in('entry_date', dates);
  if (readError) throw readError;
  const current = new Map((currentRows || []).map((row: any) => [String(row.entry_date), new Date(row.client_updated_at).getTime()]));
  const rows = incoming.filter(item => new Date(item.at).getTime() >= (current.get(item.date) || 0)).map(item => ({
    user_id: auth.user.id,
    telegram_id: auth.telegramId,
    entry_date: item.date,
    data: item.data,
    client_updated_at: item.at,
    deleted_at: item.deletedAt,
    updated_at: now.toISOString()
  }));
  if (rows.length) {
    const { error } = await supabase.from('diary_days').upsert(rows, { onConflict: 'user_id,entry_date' });
    if (error) throw error;
  }
}

async function loadSnapshot(supabase: any, userId: string) {
  const [babyResult, settingsResult, diaryResult] = await Promise.all([
    supabase.from('babies').select('name,birthdate,age_months,updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('user_app_settings').select('settings,client_updated_at').eq('user_id', userId).maybeSingle(),
    supabase.from('diary_days').select('entry_date,data,client_updated_at,deleted_at')
      .eq('user_id', userId).order('entry_date', { ascending: false }).limit(400)
  ]);
  if (babyResult.error) throw babyResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (diaryResult.error) throw diaryResult.error;
  const baby = babyResult.data;
  const settings = settingsResult.data;
  const diary = [...(diaryResult.data || [])].sort((left: any, right: any) => String(left.entry_date).localeCompare(String(right.entry_date)));
  return {
    profile: baby || null,
    profile_updated_at: baby?.updated_at || null,
    settings: settings?.settings || {},
    settings_updated_at: settings?.client_updated_at || null,
    diary: (diary || []).filter((row: any) => !row.deleted_at).map((row: any) => ({
      ...row.data, date: String(row.entry_date), _updatedAt: row.client_updated_at
    })),
    deleted_diary_days: (diary || []).filter((row: any) => row.deleted_at).map((row: any) => ({
      date: String(row.entry_date), _updatedAt: row.client_updated_at
    }))
  };
}

function parseBody(rawBody: string) {
  try { return rawBody ? JSON.parse(rawBody) : {}; }
  catch (_) { return {}; }
}

function safeTimestamp(value: unknown, now: Date) {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + 5 * 60_000) return now.toISOString();
  return parsed.toISOString();
}
