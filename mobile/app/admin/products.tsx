import { Text, View } from 'react-native';
import { AdminList, cardStyles as s } from '@/AdminList';
import type { Product } from '@/types';

const peso = (n: number) => `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function ProductsScreen() {
  return (
    <AdminList<Product>
      url="/software-products"
      keyExtractor={(p) => p.id}
      emptyText="No products yet."
      renderItem={(p) => (
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.title}>{p.productName}</Text>
            <Text style={[s.title, { color: '#4f46e5' }]}>{peso(Number(p.price))}</Text>
          </View>
          <Text style={s.meta}>v{p.version} · {p.licenseType.replace(/_/g, ' ')}</Text>
        </View>
      )}
    />
  );
}
