// Packs each plugin into dist/<name>-<version>.zip for Claude Desktop's
// "Import a plugin" dialog: the manifest sits at the archive's root.
// Usage: npm run zip [-- <plugin-name>]
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PLUGINS = join(ROOT, 'plugins')
const DIST = join(ROOT, 'dist')

// Development files the installed plugin has no use for.
const SKIPPED = [/^\.claude-plugin\/types(\/|$)/, /\.test\.[cm]?[jt]sx?$/, /^tsconfig\.json$/, /(^|\/)\.DS_Store$/]

const filesUnder = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })

const pack = name => {
  const dir = join(PLUGINS, name)
  const manifest = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'))
  const entries = {}

  for (const file of filesUnder(dir)) {
    const path = relative(dir, file).split(sep).join('/')
    if (!SKIPPED.some(rule => rule.test(path))) entries[path] = readFileSync(file)
  }

  mkdirSync(DIST, { recursive: true })
  const out = join(DIST, `${manifest.name}-${manifest.version}.zip`)
  writeFileSync(out, zipSync(entries, { level: 9 }))
  console.log(`${relative(ROOT, out)}  (${Object.keys(entries).length} files: ${Object.keys(entries).join(', ')})`)
}

const wanted = process.argv.slice(2)
const names = wanted.length > 0 ? wanted : readdirSync(PLUGINS).filter(name => statSync(join(PLUGINS, name)).isDirectory())
names.forEach(pack)
