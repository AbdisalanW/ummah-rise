const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const ADMIN_EMAIL = 'abdisalanweli10@gmail.com';
const FROM = 'Ummah Rise <noreply@ummahrise.site>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Auto-hide content once it accumulates this many independent reports,
// rather than waiting on manual review for every case.
const AUTO_HIDE_THRESHOLD = 3;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TABLES: Record<string, true> = { posts: true, taasiya_posts: true };

async function sendEmail(to: string, subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { post_id, table } = await req.json();
    if (!post_id || !TABLES[table]) {
      return new Response(JSON.stringify({ error: 'invalid post_id/table' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id,content,report_count&id=eq.${post_id}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const rows = await getRes.json();
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const row = rows[0];
    const newCount = (row.report_count || 0) + 1;
    const shouldHide = newCount >= AUTO_HIDE_THRESHOLD;

    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${post_id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(shouldHide ? { report_count: newCount, hidden: true } : { report_count: newCount }),
    });

    await sendEmail(
      ADMIN_EMAIL,
      shouldHide ? '🚨 Content auto-hidden — Ummah Rise' : '🚨 Content Report — Ummah Rise',
      `<h2>Content Report</h2><p><strong>Post ID:</strong> ${post_id}</p><p><strong>Table:</strong> ${table}</p><p><strong>Report count:</strong> ${newCount}</p>${shouldHide ? '<p><strong>This content has been automatically hidden from the feed.</strong></p>' : ''}<p>${row.content}</p>`
    );

    return new Response(JSON.stringify({ success: true, hidden: shouldHide }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
