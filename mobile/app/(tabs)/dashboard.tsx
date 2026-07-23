import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/api';
import { useAuth } from '@/auth';
import type { Client, License, Job, JobStatus, Withdrawal } from '@/types';

interface Stat {
  label: string;
  value: string;
  color: string;
}

const ACTIVE_STATUSES: JobStatus[] = ['ASSIGNED', 'ON_GOING', 'WAITING_ACTIVATION'];
const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function DashboardScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_STAFF';
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isAdmin) {
        const [clients, licenses, jobs, withdrawals] = await Promise.all([
          api.get<Client[]>('/clients'),
          api.get<License[]>('/licenses'),
          api.get<Job[]>('/jobs'),
          api.get<Withdrawal[]>('/withdrawals'),
        ]);
        const activeClients = clients.data.filter((c) => c.status === 'ACTIVE').length;
        const activeLicenses = licenses.data.filter((l) => l.status === 'ACTIVATED').length;
        const openJobs = jobs.data.filter((j) => j.jobStatus !== 'COMPLETED' && j.jobStatus !== 'CANCELLED').length;
        const pendingWd = withdrawals.data.filter((w) => w.status === 'PENDING').length;
        setStats([
          { label: 'Clients', value: String(clients.data.length), color: '#6d28d9' },
          { label: 'Active Clients', value: String(activeClients), color: '#16a34a' },
          { label: 'Licenses', value: String(licenses.data.length), color: '#7c3aed' },
          { label: 'Active Licenses', value: String(activeLicenses), color: '#0891b2' },
          { label: 'Open Jobs', value: String(openJobs), color: '#d97706' },
          { label: 'Pending Withdrawals', value: String(pendingWd), color: '#dc2626' },
        ]);
      } else {
        const [balance, jobs, withdrawals] = await Promise.all([
          api.get<{ availableBalance: number }>('/withdrawals/balance'),
          api.get<Job[]>('/jobs', { params: { mine: 'true' } }),
          api.get<Withdrawal[]>('/withdrawals', { params: { mine: 'true' } }),
        ]);
        const openJobs = jobs.data.filter((j) => ACTIVE_STATUSES.includes(j.jobStatus)).length;
        const doneJobs = jobs.data.filter((j) => !ACTIVE_STATUSES.includes(j.jobStatus)).length;
        const pendingWd = withdrawals.data.filter((w) => w.status === 'PENDING').length;
        setStats([
          { label: 'Available Balance', value: peso(balance.data.availableBalance), color: '#16a34a' },
          { label: 'Open Jobs', value: String(openJobs), color: '#d97706' },
          { label: 'Completed Jobs', value: String(doneJobs), color: '#6d28d9' },
          { label: 'Pending Withdrawals', value: String(pendingWd), color: '#dc2626' },
        ]);
      }
    } catch {
      // keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

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
        <ActivityIndicator size="large" color="#6d28d9" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      }
    >
      <Text style={styles.greeting}>Welcome, {user?.fullName?.split(' ')[0]} 👋</Text>
      <Text style={styles.sub}>{isAdmin ? 'System overview' : 'Your overview'}</Text>

      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    width: '47.5%',
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});
