import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_not_configured' }, 500);
  }

  const body = await req.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
  if (!events.length) return json({ ok: true, inserted: 0 });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let inserted = 0;

  for (const event of events) {
    const telegramUser = event.telegram_user || null;
    const baby = event.baby || {};
    const babyAgeMonths = baby.ageMonths === undefined ? null : baby.ageMonths;
    let userId: string | null = null;

    if (telegramUser?.id) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .upsert({
          telegram_id: telegramUser.id,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
          language_code: telegramUser.language_code || null,
          client_id: event.client_id || null,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'telegram_id' })
        .select('id')
        .single();

      if (!userError) userId = user?.id || null;
    }

    if ((baby.name || baby.birthdate || babyAgeMonths !== null) && (userId || event.client_id)) {
      await supabase
        .from('babies')
        .upsert({
          user_id: userId,
          client_id: event.client_id || null,
          name: baby.name || null,
          birthdate: baby.birthdate || null,
          age_months: babyAgeMonths,
          updated_at: new Date().toISOString()
        }, { onConflict: userId ? 'user_id' : 'client_id' });
    }

    if ((event.event === 'notifications_enabled' || event.event === 'notifications_disabled') && (userId || event.client_id || telegramUser?.id)) {
      const enabled = event.event === 'notifications_enabled';
      const setting = {
        user_id: userId,
        telegram_id: telegramUser?.id || event.payload?.telegram_user_id || null,
        client_id: event.client_id || null,
        chat_id: telegramUser?.id || event.payload?.telegram_user_id || null,
        enabled,
        timezone: event.payload?.timezone || 'Europe/Moscow',
        birthday_reminders: Boolean(event.payload?.birthday_reminders ?? enabled),
        age_milestones: Boolean(event.payload?.age_milestones ?? enabled),
        schedule_reminders: Boolean(event.payload?.schedule_reminders ?? false),
        updated_at: new Date().toISOString()
      };
      await supabase
        .from('notification_settings')
        .upsert(setting, { onConflict: userId ? 'user_id' : (setting.telegram_id ? 'telegram_id' : 'client_id') });
    }

    const { error: eventError } = await supabase.from('events').insert({
      event_name: event.event,
      user_id: userId,
      client_id: event.client_id || null,
      session_id: event.session_id || null,
      telegram_id: telegramUser?.id || null,
      baby_name: baby.name || null,
      baby_birthdate: baby.birthdate || null,
      baby_age_months: babyAgeMonths,
      payload: event.payload || {},
      page: event.page || null,
      user_agent: event.user_agent || null,
      language: event.language || null,
      created_at: event.created_at || new Date().toISOString()
    });

    if (!eventError) inserted++;
  }

  return json({ ok: true, inserted });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
