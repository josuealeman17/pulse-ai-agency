import type { Client } from "@pulse/db";
import { escapeHtml, sendEmail } from "./email.js";

export interface TransferDetails {
  reason: string;
  customer_email?: string;
  customer_phone?: string;
}

/** Notify the client that the chatbot escalated a conversation to a human. */
export async function sendTransferNotification(
  client: Client,
  details: TransferDetails,
): Promise<boolean> {
  if (!client.email) {
    console.warn(`[notify] client ${client.id} has no email; skipping transfer notice`);
    return false;
  }
  const html = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2>🔔 A customer asked to speak with someone</h2>
      <p>Your Pulse assistant transferred a conversation on <strong>${escapeHtml(client.name)}</strong>.</p>
      <p><strong>Reason:</strong> ${escapeHtml(details.reason)}</p>
      ${details.customer_email ? `<p><strong>Email:</strong> ${escapeHtml(details.customer_email)}</p>` : ""}
      ${details.customer_phone ? `<p><strong>Phone:</strong> ${escapeHtml(details.customer_phone)}</p>` : ""}
      <p style="color:#6b7280;font-size:12px">Sent automatically by Pulse.</p>
    </div>`;
  const res = await sendEmail({
    to: client.email,
    subject: `Customer needs you — ${client.name}`,
    html,
  });
  return res.ok;
}
