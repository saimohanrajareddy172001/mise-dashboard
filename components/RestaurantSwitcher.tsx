'use client'

import { Building2 } from 'lucide-react'
import { useRestaurant } from '@/lib/restaurant'

export default function RestaurantSwitcher() {
  const { list, current, setCurrent, loading } = useRestaurant()

  if (loading)
    return <span className="text-sm text-gray-500">Loading…</span>

  if (!list.length)
    return (
      <span className="text-sm text-gray-500 italic">No restaurants</span>
    )

  if (list.length === 1)
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700">
        <Building2 size={14} className="text-gray-400" />
        {list[0].name}
      </div>
    )

  return (
    <div className="relative flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300 transition">
      <Building2 size={14} className="text-gray-400" />
      <select
        value={current?.id || ''}
        onChange={(e) => {
          const r = list.find((x) => x.id === e.target.value)
          if (r) setCurrent(r)
        }}
        className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer pr-2"
        title="Switch restaurant"
      >
        {list.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  )
}
