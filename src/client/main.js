import { initRoomPreferences } from './features/room/preferences.js';
import { initNavigation } from './shell/navigation.js';
import { initDashboard } from './features/football/dashboard.js';
import { initStandings } from './features/football/standings.js';
import { initClubHub } from './features/clubs/club-hub.js';
import { initAlerts } from './features/alerts/alerts.js';
import { initMatchCenter } from './features/match/match-center.js';
import { initPredictions } from './features/group/predictions.js';
import { initLounge } from './features/lounge/controller.js';
import { initBrasileiraoRound } from './features/football/brasileirao-round.js';
import { initInstall } from './pwa/install.js';
import { initRoom } from './features/room/room-controller.js';

initNavigation();
initRoomPreferences();
initDashboard();
initStandings();
initClubHub();
initAlerts();
initMatchCenter();
initPredictions();
initLounge();
initBrasileiraoRound();
initInstall();

initRoom();
