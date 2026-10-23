const agendas = new Map();

const clubGames = new Map();
let latestTable = null;
function setLatestTable(table) {
  latestTable = table;
}
function findGame(id) {
  return [
    ...[...agendas.values()].flatMap((data) => data.games || []),
    ...(latestTable?.liveGames || []),
    ...clubGames.values(),
  ].find((game) => game.id === id);
}
export { agendas, clubGames, findGame, setLatestTable };
