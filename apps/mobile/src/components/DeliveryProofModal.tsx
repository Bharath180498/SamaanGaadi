import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface SignaturePoint {
  x: number;
  y: number;
}

type SignatureStroke = SignaturePoint[];

export interface DeliveryProofSubmission {
  receiverName: string;
  receiverSignature: string;
  photoUri: string;
  photoFileName: string;
  photoContentType: string;
}

interface DeliveryProofModalProps {
  visible: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: DeliveryProofSubmission) => Promise<void> | void;
}

const SIGNATURE_HEIGHT = 170;
const SIGNATURE_MIN_POINTS = 6;

function buildFileNameFromUri(uri: string, fallback = 'delivery-proof.jpg') {
  const clean = uri.split('?')[0] ?? '';
  const candidate = clean.split('/').pop();
  if (!candidate || !candidate.includes('.')) {
    return fallback;
  }
  return candidate;
}

function inferMimeTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.heic')) {
    return 'image/heic';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function distance(a: SignaturePoint, b: SignaturePoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizePoint(point: SignaturePoint, width: number, height: number) {
  return {
    x: Math.max(0, Math.min(point.x, width)),
    y: Math.max(0, Math.min(point.y, height))
  };
}

export function DeliveryProofModal({ visible, submitting, onClose, onSubmit }: DeliveryProofModalProps) {
  const [receiverName, setReceiverName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoFileName, setPhotoFileName] = useState('delivery-proof.jpg');
  const [photoContentType, setPhotoContentType] = useState('image/jpeg');
  const [canvasWidth, setCanvasWidth] = useState(1);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  const totalSignaturePoints = useMemo(
    () => strokes.reduce((sum, stroke) => sum + stroke.length, 0),
    [strokes]
  );

  const signatureReady = totalSignaturePoints >= SIGNATURE_MIN_POINTS;
  const receiverNameValid = receiverName.trim().length >= 2;
  const formReady = Boolean(photoUri) && signatureReady && receiverNameValid;

  const signaturePayload = useMemo(() => {
    if (!signatureReady) {
      return '';
    }

    return JSON.stringify({
      width: Number(canvasWidth.toFixed(2)),
      height: SIGNATURE_HEIGHT,
      capturedAt: new Date().toISOString(),
      strokes
    });
  }, [canvasWidth, signatureReady, strokes]);

  const signatureSegments = useMemo(() => {
    const segments: Array<{
      key: string;
      left: number;
      top: number;
      length: number;
      angleRad: number;
    }> = [];

    strokes.forEach((stroke, strokeIndex) => {
      for (let index = 1; index < stroke.length; index += 1) {
        const from = stroke[index - 1];
        const to = stroke[index];
        const length = distance(from, to);
        if (length < 0.7) {
          continue;
        }

        segments.push({
          key: `${strokeIndex}-${index}`,
          left: from.x,
          top: from.y,
          length,
          angleRad: Math.atan2(to.y - from.y, to.x - from.x)
        });
      }
    });

    return segments;
  }, [strokes]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !submitting,
        onMoveShouldSetPanResponder: () => !submitting,
        onPanResponderGrant: (event) => {
          const nextPoint = normalizePoint(
            {
              x: event.nativeEvent.locationX,
              y: event.nativeEvent.locationY
            },
            canvasWidth,
            SIGNATURE_HEIGHT
          );

          setStrokes((current) => [...current, [nextPoint]]);
        },
        onPanResponderMove: (event) => {
          const nextPoint = normalizePoint(
            {
              x: event.nativeEvent.locationX,
              y: event.nativeEvent.locationY
            },
            canvasWidth,
            SIGNATURE_HEIGHT
          );

          setStrokes((current) => {
            if (current.length === 0) {
              return current;
            }

            const next = current.slice();
            const activeStroke = next[next.length - 1] ?? [];
            const lastPoint = activeStroke[activeStroke.length - 1];
            if (lastPoint && distance(lastPoint, nextPoint) < 1.3) {
              return current;
            }

            next[next.length - 1] = [...activeStroke, nextPoint];
            return next;
          });
        }
      }),
    [canvasWidth, submitting]
  );

  const resetState = () => {
    setReceiverName('');
    setPhotoUri(undefined);
    setPhotoFileName('delivery-proof.jpg');
    setPhotoContentType('image/jpeg');
    setStrokes([]);
  };

  const handleClose = () => {
    if (submitting) {
      return;
    }
    resetState();
    onClose();
  };

  const captureDeliveryPhoto = async () => {
    try {
      const ImagePicker = require('expo-image-picker') as {
        requestCameraPermissionsAsync: () => Promise<{ status?: string }>;
        launchCameraAsync: (options: Record<string, unknown>) => Promise<{
          canceled?: boolean;
          assets?: Array<{ uri?: string; fileName?: string | null; mimeType?: string | null }>;
        }>;
        MediaTypeOptions?: { Images?: unknown };
      };

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Camera permission required', 'Allow camera access to capture delivery proof photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images,
        allowsEditing: false,
        quality: 0.75
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        throw new Error('Photo capture failed. Please try again.');
      }

      const nextFileName = (asset.fileName ?? '').trim() || buildFileNameFromUri(asset.uri);
      const nextContentType = (asset.mimeType ?? '').trim() || inferMimeTypeFromFileName(nextFileName);

      setPhotoUri(asset.uri);
      setPhotoFileName(nextFileName);
      setPhotoContentType(nextContentType);
    } catch {
      Alert.alert(
        'Camera unavailable',
        'Delivery photo capture requires expo-image-picker. Install it with: npx expo install expo-image-picker'
      );
    }
  };

  const submitProof = async () => {
    if (!photoUri) {
      Alert.alert('Delivery photo required', 'Capture a delivery photo before completing the trip.');
      return;
    }

    if (!receiverNameValid) {
      Alert.alert('Receiver name required', 'Enter receiver full name to confirm delivery.');
      return;
    }

    if (!signatureReady || !signaturePayload) {
      Alert.alert('Receiver signature required', 'Collect receiver signature before completing delivery.');
      return;
    }

    await onSubmit({
      receiverName: receiverName.trim(),
      receiverSignature: signaturePayload,
      photoUri,
      photoFileName,
      photoContentType
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Delivery Proof Required</Text>
            <Pressable onPress={handleClose} disabled={submitting}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.label}>Receiver Name</Text>
            <TextInput
              value={receiverName}
              onChangeText={setReceiverName}
              placeholder="Enter receiver full name"
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              autoCorrect={false}
              editable={!submitting}
              style={styles.input}
            />

            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.label}>Delivery Photo</Text>
                <Pressable style={styles.actionPill} onPress={() => void captureDeliveryPhoto()} disabled={submitting}>
                  <Text style={styles.actionPillText}>{photoUri ? 'Retake' : 'Take Photo'}</Text>
                </Pressable>
              </View>

              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <Text style={styles.helperText}>Capture clear photo of delivered goods and receiver handoff.</Text>
              )}
            </View>

            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.label}>Receiver Signature</Text>
                <Pressable
                  style={styles.actionPill}
                  onPress={() => setStrokes([])}
                  disabled={submitting || strokes.length === 0}
                >
                  <Text style={styles.actionPillText}>Clear</Text>
                </Pressable>
              </View>

              <View
                style={styles.signatureCanvas}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  if (width > 0 && Number.isFinite(width)) {
                    setCanvasWidth(width);
                  }
                }}
                {...panResponder.panHandlers}
              >
                {signatureSegments.map((segment) => (
                  <View
                    key={segment.key}
                    style={[
                      styles.signatureSegment,
                      {
                        left: segment.left,
                        top: segment.top,
                        width: segment.length,
                        transform: [{ rotateZ: `${segment.angleRad}rad` }]
                      }
                    ]}
                  />
                ))}
              </View>

              <Text style={styles.helperText}>
                Ask receiver to sign in the box. Minimum {SIGNATURE_MIN_POINTS} strokes/points required.
              </Text>
            </View>
          </ScrollView>

          <Pressable
            style={[styles.submitButton, !formReady && styles.submitButtonDisabled]}
            onPress={() => void submitProof()}
            disabled={submitting || !formReady}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitText}>Submit Proof and Complete</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end'
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontFamily: typography.heading,
    color: colors.accent,
    fontSize: 18
  },
  closeText: {
    fontFamily: typography.bodyBold,
    color: colors.secondary
  },
  scrollArea: {
    maxHeight: 520
  },
  scrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  label: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 13
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.accent,
    fontFamily: typography.body,
    backgroundColor: '#F8FAFF'
  },
  block: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFF',
    padding: spacing.sm,
    gap: spacing.xs
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  actionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.secondary,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  actionPillText: {
    color: colors.secondary,
    fontFamily: typography.bodyBold,
    fontSize: 12
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  signatureCanvas: {
    width: '100%',
    height: SIGNATURE_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#1E40AF',
    backgroundColor: '#F8FAFF',
    overflow: 'hidden'
  },
  signatureSegment: {
    position: 'absolute',
    height: 3,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    transformOrigin: 'left center'
  },
  helperText: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 12
  },
  submitButton: {
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8'
  },
  submitText: {
    color: colors.white,
    fontFamily: typography.bodyBold,
    fontSize: 15
  }
});
