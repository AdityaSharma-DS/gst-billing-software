import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today</Text>
      <View style={styles.card}><Text style={styles.cardLabel}>Bills</Text><Text style={styles.cardValue}>—</Text></View>
      <View style={styles.card}><Text style={styles.cardLabel}>Monthly Tax (₹)</Text><Text style={styles.cardValue}>—</Text></View>
      <Pressable style={styles.button} onPress={() => navigation.navigate('BillEntry')}>
        <Text style={styles.buttonText}>+ New Bill</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f7f9', gap: 12 },
  heading: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16 },
  cardLabel: { color: '#6b7280', fontSize: 13 },
  cardValue: { fontSize: 24, fontWeight: '700', marginTop: 4 },
  button: { marginTop: 'auto', backgroundColor: '#2563eb', padding: 16, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
