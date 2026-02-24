import { useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, useColorScheme } from 'react-native'
import { Link } from 'expo-router'
import { supabase } from '@/lib/supabase'

const LIGHT = { bg: '#fff',     text: '#0f172a', muted: '#64748b', border: '#e2e8f0', input: '#f8fafc' }
const DARK  = { bg: '#0f172a',  text: '#f1f5f9', muted: '#94a3b8', border: '#334155', input: '#1e293b' }

export default function SignIn() {
  const c = useColorScheme() === 'dark' ? DARK : LIGHT
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Sign in failed', error.message)
    setLoading(false)
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>Welcome back</Text>

      <TextInput
        style={[styles.input, { borderColor: c.border, backgroundColor: c.input, color: c.text }]}
        placeholder="Email"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { borderColor: c.border, backgroundColor: c.input, color: c.text }]}
        placeholder="Password"
        placeholderTextColor={c.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={[styles.button, loading && { opacity: 0.6 }]} onPress={handleSignIn} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>

      <Link href="/(auth)/sign-up" style={styles.link}>
        Don't have an account? Sign up
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title:     { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  input:     { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  button:    { backgroundColor: '#2563eb', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  buttonText:{ color: '#fff', fontSize: 16, fontWeight: '600' },
  link:      { textAlign: 'center', color: '#2563eb', marginTop: 8 },
})
