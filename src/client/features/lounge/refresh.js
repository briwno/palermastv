import { loungeRequest } from './api.js';
import { groupIdentity } from '../group/predictions.js';
import { pollCards } from './polls.js';
async function refreshLounge(target, context, renderSocial = null) {
  try {
    const d = await loungeRequest(context);
    await groupIdentity;
    if (target.dataset.context !== context) return;
    if (renderSocial) renderSocial(d);
    else target.querySelector('.poll-list').innerHTML = pollCards(d);
    target.querySelector('.lounge-message').textContent = '';
  } catch (e) {
    if (target.querySelector('.lounge-message'))
      target.querySelector('.lounge-message').textContent = e.message;
  }
}
export { refreshLounge };
