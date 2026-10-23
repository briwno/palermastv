import { activeMatch } from '../match/match-center.js';
const matchContext = () =>
  activeMatch ? activeMatch.game.leagueId + ':' + activeMatch.game.id : null;
export { matchContext };
