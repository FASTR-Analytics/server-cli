export async function sendCrashAlert(
  sendGridApi: string,
  containerId: string,
  exitCode: number,
  logTail: string,
): Promise<void> {
  const recipientsEnv = Deno.env.get("ALERT_RECIPIENTS");
  const fromEmail = Deno.env.get("ALERT_FROM_EMAIL");
  if (!recipientsEnv || !fromEmail) {
    console.error("Skipping crash alert: ALERT_RECIPIENTS or ALERT_FROM_EMAIL not set");
    return;
  }
  const recipients = recipientsEnv.split(",").map((r: string) => r.trim()).filter(Boolean);
  const subject = `Container crashed: ${containerId} (exit ${exitCode})`;
  const plainText = `Container ${containerId} crashed with exit code ${exitCode}.\n\nLast logs:\n\n${logTail}`;
  const html = `<p>Container <strong>${containerId}</strong> crashed with exit code <strong>${exitCode}</strong>.</p><pre style="background:#f4f4f4;padding:12px;font-size:12px">${logTail.replace(/</g, "&lt;")}</pre>`;

  for (const to of recipients) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendGridApi}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail },
        subject,
        content: [
          { type: "text/plain", value: plainText },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      console.error(`SendGrid error for ${to}: ${res.status} ${error}`);
    }
  }
}
