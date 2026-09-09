import { Tabs } from 'expo-router';

import { CustomTabBar } from '@/components/custom-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="assets" options={{ title: 'Assets' }} />
      <Tabs.Screen name="settings" options={{ title: 'Me' }} />
    </Tabs>
  );
}
