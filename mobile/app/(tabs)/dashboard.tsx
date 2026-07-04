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
import type { Client, License, Job, Withdrawal } from '@/types';

interface Stat {
  label: string;
  value: number;
  color: string;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
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
        { label: 'Clients', value: clients.data.length, color: '#4f46e5' },
        { label: 'Active Clients', value: activeClients, color: '#16a34a' },
        { label: 'Licenses', value: licenses.data.length, color: '#7c3aed' },
        { label: 'Active Licenses', value: activeLicenses, color: '#0891b2' },
        { label: 'Open Jobs', value: openJobs, color: '#d97706' },
        { label: 'Pending Withdrawals', value: pendingWd, color: '#dc2626' },
      ]);
    } catch {
      // keep previous
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
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      }
    >
      <Text style={styles.greeting}>Welcome, {user?.fullName?.split(' ')[0]} 👋</Text>
      <Text style={styles.sub}>System overview</Text>

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
  statValue: { fontSize: 30, fontWeight: '800' },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});
