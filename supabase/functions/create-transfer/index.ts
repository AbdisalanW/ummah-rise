import Stripe from 'https://esm.sh/stripe@14?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
    const url = `${SUPABASE_URL}/rest/v1/${t.table}?select=id,stripe_account_id,payout_transferred_at,${t.raisedField},${t.goalField}&claim_code=eq.${encodeURIComponent(code)}&limit=1`;
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

    if (found.row.payout_transferred_at) {
      return new Response(JSON.stringify({ error: 'already transferred' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (!found.row.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'no connected account yet' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // Re-check live with Stripe rather than trusting a cached DB flag.
    const account = await stripe.accounts.retrieve(found.row.stripe_account_id);
    if (!account.payouts_enabled) {
      return new Response(JSON.stringify({ error: 'account not ready for payouts yet' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const raised = Number(found.row[found.raisedField]) || 0;
    if (raised <= 0) {
      return new Response(JSON.stringify({ error: 'nothing to transfer' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const amountCents = Math.round(raised * 100);

    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: found.row.stripe_account_id,
      transfer_group: code,
      metadata: { claim_code: code, table: found.table, row_id: found.row.id },
    });

    await patchRow(found.table, found.row.id, { payout_transferred_at: new Date().toISOString() });

    return new Response(JSON.stringify({ success: true, transferId: transfer.id, amount: raised }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && (err as Error).message) || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
