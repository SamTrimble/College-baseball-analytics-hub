// Optional Chatling embed (your Lab 3 bot). Configure in js/config.js → CHATLING.
// Loaded once per page from here so every page gets the identical embed.
import { CHATLING } from './config.js';

export function mountChatling() {
  if (!CHATLING.enabled || !CHATLING.chatbotId || CHATLING.chatbotId.startsWith('PASTE')) return;
  document.body.classList.add('has-chatling'); // moves Diamond AI's button up so they don't overlap
  window.chtlConfig = { chatbotId: CHATLING.chatbotId };
  const s = document.createElement('script');
  s.async = true;
  s.src = CHATLING.scriptSrc;
  s.id = 'chtl-script';
  s.type = 'text/javascript';
  s.setAttribute('data-id', CHATLING.chatbotId);
  document.body.append(s);
}
