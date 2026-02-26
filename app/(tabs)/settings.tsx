import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useAuth } from '@/context/AuthContext'
import { getTheme } from '@/constants/theme'

export default function SettingsScreen() {
  const colorScheme = useColorScheme()
  const c = getTheme(colorScheme)
  const { session, signOut } = useAuth()

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* Profile card */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[styles.avatar, { backgroundColor: c.accent + '18' }]}>
          <FontAwesome name="user-circle" size={36} color={c.accent} />
        </View>
        <View style={styles.profileText}>
          <Text style={[styles.emailLabel, { color: c.muted }]}>Signed in as</Text>
          <Text style={[styles.email, { color: c.text }]} numberOfLines={1}>
            {session?.user.email ?? '—'}
          </Text>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        onPress={signOut}
        style={[styles.signOutBtn, { backgroundColor: c.card, borderColor: c.border }]}
        activeOpacity={0.7}
      >
        <FontAwesome name="sign-out" size={18} color="#ef4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  emailLabel: {
    fontSize: 12,
  },
  email: {
    fontSize: 15,
    fontWeight: '600',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
})
