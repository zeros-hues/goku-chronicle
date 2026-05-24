import axios from 'axios'

export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('WhatsApp credentials not configured — skipping message send')
    return
  }

  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
}
