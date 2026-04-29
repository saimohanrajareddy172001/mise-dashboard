import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are an invoice parser. Extract all line items from the invoice and return ONLY valid JSON.

Output this exact schema (no markdown, no explanation):
{
  "vendor": "vendor name",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "items": [
    {
      "item_name": "exact name from invoice",
      "display_name": "clean readable name (expand abbreviations, proper case)",
      "quantity": number,
      "purchase_unit": "lb | each | case",
      "unit_price": number,
      "total": number
    }
  ]
}

Rules:
- purchase_unit: "lb" if sold by weight, "case" if sold as a case of multiple units, "each" for everything else
- Skip non-product rows: taxes, fees, subtotals, payment rows, tips
- display_name: expand abbreviations (SHR→Shrimp, CHIX→Chicken, BTR→Butter, BNLS→Boneless, BRST→Breast, THGH→Thigh, PROD→remove, FZ→Frozen, GARLC→Garlic, HAL→Halal, etc.)
- Credits and returns should have negative total values
- If quantity is missing assume 1
- All numbers as floats, no currency symbols`

function categorize(name: string): string {
  const n = name.toUpperCase()
  if (/^FZ\b/.test(n)) return 'Frozen'
  if (/\b(CONT\b|FOIL|BAG\b|GLOVE|TOWEL|BLEACH|PINE.?SOL|CUP\b|LID\b|LINER|WRAP|NAPKIN|SOAP|SANITIZER|SPONGE|CHARMIN|GRILL.?BRICK|STRAW)\b/.test(n)) return 'Supplies'
  if (/^(PROD|PD)\b|\b(BROCCOLI|CAULIFLOWER|CILANTRO|CUCUMBER|CELERY|ZUCCHINI|TOMATILLO|MANGO|LIME|LEMON|BERRY|BERRIES|SPINACH|GINGER|MUSHROOM|TOMATO|CARROT|ONION|GARLIC|PEPPER|LETTUCE|ARUGULA|KALE|CABBAGE|AVOCADO|EGGPLANT)\b/.test(n)) return 'Produce'
  if (/\b(CHIX|CHICKEN|LAMB|BEEF|PORK|SHR|SHRIMP|TILAPIA|POMPANO|SALMON|TUNA|FISH|WING|HALAL|TURKEY|DUCK|VEAL|LOBSTER|CRAB|SCALLOP)\b/.test(n)) return 'Protein'
  if (/\b(CREAM|MILK|MLK|BUTTER|BTR|YOG|YOGURT|CHEESE|CHS|PANEER|DAHI|EGG)\b/.test(n)) return 'Dairy'
  if (/^BIB\b|\b(LEMONADE|PURE.?LIFE|WATER|SODA|JUICE|COFFEE|TEA)\b/.test(n)) return 'Beverages'
  if (/\b(OIL|FLOUR|SUGAR|STARCH|RICE|SALT|BASMATI|BEAN|PUREE|SAUCE|KETCHUP|SRIRACHA|SPICE|GARBANZO|CORN|EVAP|VINEGAR|MAYO|MUSTARD|SOY|SEASONING|BREAD|BRD|PASTA|NOODLE|LENTIL|CHICKPEA)\b/.test(n)) return 'Dry Goods'
  return 'Other'
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mime = file.type || 'application/octet-stream'

  let contentBlock: Record<string, unknown>
  if (mime === 'application/pdf') {
    contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
  } else if (mime.startsWith('image/')) {
    contentBlock = { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
  } else {
    const text = Buffer.from(bytes).toString('utf-8')
    contentBlock = { type: 'text', text: `Invoice content:\n\n${text}` }
  }

  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Parse this invoice and return the JSON.' }] }],
    }),
  })

  if (!claudeResp.ok) {
    const err = await claudeResp.text()
    return NextResponse.json({ error: `Claude API error: ${err}` }, { status: claudeResp.status })
  }

  const result = await claudeResp.json()
  let raw: string = result.content[0].text.trim()
  raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)

  for (const item of parsed.items || []) {
    item.category = categorize(item.item_name || '')
    item.display_name = item.display_name || item.item_name
    item.purchase_unit = item.purchase_unit || 'each'
    const qty = item.quantity || 1
    const price = item.unit_price || 0
    const total = item.total || 0
    if (price && !total) item.total = Math.round(price * qty * 100) / 100
    else if (total && !price) item.unit_price = Math.round((total / qty) * 10000) / 10000
  }

  return NextResponse.json(parsed)
}
