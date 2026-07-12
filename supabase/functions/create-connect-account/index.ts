import Stripe from 'https://esm.sh/stripe@14?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SITE_URL = 'https://ummahrise.site';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TABLES: { table: string; raisedField: string; goalField: string }[] = [
  { table: 'posts', raisedField: 'fund_raised', goalField: 'fund_goal' },
  { table: 'fund_campaigns', raisedField: 'raised', goalField: 'goal' },
  { table: 'taasiya_posts', raisedField: 'fund_raised', goalField: 'fund_goal' },
];

async function findByCode(code: string) {
  for (const t of TABLES) {
    const url = `${SUPABASE_URL}/rest/v1/${t.table}?select=id,anon_name,stripe_account_id,${t.raisedField},${t.goalField}&claim_code=eq.${encodeURIComponent(code)}&limit=1`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) continue;
    const rows = await res.json();
    if (rows && rows.length > 0) return { row: rows[0], ...t };
  }
  return null;
}

async function patchRow(table: string, id: string, body: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { code } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: 'code required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const found = await findByCode(code);
    if (!found) {
      return new Response(JSON.stringify({ error: 'code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    let accountId = found.row.stripe_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { claim_code: code, table: found.table, row_id: found.row.id },
      });
      accountId = account.id;
      await patchRow(found.table, found.row.id, { stripe_account_id: accountId });
    }

    const returnUrl = `${SITE_URL}/?connect_code=${encodeURIComponent(code)}`;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && (err as Error).message) || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
