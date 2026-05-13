// Endpoint para capturar emails entrantes y crear leads automáticos en GHL.
// Compatible con: SendGrid Inbound Parse, Mailgun Routes, Postmark, o reenvío desde Make.
//
// Si el contacto ya existe → inserta el email como mensaje inbound en Conversations.
// Si no existe → crea contacto + opportunity + inserta mensaje inbound en Conversations.

const GHL_BASE = 'https://services.leadconnectorhq.com';
const VERSION_CONTACTS = '2021-07-28';
const VERSION_CONVERSATIONS = '2021-04-15';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const GHL_API_KEY = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
  const GHL_PIPELINE_CLIENTES = process.env.GHL_PIPELINE_CLIENTES;
  const GHL_STAGE_NEW_LEAD = process.env.GHL_STAGE_NEW_LEAD;

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    return res.status(500).json({ error: 'GHL not configured' });
  }

  try {
    const body = req.body;

    const fromEmail = body.from || body.sender || body.From || '';
    const fromName = body.from_name || body.sender_name || body['From-Name'] || extractNameFromEmail(fromEmail);
    const subject = body.subject || body.Subject || 'Sin asunto';
    const rawText = body.text || body.body || body['body-plain'] || body.TextBody || '';
    const rawHtml = body.html || body['body-html'] || body.HtmlBody || '';
    const messageId = body['Message-Id'] || body.messageId || body.message_id || '';

    const emailMatch = fromEmail.match(/<(.+?)>/) || [null, fromEmail];
    const email = (emailMatch[1] || fromEmail).trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'No valid email found', received: fromEmail });
    }

    const skipPatterns = ['noreply', 'no-reply', 'mailer-daemon', 'postmaster', 'bounce'];
    if (skipPatterns.some(p => email.includes(p))) {
      return res.status(200).json({ skipped: true, reason: 'Auto-reply or system email' });
    }

    // Strip thread history & signatures — keep only the latest reply
    const latestText = stripQuotedReply(rawText);
    const latestHtml = rawHtml ? stripQuotedReplyHtml(rawHtml) : '';

    const ghlHeaders = {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json'
    };

    // 1. Check if contact already exists
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${GHL_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      { headers: { ...ghlHeaders, 'Version': VERSION_CONTACTS } }
    );
    const searchData = await searchRes.json();
    const existingContact = searchData.contact;

    let contactId;
    let action;

    if (existingContact) {
      contactId = existingContact.id;
      action = 'message_added_existing';
    } else {
      // 2. Create new contact
      // origen depende del buzón destino. Se concatena al contact.source standard
      // (string libre tipo "Email entrante - info@"). Si el envío viene a xavi@
      // se distingue para que Xavi vea en GHL de qué buzón vino el lead.
      const toEmail = (body.to || body.To || body.recipient || '').toLowerCase();
      const origen = /xavi/.test(toEmail) ? 'xavi@' : 'info@';
      const [firstName, ...lastParts] = fromName.split(' ');
      const newContact = await createContact({
        ghlHeaders,
        locationId: GHL_LOCATION_ID,
        firstName: firstName || 'Lead',
        lastName: lastParts.join(' ') || 'Email',
        email,
        subject,
        textPreview: latestText.substring(0, 200),
        origen
      });
      contactId = newContact.contact.id;
      action = 'contact_created_with_message';

      // 3. Add to pipeline (only for new contacts)
      if (GHL_PIPELINE_CLIENTES && GHL_STAGE_NEW_LEAD) {
        await fetch(`${GHL_BASE}/opportunities/`, {
          method: 'POST',
          headers: { ...ghlHeaders, 'Version': VERSION_CONTACTS },
          body: JSON.stringify({
            locationId: GHL_LOCATION_ID,
            pipelineId: GHL_PIPELINE_CLIENTES,
            pipelineStageId: GHL_STAGE_NEW_LEAD,
            contactId,
            name: `${fromName} — Email entrante`,
            source: 'Inbound Email',
            customFields: [
              { key: 'comentarios_adicionales', field_value: `${subject}\n${latestText.substring(0, 500)}` }
            ]
          })
        });
      }
    }

    // 4. Insert email as inbound message in Conversations (works for both cases)
    const messagePayload = {
      type: 'Email',
      contactId,
      direction: 'inbound',
      subject,
      html: latestHtml || `<pre>${escapeHtml(latestText)}</pre>`,
      message: latestText,
      attachments: []
    };
    if (messageId) messagePayload.altId = messageId;

    const msgRes = await fetch(`${GHL_BASE}/conversations/messages/inbound`, {
      method: 'POST',
      headers: { ...ghlHeaders, 'Version': VERSION_CONVERSATIONS },
      body: JSON.stringify(messagePayload)
    });
    const msgData = await msgRes.json();

    if (!msgRes.ok) {
      return res.status(500).json({
        error: 'Failed to insert message in Conversations',
        details: msgData,
        contactId,
        hint: 'Check PIT scopes (need conversations/message.write) and Version header (2021-04-15)'
      });
    }

    return res.status(200).json({
      success: true,
      action,
      contactId,
      conversationId: msgData.conversationId,
      messageId: msgData.messageId
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function createContact({ ghlHeaders, locationId, firstName, lastName, email, subject, textPreview, origen }) {
  const res = await fetch(`${GHL_BASE}/contacts/`, {
    method: 'POST',
    headers: { ...ghlHeaders, 'Version': VERSION_CONTACTS },
    body: JSON.stringify({
      locationId,
      firstName,
      lastName,
      email,
      source: `Email entrante - ${origen || 'info@'}`,
      tags: [],
      customFields: [
        { key: 'contact_type', field_value: 'Cliente' }
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Contact creation failed: ${JSON.stringify(data)}`);
  return data;
}

function extractNameFromEmail(email) {
  const match = email.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const local = email.split('@')[0] || 'Lead';
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Cut quoted replies, forwarded chains, and common signatures so only the latest message is sent
function stripQuotedReply(text) {
  if (!text) return '';
  const markers = [
    /\n[-_]{2,}\s*\n/,                              // signature separator (-- or ____)
    /\nOn .{1,200} wrote:\s*\n/i,                   // Gmail "On <date> <name> wrote:"
    /\nEl .{1,200} escribió:\s*\n/i,                // Gmail español
    /\n-{2,}\s*Original Message\s*-{2,}\s*\n/i,     // Outlook
    /\n-{2,}\s*Mensaje original\s*-{2,}\s*\n/i,     // Outlook español
    /\nDe:\s.+\nEnviado:/i,                          // Outlook header en español
    /\nFrom:\s.+\nSent:/i,                           // Outlook header en inglés
    /\nDe :\s.+\nDate :/i                            // Apple Mail FR
  ];
  let cutAt = text.length;
  for (const re of markers) {
    const m = text.match(re);
    if (m && m.index < cutAt) cutAt = m.index;
  }
  return text.substring(0, cutAt).trim();
}

function stripQuotedReplyHtml(html) {
  if (!html) return '';
  // Gmail wraps quoted thread in <blockquote class="gmail_quote">
  let cleaned = html
    .replace(/<blockquote[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div[^>]*class=["'][^"']*gmail_attr[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  // Outlook wraps in <div id="appendonsend"> + horizontal rule
  cleaned = cleaned.split(/<div[^>]*id=["']appendonsend["'][^>]*>/i)[0];
  cleaned = cleaned.split(/<hr[^>]*id=["']?(?:stopSpelling|divRplyFwdMsg)["']?[^>]*>/i)[0];
  return cleaned.trim();
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
