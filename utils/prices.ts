// Average cost per typical grocery purchase of each item (US prices)
const PRICE_MAP: Record<string, number> = {
  // Dairy
  'milk': 3.99, 'butter': 4.49, 'eggs': 3.49, 'cheese': 4.99,
  'cream cheese': 3.49, 'sour cream': 2.49, 'yogurt': 1.49, 'heavy cream': 3.99,
  'mozzarella': 4.49, 'parmesan': 5.49, 'cheddar': 4.99, 'feta': 4.49,
  'half and half': 2.99, 'whipped cream': 3.49, 'cream': 3.99,
  // Proteins
  'chicken breast': 6.99, 'chicken thigh': 5.49, 'chicken': 5.99,
  'ground beef': 5.99, 'beef': 7.99, 'steak': 9.99,
  'salmon': 8.99, 'shrimp': 9.99, 'fish': 7.49, 'tuna': 1.79,
  'bacon': 5.99, 'sausage': 4.99, 'turkey': 5.49, 'pork': 5.99,
  'ham': 4.99, 'pepperoni': 3.99, 'ground turkey': 5.49,
  // Grains & Pantry
  'flour': 3.49, 'sugar': 2.99, 'rice': 2.99, 'pasta': 1.79, 'bread': 3.49,
  'oats': 3.99, 'breadcrumbs': 2.29, 'cornstarch': 2.49, 'baking powder': 2.99,
  'baking soda': 1.29, 'yeast': 3.99, 'panko': 3.49,
  'olive oil': 7.99, 'vegetable oil': 4.99, 'coconut oil': 5.99, 'sesame oil': 4.99,
  'soy sauce': 2.99, 'vinegar': 2.49, 'honey': 5.99, 'maple syrup': 8.99,
  'vanilla extract': 5.99, 'cocoa powder': 4.49, 'chocolate chips': 3.99,
  'peanut butter': 4.49, 'almond butter': 7.99, 'jam': 3.99, 'jelly': 3.49,
  'mayonnaise': 4.49, 'mustard': 2.49, 'ketchup': 2.99, 'hot sauce': 3.49,
  'worcestershire sauce': 2.99, 'fish sauce': 3.99, 'oyster sauce': 3.49,
  'brown sugar': 2.99, 'powdered sugar': 2.49,
  // Produce
  'onion': 0.89, 'garlic': 0.79, 'tomato': 1.49, 'bell pepper': 1.29,
  'broccoli': 2.49, 'spinach': 3.49, 'lettuce': 2.29, 'avocado': 1.29,
  'lemon': 0.79, 'lime': 0.59, 'potato': 0.99, 'sweet potato': 1.29,
  'carrot': 1.49, 'celery': 1.99, 'mushroom': 3.49, 'zucchini': 1.29,
  'cucumber': 0.99, 'corn': 0.79, 'green beans': 2.49, 'peas': 1.99,
  'kale': 2.99, 'arugula': 3.49, 'cabbage': 1.49, 'cauliflower': 2.99,
  'asparagus': 3.99, 'eggplant': 1.99, 'jalapeño': 0.49, 'cilantro': 0.99,
  'parsley': 0.99, 'basil': 2.49, 'ginger': 1.29, 'scallion': 0.99,
  'green onion': 0.99, 'shallot': 1.49, 'apple': 1.29, 'banana': 0.59,
  'strawberry': 3.99, 'blueberry': 4.99, 'lemon juice': 2.49,
  // Canned / Jarred
  'black beans': 1.29, 'chickpeas': 1.29, 'kidney beans': 1.29, 'white beans': 1.29,
  'diced tomatoes': 1.49, 'crushed tomatoes': 1.99, 'tomato sauce': 1.99,
  'tomato paste': 1.29, 'chicken broth': 2.49, 'beef broth': 2.49,
  'vegetable broth': 2.49, 'coconut milk': 2.49, 'pumpkin': 2.49,
  'olives': 2.99, 'artichoke hearts': 3.49, 'roasted red peppers': 3.49,
  // Herbs & Spices (~$3 per bottle)
  'salt': 1.99, 'pepper': 3.49, 'cumin': 3.49, 'paprika': 3.49,
  'oregano': 3.49, 'thyme': 3.49, 'rosemary': 3.49, 'bay leaves': 3.49,
  'cinnamon': 3.99, 'chili powder': 3.49, 'cayenne': 3.49, 'turmeric': 3.99,
  'garlic powder': 3.49, 'onion powder': 3.49, 'red pepper flakes': 3.49,
  'italian seasoning': 3.49, 'curry powder': 3.99, 'smoked paprika': 3.99,
  'nutmeg': 3.99, 'cardamom': 4.49, 'coriander': 3.49,
}

export function estimateTotal(itemNames: string[]): number {
  let total = 0
  for (const raw of itemNames) {
    const name = raw.toLowerCase().trim()
    // Try exact match first, then partial match
    let price = PRICE_MAP[name]
    if (price === undefined) {
      for (const [key, val] of Object.entries(PRICE_MAP)) {
        if (name.includes(key) || key.includes(name)) {
          price = val
          break
        }
      }
    }
    total += price ?? 2.00 // $2 default for unknown items
  }
  return total
}
