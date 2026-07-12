import Stripe from 'https://esm.sh/stripe@14?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const FIELD_MAP: Record<string, { raisedField: string; goalField: string }> = {
  posts: { raisedField: 'fund_raised', goalField: 'fund_goal' },
  fund_campaigns: { raisedField: 'raised', goalField: 'goal' },
  taasiya_posts: { raisedField: 'fund_raised', goalField: 'fund_goal' },
};

async function notifyDonation(table: string, id: string, amount: number) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: id,
        post_table: table,
        title: 'Donation received',
        body: `Someone donated $${amount} to your fund. JazakAllah Khair!`,
      }),
    });
  } catch (_e) {
    // best-effort; a missed notification shouldn't fail the webhook
  }
}

async function creditDonation(table: string, id: string, amount: number) {
  const conf = FIELD_MAP[table];
  if (!conf) return;
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=${conf.raisedField},${conf.goalField}&id=eq.${id}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!getRes.ok) return;
  const rows = await getRes.json();
  if (!rows || rows.length === 0) return;
  const current = rows[0][conf.raisedField] || 0;
  const goal = rows[0][conf.goalField] || 0;
  const next = goal > 0 ? Math.min(goal, current + amount) : current + amount;

  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ [conf.raisedField]: next }),
  });
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature || '', STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${String((err as Error).message)}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const table = metadata.campaign_table;
    const rowId = metadata.campaign_id;
    const amount = metadata.amount ? parseFloat(metadata.amount) : 0;

    if (table && rowId && amount > 0) {
      await creditDonation(table, rowId, amount);
      await notifyDonation(table, rowId, amount);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
