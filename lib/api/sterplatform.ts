const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const API_TOKEN = process.env.STER_API_TOKEN!;

export async function sendEmail(
  template: string,
  to: string,
  variables: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/email/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': API_TOKEN,
    },
    body: JSON.stringify({ template, to, variables }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SterPlatform email API ${res.status}: ${body}`);
  }
}
