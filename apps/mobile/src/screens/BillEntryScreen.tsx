import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Alert } from 'react-native';

/**
 * Bill entry skeleton. Phase 4 adds: camera scan, barcode lookup (Bluetooth/USB),
 * vendor auto-fill, on-device GST calc, and offline queue + sync.
 */
export function BillEntryScreen() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('18');

  function save() {
    // TODO: enqueue offline, sync to POST /api/bills when online.
    Alert.alert('Saved (stub)', `${description} ₹${amount} @ ${gstRate}%`);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Description</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} />
      <Text style={styles.label}>Amount (₹)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Text style={styles.label}>GST Rate (%)</Text>
      <TextInput style={styles.input} value={gstRate} onChangeText={setGstRate} keyboardType="numeric" />
      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Save Bill</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', gap: 8 },
  label: { color: '#6b7280', fontSize: 13, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { marginTop: 20, backgroundColor: '#2563eb', padding: 16, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
