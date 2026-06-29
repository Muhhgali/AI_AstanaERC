type SendRequestEmailParams = {
  to: string;
  subject: string;
  text: string;
};

export async function sendRequestEmail(params: SendRequestEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    return {
      sent: false,
      reason: "RESEND_API_KEY or MAIL_FROM is not configured",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    return {
      sent: false,
      reason: detail || `Resend returned ${response.status}`,
    };
  }

  return {
    sent: true,
  };
}
