import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the page
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeParser/1.0; +https://familymealprep.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) throw new Error(`Failed to fetch page (HTTP ${res.status})`)
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
      return new Response(
        JSON.stringify({ error: 'No recipe found on this page. The URL must be a recipe page on a site that uses Schema.org markup (AllRecipes, BBC Good Food, Food Network, etc.).' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse instructions — can be strings or HowToStep objects
    const rawSteps = (recipe.recipeInstructions as unknown[]) || []
    const instructions: string[] = rawSteps
      .map((s) => {
        if (typeof s === 'string') return s.trim()
        if (typeof s === 'object' && s !== null) {
          const step = s as Record<string, unknown>
          // HowToSection — flatten nested steps
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

    const parsed = {
      title:        (recipe.name as string)?.trim() || 'Untitled Recipe',
      description:  (recipe.description as string)?.trim() || undefined,
      image_url:    getImageUrl(recipe.image),
      source_url:   url,
      servings,
      prep_time:    recipe.prepTime ? parseDuration(recipe.prepTime as string) : undefined,
      cook_time:    recipe.cookTime ? parseDuration(recipe.cookTime as string) : undefined,
      ingredients,
      instructions,
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
