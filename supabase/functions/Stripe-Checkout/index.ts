import Stripe from "https://esm.sh/stripe@14?target=deno";

const TABLE_MAP: Record<string, string> = {
  fund: "fund_campaigns",
  taasiya: "taasiya_posts",
  post: "posts",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, authorization",
      },
    });
  }

  try {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(key, { apiVersion: "2023-10-16" });

    const { amount, campaign_id, campaign_name, campaign_type } = await req.json();
    const table = TABLE_MAP[campaign_type] || "posts";
    const amountCents = Math.round(amount * 100);
    const feeCents = Math.round(amountCents * 0.03);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `Donation to ${campaign_name}`,
            description: "Ummah Rise Marriage Fund — JazakAllah Khair",
          },
          unit_amount: amountCents + feeCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      // Actual crediting of funds happens server-side in stripe-webhook,
      // driven by this metadata — the client redirect below is UI-only and
      // is never trusted to write donation amounts.
      metadata: {
        campaign_id,
        campaign_table: table,
        campaign_type: campaign_type || "post",
        amount: String(amount),
      },
      // campaign_id/type/amount here are for the client's post-redirect UI
      // (toast text, which feed to refresh) only — never trusted for writes.
      success_url: `https://ummahrise.site/?donated=true&campaign_type=${encodeURIComponent(campaign_type || "post")}&campaign_id=${encodeURIComponent(campaign_id)}`,
      cancel_url: `https://ummahrise.site/?cancelled=true`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    console.error("Stripe error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
