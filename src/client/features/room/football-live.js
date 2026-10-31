// Substitutions inherit the outgoing player's display slot, not a claimed new formation.
export function currentLineup(lineup, events, initial = false) {
  if (!lineup || initial) return lineup;
  const players = lineup.players.map((p) => ({
    ...p,
    initialStarter: p.starter,
  }));
  const substitutions = events
    .filter((e) => e.type === 'substitution' && e.teamId === lineup.team.id)
    .sort((a, b) => a.period - b.period || a.seconds - b.seconds);
  for (const e of substitutions) {
    const [incomingId, outgoingId] = e.participantIds || [];
    const incoming = players.find((p) => p.id === incomingId),
      outgoing = players.find((p) => p.id === outgoingId);
    if (!incoming || !outgoing || !outgoing.starter || incoming.starter)
      continue;
    incoming.positionCode = outgoing.positionCode;
    incoming.formationPlace = outgoing.formationPlace;
    incoming.starter = true;
    incoming.enteredAt = e.clock;
    outgoing.starter = false;
    outgoing.leftAt = e.clock;
  }
  // Sent-off players keep their slot so the formation stays drawable.
  for (const p of players) if (Number(p.redCards) > 0) p.sentOff = p.starter;
  return { ...lineup, players };
}

export function goalChange(previous, game) {
  if (
    !previous ||
    previous.id !== game.id ||
    previous.leagueId !== game.leagueId ||
    game.state !== 'in'
  )
    return null;
  const scores = [
    previous.homeScore,
    previous.awayScore,
    game.homeScore,
    game.awayScore,
  ];
  if (!scores.every(Number.isFinite)) return null;
  const home = game.homeScore - previous.homeScore,
    away = game.awayScore - previous.awayScore;
  return home === 1 && away === 0
    ? 'home'
    : away === 1 && home === 0
      ? 'away'
      : null;
}
