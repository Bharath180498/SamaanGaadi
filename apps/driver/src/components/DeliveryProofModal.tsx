import { useMemo, useRef, useState } from 'react';
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
import { useDriverI18n } from '../i18n/useDriverI18n';

interface SignaturePoint {
  x: number;
  y: number;
}

type SignatureStroke = SignaturePoint[];

interface SignatureCanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
const SIGNATURE_STROKE_WIDTH = 3;

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
  const { t } = useDriverI18n();
  const [receiverName, setReceiverName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoFileName, setPhotoFileName] = useState('delivery-proof.jpg');
  const [photoContentType, setPhotoContentType] = useState('image/jpeg');
  const [canvasWidth, setCanvasWidth] = useState(1);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const signatureCanvasRef = useRef<View | null>(null);
  const isDrawingRef = useRef(false);
  const canvasBoundsRef = useRef<SignatureCanvasBounds>({
    x: 0,
    y: 0,
    width: 1,
    height: SIGNATURE_HEIGHT
  });

  const updateCanvasMetrics = () => {
    const node = signatureCanvasRef.current;
    if (!node) {
      return;
    }

    node.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return;
      }

      canvasBoundsRef.current = { x, y, width, height };
      setCanvasWidth(width);
    });
  };

  const eventPointToCanvasPoint = (event: {
    nativeEvent: {
      pageX?: number;
      pageY?: number;
      locationX: number;
      locationY: number;
    };
  }) => {
    const bounds = canvasBoundsRef.current;
    const pageX = event.nativeEvent.pageX;
    const pageY = event.nativeEvent.pageY;

    if (typeof pageX === 'number' && typeof pageY === 'number' && bounds.width > 1) {
      return normalizePoint(
        {
          x: pageX - bounds.x,
          y: pageY - bounds.y
        },
        bounds.width,
        bounds.height
      );
    }

    return normalizePoint(
      {
        x: event.nativeEvent.locationX,
        y: event.nativeEvent.locationY
      },
      canvasWidth,
      SIGNATURE_HEIGHT
    );
  };

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
          left: (from.x + to.x) / 2 - length / 2,
          top: (from.y + to.y) / 2 - SIGNATURE_STROKE_WIDTH / 2,
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
        onStartShouldSetPanResponderCapture: () => !submitting,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          !submitting && (Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1),
        onMoveShouldSetPanResponderCapture: () => !submitting,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          isDrawingRef.current = true;
          setIsDrawingSignature(true);

          const nextPoint = eventPointToCanvasPoint(event);

          setStrokes((current) => [...current, [nextPoint]]);
        },
        onPanResponderMove: (event) => {
          if (!isDrawingRef.current) {
            return;
          }

          const nextPoint = eventPointToCanvasPoint(event);

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
        },
        onPanResponderRelease: () => {
          isDrawingRef.current = false;
          setIsDrawingSignature(false);
        },
        onPanResponderTerminate: () => {
          isDrawingRef.current = false;
          setIsDrawingSignature(false);
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
    isDrawingRef.current = false;
    setIsDrawingSignature(false);
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
        Alert.alert(t('deliveryProof.alert.cameraPermissionTitle'), t('deliveryProof.alert.cameraPermissionBody'));
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
        throw new Error(t('deliveryProof.alert.photoCaptureFailed'));
      }

      const nextFileName = (asset.fileName ?? '').trim() || buildFileNameFromUri(asset.uri);
      const nextContentType = (asset.mimeType ?? '').trim() || inferMimeTypeFromFileName(nextFileName);

      setPhotoUri(asset.uri);
      setPhotoFileName(nextFileName);
      setPhotoContentType(nextContentType);
    } catch {
      Alert.alert(
        t('deliveryProof.alert.cameraUnavailableTitle'),
        t('deliveryProof.alert.cameraUnavailableBody')
      );
    }
  };

  const submitProof = async () => {
    if (!photoUri) {
      Alert.alert(t('deliveryProof.alert.photoRequiredTitle'), t('deliveryProof.alert.photoRequiredBody'));
      return;
    }

    if (!receiverNameValid) {
      Alert.alert(t('deliveryProof.alert.receiverNameTitle'), t('deliveryProof.alert.receiverNameBody'));
      return;
    }

    if (!signatureReady || !signaturePayload) {
      Alert.alert(t('deliveryProof.alert.signatureRequiredTitle'), t('deliveryProof.alert.signatureRequiredBody'));
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
            <Text style={styles.title}>{t('deliveryProof.title')}</Text>
            <Pressable onPress={handleClose} disabled={submitting}>
              <Text style={styles.closeText}>{t('common.close')}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            scrollEnabled={!isDrawingSignature && !submitting}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>{t('deliveryProof.receiverName')}</Text>
            <TextInput
              value={receiverName}
              onChangeText={setReceiverName}
              placeholder={t('deliveryProof.receiverPlaceholder')}
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              autoCorrect={false}
              editable={!submitting}
              style={styles.input}
            />

            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.label}>{t('deliveryProof.deliveryPhoto')}</Text>
                <Pressable style={styles.actionPill} onPress={() => void captureDeliveryPhoto()} disabled={submitting}>
                  <Text style={styles.actionPillText}>{photoUri ? t('deliveryProof.retakePhoto') : t('deliveryProof.takePhoto')}</Text>
                </Pressable>
              </View>

              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <Text style={styles.helperText}>{t('deliveryProof.photoHint')}</Text>
              )}
            </View>

            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.label}>{t('deliveryProof.signature')}</Text>
                <Pressable
                  style={styles.actionPill}
                  onPress={() => setStrokes([])}
                  disabled={submitting || strokes.length === 0}
                >
                  <Text style={styles.actionPillText}>{t('deliveryProof.clear')}</Text>
                </Pressable>
              </View>

              <View
                ref={(node) => {
                  signatureCanvasRef.current = node;
                }}
                collapsable={false}
                style={styles.signatureCanvas}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  if (width > 0 && Number.isFinite(width)) {
                    setCanvasWidth(width);
                  }
                  updateCanvasMetrics();
                }}
                {...panResponder.panHandlers}
              >
                {signatureSegments.map((segment) => (
                  <View
                    key={segment.key}
                    pointerEvents="none"
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
                {t('deliveryProof.signatureHint', { points: SIGNATURE_MIN_POINTS })}
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
              <Text style={styles.submitText}>{t('deliveryProof.submit')}</Text>
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
    height: SIGNATURE_STROKE_WIDTH,
    borderRadius: 999,
    backgroundColor: '#1E293B'
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
