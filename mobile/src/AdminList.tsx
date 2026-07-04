import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from './api';

interface AdminListProps<T> {
  url: string;
  params?: Record<string, string>;
  keyExtractor: (item: T) => string;
  renderItem: (item: T, refresh: () => void) => React.ReactElement;
  emptyText?: string;
  header?: React.ReactElement;
}

export function AdminList<T>({
  url,
  params,
  keyExtractor,
  renderItem,
  emptyText = 'No records found.',
  header,
}: AdminListProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<T[]>(url, { params });
      setData(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Could not load data. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params)]);

  useEffect(() => {
    void load();
  }, [load]);

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
      data={data}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
      ListEmptyComponent={<Text style={styles.empty}>{error ?? emptyText}</Text>}
      renderItem={({ item }) => renderItem(item, load)}
    />
  );
}

export const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meta: { fontSize: 13, color: '#6b7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
});
