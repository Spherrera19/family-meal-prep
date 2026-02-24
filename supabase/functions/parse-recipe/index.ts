import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url) return err('URL is required')

    // Fetch the page (15s timeout)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let res: Response
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
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

    // Find JSON-LD blocks
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let match
    let recipe: Record<string, unknown> | null = null

    while ((match = regex.exec(html)) !== null) {
      try {
        recipe = findRecipe(JSON.parse(match[1]))
        if (recipe) break
      } catch {
        // malformed JSON-LD, skip
      }
    }

    if (!recipe) {
      return err('No recipe found on this page. The URL must be a recipe page on a site that uses Schema.org markup (AllRecipes, BBC Good Food, Food Network, etc.).')
    }

    // Parse instructions — can be strings or HowToStep objects
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
    })
  } catch (e) {
    return err((e as Error).message)
  }
})
