import { requestJSON } from '../../shared/request.js';
import { $ } from '../../shared/dom.js';
import { save } from '../../shared/storage.js';
import { groupToken } from '../group/predictions.js';
const loungeCache = new Map();

const loungeErrors = {
  invalid_poll: 'Escreva uma pergunta e de 2 a 6 opções diferentes.',
  poll_limit:
    'Limite de enquetes atingido. Encerre alguma antes de criar outra.',
  poll_closed: 'Esta enquete foi encerrada.',
  not_owner: 'Só quem criou pode encerrar a enquete.',
  invalid_identity: 'Salve seu apelido na sala primeiro.',
  invalid_post:
    'Cole um link público de post do X, no formato x.com/usuario/status/numero.',
  duplicate_post: 'Esse post já está no mural.',
  post_limit: 'Este mural já tem 24 posts.',
  invalid_widget:
    'Use o código oficial de escalações do Sofascore, com endereço widgets.sofascore.com/embed/lineups.',
  try_later: 'Aguarde um instante e tente novamente.',
};

async function loungeRequest(context, body) {
  if (body && !$('#nickname').value.trim()) {
    const name =
      'Palerma ' +
      (100 + (crypto.getRandomValues(new Uint16Array(1))[0] % 900));
    $('#nickname').value = name;
    save('palermas-nickname', name);
  }
  const d = await requestJSON(
    '/api/group/lounge' +
      (!body ? '?context=' + encodeURIComponent(context) : ''),
    {
      credentials: 'same-origin',
      ...(body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...body,
              context,
              token: groupToken,
              name: $('#nickname').value.trim(),
            }),
          }
        : {}),
    },
    loungeErrors,
  );
  loungeCache.set(context, d);
  return d;
}
export { loungeRequest };
