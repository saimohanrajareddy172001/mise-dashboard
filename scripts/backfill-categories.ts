/**
 * Backfill invoice_lines.category using the shared categorize() rules.
 *
 * Reads EVERY invoice_lines row, recomputes the category from item_name, and
 * (with --apply) writes back the rows whose category actually changed.
 *
 * Safety: DRY RUN by default — prints what would change and writes nothing.
 * Pass --apply to persist. Uses the service-role key so it can see/update
 * rows across every restaurant (RLS would otherwise scope to the caller).
 *
 * Run:
 *   npx tsx scripts/backfill-categories.ts            # preview only
 *   npx tsx scripts/backfill-categories.ts --apply    # write changes
 *
 * (tsx is not a project dependency; `npx tsx` fetches it on demand.)
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { categorize } from '../lib/categorize'

// --- Minimal .env.local loader (no dotenv dependency) --------------------
function loadEnvLocal(): void {
  let raw: string
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  } catch {
    return // fall back to whatever is already in process.env
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

type Line = { id: string; item_name: string | null; category: string | null }

const PAGE = 1000
const APPLY = process.argv.includes('--apply')

async function main() {
  loadEnvLocal()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY (checked .env.local).')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(APPLY ? '── BACKFILL (APPLY) ──' : '── BACKFILL (dry run — no writes) ──')

  let from = 0
  let scanned = 0
  let changed = 0
  let updated = 0
  const byCategory: Record<string, number> = {}
  const samples: string[] = []

  for (;;) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select('id, item_name, category')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('Read failed:', error.message)
      process.exit(1)
    }
    const rows = (data ?? []) as Line[]
    if (rows.length === 0) break

    // Rows in this page whose category should change.
    const updates: { id: string; category: string }[] = []
    for (const row of rows) {
      scanned++
      const next = categorize(row.item_name ?? '')
      byCategory[next] = (byCategory[next] ?? 0) + 1
      if (next !== (row.category ?? '')) {
        changed++
        updates.push({ id: row.id, category: next })
        if (samples.length < 20) {
          samples.push(`  ${JSON.stringify(row.item_name)}: ${row.category ?? 'null'} → ${next}`)
        }
      }
    }

    if (APPLY && updates.length) {
      // Per-row update keyed by primary key. Bounded concurrency to stay
      // gentle on the API while still moving quickly.
      const CONCURRENCY = 10
      for (let i = 0; i < updates.length; i += CONCURRENCY) {
        const batch = updates.slice(i, i + CONCURRENCY)
        const results = await Promise.all(
          batch.map((u) =>
            supabase.from('invoice_lines').update({ category: u.category }).eq('id', u.id),
          ),
        )
        for (const r of results) {
          if (r.error) console.error('  update failed:', r.error.message)
          else updated++
        }
      }
    }

    process.stdout.write(`  scanned ${scanned}, would-change ${changed}${APPLY ? `, updated ${updated}` : ''}\r`)

    if (rows.length < PAGE) break
    from += PAGE
  }

  console.log('\n\nResulting category distribution (recomputed over all rows):')
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(12)} ${count}`)
  }

  if (samples.length) {
    console.log(`\nSample changes (first ${samples.length}):`)
    console.log(samples.join('\n'))
  }

  console.log('')
  if (APPLY) {
    console.log(`Done. Scanned ${scanned}, changed ${changed}, updated ${updated}.`)
  } else {
    console.log(`Dry run. Scanned ${scanned}, ${changed} rows would change. Re-run with --apply to write.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
