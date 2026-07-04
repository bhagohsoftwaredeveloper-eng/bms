import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { Client } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#16a34a', EXPIRED: '#d97706', SUSPENDED: '#dc2626', CANCELLED: '#6b7280',
};

export default function ClientsScreen() {
  return (
    <AdminList<Client>
      url="/clients"
      keyExtractor={(c) => c.id}
      emptyText="No clients yet."
      renderItem={(c) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title}>{c.businessName}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLOR[c.status] ?? '#6b7280' }]}>
              <Text style={s.badgeText}>{c.status}</Text>
            </View>
          </View>
          <Text style={s.meta}>{c.clientCode} · {c.clientType}</Text>
          <Text style={s.meta}>Owner: {c.ownerName} · {c.contactNo}</Text>
          {c.address ? <Text style={s.meta}>{c.address}</Text> : null}
        </View>
      )}
    />
  );
}
