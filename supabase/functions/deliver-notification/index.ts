// Dirista email (Gmail SMTP) + browser push (Web Push) marka notification cusub la geliyo.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const { id } = await req.json();
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: n } = await sb.from("notifications").select("*").eq("id", id).maybeSingle();
  if (!n) return new Response("not found", { status: 404 });

  const { data: prefs } = await sb
    .from("notification_preferences")
    .select("email_enabled,push_enabled")
    .eq("user_id", n.user_id)
    .maybeSingle();
  const emailOn = prefs?.email_enabled ?? true;
  const pushOn = prefs?.push_enabled ?? true;
  const result: Record<string, string> = { email: "skipped", push: "skipped" };

  /* ---------- EMAIL (Gmail SMTP) ---------- */
  if (emailOn && env("GMAIL_USER") && env("GMAIL_APP_PASSWORD")) {
    try {
      const { data } = await sb.auth.admin.getUserById(n.user_id);
      const to = data?.user?.email;
      if (to) {
        const link = env("APP_URL") && n.url ? `${env("APP_URL")}${n.url}` : "";
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e8ecf3;border-radius:14px">
            <p style="margin:0 0 4px;color:#2563eb;font-weight:700;letter-spacing:.5px">TRADORA</p>
            <h2 style="margin:0 0 12px;font-size:18px;color:#0f172a">${esc(n.title)}</h2>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">${esc(n.body).replace(/\n/g, "<br>")}</p>
            ${link ? `<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px">Open TRADORA</a>` : ""}
          </div>`;
        const client = new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: { username: env("GMAIL_USER"), password: env("GMAIL_APP_PASSWORD") },
          },
        });
        await client.send({
          from: `TRADORA <${env("GMAIL_USER")}>`,
          to,
          subject: n.title,
          content: `${n.title}\n\n${n.body}`,
          html,
        });
        await client.close();
        await sb.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", n.id);
        result.email = "sent";
      }
    } catch (e) {
      console.error("email failed", e);
      result.email = `error: ${(e as Error).message}`;
    }
  }

  /* ---------- PUSH (system notification) ---------- */
  if (pushOn && env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY")) {
    try {
      webpush.setVapidDetails(
        `mailto:${env("GMAIL_USER") || "admin@example.com"}`,
        env("VAPID_PUBLIC_KEY"),
        env("VAPID_PRIVATE_KEY"),
      );
      const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", n.user_id);
      let sent = 0;
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body, url: n.url || "/", tag: n.id }),
          );
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("push failed", e);
        }
      }
      if (sent > 0) {
        await sb.from("notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", n.id);
        result.push = `sent:${sent}`;
      }
    } catch (e) {
      console.error("push setup failed", e);
      result.push = `error: ${(e as Error).message}`;
    }
  }

  return Response.json(result);
});