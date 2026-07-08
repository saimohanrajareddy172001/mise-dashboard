'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'
import { CheckCircle, AlertCircle, Link2, Key, AlertTriangle, Trash2, Store } from 'lucide-react'

type DeletionCounts = {
  invoice_files: number
  invoice_headers: number
  invoice_lines: number
  pos_sales: number
  members: number
}

export default function SettingsPage() {
  const { current, deleteRestaurant } = useRestaurant()
  const restaurantId = current?.id ?? null
  const restaurantName = current?.name ?? ''
  const [merchantId, setMerchantId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // Restaurant Depot state
  const [rdEmail, setRdEmail] = useState('')
  const [rdPassword, setRdPassword] = useState('')
  const [rdStoreNumber, setRdStoreNumber] = useState('')
  const [rdStatus, setRdStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [rdErr, setRdErr] = useState<string | null>(null)
  const [rdConnected, setRdConnected] = useState(false)

  // Danger Zone state
  const [counts, setCounts] = useState<DeletionCounts | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  useEffect(() => {
    if (!restaurantId) return
    supabase
      .from('restaurant_settings')
      .select('clover_merchant_id, clover_api_key')
      .eq('restaurant_id', restaurantId)
      .single()
      .then(({ data: settings }) => {
        if (settings) {
          setMerchantId(settings.clover_merchant_id || '')
          setApiKey(settings.clover_api_key ? '••••••••' : '')
          setConnected(!!(settings.clover_merchant_id && settings.clover_api_key))
        } else {
          setMerchantId('')
          setApiKey('')
          setConnected(false)
        }
      })
  }, [restaurantId])

  async function saveClover() {
    if (!restaurantId) return
    setStatus('saving')
    const payload = {
      restaurant_id: restaurantId,
      clover_merchant_id: merchantId.trim() || null,
      clover_api_key: apiKey.startsWith('••') ? undefined : (apiKey.trim() || null),
    }
    const { error } = await supabase
      .from('restaurant_settings')
      .upsert(payload, { onConflict: 'restaurant_id' })
    if (error) { setStatus('error'); return }
    setConnected(!!(merchantId.trim() && apiKey.trim()))
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 3000)
  }

  async function triggerSync() {
    setSyncing(true); setSyncMsg('')
    const resp = await fetch('/api/clover-sync', { method: 'POST', body: JSON.stringify({ restaurant_id: restaurantId }), headers: { 'Content-Type': 'application/json' } })
    const json = await resp.json()
    setSyncMsg(resp.ok ? `Synced ${json.count} sales records.` : json.error || 'Sync failed')
    setSyncing(false)
  }

  useEffect(() => {
    if (!restaurantId) return
    setRdErr(null)
    supabase
      .from('restaurants')
      .select('rd_email, rd_password, rd_store_number')
      .eq('id', restaurantId)
      .single()
      .then(({ data }) => {
        if (data) {
          setRdEmail(data.rd_email || '')
          setRdPassword(data.rd_password ? '••••••••' : '')
          setRdStoreNumber(data.rd_store_number || '')
          setRdConnected(!!(data.rd_email && data.rd_password && data.rd_store_number))
        } else {
          setRdEmail(''); setRdPassword(''); setRdStoreNumber(''); setRdConnected(false)
        }
      })
  }, [restaurantId])

  async function saveRD() {
    if (!restaurantId) return
    setRdStatus('saving'); setRdErr(null)
    const passwordChanged = !rdPassword.startsWith('••')
    const { error } = await supabase.rpc('update_my_restaurant_credentials', {
      p_restaurant_id: restaurantId,
      p_rd_email: rdEmail.trim(),
      p_rd_password: passwordChanged ? rdPassword.trim() : null,
      p_rd_store_number: rdStoreNumber.trim(),
    })
    if (error) {
      setRdStatus('error')
      setRdErr(error.message || 'Save failed')
      return
    }
    const passwordIsSet = passwordChanged ? !!rdPassword.trim() : rdConnected
    setRdConnected(!!(rdEmail.trim() && rdStoreNumber.trim() && passwordIsSet))
    if (passwordChanged && rdPassword.trim()) setRdPassword('••••••••')
    setRdStatus('saved')
    setTimeout(() => setRdStatus('idle'), 3000)
  }

  // Pre-flight counts for the Danger Zone — refreshes on restaurant switch.
  useEffect(() => {
    if (!restaurantId) { setCounts(null); return }
    setConfirmText(''); setDeleteErr(null)
    let cancelled = false
    ;(async () => {
      const [files, headers, lines, sales, members] = await Promise.all([
        supabase.from('invoice_files').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('invoice_headers').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('invoice_lines').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('user_restaurants').select('user_id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
      ])
      if (cancelled) return
      setCounts({
        invoice_files: files.count ?? 0,
        invoice_headers: headers.count ?? 0,
        invoice_lines: lines.count ?? 0,
        pos_sales: sales.count ?? 0,
        members: members.count ?? 0,
      })
    })()
    return () => { cancelled = true }
  }, [restaurantId])

  async function handleDelete() {
    if (!restaurantId) return
    if (confirmText !== restaurantName) {
      setDeleteErr('Type the restaurant name exactly to confirm.')
      return
    }
    setDeleting(true); setDeleteErr(null)
    try {
      await deleteRestaurant(restaurantId)
      // deleteRestaurant switches `current` to another restaurant if available.
      // Dashboard layout will redirect / show the empty state automatically.
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-8">Manage integrations and connections.</p>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <Link2 size={18} className="text-green-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              Clover POS
              {connected && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={10} /> Connected</span>}
            </div>
            <div className="text-sm text-gray-500">Pull sales data to enable wastage tracking</div>
          </div>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Merchant ID</label>
            <input
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              placeholder="e.g. ABC12DEFGHIJK"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Found in Clover Dashboard → Account → About</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1"><Key size={11} /> API Key</label>
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              type="password"
              placeholder="Clover API token"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Clover Dashboard → Setup → API Tokens → Create Token</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={saveClover} disabled={status === 'saving'}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition">
            {status === 'saving' ? 'Saving...' : 'Save'}
          </button>
          {status === 'saved' && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Saved</span>}
          {status === 'error' && <span className="text-sm text-red-500 flex items-center gap-1"><AlertCircle size={14} /> Error saving</span>}
        </div>

        {connected && (
          <div className="mt-5 pt-5 border-t">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-800">Sync Sales Data</div>
                <div className="text-xs text-gray-400 mt-0.5">Pull last 30 days of sales from Clover</div>
              </div>
              <button onClick={triggerSync} disabled={syncing}
                className="px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition">
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
            {syncMsg && <p className="text-sm text-gray-600 mt-2">{syncMsg}</p>}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Store size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              Restaurant Depot
              {rdConnected && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={10} /> Connected</span>}
            </div>
            <div className="text-sm text-gray-500">Auto-pull invoices daily via the Apify scraper</div>
          </div>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Email</label>
            <input
              value={rdEmail}
              onChange={e => setRdEmail(e.target.value)}
              type="email"
              autoComplete="off"
              placeholder="login@example.com"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Your Restaurant Depot account login email</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1"><Key size={11} /> Password</label>
            <input
              value={rdPassword}
              onChange={e => setRdPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Restaurant Depot password"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Stored in your private Supabase project. Leave masked to keep the existing value.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Store Number</label>
            <input
              value={rdStoreNumber}
              onChange={e => setRdStoreNumber(e.target.value)}
              placeholder="e.g. 79"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">The store you order from — visible on any past RD receipt.</p>
          </div>
        </div>

        {rdErr && (
          <div className="bg-red-50 text-red-700 text-sm p-2.5 rounded mb-3 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {rdErr}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={saveRD} disabled={rdStatus === 'saving'}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition">
            {rdStatus === 'saving' ? 'Saving...' : 'Save'}
          </button>
          {rdStatus === 'saved' && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Saved</span>}
        </div>

        {rdConnected && (
          <div className="mt-5 pt-5 border-t">
            <div className="text-sm font-medium text-gray-800">Scheduled sync</div>
            <div className="text-xs text-gray-400 mt-0.5">The Apify actor runs daily and discovers any active restaurant with credentials. New files show up under <span className="font-medium">AI Automation → portal</span> once processed.</div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl border border-dashed p-6 text-center text-gray-400 mb-6">
        <div className="text-sm font-medium mb-1">More integrations coming soon</div>
        <div className="text-xs">Gordon Food Service · Costco · Sysco</div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <div className="font-semibold text-red-700">Danger Zone</div>
            <div className="text-sm text-gray-500">Permanent actions. Read carefully.</div>
          </div>
        </div>

        <div className="border border-red-100 rounded-lg p-4 bg-red-50/50">
          <div className="font-medium text-gray-900 mb-1">Delete this restaurant</div>
          <div className="text-sm text-gray-600 mb-3">
            Permanently delete <span className="font-semibold text-gray-900">{restaurantName || '—'}</span> and everything attached to it. This cannot be undone.
          </div>

          {counts && (
            <div className="text-xs text-gray-600 bg-white border border-red-100 rounded p-3 mb-3 space-y-0.5">
              <div className="font-medium text-gray-800 mb-1">Will permanently delete:</div>
              <div>· {counts.invoice_files.toLocaleString()} invoice file(s)</div>
              <div>· {counts.invoice_headers.toLocaleString()} invoice(s)</div>
              <div>· {counts.invoice_lines.toLocaleString()} line item(s)</div>
              <div>· {counts.pos_sales.toLocaleString()} POS sales record(s)</div>
              <div>· {counts.members.toLocaleString()} team member link(s)</div>
              <div className="text-gray-500 mt-1">Plus: vendors config, invites, recipes, calibrations, Clover settings.</div>
            </div>
          )}

          <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
            Type <span className="font-semibold text-gray-900">{restaurantName}</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => { setConfirmText(e.target.value); setDeleteErr(null) }}
            placeholder={restaurantName}
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-red-400 mb-3"
          />

          {deleteErr && (
            <div className="bg-red-100 text-red-700 text-sm p-2.5 rounded mb-3 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {deleteErr}
            </div>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting || confirmText !== restaurantName}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting…' : 'Delete restaurant permanently'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Owner role required. Soft alternative: ask Supabase admin to set <code className="font-mono">is_active=false</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
