import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth';

interface MenuLink {
  label: string;
  icon: string;
  route: string;
  superAdminOnly?: boolean;
}

const LINKS: MenuLink[] = [
  { label: 'Clients', icon: '🏢', route: '/admin/clients' },
  { label: 'Products', icon: '📦', route: '/admin/products' },
  { label: 'Licenses', icon: '🔑', route: '/admin/licenses' },
  { label: 'Job Orders', icon: '📋', route: '/admin/job-orders' },
  { label: 'Jobs', icon: '🧰', route: '/admin/jobs' },
  { label: 'Withdrawals', icon: '💸', route: '/admin/withdrawals' },
  { label: 'Users', icon: '👥', route: '/admin/users', superAdminOnly: true },
  { label: 'Audit Logs', icon: '📜', route: '/admin/audit-logs', superAdminOnly: true },
];

export default function MenuScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const links = LINKS.filter((l) => !l.superAdminOnly || isSuperAdmin);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Management</Text>
      <View style={styles.grid}>
        {links.map((l) => (
          <TouchableOpacity key={l.route} style={styles.tile} onPress={() => router.push(l.route as never)}>
            <Text style={styles.icon}>{l.icon}</Text>
            <Text style={styles.label}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 22,
    width: '47.5%',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  icon: { fontSize: 30 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
});
