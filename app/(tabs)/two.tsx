import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useRecipes, type Recipe } from '@/hooks/useRecipes'
import { useFamily } from '@/hooks/useFamily'

const LIGHT = { bg: '#f8fafc', card: '#fff', text: '#0f172a', muted: '#94a3b8', border: '#e2e8f0' }
const DARK  = { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', muted: '#64748b', border: '#334155' }

// ─── Manual add / edit recipe modal ──────────────────────────────────────────

function ManualRecipeModal({ visible, onClose, onSave, c, prefillUrl }: {
  visible: boolean
  onClose: () => void
  onSave: (fields: {
    title: string; image_url: string; ingredients: string[]
    instructions: string[]; servings: string; prep_time: string; cook_time: string
  }) => Promise<void>
  c: typeof LIGHT
  prefillUrl?: string
}) {
  const [title, setTitle]           = useState('')
  const [imageUrl, setImageUrl]     = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')
  const [servings, setServings]     = useState('')
  const [prepTime, setPrepTime]     = useState('')
  const [cookTime, setCookTime]     = useState('')
  const [saving, setSaving]         = useState(false)

  // Reset form when modal opens
  const wasVisible = useState(false)
  if (visible && !wasVisible[0]) { wasVisible[1](true) }
  if (!visible && wasVisible[0]) {
    wasVisible[1](false)
    setTitle(''); setImageUrl(''); setIngredients(''); setInstructions('')
    setServings(''); setPrepTime(''); setCookTime('')
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      title:        title.trim(),
      image_url:    imageUrl.trim(),
      ingredients:  ingredients.split('\n').map(s => s.trim()).filter(Boolean),
      instructions: instructions.split('\n').map(s => s.trim()).filter(Boolean),
      servings:     servings.trim(),
      prep_time:    prepTime.trim(),
      cook_time:    cookTime.trim(),
    })
    setSaving(false)
  }

  const inputStyle = [manualModal.input, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[manualModal.container, { backgroundColor: c.bg }]}>
        <View style={[manualModal.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={onClose} style={manualModal.closeBtn}>
            <FontAwesome name="chevron-down" size={16} color={c.muted} />
          </TouchableOpacity>
          <Text style={[manualModal.headerTitle, { color: c.text }]}>Add Recipe Manually</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim() || saving}
            style={[manualModal.saveBtn, (!title.trim() || saving) && { opacity: 0.4 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={manualModal.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={manualModal.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[manualModal.label, { color: c.muted }]}>Title *</Text>
          <TextInput style={inputStyle} value={title} onChangeText={setTitle}
            placeholder="e.g. Chicken Tikka Masala" placeholderTextColor={c.muted} />

          <Text style={[manualModal.label, { color: c.muted }]}>Image URL (optional)</Text>
          <TextInput style={inputStyle} value={imageUrl} onChangeText={setImageUrl}
            placeholder="https://…" placeholderTextColor={c.muted}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" />

          <View style={manualModal.row}>
            <View style={{ flex: 1 }}>
              <Text style={[manualModal.label, { color: c.muted }]}>Prep time</Text>
              <TextInput style={inputStyle} value={prepTime} onChangeText={setPrepTime}
                placeholder="15 min" placeholderTextColor={c.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[manualModal.label, { color: c.muted }]}>Cook time</Text>
              <TextInput style={inputStyle} value={cookTime} onChangeText={setCookTime}
                placeholder="30 min" placeholderTextColor={c.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[manualModal.label, { color: c.muted }]}>Servings</Text>
              <TextInput style={inputStyle} value={servings} onChangeText={setServings}
                placeholder="4" placeholderTextColor={c.muted} />
            </View>
          </View>

          <Text style={[manualModal.label, { color: c.muted }]}>Ingredients (one per line)</Text>
          <TextInput
            style={[inputStyle, manualModal.multiline]}
            value={ingredients}
            onChangeText={setIngredients}
            placeholder={"2 cups flour\n1 tsp salt\n…"}
            placeholderTextColor={c.muted}
            multiline
            textAlignVertical="top"
          />

          <Text style={[manualModal.label, { color: c.muted }]}>Instructions (one step per line)</Text>
          <TextInput
            style={[inputStyle, manualModal.multiline]}
            value={instructions}
            onChangeText={setInstructions}
            placeholder={"Preheat oven to 350°F\nMix dry ingredients\n…"}
            placeholderTextColor={c.muted}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Nutrition panel ─────────────────────────────────────────────────────────

type NutrientChipDef = {
  label: string
  icon: string
  value: number | undefined
  unit: string
  isInt?: boolean
}

function NutritionPanel({ recipe, c }: { recipe: Recipe; c: typeof LIGHT }) {
  const chips: NutrientChipDef[] = [
    { label: 'Calories', icon: '🔥', value: recipe.calories,        unit: 'kcal', isInt: true },
    { label: 'Protein',  icon: '💪', value: recipe.protein_g,       unit: 'g' },
    { label: 'Carbs',    icon: '🌾', value: recipe.carbs_g,         unit: 'g' },
    { label: 'Fat',      icon: '🫙', value: recipe.fat_g,           unit: 'g' },
    { label: 'Fiber',    icon: '🌿', value: recipe.fiber_g,         unit: 'g' },
    { label: 'Sugar',    icon: '🍬', value: recipe.sugar_g,         unit: 'g' },
    { label: 'Sodium',   icon: '🧂', value: recipe.sodium_mg,       unit: 'mg', isInt: true },
    { label: 'Sat. Fat', icon: '🥓', value: recipe.saturated_fat_g, unit: 'g' },
  ]

  const visible = chips.filter(c => c.value != null)
  if (visible.length === 0) return null

  const row1 = visible.slice(0, 4)
  const row2 = visible.slice(4)

  function Chip({ chip }: { chip: NutrientChipDef }) {
    const display = chip.isInt
      ? `${Math.round(chip.value!)}${chip.unit}`
      : `${chip.value}${chip.unit}`
    return (
      <View style={[nutri.chip, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={nutri.chipIcon}>{chip.icon}</Text>
        <Text style={[nutri.chipLabel, { color: c.muted }]}>{chip.label}</Text>
        <Text style={[nutri.chipValue, { color: c.text }]}>{display}</Text>
      </View>
    )
  }

  return (
    <View style={nutri.container}>
      <View style={nutri.row}>
        {row1.map(chip => <Chip key={chip.label} chip={chip} />)}
      </View>
      {row2.length > 0 && (
        <View style={nutri.row}>
          {row2.map(chip => <Chip key={chip.label} chip={chip} />)}
        </View>
      )}
      {recipe.servings && (
        <Text style={[nutri.perServing, { color: c.muted }]}>per serving</Text>
      )}
    </View>
  )
}

// ─── Recipe detail modal ──────────────────────────────────────────────────────

function RecipeModal({ recipe, onClose, onAddToList, c }: {
  recipe: Recipe
  onClose: () => void
  onAddToList: (recipe: Recipe) => Promise<void>
  c: typeof LIGHT
}) {
  const [adding, setAdding] = useState(false)

  async function handleAddToList() {
    setAdding(true)
    await onAddToList(recipe)
    setAdding(false)
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modal.container, { backgroundColor: c.bg }]}>
        <View style={[modal.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <FontAwesome name="chevron-down" size={16} color={c.muted} />
          </TouchableOpacity>
          <Text style={[modal.headerTitle, { color: c.text }]} numberOfLines={1}>{recipe.title}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={modal.scroll} showsVerticalScrollIndicator={false}>
          {recipe.image_url && (
            <Image source={{ uri: recipe.image_url }} style={modal.image} resizeMode="cover" />
          )}

          <View style={modal.section}>
            <Text style={[modal.title, { color: c.text }]}>{recipe.title}</Text>
            {recipe.description && (
              <Text style={[modal.description, { color: c.muted }]}>{recipe.description}</Text>
            )}
            <View style={modal.metaRow}>
              {recipe.prep_time && (
                <View style={[modal.metaChip, { backgroundColor: c.card, borderColor: c.border }]}>
                  <FontAwesome name="clock-o" size={12} color={c.muted} />
                  <Text style={[modal.metaText, { color: c.muted }]}>Prep {recipe.prep_time}</Text>
                </View>
              )}
              {recipe.cook_time && (
                <View style={[modal.metaChip, { backgroundColor: c.card, borderColor: c.border }]}>
                  <FontAwesome name="fire" size={12} color={c.muted} />
                  <Text style={[modal.metaText, { color: c.muted }]}>Cook {recipe.cook_time}</Text>
                </View>
              )}
              {recipe.servings && (
                <View style={[modal.metaChip, { backgroundColor: c.card, borderColor: c.border }]}>
                  <FontAwesome name="users" size={12} color={c.muted} />
                  <Text style={[modal.metaText, { color: c.muted }]}>{recipe.servings}</Text>
                </View>
              )}
            </View>
          </View>

          <NutritionPanel recipe={recipe} c={c} />

          {recipe.ingredients.length > 0 && (
            <TouchableOpacity
              style={[modal.addListBtn, adding && { opacity: 0.5 }]}
              onPress={handleAddToList}
              disabled={adding}
            >
              {adding
                ? <ActivityIndicator color="#fff" size="small" />
                : <FontAwesome name="shopping-cart" size={14} color="#fff" />
              }
              <Text style={modal.addListBtnText}>
                {adding ? 'Adding…' : `Add ${recipe.ingredients.length} ingredients to shopping list`}
              </Text>
            </TouchableOpacity>
          )}

          {recipe.ingredients.length > 0 && (
            <View style={[modal.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[modal.sectionTitle, { color: c.text }]}>Ingredients</Text>
              {recipe.ingredients.map((ing, i) => (
                <View key={i} style={[modal.ingredientRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={[modal.bullet, { backgroundColor: '#2563eb' }]} />
                  <Text style={[modal.ingredientText, { color: c.text }]}>{ing}</Text>
                </View>
              ))}
            </View>
          )}

          {recipe.instructions.length > 0 && (
            <View style={[modal.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[modal.sectionTitle, { color: c.text }]}>Instructions</Text>
              {recipe.instructions.map((step, i) => (
                <View key={i} style={[modal.stepRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={modal.stepNum}>
                    <Text style={modal.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={[modal.stepText, { color: c.text }]}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {recipe.source_url && (
            <Text style={[modal.sourceUrl, { color: c.muted }]} numberOfLines={1}>
              Source: {recipe.source_url}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Recipe card ──────────────────────────────────────────────────────────────

function RecipeCard({ recipe, onPress, onDelete, c }: {
  recipe: Recipe
  onPress: () => void
  onDelete: () => void
  c: typeof LIGHT
}) {
  function confirmDelete() {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${recipe.title}"?`)) onDelete()
    } else {
      Alert.alert('Delete recipe', `Remove "${recipe.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ])
    }
  }

  return (
    <View style={[card.container, { backgroundColor: c.card, borderColor: c.border }]}>
      <TouchableOpacity style={card.pressable} onPress={onPress} activeOpacity={0.7}>
        {recipe.image_url && (
          <Image source={{ uri: recipe.image_url }} style={card.image} resizeMode="cover" />
        )}
        <View style={card.body}>
          <Text style={[card.title, { color: c.text }]} numberOfLines={2}>{recipe.title}</Text>
          <View style={card.metaRow}>
            {recipe.prep_time && <Text style={[card.meta, { color: c.muted }]}>⏱ {recipe.prep_time}</Text>}
            {recipe.cook_time && <Text style={[card.meta, { color: c.muted }]}>🔥 {recipe.cook_time}</Text>}
            {recipe.servings && <Text style={[card.meta, { color: c.muted }]}>👥 {recipe.servings}</Text>}
          </View>
          <Text style={[card.count, { color: c.muted }]}>
            {recipe.ingredients.length} ingredients · {recipe.instructions.length} steps
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={confirmDelete} style={card.deleteBtn}>
        <FontAwesome name="trash-o" size={15} color={c.muted} />
      </TouchableOpacity>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecipesScreen() {
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? DARK : LIGHT
  const { family } = useFamily()
  const { recipes, loading, importing, error, importRecipe, saveManualRecipe, deleteRecipe, addIngredientsToShoppingList } =
    useRecipes(family?.id ?? null)

  const [url, setUrl] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) return
    const recipe = await importRecipe(trimmed)
    if (recipe) {
      setUrl('')
      setSelectedRecipe(recipe)
    } else {
      // Import failed — open the manual entry modal so the user can paste it themselves
      setManualOpen(true)
    }
  }

  async function handleSaveManual(fields: Parameters<typeof saveManualRecipe>[0]) {
    const recipe = await saveManualRecipe(fields)
    if (recipe) {
      setManualOpen(false)
      setUrl('')
      setSelectedRecipe(recipe)
    }
  }

  async function handleAddToList(recipe: Recipe) {
    if (!family) {
      Alert.alert('No family', 'Join or create a family on the Shopping tab to use this feature.')
      return
    }
    const count = await addIngredientsToShoppingList(recipe)
    Alert.alert('Added to shopping list', `${count} ingredient${count !== 1 ? 's' : ''} added.`)
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      {/* Import bar */}
      <View style={[styles.importBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TextInput
          style={[styles.urlInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
          placeholder="Paste a recipe URL to import…"
          placeholderTextColor={c.muted}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={handleImport}
          returnKeyType="go"
          editable={!importing}
        />
        <TouchableOpacity
          style={[styles.importBtn, (!url.trim() || importing) && { opacity: 0.4 }]}
          onPress={handleImport}
          disabled={!url.trim() || importing}
        >
          {importing
            ? <ActivityIndicator color="#fff" size="small" />
            : <FontAwesome name="download" size={15} color="#fff" />
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.addManualBtn} onPress={() => setManualOpen(true)}>
          <FontAwesome name="plus" size={15} color="#fff" />
        </TouchableOpacity>
      </View>

      {importing && (
        <View style={[styles.banner, { backgroundColor: '#dbeafe' }]}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={[styles.bannerText, { color: '#2563eb' }]}>Fetching recipe…</Text>
        </View>
      )}

      {error && (
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: '#fee2e2' }]}
          onPress={() => setManualOpen(true)}
        >
          <FontAwesome name="exclamation-circle" size={14} color="#ef4444" />
          <Text style={[styles.bannerText, { color: '#ef4444', flex: 1 }]}>{error}</Text>
          <Text style={[styles.bannerText, { color: '#ef4444', fontWeight: '700' }]}>Add manually →</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              onPress={() => setSelectedRecipe(item)}
              onDelete={() => deleteRecipe(item.id)}
              c={c}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📖</Text>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No recipes yet</Text>
              <Text style={[styles.emptyHint, { color: c.muted }]}>
                Paste a URL from AllRecipes, BBC Good Food, Food Network, or any site with Schema.org recipe markup.
              </Text>
            </View>
          }
        />
      )}

      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onAddToList={handleAddToList}
          c={c}
        />
      )}

      <ManualRecipeModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        onSave={handleSaveManual}
        c={c}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  importBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderBottomWidth: 1,
  },
  urlInput: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14 },
  importBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center',
  },
  addManualBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center',
  },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { fontSize: 14, fontWeight: '500' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, gap: 12 },
  empty: { paddingTop: 80, alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
})

const card = StyleSheet.create({
  container: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  pressable: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  image: { width: 90, height: 90 },
  body: { flex: 1, padding: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { fontSize: 12 },
  count: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 14 },
})

const modal = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  closeBtn: { width: 36, alignItems: 'flex-start' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  scroll: { paddingBottom: 48 },
  image: { width: '100%', height: 220 },
  section: { padding: 20, gap: 8 },
  title: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
  description: { fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  metaText: { fontSize: 13 },
  addListBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2563eb', marginHorizontal: 20, marginBottom: 8, borderRadius: 12, padding: 14,
  },
  addListBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  card: { margin: 20, marginTop: 8, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 17, fontWeight: '700', padding: 14, paddingBottom: 10 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3 },
  ingredientText: { flex: 1, fontSize: 15 },
  stepRow: { flexDirection: 'row', gap: 12, padding: 14 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#2563eb',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1,
  },
  stepNumText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  sourceUrl: { fontSize: 12, textAlign: 'center', padding: 16 },
})

const nutri = StyleSheet.create({
  container: { marginHorizontal: 20, marginBottom: 8, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1, borderWidth: 1, borderRadius: 10, padding: 8,
    alignItems: 'center', gap: 2,
  },
  chipIcon: { fontSize: 16 },
  chipLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  chipValue: { fontSize: 13, fontWeight: '700' },
  perServing: { fontSize: 11, textAlign: 'center', marginTop: 2 },
})

const manualModal = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  closeBtn: { width: 36, alignItems: 'flex-start' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  saveBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7, minWidth: 56, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { padding: 16, gap: 4, paddingBottom: 48 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  multiline: { minHeight: 120, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 8 },
})
