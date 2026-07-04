import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { AuditLog } from '@/types';

export default function AuditLogsScreen() {
  return (
    <AdminList<AuditLog>
      url="/audit-logs"
      keyExtractor={(a) => a.id}
      emptyText="No audit logs."
      renderItem={(a) => (
        <View style={s.card}>
          <Text style={s.title}>{a.action}</Text>
          <Text style={s.meta}>{a.user?.fullName ?? 'System'} {a.user?.email ? `· ${a.user.email}` : ''}</Text>
          <View style={s.row}>
            <Text style={s.meta}>{new Date(a.createdAt).toLocaleString()}</Text>
            {a.ipAddress ? <Text style={s.meta}>{a.ipAddress}</Text> : null}
          </View>
        </View>
      )}
    />
  );
}
