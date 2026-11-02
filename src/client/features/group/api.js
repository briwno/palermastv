import { requestJSON } from '../../shared/request.js';
import { groupToken } from './identity.js';
export async function communityRequest(path, body) {
  let name = 'Palerma';
  try {
    name = localStorage.getItem('palermas-nickname') || name;
  } catch {}
  return requestJSON(
    '/api/group/' + path,
    {
      credentials: 'same-origin',
      ...(body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: groupToken,
              name,
              ...body,
            }),
          }
        : {}),
    },
    {
      host_only: 'Só quem está transmitindo pode vincular ou remover o jogo.',
      awards_closed: 'A votação abre depois do fim da partida.',
      invalid_award: path.startsWith('pulse')
        ? 'Escolha um jogador que participou da partida.'
        : 'Escolha dois jogadores diferentes que entraram em campo.',
      picks_closed: 'Os palpites fecharam: a partida já começou.',
      game_changed: 'A partida vinculada mudou. Aguarde a atualização da sala.',
      voting_closed: 'A votação abre no intervalo e após o apito final.',
      invalid_identity: 'Salve seu apelido no perfil para participar.',
      invalid_profile: 'Confira seu apelido, avatar e time.',
      try_later: 'Aguarde um segundo antes de enviar novamente.',
      player_limit: 'O grupo atingiu o limite de 32 perfis.',
      game_limit: 'O histórico atingiu o limite de partidas.',
    },
  );
}
