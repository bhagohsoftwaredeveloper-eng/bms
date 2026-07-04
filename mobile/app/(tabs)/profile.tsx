import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/auth';

function formatRole(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {user?.fullName?.charAt(0).toUpperCase() ?? '?'}
        </Text>
      </View>
      <Text style={styles.name}>{user?.fullName}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{user ? formatRole(user.role) : ''}</Text>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={() => void signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 32, gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 8 },
  email: { fontSize: 14, color: '#6b7280' },
  roleBadge: { backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 6 },
  roleText: { color: '#4f46e5', fontWeight: '700', fontSize: 13 },
  signOut: {
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  signOutText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
});
