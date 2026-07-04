import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/api';
import type { Job, JobStatus } from '@/types';

const NEXT_STATUS: Partial<Record<JobStatus, { label: string; value: JobStatus }>> = {
  ASSIGNED: { label: 'Start Job', value: 'ON_GOING' },
  ON_GOING: { label: 'Mark Completed', value: 'COMPLETED' },
};

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Job>(`/jobs/${id}`);
      setJob(data);
    } catch {
      Alert.alert('Error', 'Could not load this job.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (value: JobStatus) => {
    setBusy(true);
    try {
      await api.patch(`/jobs/${id}/status`, { jobStatus: value });
      await load();
    } catch {
      Alert.alert('Update failed', 'Could not change the job status. Activation may be required first.');
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required to capture proof.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const submitProof = async () => {
    if (!photoUri) {
      Alert.alert('Photo required', 'Capture an installation photo first.');
      return;
    }
    setBusy(true);
    try {
      // 1) GPS
      let gpsLatitude: number | undefined;
      let gpsLongitude: number | undefined;
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.granted) {
        const pos = await Location.getCurrentPositionAsync({});
        gpsLatitude = pos.coords.latitude;
        gpsLongitude = pos.coords.longitude;
      }

      // 2) Upload photo
      const form = new FormData();
      form.append('files', {
        uri: photoUri,
        name: `proof-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
      const { data: uploaded } = await api.post<{ urls: string[] }>('/uploads/images', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 3) Submit proof
      await api.post(`/jobs/${id}/proof`, {
        photoUrls: uploaded.urls,
        gpsLatitude,
        gpsLongitude,
        deviceInfo: { os: Platform.OS, model: Device.modelName ?? 'unknown' },
      });

      setPhotoUri(null);
      await load();
      Alert.alert('Submitted', 'Proof of installation submitted. Awaiting activation.');
    } catch {
      Alert.alert('Submit failed', 'Could not submit proof. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!job) return null;

  const next = NEXT_STATUS[job.jobStatus];
  const canSubmitProof = job.jobStatus === 'ON_GOING' || job.jobStatus === 'ASSIGNED';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.business}>{job.client?.businessName ?? 'Client'}</Text>
        <Text style={styles.meta}>Owner: {job.client?.ownerName ?? '—'}</Text>
        <Text style={styles.meta}>Contact: {job.client?.contactNo ?? '—'}</Text>
        <Text style={styles.meta}>Address: {job.client?.address ?? '—'}</Text>
        <Text style={styles.meta}>Scheduled: {new Date(job.scheduleDate).toLocaleString()}</Text>
        <Text style={styles.status}>Status: {job.jobStatus.replace(/_/g, ' ')}</Text>
        {job.remarks ? <Text style={styles.meta}>Remarks: {job.remarks}</Text> : null}
      </View>

      {next && (
        <TouchableOpacity
          style={[styles.button, busy && styles.disabled]}
          disabled={busy}
          onPress={() => updateStatus(next.value)}
        >
          <Text style={styles.buttonText}>{next.label}</Text>
        </TouchableOpacity>
      )}

      {canSubmitProof && (
        <View style={styles.proofBox}>
          <Text style={styles.sectionTitle}>Proof of Installation</Text>
          {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}
          <TouchableOpacity style={styles.secondaryButton} onPress={takePhoto}>
            <Text style={styles.secondaryText}>{photoUri ? 'Retake Photo' : '📷 Capture Photo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, (busy || !photoUri) && styles.disabled]}
            disabled={busy || !photoUri}
            onPress={submitProof}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Proof + GPS</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 18, gap: 5, borderWidth: 1, borderColor: '#eef0f4' },
  business: { fontSize: 19, fontWeight: '800', color: '#111827', marginBottom: 4 },
  meta: { fontSize: 14, color: '#374151' },
  status: { fontSize: 14, fontWeight: '700', color: '#4f46e5', marginTop: 6 },
  proofBox: { backgroundColor: '#fff', borderRadius: 12, padding: 18, gap: 12, borderWidth: 1, borderColor: '#eef0f4' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  preview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#f3f4f6' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: '#4f46e5', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: '#4f46e5', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
});
