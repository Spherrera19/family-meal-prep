import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useFamily } from '@/hooks/useFamily'
import { useShoppingList, type ShoppingItem } from '@/hooks/useShoppingList'

// ─── Theme ────────────────────────────────────────────────────────────────────

const LIGHT = { bg: '#f8fafc', card: '#fff', text: '#0f172a', muted: '#94a3b8', border: '#e2e8f0' }
const DARK  = { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', muted: '#64748b', border: '#334155' }

// ─── Family setup screen ──────────────────────────────────────────────────────

function FamilySetup({ c, createFamily, joinFamily, error }: {
  c: typeof LIGHT
  createFamily: (name: string) => Promise<void>
  joinFamily: (code: string) => Promise<void>
  error: string | null
}) {
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!familyName.trim()) return
    setSaving(true)
    await createFamily(familyName.trim())
    setSaving(false)
  }

  async function handleJoin() {
    if (inviteCode.trim().length !== 6) {
      Alert.alert('Invalid code', 'Invite codes are 6 characters long.')
      return
    }
    setSaving(true)
    await joinFamily(inviteCode.trim())
    setSaving(false)
  }

  return (
    <View style={[setup.container, { backgroundColor: c.bg }]}>
      <Text style={setup.emoji}>👨‍👩‍👧‍👦</Text>
      <Text style={[setup.title, { color: c.text }]}>Set up your family</Text>
      <Text style={[setup.subtitle, { color: c.muted }]}>
        Create a family to share a shopping list, or join one with an invite code.
      </Text>

      {error && <Text style={setup.error}>{error}</Text>}

      {/* Create */}
      <View style={[setup.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[setup.cardTitle, { color: c.text }]}>Create a new family</Text>
        <TextInput
          style={[setup.input, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
          placeholder="Family name"
          placeholderTextColor={c.muted}
          value={familyName}
          onChangeText={setFamilyName}
        />
        <TouchableOpacity
          style={[setup.btn, (!familyName.trim() || saving) && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={!familyName.trim() || saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={setup.btnText}>Create family</Text>}
        </TouchableOpacity>
      </View>

      <View style={setup.divider}>
        <View style={[setup.dividerLine, { backgroundColor: c.border }]} />
        <Text style={[setup.dividerText, { color: c.muted }]}>or</Text>
        <View style={[setup.dividerLine, { backgroundColor: c.border }]} />
      </View>

      {/* Join */}
      <View style={[setup.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[setup.cardTitle, { color: c.text }]}>Join with an invite code</Text>
        <TextInput
          style={[setup.input, { borderColor: c.border, color: c.text, backgroundColor: c.bg, letterSpacing: 4, textTransform: 'uppercase' }]}
          placeholder="ABC123"
          placeholderTextColor={c.muted}
          value={inviteCode}
          onChangeText={t => setInviteCode(t.toUpperCase())}
          maxLength={6}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={[setup.btn, setup.btnOutline, { borderColor: '#2563eb' }, (!inviteCode.trim() || saving) && { opacity: 0.4 }]}
          onPress={handleJoin}
          disabled={!inviteCode.trim() || saving}
        >
          {saving ? <ActivityIndicator color="#2563eb" /> : <Text style={[setup.btnText, { color: '#2563eb' }]}>Join family</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Shopping list ────────────────────────────────────────────────────────────

function ShoppingList({ familyId, familyName, inviteCode, c }: {
  familyId: string
  familyName: string
  inviteCode: string
  c: typeof LIGHT
}) {
  const { items, loading, error, addItem, toggleItem, deleteItem, clearChecked } = useShoppingList(familyId)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [adding, setAdding] = useState(false)

  const checkedCount = items.filter(i => i.checked).length

  async function handleAdd() {
    if (!name.trim()) return
    setAdding(true)
    await addItem(name.trim(), quantity.trim() || undefined)
    setName('')
    setQuantity('')
    setAdding(false)
  }

  function renderItem({ item }: { item: ShoppingItem }) {
    return (
      <View style={[list.row, { backgroundColor: c.card, borderColor: c.border }]}>
        <TouchableOpacity onPress={() => toggleItem(item.id, !item.checked)} style={list.checkbox}>
          <View style={[list.checkOuter, { borderColor: item.checked ? '#2563eb' : c.border }]}>
            {item.checked && <FontAwesome name="check" size={10} color="#2563eb" />}
          </View>
        </TouchableOpacity>

        <View style={list.itemInfo}>
          <Text style={[list.itemName, { color: c.text }, item.checked && list.strikethrough]}>
            {item.name}
          </Text>
          {item.quantity ? (
            <Text style={[list.itemQty, { color: c.muted }]}>{item.quantity}</Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={() => deleteItem(item.id)} style={list.deleteBtn}>
          <FontAwesome name="trash-o" size={15} color={c.muted} />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[list.screen, { backgroundColor: c.bg }]}>
      {/* Family header */}
      <View style={[list.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <View>
          <Text style={[list.familyName, { color: c.text }]}>{familyName}</Text>
          <Text style={[list.memberCount, { color: c.muted }]}>
            {items.length} item{items.length !== 1 ? 's' : ''}
            {checkedCount > 0 ? ` · ${checkedCount} checked` : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => Alert.alert('Invite code', `Share this code with your family:\n\n${inviteCode}`, [{ text: 'OK' }])}
          style={[list.codeBadge, { backgroundColor: '#dbeafe' }]}
        >
          <FontAwesome name="users" size={11} color="#2563eb" style={{ marginRight: 5 }} />
          <Text style={list.codeText}>{inviteCode}</Text>
        </Pressable>
      </View>

      {error && <Text style={list.error}>{error}</Text>}

      {/* List */}
      {loading ? (
        <View style={list.centered}>
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={list.listContent}
          ListEmptyComponent={
            <View style={list.empty}>
              <Text style={list.emptyIcon}>🛒</Text>
              <Text style={[list.emptyText, { color: c.muted }]}>Your list is empty</Text>
              <Text style={[list.emptyHint, { color: c.muted }]}>Add items below to get started</Text>
            </View>
          }
          ListFooterComponent={
            checkedCount > 0 ? (
              <TouchableOpacity onPress={clearChecked} style={list.clearBtn}>
                <Text style={list.clearBtnText}>Clear {checkedCount} checked item{checkedCount !== 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* Add item bar */}
      <View style={[list.addBar, { backgroundColor: c.card, borderTopColor: c.border }]}>
        <TextInput
          style={[list.nameInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
          placeholder="Add item..."
          placeholderTextColor={c.muted}
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TextInput
          style={[list.qtyInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
          placeholder="Qty"
          placeholderTextColor={c.muted}
          value={quantity}
          onChangeText={setQuantity}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[list.addBtn, (!name.trim() || adding) && { opacity: 0.4 }]}
          onPress={handleAdd}
          disabled={!name.trim() || adding}
        >
          {adding
            ? <ActivityIndicator color="#fff" size="small" />
            : <FontAwesome name="plus" size={16} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ShoppingScreen() {
  const scheme = useColorScheme()
  const c = scheme === 'dark' ? DARK : LIGHT
  const { family, loading, error, createFamily, joinFamily } = useFamily()

  if (loading) {
    return (
      <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center' }, { backgroundColor: c.bg }]}>
        <ActivityIndicator color="#2563eb" />
      </View>
    )
  }

  if (!family) return (
    <FamilySetup
      c={c}
      createFamily={createFamily}
      joinFamily={joinFamily}
      error={error}
    />
  )

  return (
    <ShoppingList
      familyId={family.id}
      familyName={family.name}
      inviteCode={family.invite_code}
      c={c}
    />
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const setup = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  error: { color: '#ef4444', textAlign: 'center', marginBottom: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
})

const list = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1,
  },
  familyName: { fontSize: 17, fontWeight: '700' },
  memberCount: { fontSize: 13, marginTop: 2 },
  codeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  codeText: { color: '#2563eb', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  error: { color: '#ef4444', fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, gap: 8, flexGrow: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, padding: 12, gap: 10,
  },
  checkbox: { padding: 4 },
  checkOuter: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '500' },
  itemQty: { fontSize: 13, marginTop: 1 },
  strikethrough: { textDecorationLine: 'line-through', opacity: 0.4 },
  deleteBtn: { padding: 6 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptyHint: { fontSize: 14 },
  clearBtn: { alignSelf: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16 },
  clearBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  addBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderTopWidth: 1,
  },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  qtyInput: { width: 70, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  addBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center',
  },
})
