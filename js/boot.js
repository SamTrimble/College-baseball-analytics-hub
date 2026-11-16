// Shared page bootstrap: navigation/footer, Diamond AI chatbot, optional Chatling embed.
import { renderChrome } from './ui/common.js';
import { mountDiamond } from './chat/widget.js';
import { mountChatling } from './chatling.js';

export function boot(pageId) {
  renderChrome(pageId);
  mountChatling();
  mountDiamond({ page: pageId });
}
