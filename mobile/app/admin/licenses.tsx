import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { License } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  ACTIVATED: '#16a34a', PENDING: '#d97706', EXPIRED: '#dc2626', SUSPENDED: '#6b7280',
};

export default function LicensesScreen() {
  return (
    <AdminList<License>
      url="/licenses"
      keyExtractor={(l) => l.id}
      emptyText="No licenses yet."
      renderItem={(l) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title} numberOfLines={1}>{l.client?.businessName ?? 'Client'}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLOR[l.status] ?? '#6b7280' }]}>
              <Text style={s.badgeText}>{l.status}</Text>
            </View>
          </View>
          <Text style={s.meta}>{l.product?.productName ?? '—'}</Text>
          <Text style={[s.meta, { fontFamily: 'monospace' }]} numberOfLines={1}>{l.licenseKey}</Text>
          {l.expirationDate ? (
            <Text style={s.meta}>Expires: {new Date(l.expirationDate).toLocaleDateString()}</Text>
          ) : null}
        </View>
      )}
    />
  );
}
