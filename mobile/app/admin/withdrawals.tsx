import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import { api } from '@/api';

interface AdminWithdrawal {
  id: string;
  amount: string;
  method: string;
  accountName: string;
  accountNumber: string;
  status: string;
  createdAt: string;
  user?: { fullName: string };
}

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#d97706', APPROVED: '#2563eb', REJECTED: '#dc2626', RELEASED: '#16a34a',
};

function WithdrawalCard({ w, refresh }: { w: AdminWithdrawal; refresh: () => void }) {
  const [busy, setBusy] = useState(false);

  const act = async (action: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await api.patch(`/withdrawals/${w.id}/${action}`);
      refresh();
    } catch {
      Alert.alert('Failed', `Could not ${action} this withdrawal.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={s.title}>{w.user?.fullName ?? 'User'}</Text>
        <View style={[s.badge, { backgroundColor: STATUS_COLOR[w.status] ?? '#6b7280' }]}>
          <Text style={s.badgeText}>{w.status}</Text>
        </View>
      </View>
      <Text style={[s.title, { color: '#dc2626' }]}>{peso(Number(w.amount))}</Text>
      <Text style={s.meta}>{w.method.replace(/_/g, ' ')} · {w.accountName} ({w.accountNumber})</Text>
      <Text style={s.meta}>{new Date(w.createdAt).toLocaleDateString()}</Text>

      {w.status === 'PENDING' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.approve, busy && styles.disabled]}
            disabled={busy}
            onPress={() => act('approve')}
          >
            <Text style={styles.btnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.reject, busy && styles.disabled]}
            disabled={busy}
            onPress={() => act('reject')}
          >
            <Text style={styles.btnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function WithdrawalsScreen() {
  return (
    <AdminList<AdminWithdrawal>
      url="/withdrawals"
      keyExtractor={(w) => w.id}
      emptyText="No withdrawal requests."
      renderItem={(w, refresh) => <WithdrawalCard w={w} refresh={refresh} />}
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approve: { backgroundColor: '#16a34a' },
  reject: { backgroundColor: '#dc2626' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.5 },
});
