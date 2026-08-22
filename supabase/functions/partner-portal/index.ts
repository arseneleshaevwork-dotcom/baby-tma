import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { authenticateAppRequest } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/http.ts';
import { buildPartnerSummary, PARTNER_TERMS_VERSION, validatePartnerApplication } from '../_shared/partner-portal.mjs';

const allowedOrigin = 'https://arseneleshaevwork-dotcom.github.io';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Cache-Control': 'no-store'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== allowedOrigin) return json({ error: 'origin_not_allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !botToken) return json({ error: 'server_not_configured' }, 500);

  const parsedBody = await readJsonBody(req, 10_000);
  if (!parsedBody.ok) return json({ error: parsedBody.error }, parsedBody.error === 'payload_too_large' ? 413 : 400);
  const body = parsedBody.value || {};
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const auth = await authenticateAppRequest({ req, body, supabase, botToken });
  if (!auth.ok) return json({ error: auth.error }, 401);

  const action = String(body.action || 'status');
  const owned = await findOwnedPartner(supabase, auth.user.id, auth.telegramId);
  if (owned.error) return json({ error: 'partner_lookup_failed' }, 500);
  let partner = owned.partner;

  if (action === 'apply') {
    const application = validatePartnerApplication(body);
    if (!application.ok) return json({ error: application.error }, 400);
    if (partner && !['pending', 'rejected'].includes(partner.status)) {
      return json({ error: 'partner_application_locked' }, 409);
    }
    const now = new Date().toISOString();
    const values = {
      user_id: auth.user.id,
      telegram_id: auth.telegramId,
      name: application.name,
      code: application.code,
      contact: application.contact,
      status: 'pending',
      commission_bps: 3000,
      attribution_days: 30,
      hold_days: 14,
      commission_payment_limit: 2,
      commission_days: 62,
      terms_accepted_at: now,
      terms_version: PARTNER_TERMS_VERSION,
      applied_at: now,
      reviewed_at: null,
      approved_at: null,
      updated_at: now
    };
    const query = partner
      ? supabase.from('partners').update(values).eq('id', partner.id)
      : supabase.from('partners').insert(values);
    const result = await query.select(partnerFields).maybeSingle();
    if (result.error?.code === '23505') return json({ error: 'partner_code_exists' }, 409);
    if (result.error || !result.data) return json({ error: 'partner_application_failed' }, 500);
    partner = result.data;
  } else if (action !== 'status') {
    return json({ error: 'unknown_action' }, 400);
  }

  if (!partner) return json({ ok: true, portal: null, terms_version: PARTNER_TERMS_VERSION });
  const [referralsResult, commissionsResult, payoutsResult] = await Promise.all([
    supabase.from('partner_referrals').select('id').eq('partner_id', partner.id),
    supabase.from('partner_commissions').select('status,amount_minor,commission_minor,available_at').eq('partner_id', partner.id),
    supabase.from('partner_payouts').select('status').eq('partner_id', partner.id)
  ]);
  if (referralsResult.error || commissionsResult.error || payoutsResult.error) {
    return json({ error: 'partner_stats_failed' }, 500);
  }
  return json({
    ok: true,
    portal: buildPartnerSummary({
      partner,
      referrals: referralsResult.data || [],
      commissions: commissionsResult.data || [],
      payouts: payoutsResult.data || [],
      now: new Date()
    }),
    terms_version: PARTNER_TERMS_VERSION
  });
});

const partnerFields = 'id,code,name,contact,status,commission_bps,created_at,applied_at,reviewed_at,approved_at';

async function findOwnedPartner(supabase: any, userId: string, telegramId: number) {
  const byUser = await supabase.from('partners').select(partnerFields).eq('user_id', userId).maybeSingle();
  if (byUser.error) return { partner: null, error: byUser.error };
  if (byUser.data) return { partner: byUser.data, error: null };
  const byTelegram = await supabase.from('partners').select(partnerFields).eq('telegram_id', telegramId).maybeSingle();
  return { partner: byTelegram.data || null, error: byTelegram.error || null };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
