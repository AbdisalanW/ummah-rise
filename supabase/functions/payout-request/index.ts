import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const ADMIN_EMAIL = 'abdisalanweli10@gmail.com';
const FROM = 'Ummah Rise <noreply@ummahrise.site>';

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  return res.ok;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const body = await req.json();
    const { claim_code, content, table, recipient_email } = body;

    // Content report
    if (table === 'report') {
      await sendEmail(
        ADMIN_EMAIL,
        '🚨 Content Report — Ummah Rise',
        `<h2>Content Report</h2><p><strong>Post ID:</strong> ${claim_code}</p><p>${content}</p>`
      );
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Claim code email backup
    if (table === 'email-backup' && recipient_email) {
      await sendEmail(
        recipient_email,
        'Your Ummah Rise Claim Code',
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#0d0f0e;color:#f0ede8;border-radius:12px;">
          <h2 style="color:#4ade80;font-size:1.4rem;margin-bottom:1rem;">Your Claim Code</h2>
          <p style="color:#9a9e96;margin-bottom:1rem;">Keep this email safe. This code is the only way to claim your Ummah Rise funds.</p>
          <div style="background:#1e221e;border:2px dashed rgba(74,222,128,.4);border-radius:8px;padding:1.5rem;text-align:center;font-size:1.4rem;font-weight:700;color:#4ade80;letter-spacing:.1em;margin-bottom:1.5rem;">
            ${claim_code}
          </div>
          <p style="font-size:12px;color:#6a6e66;">To claim your funds, open Ummah Rise → Profile → Claim Funds → enter this code.</p>
          <p style="font-size:12px;color:#6a6e66;margin-top:1rem;">JazakAllah Khair for using Ummah Rise.</p>
        </div>
        `
      );
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Manual payout-by-email has been replaced by Stripe Connect transfers
    // (see create-connect-account / create-transfer). Nothing else should
    // reach this point.
    return new Response(JSON.stringify({ success: false, error: 'unknown request type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
