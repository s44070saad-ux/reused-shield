// Email alerts via Resend (https://resend.com). No SDK — plain fetch.
// Requires RESEND_API_KEY in the server environment. Without a verified
// domain, Resend's shared sender (onboarding@resend.dev) can only deliver
// to the Resend account owner's own email address — fine for the owner's
// alerts during beta; set RESEND_FROM to a verified domain sender later.

export async function sendAlertEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Reused Content Shield <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
