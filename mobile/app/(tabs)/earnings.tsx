import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/api';
import type { Earning, Withdrawal } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const METHODS = ['GCASH', 'MAYA', 'BANK_TRANSFER'] as const;
const EMPTY_FORM = { amount: '', method: METHODS[0] as string, accountName: '', accountNumber: '' };

export default function EarningsScreen() {
  const [balance, setBalance] = useState(0);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const openForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const submit = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      setFormError('Enter a valid amount.');
      return;
    }
    if (amount > balance) {
      setFormError(`Amount exceeds your available balance of ${peso(balance)}.`);
      return;
    }
    if (!form.accountName.trim() || !form.accountNumber.trim()) {
      setFormError('Account name and number are required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api.post('/withdrawals', {
        amount,
        method: form.method,
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
      });
      setShowForm(false);
      Alert.alert('Request submitted', 'Your withdrawal request is now pending review.');
      void load();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setFormError(
        Array.isArray(message) ? message.join('\n') : message ?? 'Could not submit the request. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

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
        <TouchableOpacity
          style={[styles.requestBtn, balance <= 0 && styles.requestBtnDisabled]}
          disabled={balance <= 0}
          onPress={openForm}
        >
          <Text style={styles.requestBtnText}>Request Withdrawal</Text>
        </TouchableOpacity>
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

      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request Withdrawal</Text>
            <Text style={styles.modalMeta}>Available: {peso(balance)}</Text>

            <Text style={styles.inputLabel}>Amount (₱)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              value={form.amount}
              onChangeText={(v) => setForm({ ...form, amount: v })}
            />

            <Text style={styles.inputLabel}>Method</Text>
            <View style={styles.methodRow}>
              {METHODS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodChip, form.method === m && styles.methodChipActive]}
                  onPress={() => setForm({ ...form, method: m })}
                >
                  <Text style={[styles.methodChipText, form.method === m && styles.methodChipTextActive]}>
                    {m.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Account name</Text>
            <TextInput
              style={styles.input}
              placeholder="Juan Dela Cruz"
              placeholderTextColor="#9ca3af"
              value={form.accountName}
              onChangeText={(v) => setForm({ ...form, accountName: v })}
            />

            <Text style={styles.inputLabel}>Account number</Text>
            <TextInput
              style={styles.input}
              placeholder="09XXXXXXXXX"
              placeholderTextColor="#9ca3af"
              value={form.accountNumber}
              onChangeText={(v) => setForm({ ...form, accountNumber: v })}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                disabled={submitting}
                onPress={() => setShowForm(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.submitBtn, submitting && styles.requestBtnDisabled]}
                disabled={submitting}
                onPress={() => void submit()}
              >
                <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 8, paddingBottom: 40 },
  balanceCard: { backgroundColor: '#6d28d9', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 8 },
  balanceLabel: { color: '#c7d2fe', fontSize: 13, fontWeight: '600' },
  balanceValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },
  requestBtn: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  requestBtnDisabled: { opacity: 0.5 },
  requestBtnText: { color: '#6d28d9', fontWeight: '700', fontSize: 14 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalMeta: { fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: 8 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  methodChipActive: { backgroundColor: '#6d28d9', borderColor: '#6d28d9' },
  methodChipText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  methodChipTextActive: { color: '#fff' },
  formError: { color: '#dc2626', fontSize: 13, marginTop: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#f3f4f6' },
  cancelBtnText: { color: '#374151', fontWeight: '700', fontSize: 14 },
  submitBtn: { backgroundColor: '#6d28d9' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
