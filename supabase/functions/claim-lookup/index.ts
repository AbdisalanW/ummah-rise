import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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

async function findByCode(table: string, raisedField: string, goalField: string, code: string) {
  const cols = `id,anon_name,content,${raisedField},${goalField}`;
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${cols}&claim_code=eq.${encodeURIComponent(code)}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length > 0 ? rows[0] : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ found: false, error: 'code required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    for (const t of TABLES) {
      const row = await findByCode(t.table, t.raisedField, t.goalField, code);
      if (row) {
        return new Response(
          JSON.stringify({
            found: true,
            table: t.table,
            raisedField: t.raisedField,
            goalField: t.goalField,
            anon_name: row.anon_name,
            content: row.content,
            raised: row[t.raisedField],
            goal: row[t.goalField],
          }),
          { headers: { 'Content-Type': 'application/json', ...CORS } }
        );
      }
    }

    return new Response(JSON.stringify({ found: false }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ found: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
