# Rotur extension source

`featured/Rotur.js` is a **generated file**. Do not edit it by hand. It is
built from this directory plus an embedded copy of `rotur-sdk` from npm:

```
npm run build:rotur
```

- `extension.js` is the source of truth for every block implementation.
  All actions go through the embedded SDK (HTTP namespaces + the SDK status
  socket). The legacy `wss://rotur.mistium.com` protocol
  (`handshake` / `setid` / `pmsg` commands) is gone.
- `helpers.js` holds the block factory helpers.
- `getinfo.js` holds the block + menu definitions. It was lifted verbatim
  from the old hand-written extension, so the block surface (141 opcodes in
  the same order, same menus) is unchanged and existing projects keep
  working.

## Behaviour changes vs the old websocket build

- Connecting now requires a login. `connectToServer` prepares the SDK
  client; the socket opens on `login_prompt` / `login with token`. The old
  build connected anonymously first.
- `login` / `loginMd5` (username + password) and `register` no longer exist
  server-side. They return a message pointing at the login prompt / token
  flow instead of silently doing nothing.
- `clientIP` returns `"Unavailable in the SDK build"`. The new backend does
  not expose it.
- Presence blocks (`connected users`, join/leave, designation filter) read
  the rooms you joined. The old `rtr-username` designation prefix no longer
  exists, so `get all users on designation` returns the room members only
  when the designation matches the connected one.
- Mail, synced variables, and calls are delivered as SDK socket messages
  while both users share the room, then cached locally. Mail sent while the
  recipient is offline is not stored server-side.
- Hidden admin key blocks (`updateItem`, `deleteItem`, `hideItem`) map to
  the SDK keys namespace. `showItem` and `allBadges` / `badgeInfo` are stubs
  that say where to go instead.
