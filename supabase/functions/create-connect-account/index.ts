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

// This Stripe account was created under the newer Accounts v2 API (no v1
// compatibility toggle available), which needs a raw call with a .preview
// Stripe-Version header — the SDK doesn't wrap this resource yet. v1
// endpoints (account_links, accounts.retrieve, transfers.create) remain
// interoperable with v2-created accounts, so only this call differs.
async function createV2RecipientAccount(code: string, table: string, rowId: string) {
  const res = await fetch('https://api.stripe.com/v2/core/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      'Stripe-Version': '2025-03-31.preview',
    },
    body: JSON.stringify({
      // Placeholder only — Stripe requires a contact_email to attach the
      // recipient configuration, but we don't collect a real one from
      // claimants. Their actual email (if any) is entered directly with
      // Stripe during hosted onboarding, not stored by us.
      contact_email: `claim-${code.toLowerCase()}@placeholder.ummahrise.site`,
      display_name: `Ummah Rise claim ${code}`,
      identity: { country: 'us' },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
      },
      dashboard: 'express',
      metadata: { claim_code: code, table, row_id: rowId },
    }),
  });
  if (!res.ok) {
    throw new Error(`Stripe v2 account creation failed: ${await res.text()}`);
  }
  const account = await res.json();

  // v2 account creation doesn't accept business_profile directly, but the
  // v1 update endpoint does. Without this, Express onboarding asks the
  // claimant for a business URL, which doesn't make sense for an anonymous
  // individual receiving a one-time donation — so we supply a generic,
  // accurate description ourselves to skip that field.
  await stripe.accounts.update(account.id, {
    business_profile: {
      product_description: 'Anonymous community fundraiser recipient on Ummah Rise',
    },
  });

  return account.id as string;
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
      accountId = await createV2RecipientAccount(code, found.table, found.row.id);
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
