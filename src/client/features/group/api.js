import { groupToken } from './identity.js';
export async function communityRequest(path, body) {
  let name = 'Palerma';
  try {
    name = localStorage.getItem('palermas-nickname') || name;
  } catch {}
  const r = await fetch('/api/group/' + path, {
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
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(
      {
        host_only: 'Só quem está transmitindo pode vincular ou remover o jogo.',
        awards_closed: 'A votação abre depois do fim da partida.',
        invalid_award:
          'Escolha dois jogadores diferentes que entraram em campo.',
        invalid_identity: 'Salve seu apelido no perfil para participar.',
        invalid_profile: 'Confira seu apelido, avatar e time.',
        try_later: 'Aguarde um segundo antes de enviar novamente.',
        player_limit: 'O grupo atingiu o limite de 32 perfis.',
        game_limit: 'O histórico atingiu o limite de partidas.',
      }[data.error] || 'Não foi possível consultar o grupo. Tente novamente.',
    );
  return data;
}
