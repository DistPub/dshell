# dshell
Decentralized distribution browser action framework, build-in P2P network and IPFS storage.

# Install
`npm install dshell`

# Build
`dshell` writen under `esm` module system, but the dependency part current not support `esm`.

Run `npm run build-dep` to generate `dep.bundle.min.js` file.

>In `nodejs` environment, no build step need.

# Usage

Include `dshell` dependency first, add below code to your html code:

```
<script src="/path/to/dshell/dep.bundle.min.js"></script>

or use cdn

<script src="https://cdn.jsdelivr.net/npm/dshell/dep.bundle.min.js"></script>
```

Then you can import in module script tag:
 
```
<script type="module" about="main">
  import { Shell, UserNode, Soul, datastoreLevel } from '/path/to/dshell/index.js';
  
  ...rest part code
</script>

or use cdn

<script type="module" about="main">
  import { Shell, UserNode, Soul, datastoreLevel } from 'https://cdn.jsdelivr.net/npm/dshell/index.min.js';
  
  ...rest part code
</script>
```

# Example

```
const username = 'demo';
const db = (new datastoreLevel(`dshell/${username}`, { prefix: '' })).db;
const country = '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/';
const simplePeerOptions = { trickle: true };
const my = new UserNode(db, username, country, simplePeerOptions);
const soul = new Soul(db, username);
const shell = new Shell(my, soul);
window.dshell = shell;
const peers = [];
const intervalCache = {};

async function beatPingPeer(id) {
  await my.pingPeer(id)
}

function log(message) {
  console.log(message)
}

function MeetPeer(id) {
  log(`* Nice to meet ${id}`);

  if (!peers.includes(id)) {
    peers.push(id)
    intervalCache[id] = window.setInterval(async () => await beatPingPeer(id), 3000);
  }
}

function AwayPeer(id) {
  log(`* Bay ${id}`);

  const index = peers.indexOf(id);
  if (index > -1) {
    peers.splice(index, 1);
    window.clearInterval(intervalCache[id]);
    delete intervalCache[id]
  }
}
my.on('user:online', MeetPeer);
my.on('user:offline', AwayPeer);

document.addEventListener('DOMContentLoaded', async () => {
  await db.put('welcome', 'shell');
  db.db.codec.opts.valueEncoding = 'json';
  await my.init();
  window.addEventListener("unload", async () => await my.vegetative());
  await soul.init();
  shell.install();
  shell.installModule(
    'https://cdn.jsdelivr.net/npm/dshell/actions/network.js',
    'https://cdn.jsdelivr.net/npm/dshell/actions/dom.js',
    'https://cdn.jsdelivr.net/npm/dshell/actions/utils.js',
    'https://cdn.jsdelivr.net/npm/dshell/actions/soul.js',
  );
  shell.installExternalAction(function Add(_, a, b) {
    return a + b
  });
  await my.awake();
});
```

Try

```
response = await shell.exec(shell.Action
    .zipArray([Array(10).fill(1), Array(10).fill(2)]) // => [[1, 2], ...]
    .Add.PCollect // => [3, ...]
    .Map // => 3
    .Echo // => "3"
    .Collect // => ["3", ...]
    .zipArray([Array(10).fill(4)]) // => [[4, "3"]]
    .buildExcel(['data', ['number', 'add result']]) // => blob file
    .download(['demo.xlsx']) // trigger download
    .pushFile(['/tmp/demo.xlsx']) // upload to IPFS storage
    .PreviewOffice) // preview online
```
# API

todo