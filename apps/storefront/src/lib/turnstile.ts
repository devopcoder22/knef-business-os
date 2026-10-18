const SECRET = process.env.CLOUDFLARE_TURNSTILE_SECRET ?? '';

export async function verifyTurnstile(token: string | undefined): Promise<{ ok: boolean; error?: string }> {
  if (!SECRET) return { ok: true }; // Skip if not configured (local dev)
  if (!token) return { ok: false, error: 'CAPTCHA verification required' };

  const params = new URLSearchParams({ secret: SECRET, response: token });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json() as { success: boolean };
  return data.success ? { ok: true } : { ok: false, error: 'CAPTCHA verification failed. Please try again.' };
}
