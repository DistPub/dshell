# dshell
Decentralized distribution browser action framework, build-in P2P network and IPFS storage.

# Build
`dshell` writen under `esm` module system, but the dependency part current not support `emm`.

Run `npm run build-dep` to generate `dep.bundle.min.js` file.

>In `nodejs` environment, no build step need.

# Usage

Include `dshell` dependency first, add below code to your html code:

```
<script src="/path/to/dshell/dep.bundle.min.js"></script>
```

Then you can import in module script tag:
 
```
<script type="module" about="main">
  import { Shell, UserNode, Soul, datastoreLevel } from '/path/to/dshell/index.js';
  
  ...rest part code
</script>
```

# API

todo