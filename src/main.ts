import { GAME_TITLE } from './app/config';
import { startGame } from './app/game';

document.title = GAME_TITLE;
const host = document.getElementById('app');
if (host === null) throw new Error('Missing #app element');
startGame(host).catch((error: unknown) => {
  console.error(error);
});
