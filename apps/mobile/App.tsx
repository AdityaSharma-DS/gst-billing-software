import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { BillEntryScreen } from './src/screens/BillEntryScreen';

export type RootStackParamList = {
  Dashboard: undefined;
  BillEntry: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator initialRouteName="Dashboard">
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'GST Billing' }} />
        <Stack.Screen name="BillEntry" component={BillEntryScreen} options={{ title: 'New Bill' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
