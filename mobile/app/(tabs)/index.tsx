import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '@/api';
import type { Job, JobStatus } from '@/types';

const STATUS_COLOR: Record<JobStatus, string> = {
  ASSIGNED: '#2563eb',
  ON_GOING: '#d97706',
  WAITING_ACTIVATION: '#7c3aed',
  COMPLETED: '#16a34a',
  CANCELLED: '#6b7280',
};

export default function JobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data } = await api.get<Job[]>('/jobs', { params: { mine: 'true' } });
      setJobs(data);
    } catch {
      setError('Could not load your jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={jobs}
      keyExtractor={(j) => j.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
      ListEmptyComponent={
        <Text style={styles.empty}>{error ?? 'No jobs assigned to you yet.'}</Text>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => router.push(`/job/${item.id}`)}>
          <View style={styles.cardHeader}>
            <Text style={styles.business}>{item.client?.businessName ?? 'Client'}</Text>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.jobStatus] }]}>
              <Text style={styles.badgeText}>{item.jobStatus.replace(/_/g, ' ')}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {item.client?.address ?? 'No address'} · {item.client?.contactNo ?? '—'}
          </Text>
          <Text style={styles.meta}>
            Scheduled: {new Date(item.scheduleDate).toLocaleDateString()}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 48 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  business: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b7280' },
});
