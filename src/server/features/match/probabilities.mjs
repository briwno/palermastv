export function poissonProbabilities(home, away) {
  if (home.length < 5 || away.length < 5) return null;
  const mean = (list, field) =>
    list.reduce((sum, g) => sum + g[field], 0) / list.length;
  const lambdaHome = (mean(home, 'own') + mean(away, 'against')) / 2;
  const lambdaAway = (mean(away, 'own') + mean(home, 'against')) / 2;
  const distribution = (lambda) => {
    const p = [Math.exp(-lambda)];
    for (let n = 1; n <= 30; n++) p.push((p[n - 1] * lambda) / n);
    return p;
  };
  const h = distribution(lambdaHome),
    a = distribution(lambdaAway),
    totals = { home: 0, draw: 0, away: 0 };
  const scores = [];
  for (let i = 0; i < h.length; i++)
    for (let j = 0; j < a.length; j++) {
      const probability = h[i] * a[j];
      totals[i > j ? 'home' : i === j ? 'draw' : 'away'] += probability;
      scores.push({ home: i, away: j, probability });
    }
  const mass = totals.home + totals.draw + totals.away;
  const shares = ['home', 'draw', 'away'].map(
    (key) => (totals[key] / mass) * 1000,
  );
  const rounded = shares.map(Math.floor);
  const order = shares
    .map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  const remainder = 1000 - rounded.reduce((a, b) => a + b, 0);
  for (let n = 0; n < remainder; n++) rounded[order[n].index]++;
  return {
    home: rounded[0] / 10,
    draw: rounded[1] / 10,
    away: rounded[2] / 10,
    expectedHome: Math.round(lambdaHome * 100) / 100,
    expectedAway: Math.round(lambdaAway * 100) / 100,
    sampleHome: home.length,
    sampleAway: away.length,
    scores: scores
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3)
      .map((s) => ({
        ...s,
        probability: Math.round((s.probability / mass) * 1000) / 10,
      })),
    method:
      'Poisson · médias de gols marcados e sofridos nos últimos 10 jogos anteriores à partida. Sem ajuste de mando, escalação ou força dos adversários.',
  };
}
