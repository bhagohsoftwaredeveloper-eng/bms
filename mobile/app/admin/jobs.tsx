import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { Job } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  ASSIGNED: '#2563eb', ON_GOING: '#d97706', WAITING_ACTIVATION: '#7c3aed', COMPLETED: '#16a34a', CANCELLED: '#6b7280',
};

export default function AdminJobsScreen() {
  return (
    <AdminList<Job>
      url="/jobs"
      keyExtractor={(j) => j.id}
      emptyText="No jobs yet."
      renderItem={(j) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title} numberOfLines={1}>{j.client?.businessName ?? 'Client'}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLOR[j.jobStatus] ?? '#6b7280' }]}>
              <Text style={s.badgeText}>{j.jobStatus.replace(/_/g, ' ')}</Text>
            </View>
          </View>
          <Text style={s.meta}>Scheduled: {new Date(j.scheduleDate).toLocaleDateString()}</Text>
          {j.client?.contactNo ? <Text style={s.meta}>{j.client.contactNo}</Text> : null}
        </View>
      )}
    />
  );
}
