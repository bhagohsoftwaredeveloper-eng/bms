import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@/auth';

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{label}</Text>;
}

export default function TabsLayout() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_STAFF';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 },
        headerStyle: { backgroundColor: '#4f46e5' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      {/* Admin-only tabs */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon label="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon label="🗂️" color={color} />,
        }}
      />

      {/* Field-staff tabs */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Jobs',
          href: isAdmin ? null : undefined,
          tabBarIcon: ({ color }) => <TabIcon label="🧰" color={color} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          href: isAdmin ? null : undefined,
          tabBarIcon: ({ color }) => <TabIcon label="💰" color={color} />,
        }}
      />

      {/* Everyone */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
