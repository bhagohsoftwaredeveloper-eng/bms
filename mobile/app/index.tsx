import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/auth';

export default function Index() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5' }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return <Redirect href={user ? '/(tabs)' : '/login'} />;
}
