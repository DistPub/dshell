/**
 * This module exported a default shell for do lightly local based action work.
 * If you want use P2P network feature, you **MUST** create your own shell instead of use this default shell.
 */
import { Shell, UserNode, Soul, datastoreLevel } from './index.js';

const username = 'dshell';
const db = (new datastoreLevel(`dshell/${username}`, { prefix: '' })).db;
const country = '/dns4/YOUR.HOST.SIGNALLING.STAR/tcp/443/wss/p2p-webrtc-star';
const simplePeerOptions = { trickle: true };
const nodeMode = 'unworldly'; // use `worldly` mode to enable P2P
const my = new UserNode(db, username, country, simplePeerOptions, nodeMode);
const soul = new Soul(db, username);
const shell = new Shell(my, soul);

(async () => {
  await db.put('welcome', 'shell');
  db.db.codec.opts.valueEncoding = 'json';
  await my.init();
  await soul.init();
  shell.install();
  shell.installModule(
    './actions/network.js',
    './actions/dom.js',
    './actions/utils.js',
    './actions/soul.js',
  );
  // need awake node when in `worldly` mode
  // await my.awake();
})();

window.dshell = shell;
export default shell;
