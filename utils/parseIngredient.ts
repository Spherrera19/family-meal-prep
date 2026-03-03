// Splits an ingredient string into qty, unit, and food name.
// e.g. "2 cups flour, sifted" → { qty: "2", unit: "cups", foodName: "flour" }

const UNITS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters',
  'large', 'medium', 'small', 'clove', 'cloves', 'can', 'cans',
  'bunch', 'bunches', 'slice', 'slices', 'piece', 'pieces',
  'pkg', 'package', 'packages', 'stick', 'sticks', 'sprig', 'sprigs',
  'pinch', 'dash', 'handful', 'strip', 'strips',
])

// Matches leading quantity: mixed numbers, fractions, decimals, unicode fractions
const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*|[¼½¾⅓⅔⅛⅜⅝⅞])/

export function parseIngredientString(raw: string): { qty: string; unit: string; foodName: string } {
  let s = raw.trim()

  // Extract qty
  let qty = ''
  const qtyMatch = QTY_RE.exec(s)
  if (qtyMatch) {
    qty = qtyMatch[1].trim()
    s = s.slice(qtyMatch[0].length).trim()
  }

  // Extract unit
  let unit = ''
  const words = s.split(/\s+/)
  if (words.length > 0 && UNITS.has(words[0].toLowerCase())) {
    unit = words[0]
    s = words.slice(1).join(' ').trim()
  }

  // Remove parenthetical notes and everything after comma or semicolon
  s = s.replace(/\(.*?\)/g, '').replace(/[,;].*$/, '').trim()

  const foodName = s.toLowerCase().trim()
  return { qty, unit, foodName: foodName || raw.toLowerCase().trim() }
}
