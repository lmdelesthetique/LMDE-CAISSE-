import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(key: string): string | undefined } };

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://lmdecaisse.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildResetEmailHTML(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Réinitialisation de mot de passe — BeautyPOS</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 32px 40px; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 700; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
    .body { padding: 32px 40px; }
    .message { font-size: 15px; color: #3f3f46; line-height: 1.6; margin-bottom: 28px; }
    .btn { display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 600; letter-spacing: 0.2px; }
    .btn-wrap { text-align: center; margin: 28px 0; }
    .warning { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; font-size: 12px; color: #92400e; line-height: 1.6; margin-top: 24px; }
    .url-box { background: #f4f4f5; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #71717a; word-break: break-all; margin-top: 16px; }
    .footer { background: #fafafa; border-top: 1px solid #e4e4e7; padding: 20px 40px; text-align: center; font-size: 11px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🔐 Réinitialisation du mot de passe</h1>
      <p>BeautyPOS — Demande de réinitialisation</p>
    </div>
    <div class="body">
      <p class="message">
        Bonjour,<br/><br/>
        Vous avez demandé la réinitialisation de votre mot de passe BeautyPOS.<br/>
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
      </p>
      <div class="btn-wrap">
        <a href="${resetUrl}" class="btn">Réinitialiser mon mot de passe</a>
      </div>
      <div class="warning">
        ⚠️ <strong>Ce lien est valable 1 heure.</strong> Si vous n'avez pas demandé cette réinitialisation, ignorez cet email — votre mot de passe reste inchangé.
      </div>
      <div class="url-box">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
        ${resetUrl}
      </div>
    </div>
    <div class="footer">
      <p>BeautyPOS — Logiciel de caisse professionnel</p>
      <p style="margin-top:4px">Cet email a été envoyé automatiquement. Ne pas répondre directement.</p>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Configuration serveur manquante" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json();
    const { action, email, token, newPassword } = body as {
      action: "request" | "verify" | "update";
      email?: string;
      token?: string;
      newPassword?: string;
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── ACTION: request ── Send reset email
    if (action === "request") {
      if (!email) {
        return new Response(JSON.stringify({ error: "Email requis" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Check if user exists in Supabase Auth
      const { data: users, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: "Erreur serveur" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const userExists = users.users.some(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      // Always return success to prevent email enumeration
      if (!userExists) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Invalidate any existing tokens for this email
      await supabase
        .from("password_reset_tokens")
        .delete()
        .eq("email", email.toLowerCase());

      // Create new token (expires in 1 hour)
      const resetToken = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const { error: insertError } = await supabase
        .from("password_reset_tokens")
        .insert({
          email: email.toLowerCase(),
          token: resetToken,
          expires_at: expiresAt,
        });

      if (insertError) {
        return new Response(JSON.stringify({ error: "Erreur lors de la création du token" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Send email via Resend
      const resetUrl = `${SITE_URL}/reset-password?token=${resetToken}`;
      const html = buildResetEmailHTML(resetUrl);

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [email],
          subject: "Réinitialisation de votre mot de passe — BeautyPOS",
          html,
        }),
      });

      if (!resendRes.ok) {
        const resendData = await resendRes.json();
        return new Response(JSON.stringify({ error: resendData?.message ?? "Erreur envoi email" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── ACTION: verify ── Check token validity
    if (action === "verify") {
      if (!token) {
        return new Response(JSON.stringify({ valid: false, error: "Token manquant" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data, error } = await supabase
        .from("password_reset_tokens")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ valid: false, error: "Token invalide ou expiré" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, error: "Ce lien a expiré. Veuillez faire une nouvelle demande." }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ valid: true, email: data.email }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── ACTION: update ── Update password and mark token as used
    if (action === "update") {
      if (!token || !newPassword) {
        return new Response(JSON.stringify({ error: "Token et nouveau mot de passe requis" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Verify token again
      const { data: tokenData, error: tokenError } = await supabase
        .from("password_reset_tokens")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .single();

      if (tokenError || !tokenData) {
        return new Response(JSON.stringify({ error: "Token invalide ou déjà utilisé" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Ce lien a expiré. Veuillez faire une nouvelle demande." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Find user by email
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users.find(
        (u) => u.email?.toLowerCase() === tokenData.email.toLowerCase()
      );

      if (!user) {
        return new Response(JSON.stringify({ error: "Utilisateur introuvable" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Update password
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });

      if (updateError) {
        return new Response(JSON.stringify({ error: "Erreur lors de la mise à jour du mot de passe" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Mark token as used
      await supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
