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
import type { Earning, Withdrawal } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function EarningsScreen() {
  const [balance, setBalance] = useState(0);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, e, w] = await Promise.all([
        api.get<{ availableBalance: number }>('/withdrawals/balance'),
        api.get<Earning[]>('/earnings', { params: { mine: 'true' } }),
        api.get<Withdrawal[]>('/withdrawals', { params: { mine: 'true' } }),
      ]);
      setBalance(b.data.availableBalance);
      setEarnings(e.data);
      setWithdrawals(w.data);
    } catch {
      // leave previous data
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
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceValue}>{peso(balance)}</Text>
      </View>

      <Text style={styles.sectionTitle}>Earnings</Text>
      {earnings.length === 0 ? (
        <Text style={styles.empty}>No earnings yet.</Text>
      ) : (
        earnings.map((e) => (
          <View key={e.id} style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>{e.type}</Text>
              <Text style={styles.rowMeta}>{new Date(e.createdAt).toLocaleDateString()} · {e.status}</Text>
            </View>
            <Text style={styles.amount}>{peso(Number(e.amount))}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Withdrawals</Text>
      {withdrawals.length === 0 ? (
        <Text style={styles.empty}>No withdrawals yet.</Text>
      ) : (
        withdrawals.map((w) => (
          <View key={w.id} style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>{w.method.replace(/_/g, ' ')}</Text>
              <Text style={styles.rowMeta}>{new Date(w.createdAt).toLocaleDateString()} · {w.status}</Text>
            </View>
            <Text style={[styles.amount, { color: '#dc2626' }]}>-{peso(Number(w.amount))}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 8, paddingBottom: 40 },
  balanceCard: { backgroundColor: '#4f46e5', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 8 },
  balanceLabel: { color: '#c7d2fe', fontSize: 13, fontWeight: '600' },
  balanceValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 4 },
  empty: { color: '#9ca3af', fontSize: 13, paddingVertical: 8 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
});
