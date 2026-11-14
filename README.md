# Claude Desktop Mods

Quality of life mods for the Claude Desktop app (Code).

## Mods
- [usage-glance](plugins/usage-glance): Your session and weekly usage as two quiet rings above the chat input.

## Install

Add the `yo-l-an/claude-desktop-mods` repository as a marketplace, then install the mod.

```
/plugin marketplace add yo-l-an/claude-desktop-mods
/plugin install usage-glance@claude-desktop-mods
```

## Development

```bash
npm install
npm run check   # validate the manifest and hooks, type-check, run the tests
npm run zip     # for local install: pack every plugin into `dist/<name>-<version>.zip`
```
