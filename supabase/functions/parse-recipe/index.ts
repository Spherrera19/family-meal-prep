import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { parseHTML } from 'npm:linkedom'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ok  = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const err = (msg: string)   => new Response(JSON.stringify({ error: msg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDuration(iso: string): string {
  if (!iso) return ''
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return iso
  const h = parseInt(m[1] || '0')
  const min = parseInt(m[2] || '0')
  if (h && min) return `${h}h ${min}m`
  if (h) return `${h}h`
  if (min) return `${min}m`
  return iso
}

function getImageUrl(image: unknown): string | undefined {
  if (!image) return undefined
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return getImageUrl(image[0])
  if (typeof image === 'object' && image !== null && 'url' in image) {
    return (image as Record<string, unknown>).url as string
  }
  return undefined
}

function findRecipe(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) {
    for (const item of data) {
      const r = findRecipe(item)
      if (r) return r
    }
    return null
  }
  const obj = data as Record<string, unknown>
  if (obj['@type'] === 'Recipe') return obj
  if (Array.isArray(obj['@type']) && (obj['@type'] as string[]).includes('Recipe')) return obj
  if (obj['@graph']) return findRecipe(obj['@graph'])
  return null
}

// Strip non-numeric chars and return an integer, or undefined if unparseable
function parseNutritionInt(val: unknown): number | undefined {
  if (val == null) return undefined
  const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? undefined : n
}

// Keep decimal point, return float or undefined
function parseNutritionFloat(val: unknown): number | undefined {
  if (val == null) return undefined
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? undefined : n
}

// ─── Schema.org nutrition extraction ─────────────────────────────────────────

type NutritionResult = {
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  saturated_fat_g?: number
}

function extractFromSchemaOrg(nutrition: Record<string, unknown>): NutritionResult {
  return {
    calories:        parseNutritionInt  (nutrition.calories),
    protein_g:       parseNutritionInt  (nutrition.proteinContent),
    carbs_g:         parseNutritionInt  (nutrition.carbohydrateContent),
    fat_g:           parseNutritionInt  (nutrition.fatContent),
    fiber_g:         parseNutritionFloat(nutrition.fiberContent),
    sugar_g:         parseNutritionFloat(nutrition.sugarContent),
    sodium_mg:       parseNutritionInt  (nutrition.sodiumContent),
    saturated_fat_g: parseNutritionFloat(nutrition.saturatedFatContent),
  }
}

// ─── USDA FoodData Central ingredient-based fallback ─────────────────────────

// USDA nutrient IDs
const NUTRIENT_IDS = {
  calories:        1008,
  protein_g:       1003,
  fat_g:           1004,
  carbs_g:         1005,
  fiber_g:         1079,
  sugar_g:         2000,
  sodium_mg:       1093,
  saturated_fat_g: 1258,
}

// Unit → gram weight (approximate)
const UNIT_G: Record<string, number> = {
  // Mass (exact)
  g: 1, gram: 1, grams: 1, mg: 0.001, kg: 1000,
  oz: 28.35, lb: 453.59, pound: 453.59, pounds: 453.59,
  // Volume (water density baseline)
  ml: 1, l: 1000, cup: 240, cups: 240,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  'fl oz': 30, pint: 473, quart: 946,
  // Count (representative gram weights)
  large: 50, medium: 35, small: 25, clove: 5, cloves: 5,
  bunch: 80, slice: 30, slices: 30, piece: 40, pieces: 40,
  stalk: 40, stalks: 40, sprig: 5, sprigs: 5, strip: 25, strips: 25,
}

// Food-specific density corrections (grams per cup)
const DENSITY_PER_CUP: Record<string, number> = {
  // Flours & powders
  flour: 125, 'all-purpose flour': 125, 'bread flour': 130, 'cake flour': 114,
  'almond flour': 112, 'whole wheat flour': 130, 'cocoa powder': 85, 'bread crumbs': 120, breadcrumbs: 120,
  // Sugars
  sugar: 200, 'brown sugar': 220, 'powdered sugar': 120, 'granulated sugar': 200,
  // Fats
  butter: 227, 'olive oil': 216, oil: 218, 'vegetable oil': 218, 'coconut oil': 218,
  // Sweeteners
  honey: 340, 'maple syrup': 322, agave: 340,
  // Grains
  rice: 185, 'rolled oats': 90, oats: 90,
  // Dairy
  milk: 245, cream: 240, yogurt: 245, 'sour cream': 230,
}

const VOLUME_UNITS = new Set(['ml', 'l', 'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'fl oz', 'pint', 'quart'])

function parseFraction(s: string): number | null {
  const parts = s.trim().split('/')
  if (parts.length === 2) {
    const num = parseFloat(parts[0])
    const den = parseFloat(parts[1])
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den
  }
  return null
}

function parseQuantity(s: string): number | null {
  // Range: "1-2" or "1 to 2" → average
  const rangeMatch = s.match(/^([\d.]+)\s*[-–]\s*([\d.]+)$/) || s.match(/^([\d.]+)\s+to\s+([\d.]+)$/i)
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1])
    const b = parseFloat(rangeMatch[2])
    if (!isNaN(a) && !isNaN(b)) return (a + b) / 2
  }

  // Mixed number: "1 1/2"
  const mixedMatch = s.match(/^([\d.]+)\s+(\d+\/\d+)$/)
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1])
    const frac = parseFraction(mixedMatch[2])
    if (!isNaN(whole) && frac !== null) return whole + frac
  }

  // Simple fraction: "1/2"
  if (s.includes('/')) {
    const frac = parseFraction(s)
    if (frac !== null) return frac
  }

  // Plain number
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

type ParsedIngredient = { gramWeight: number; foodName: string }

function parseIngredient(str: string): ParsedIngredient | null {
  // Skip "to taste" / "as needed"
  if (/\b(to taste|as needed|optional)\b/i.test(str)) return null

  const s = str.trim()

  // Parenthetical can: "1 (15 oz) can black beans"
  const canMatch = s.match(/^([\d\s/.-]+)\s*\(\s*([\d.]+)\s*(oz|g|ml|lb)\s*\)\s*(?:can|jar|bottle)s?\s+(.+)/i)
  if (canMatch) {
    const count = parseQuantity(canMatch[1].trim()) ?? 1
    const size  = parseFloat(canMatch[2])
    const unit  = canMatch[3].toLowerCase()
    const food  = canMatch[4].split(/[,;]/)[0].trim()
    const unitG = UNIT_G[unit] ?? 1
    if (!isNaN(count) && !isNaN(size)) {
      return { gramWeight: count * size * unitG, foodName: food }
    }
  }

  // Tokenize: split on spaces
  const tokens = s.split(/\s+/)
  if (tokens.length === 0) return null

  // Try to parse quantity from first 1-3 tokens
  let qty: number | null = null
  let unitStartIdx = 0

  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    qty = parseQuantity(tokens.slice(0, len).join(' '))
    if (qty !== null) { unitStartIdx = len; break }
  }
  if (qty === null) return null

  // Try to parse unit from next token(s) — handle "fl oz" (2 words)
  let unit: string | undefined
  let foodStartIdx = unitStartIdx

  if (tokens[unitStartIdx] && tokens[unitStartIdx + 1]) {
    const twoWord = `${tokens[unitStartIdx]} ${tokens[unitStartIdx + 1]}`.toLowerCase()
    if (UNIT_G[twoWord] !== undefined) {
      unit = twoWord
      foodStartIdx = unitStartIdx + 2
    }
  }
  if (!unit && tokens[unitStartIdx]) {
    const oneWord = tokens[unitStartIdx].toLowerCase().replace(/[.,;]$/, '')
    if (UNIT_G[oneWord] !== undefined) {
      unit = oneWord
      foodStartIdx = unitStartIdx + 1
    }
  }

  if (!unit) {
    // No unit found — qty may actually be a count (e.g., "2 eggs")
    unit = 'piece'
    foodStartIdx = unitStartIdx
  }

  const rawFood = tokens.slice(foodStartIdx).join(' ')
  // Strip prep notes after first comma or semicolon
  const foodName = rawFood.split(/[,;]/)[0].trim().toLowerCase()
  if (!foodName) return null

  let gramWeight = qty * (UNIT_G[unit] ?? 1)

  // Apply density correction for volume units
  if (VOLUME_UNITS.has(unit)) {
    const cupRatio = (UNIT_G[unit] ?? 240) / 240
    for (const [key, densityPerCup] of Object.entries(DENSITY_PER_CUP)) {
      if (foodName.includes(key)) {
        gramWeight = qty * cupRatio * densityPerCup
        break
      }
    }
  }

  return { gramWeight, foodName }
}

async function fetchUSDANutrients(
  foodName: string,
  apiKey: string,
): Promise<Record<string, number> | null> {
  try {
    const params = new URLSearchParams({
      query:    foodName,
      api_key:  apiKey,
      dataType: 'Foundation,SR Legacy',
      pageSize: '3',
      nutrients: Object.values(NUTRIENT_IDS).join(','),
    })
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.foods?.length) return null

    const food = data.foods[0]
    const nutrientMap: Record<string, number> = {}
    for (const fn of (food.foodNutrients ?? [])) {
      for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
        if (fn.nutrientId === id && typeof fn.value === 'number') {
          nutrientMap[key] = fn.value
        }
      }
    }
    return Object.keys(nutrientMap).length > 0 ? nutrientMap : null
  } catch {
    return null
  }
}

function parseServingsCount(servingsStr: string | undefined): number {
  if (!servingsStr) return 1
  // "4-6" → average 5
  const rangeM = servingsStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (rangeM) return (parseInt(rangeM[1]) + parseInt(rangeM[2])) / 2
  // First number found
  const m = servingsStr.match(/(\d+)/)
  return m ? parseInt(m[1]) : 1
}

async function calcFromIngredients(
  ingredients: string[],
  servingsStr: string | undefined,
  apiKey: string,
): Promise<NutritionResult> {
  const servings = parseServingsCount(servingsStr)

  const parsed = ingredients.map(parseIngredient).filter(Boolean) as ParsedIngredient[]

  // Concurrent USDA lookups
  const lookupResults = await Promise.all(
    parsed.map(p => fetchUSDANutrients(p.foodName, apiKey)),
  )

  // Accumulators
  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}

  for (let i = 0; i < parsed.length; i++) {
    const nutrients = lookupResults[i]
    if (!nutrients) continue
    const { gramWeight } = parsed[i]
    for (const [key] of Object.entries(NUTRIENT_IDS)) {
      if (nutrients[key] !== undefined) {
        sums[key]   = (sums[key]   ?? 0) + nutrients[key] * (gramWeight / 100)
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
  }

  const perServing = (key: string): number | undefined => {
    if (!counts[key]) return undefined
    return sums[key] / servings
  }

  const round1 = (v: number | undefined) => v !== undefined ? Math.round(v * 10) / 10 : undefined
  const roundI = (v: number | undefined) => v !== undefined ? Math.round(v) : undefined

  return {
    calories:        roundI(perServing('calories')),
    protein_g:       roundI(perServing('protein_g')),
    carbs_g:         roundI(perServing('carbs_g')),
    fat_g:           roundI(perServing('fat_g')),
    fiber_g:         round1(perServing('fiber_g')),
    sugar_g:         round1(perServing('sugar_g')),
    sodium_mg:       roundI(perServing('sodium_mg')),
    saturated_fat_g: round1(perServing('saturated_fat_g')),
  }
}

// ─── Extraction result type ───────────────────────────────────────────────────

type ExtractionResult = {
  name: string
  description?: string
  ingredients: string[]
  instructions: string[]
  servings?: string
  prep_time?: string
  cook_time?: string
  image_url?: string
  calories?: string
  protein?: string
  carbs?: string
  fat?: string
}

function isValid(r: ExtractionResult | null): r is ExtractionResult {
  if (!r) return false
  return !!(r.name && (r.ingredients.length > 0 || r.instructions.length > 0))
}

function getText(el: Element): string {
  return (el.textContent ?? '').trim()
}

// ─── Strategy 2: Microdata ────────────────────────────────────────────────────

function extractMicrodata(document: Document): ExtractionResult | null {
  // Try scoped recipe element first, then fall back to global itemprop queries
  const recipeEl = document.querySelector('[itemtype*="schema.org/Recipe"]') ?? document

  const name = recipeEl.querySelector('[itemprop="name"]')
  if (!name) return null

  const ingredientEls = recipeEl.querySelectorAll('[itemprop="recipeIngredient"]')
  const instructionEls = recipeEl.querySelectorAll('[itemprop="recipeInstructions"]')

  const ingredients = Array.from(ingredientEls).map(el => getText(el)).filter(Boolean)
  const instructions = Array.from(instructionEls).map(el => getText(el)).filter(Boolean)

  const yieldEl = recipeEl.querySelector('[itemprop="recipeYield"]')
  const servings = yieldEl
    ? (yieldEl.getAttribute('content') ?? getText(yieldEl)) || undefined
    : undefined

  const prepEl = recipeEl.querySelector('[itemprop="prepTime"]')
  const cookEl = recipeEl.querySelector('[itemprop="cookTime"]')
  const prep_time = prepEl
    ? parseDuration(prepEl.getAttribute('content') ?? getText(prepEl))
    : undefined
  const cook_time = cookEl
    ? parseDuration(cookEl.getAttribute('content') ?? getText(cookEl))
    : undefined

  const imgEl = recipeEl.querySelector('[itemprop="image"]')
  const image_url = imgEl
    ? (imgEl.getAttribute('src') ?? imgEl.getAttribute('content') ?? getText(imgEl)) || undefined
    : undefined

  const descEl = recipeEl.querySelector('[itemprop="description"]')
  const description = descEl
    ? (descEl.getAttribute('content') ?? getText(descEl)) || undefined
    : undefined

  const calEl = recipeEl.querySelector('[itemprop="calories"]')
  const proEl = recipeEl.querySelector('[itemprop="proteinContent"]')
  const carbEl = recipeEl.querySelector('[itemprop="carbohydrateContent"]')
  const fatEl = recipeEl.querySelector('[itemprop="fatContent"]')

  return {
    name: getText(name),
    description,
    ingredients,
    instructions,
    servings,
    prep_time,
    cook_time,
    image_url,
    calories: calEl ? getText(calEl) || undefined : undefined,
    protein:  proEl ? getText(proEl) || undefined : undefined,
    carbs:    carbEl ? getText(carbEl) || undefined : undefined,
    fat:      fatEl ? getText(fatEl) || undefined : undefined,
  }
}

// ─── Strategy 3: WordPress plugin selectors ───────────────────────────────────

function extractWPRM(document: Document): ExtractionResult | null {
  const nameEl = document.querySelector('.wprm-recipe-name')
  if (!nameEl) return null

  const ingredients = Array.from(document.querySelectorAll('.wprm-recipe-ingredient'))
    .map(li => {
      const amount = li.querySelector('.wprm-recipe-ingredient-amount')?.textContent?.trim() ?? ''
      const unit   = li.querySelector('.wprm-recipe-ingredient-unit')?.textContent?.trim() ?? ''
      const name   = li.querySelector('.wprm-recipe-ingredient-name')?.textContent?.trim() ?? ''
      const notes  = li.querySelector('.wprm-recipe-ingredient-notes')?.textContent?.trim() ?? ''
      return [amount, unit, name, notes].filter(Boolean).join(' ').trim()
    })
    .filter(Boolean)

  const instructions = Array.from(document.querySelectorAll('.wprm-recipe-instruction-text'))
    .map(el => getText(el))
    .filter(Boolean)

  const servingsEl = document.querySelector('.wprm-recipe-servings')
  const servings = servingsEl ? getText(servingsEl) || undefined : undefined

  const imgEl = document.querySelector('.wprm-recipe-image img[src]')
  const image_url = imgEl ? imgEl.getAttribute('src') || undefined : undefined

  return {
    name: getText(nameEl),
    ingredients,
    instructions,
    servings,
    image_url,
  }
}

function extractTasty(document: Document): ExtractionResult | null {
  const nameEl = document.querySelector('.tasty-recipes-title')
  if (!nameEl) return null

  const ingredients = Array.from(document.querySelectorAll('.tasty-recipes-ingredients li'))
    .map(el => getText(el))
    .filter(Boolean)

  const instructions = Array.from(document.querySelectorAll('.tasty-recipes-instructions li'))
    .map(el => getText(el))
    .filter(Boolean)

  const servingsEl = document.querySelector('.tasty-recipes-yield')
  const servings = servingsEl ? getText(servingsEl) || undefined : undefined

  return { name: getText(nameEl), ingredients, instructions, servings }
}

function extractMediavine(document: Document): ExtractionResult | null {
  const nameEl = document.querySelector('.mv-create-title')
  if (!nameEl) return null

  const ingredients = Array.from(document.querySelectorAll('.mv-create-ingredients li'))
    .map(el => getText(el))
    .filter(Boolean)

  const instructions = Array.from(document.querySelectorAll('.mv-create-directions li'))
    .map(el => getText(el))
    .filter(Boolean)

  return { name: getText(nameEl), ingredients, instructions }
}

function extractHrecipe(document: Document): ExtractionResult | null {
  const nameEl = document.querySelector('.fn, .p-name')
  if (!nameEl) return null

  const ingredients = Array.from(document.querySelectorAll('.ingredient, .p-ingredient'))
    .map(el => getText(el))
    .filter(Boolean)

  const instructions = Array.from(document.querySelectorAll('.instructions, .e-instructions'))
    .map(el => getText(el))
    .filter(Boolean)

  const servingsEl = document.querySelector('.yield, .p-yield')
  const servings = servingsEl ? getText(servingsEl) || undefined : undefined

  return { name: getText(nameEl), ingredients, instructions, servings }
}

function extractPlugins(document: Document): ExtractionResult | null {
  for (const fn of [extractWPRM, extractTasty, extractMediavine, extractHrecipe]) {
    const result = fn(document)
    if (isValid(result)) return result
  }
  return null
}

// ─── Strategy 4: Heading heuristic ───────────────────────────────────────────

function extractHeadingHeuristic(document: Document): ExtractionResult | null {
  // Name: og:title → h1 → title
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
  const h1Text = document.querySelector('h1')?.textContent?.trim()
  const titleText = document.querySelector('title')?.textContent?.trim()
  const name = ogTitle ?? h1Text ?? titleText
  if (!name) return null

  // Find all headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))

  function findListAfterHeading(regex: RegExp): string[] {
    for (const heading of headings) {
      if (!regex.test(heading.textContent ?? '')) continue
      // Walk forward siblings and descendants looking for the first ul/ol
      let node: Element | null = heading
      for (let i = 0; i < 10; i++) {
        node = node.nextElementSibling
        if (!node) break
        // Direct list
        if (node.tagName === 'UL' || node.tagName === 'OL') {
          return Array.from(node.querySelectorAll('li'))
            .map(li => getText(li))
            .filter(Boolean)
        }
        // List nested inside
        const nested = node.querySelector('ul, ol')
        if (nested) {
          return Array.from(nested.querySelectorAll('li'))
            .map(li => getText(li))
            .filter(Boolean)
        }
      }
    }
    return []
  }

  const ingredients = findListAfterHeading(/ingredient/i)
  const instructions = findListAfterHeading(/instruction|direction|step|method|how to/i)

  // Valid only if we got enough content
  if (ingredients.length < 2 && instructions.length < 1) return null

  return { name, ingredients, instructions }
}

// ─── Strategy 5: Claude API fallback ─────────────────────────────────────────

async function extractWithClaude(html: string): Promise<ExtractionResult | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return null

  // Strip noise tags
  const stripped = html
    .replace(/<(script|style|nav|header|footer|aside|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Extract the recipe from this web page text and return ONLY valid JSON with these fields:
{"title": string, "description": string, "ingredients": string[], "instructions": string[], "servings": string, "prep_time": string, "cook_time": string, "image_url": string}

Use empty string for missing string fields and empty array for missing arrays. Do not include any explanation, only the JSON object.

Page text:
${stripped}`,
        }],
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const content = data.content?.[0]?.text ?? ''

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    return {
      name: parsed.title ?? '',
      description: parsed.description || undefined,
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      instructions: Array.isArray(parsed.instructions) ? parsed.instructions : [],
      servings: parsed.servings || undefined,
      prep_time: parsed.prep_time || undefined,
      cook_time: parsed.cook_time || undefined,
      image_url: parsed.image_url || undefined,
    }
  } catch {
    return null
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url) return err('URL is required')

    const usdaApiKey = Deno.env.get('USDA_API_KEY') ?? 'DEMO_KEY'

    // Fetch the page (15s timeout)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let res: Response
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        },
      })
    } catch (e) {
      return err((e as Error).name === 'AbortError'
        ? 'The recipe page took too long to respond.'
        : `Could not reach the page: ${(e as Error).message}`)
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) return err(`Failed to fetch page (HTTP ${res.status})`)
    const html = await res.text()

    // ── Strategy 1: JSON-LD ────────────────────────────────────────────────
    let recipe: Record<string, unknown> | null = null

    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let match
    while ((match = regex.exec(html)) !== null) {
      try {
        recipe = findRecipe(JSON.parse(match[1]))
        if (recipe) break
      } catch {
        // malformed JSON-LD, skip
      }
    }

    // Fallback: untyped <script> tags
    if (!recipe) {
      const untyped = /<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/gi
      while ((match = untyped.exec(html)) !== null) {
        const content = match[1].trim()
        if (!content.startsWith('{') && !content.startsWith('[')) continue
        try {
          recipe = findRecipe(JSON.parse(content))
          if (recipe) break
        } catch {
          // not JSON, skip
        }
      }
    }

    if (recipe) {
      // Strategy 1 succeeded — build response from JSON-LD
      const rawSteps = (recipe.recipeInstructions as unknown[]) || []
      const instructions: string[] = rawSteps
        .map((s) => {
          if (typeof s === 'string') return s.trim()
          if (typeof s === 'object' && s !== null) {
            const step = s as Record<string, unknown>
            if (step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)) {
              return (step.itemListElement as Record<string, unknown>[])
                .map(i => (i.text as string || i.name as string || '').trim())
                .filter(Boolean)
                .join(' ')
            }
            return ((step.text as string) || (step.name as string) || '').trim()
          }
          return ''
        })
        .filter(Boolean)

      const ingredients = ((recipe.recipeIngredient as string[]) || []).map(s => s.trim()).filter(Boolean)
      const servings = recipe.recipeYield
        ? String(Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield)
        : undefined

      const nutrition = recipe.nutrition as Record<string, unknown> | undefined
      const hasNutrition = nutrition &&
        (nutrition.calories || nutrition.proteinContent || nutrition.carbohydrateContent)

      const nutritionResult: NutritionResult = hasNutrition
        ? extractFromSchemaOrg(nutrition!)
        : await calcFromIngredients(ingredients, servings, usdaApiKey)

      return ok({
        title:        (recipe.name as string)?.trim() || 'Untitled Recipe',
        description:  (recipe.description as string)?.trim() || undefined,
        image_url:    getImageUrl(recipe.image),
        source_url:   url,
        servings,
        prep_time:    recipe.prepTime ? parseDuration(recipe.prepTime as string) : undefined,
        cook_time:    recipe.cookTime ? parseDuration(recipe.cookTime as string) : undefined,
        ingredients,
        instructions,
        ...nutritionResult,
      })
    }

    // ── Strategies 2–5: DOM-based ──────────────────────────────────────────
    const { document } = parseHTML(html)

    // Strategy 2: Microdata
    let extracted: ExtractionResult | null = extractMicrodata(document)

    // Strategy 3: WordPress plugins
    if (!isValid(extracted)) {
      extracted = extractPlugins(document)
    }

    // Strategy 4: Heading heuristic
    if (!isValid(extracted)) {
      extracted = extractHeadingHeuristic(document)
    }

    // Strategy 5: Claude API fallback
    if (!isValid(extracted)) {
      extracted = await extractWithClaude(html)
    }

    if (!isValid(extracted)) {
      return err('No recipe found on this page. Try a direct recipe URL from a food blog or major recipe site.')
    }

    // Build nutrition from extracted data or USDA fallback
    const hasNutrition = extracted.calories || extracted.protein || extracted.carbs
    const nutritionResult: NutritionResult = hasNutrition
      ? {
          calories:  parseNutritionInt(extracted.calories),
          protein_g: parseNutritionInt(extracted.protein),
          carbs_g:   parseNutritionInt(extracted.carbs),
          fat_g:     parseNutritionInt(extracted.fat),
        }
      : await calcFromIngredients(extracted.ingredients, extracted.servings, usdaApiKey)

    return ok({
      title:        extracted.name || 'Untitled Recipe',
      description:  extracted.description,
      image_url:    extracted.image_url,
      source_url:   url,
      servings:     extracted.servings,
      prep_time:    extracted.prep_time,
      cook_time:    extracted.cook_time,
      ingredients:  extracted.ingredients,
      instructions: extracted.instructions,
      ...nutritionResult,
    })
  } catch (e) {
    return err((e as Error).message)
  }
})
