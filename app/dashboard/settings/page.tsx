'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, AlertCircle, Link2, Key } from 'lucide-react'

type Settings = { clover_merchant_id: string | null; clover_api_key: string | null }

export default function SettingsPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [merchantId, setMerchantId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', data.user.id).single()
      if (!profile) return
      setRestaurantId(profile.restaurant_id)
      const { data: settings } = await supabase
        .from('restaurant_settings')
        .select('clover_merchant_id, clover_api_key')
        .eq('restaurant_id', profile.restaurant_id)
        .single()
      if (settings) {
        setMerchantId(settings.clover_merchant_id || '')
        setApiKey(settings.clover_api_key ? '••••••••' : '')
        setConnected(!!(settings.clover_merchant_id && settings.clover_api_key))
      }
    })
  }, [])

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

      <div className="bg-gray-50 rounded-xl border border-dashed p-6 text-center text-gray-400">
        <div className="text-sm font-medium mb-1">More integrations coming soon</div>
        <div className="text-xs">Gordon Food Service · Costco · Sysco</div>
      </div>
    </div>
  )
}
