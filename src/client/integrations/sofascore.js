const sofaRound31 = [
  ['2026-10-16', 'Mirassol', 'Internacional', '15238223'],
  ['2026-10-17', 'Botafogo', 'Chapecoense', '15238196'],
  ['2026-10-17', 'Atlético-MG', 'Coritiba', '15238202'],
  ['2026-10-17', 'Athletico', 'Palmeiras', '15238204'],
  ['2026-10-17', 'São Paulo', 'Vasco', '15238219'],
  ['2026-10-18', 'Fluminense', 'Santos', '15238198'],
  ['2026-10-18', 'Grêmio', 'Cruzeiro', '15238214'],
  ['2026-10-18', 'Bahia', 'Flamengo', '15238203'],
  ['2026-10-18', 'Remo', 'RB Bragantino', '15238209'],
  ['2026-10-19', 'Corinthians', 'Vitória', '15238199'],
];

function sofaTeam(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/athletico(?:[- ]?(?:pr|paranaense))?/g, 'athletico')
    .replace(/atletico(?:[- ]mg| mineiro)/g, 'atleticomg')
    .replace(/vasco da gama/g, 'vasco')
    .replace(/(?:rb|red bull) bragantino/g, 'bragantino')
    .replace(/[^a-z0-9]/g, '');
}

function sofaForGame(g) {
  if (!g || g.leagueId !== 'bra.1') return null;
  const matches = sofaRound31.filter(
    (r) =>
      r[0] === g.day &&
      sofaTeam(r[1]) === sofaTeam(g.home.name) &&
      sofaTeam(r[2]) === sofaTeam(g.away.name),
  );
  return matches.length === 1
    ? {
        url:
          'https://widgets.sofascore.com/embed/lineups?id=' +
          matches[0][3] +
          '&widgetTheme=dark',
        name: 'Sofascore · rodada 31',
      }
    : null;
}

function sofaInput(value) {
  try {
    const u = new URL(String(value).trim());
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      !['sofascore.com', 'www.sofascore.com'].includes(u.hostname) ||
      !/^\/(?:[a-z]{2}\/)?football\/match\//.test(u.pathname)
    )
      return null;
    const id = u.hash.match(/^#id:(\d{1,14})(?:,.*)?$/)?.[1];
    return id
      ? 'https://widgets.sofascore.com/embed/lineups?id=' +
          id +
          '&widgetTheme=dark'
      : null;
  } catch {
    return null;
  }
}
export { sofaInput, sofaForGame };
