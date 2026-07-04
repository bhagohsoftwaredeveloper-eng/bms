import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { AdminUser } from '@/types';

function formatRole(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function UsersScreen() {
  return (
    <AdminList<AdminUser>
      url="/users"
      keyExtractor={(u) => u.id}
      emptyText="No users yet."
      renderItem={(u) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title} numberOfLines={1}>{u.fullName}</Text>
            <View style={[s.badge, { backgroundColor: u.isActive ? '#16a34a' : '#dc2626' }]}>
              <Text style={s.badgeText}>{u.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
            </View>
          </View>
          <Text style={s.meta}>{u.email}</Text>
          <Text style={[s.meta, { color: '#4f46e5', fontWeight: '600' }]}>{formatRole(u.role)}</Text>
        </View>
      )}
    />
  );
}
