import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import api, { SUPPORT_PHONE, maskPhone } from '../../services/api';
import { useDriverSessionStore } from '../../store/useDriverSessionStore';
import { useDriverAppStore } from '../../store/useDriverAppStore';
import { colors, radius, spacing, typography } from '../../theme';
import { useDriverI18n } from '../../i18n/useDriverI18n';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED';
type SenderType = 'USER' | 'ADMIN' | 'SYSTEM';
const RESOLUTION_TARGET_HOURS = 6;
const CALL_ESCALATION_HOURS = 6;
const CALL_ESCALATION_MS = CALL_ESCALATION_HOURS * 60 * 60 * 1000;
const ESCALATION_LONG_PRESS_MS = 1800;

interface PickedImage {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

interface DraftAttachment {
  localId: string;
  uri: string;
  fileName?: string;
  contentType?: string;
  fileSizeBytes?: number;
}

interface SupportMessageAttachment {
  id: string;
  fileKey: string;
  fileUrl: string;
  fileName?: string | null;
  contentType?: string | null;
  fileSizeBytes?: number | null;
  createdAt?: string;
}

interface SupportMessage {
  id: string;
  senderType: SenderType;
  message: string;
  createdAt: string;
  senderUser?: {
    id: string;
    name: string;
    role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
  } | null;
  attachments: SupportMessageAttachment[];
}

interface SupportTicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  orderId?: string | null;
  tripId?: string | null;
  messageCount: number;
}

interface SupportTicketDetail extends SupportTicketSummary {
  description: string;
  messages: SupportMessage[];
}

const MAX_ATTACHMENTS_PER_MESSAGE = 5;

async function pickSupportImageFromLibrary(): Promise<PickedImage | null> {
  try {
    const ImagePicker = require('expo-image-picker') as {
      MediaTypeOptions?: { Images?: unknown };
      requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
      launchImageLibraryAsync: (options: Record<string, unknown>) => Promise<{
        canceled: boolean;
        assets?: PickedImage[];
      }>;
    };

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('PERMISSION_DENIED');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions?.Images,
      allowsEditing: true,
      quality: 0.8
    });

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    return result.assets[0];
  } catch {
    throw new Error('IMAGE_PICKER_UNAVAILABLE');
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function errorMessage(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : fallback;
}

function normalizeStatus(input: unknown): TicketStatus {
  const value = typeof input === 'string' ? input : 'OPEN';
  if (value === 'IN_PROGRESS' || value === 'WAITING_FOR_USER' || value === 'RESOLVED') {
    return value;
  }
  return 'OPEN';
}

function normalizeAttachment(input: unknown): SupportMessageAttachment | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const row = input as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const fileKey = typeof row.fileKey === 'string' ? row.fileKey : '';
  const fileUrl = typeof row.fileUrl === 'string' ? row.fileUrl : '';
  if (!id || !fileKey || !fileUrl) {
    return null;
  }

  return {
    id,
    fileKey,
    fileUrl,
    fileName: typeof row.fileName === 'string' ? row.fileName : undefined,
    contentType: typeof row.contentType === 'string' ? row.contentType : undefined,
    fileSizeBytes: typeof row.fileSizeBytes === 'number' ? row.fileSizeBytes : undefined,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined
  };
}

function normalizeMessage(input: unknown): SupportMessage | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const row = input as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const message = typeof row.message === 'string' ? row.message : '';
  const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';

  if (!id || !message || !createdAt) {
    return null;
  }

  const senderTypeRaw = typeof row.senderType === 'string' ? row.senderType : 'SYSTEM';
  const senderType: SenderType =
    senderTypeRaw === 'USER' || senderTypeRaw === 'ADMIN' || senderTypeRaw === 'SYSTEM'
      ? senderTypeRaw
      : 'SYSTEM';

  const senderUser =
    row.senderUser && typeof row.senderUser === 'object'
      ? {
          id: String((row.senderUser as Record<string, unknown>).id ?? ''),
          name: String((row.senderUser as Record<string, unknown>).name ?? ''),
          role: String((row.senderUser as Record<string, unknown>).role ?? 'DRIVER') as
            | 'CUSTOMER'
            | 'DRIVER'
            | 'ADMIN'
        }
      : null;

  const attachments = Array.isArray(row.attachments)
    ? row.attachments
        .map(normalizeAttachment)
        .filter((attachment): attachment is SupportMessageAttachment => Boolean(attachment))
    : [];

  return {
    id,
    senderType,
    message,
    createdAt,
    senderUser,
    attachments
  };
}

function normalizeTicketSummary(input: unknown): SupportTicketSummary | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const row = input as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const subject = typeof row.subject === 'string' ? row.subject : '';
  const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
  const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : '';

  if (!id || !subject || !createdAt || !updatedAt) {
    return null;
  }

  const messages = Array.isArray(row.messages)
    ? row.messages.map(normalizeMessage).filter((message): message is SupportMessage => Boolean(message))
    : [];

  return {
    id,
    subject,
    status: normalizeStatus(row.status),
    createdAt,
    updatedAt,
    orderId: typeof row.orderId === 'string' ? row.orderId : undefined,
    tripId: typeof row.tripId === 'string' ? row.tripId : undefined,
    messageCount: messages.length
  };
}

function normalizeTicketDetail(input: unknown): SupportTicketDetail | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const row = input as Record<string, unknown>;
  const summary = normalizeTicketSummary(row);
  if (!summary) {
    return null;
  }

  const description = typeof row.description === 'string' ? row.description : '';
  const messages = Array.isArray(row.messages)
    ? row.messages.map(normalizeMessage).filter((message): message is SupportMessage => Boolean(message))
    : [];

  return {
    ...summary,
    description,
    messages
  };
}

function getStatusLabel(status: TicketStatus, t: (key: string, params?: Record<string, string | number>) => string) {
  switch (status) {
    case 'OPEN':
      return t('support.status.pending');
    case 'IN_PROGRESS':
      return t('support.status.inProgress');
    case 'WAITING_FOR_USER':
      return t('support.status.waiting');
    case 'RESOLVED':
      return t('support.status.resolved');
    default:
      return status;
  }
}

function getSenderTypeLabel(senderType: SenderType, t: (key: string, params?: Record<string, string | number>) => string) {
  if (senderType === 'ADMIN') {
    return t('support.sender.admin');
  }
  if (senderType === 'SYSTEM') {
    return t('support.sender.system');
  }
  return t('support.sender.user');
}

function buildDraftFileName(index: number) {
  return `support-image-${Date.now()}-${index}.jpg`;
}

export function SupportScreen() {
  const { t } = useDriverI18n();
  const user = useDriverSessionStore((state) => state.user);
  const currentJob = useDriverAppStore((state) => state.currentJob);

  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>();
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketDetail>();
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<DraftAttachment[]>([]);
  const [viewMode, setViewMode] = useState<'inbox' | 'detail'>('inbox');

  const maskedSupportPhone = useMemo(() => maskPhone(SUPPORT_PHONE), []);
  const escalationEligible = useMemo(() => {
    const now = Date.now();
    return tickets.some((ticket) => {
      if (ticket.status === 'RESOLVED') {
        return false;
      }

      const updatedAtMs = new Date(ticket.updatedAt).getTime();
      if (!Number.isFinite(updatedAtMs)) {
        return false;
      }

      return now - updatedAtMs >= CALL_ESCALATION_MS;
    });
  }, [tickets]);

  const loadTickets = useCallback(
    async (showSpinner = true) => {
      if (!user?.id) {
        return;
      }

      if (showSpinner) {
        setLoadingList(true);
      }

      try {
        const response = await api.get('/support/tickets', {
          params: {
            userId: user.id
          }
        });

        const nextRaw = Array.isArray(response.data) ? response.data : [];
        const next = nextRaw.map(normalizeTicketSummary).filter(Boolean) as SupportTicketSummary[];
        setTickets(next);

        if (selectedTicketId && !next.some((ticket) => ticket.id === selectedTicketId)) {
          setSelectedTicketId(undefined);
          setSelectedTicket(undefined);
          setReplyAttachments([]);
          setViewMode('inbox');
        }
      } catch (loadError: unknown) {
        Alert.alert(t('support.alert.genericTitle'), errorMessage(loadError, t('support.alert.loadTickets')));
      } finally {
        setLoadingList(false);
        setRefreshingList(false);
      }
    },
    [selectedTicketId, user?.id]
  );

  const openTicket = useCallback(
    async (ticketId: string, showSpinner = true, silent = false) => {
      if (!user?.id) {
        return;
      }

      if (showSpinner) {
        setLoadingDetail(true);
      }

      try {
        const response = await api.get(`/support/tickets/${ticketId}`, {
          params: {
            userId: user.id
          }
        });

        const detail = normalizeTicketDetail(response.data);
        if (!detail) {
          throw new Error(t('support.alert.openTicket'));
        }

        setSelectedTicketId(ticketId);
        setSelectedTicket(detail);
        setViewMode('detail');
      } catch (ticketError: unknown) {
        if (!silent) {
          Alert.alert(t('support.alert.genericTitle'), errorMessage(ticketError, t('support.alert.openTicket')));
        }
      } finally {
        setLoadingDetail(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void loadTickets(true);
  }, [loadTickets]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadTickets(false);
      if (selectedTicketId && viewMode === 'detail') {
        void openTicket(selectedTicketId, false, true);
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [loadTickets, openTicket, selectedTicketId, viewMode]);

  const placeSupportCall = async () => {
    const url = `tel:${SUPPORT_PHONE}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(t('support.alert.genericTitle'), t('support.alert.cannotDial'));
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('support.alert.genericTitle'), t('support.alert.callFail'));
    }
  };

  const callSupport = async () => {
    if (tickets.length === 0) {
      Alert.alert(
        t('support.alert.messageFirstTitle'),
        t('support.alert.messageFirstBody', {
          resolveHours: RESOLUTION_TARGET_HOURS,
          callHours: CALL_ESCALATION_HOURS
        })
      );
      return;
    }

    if (!escalationEligible) {
      Alert.alert(
        t('support.alert.waitResponseTitle'),
        t('support.alert.waitResponseBody', {
          resolveHours: RESOLUTION_TARGET_HOURS,
          callHours: CALL_ESCALATION_HOURS
        })
      );
      return;
    }

    Alert.alert(
      t('support.alert.escalateTitle'),
      t('support.alert.escalateBody', { hours: CALL_ESCALATION_HOURS }),
      [
        { text: t('support.alert.notNow'), style: 'cancel' },
        {
          text: t('support.alert.callSupport'),
          onPress: () => {
            void placeSupportCall();
          }
        }
      ]
    );
  };

  const createTicket = async () => {
    if (!user?.id || !subject.trim() || !description.trim()) {
      return;
    }

    setBusy(true);
    try {
      const response = await api.post('/support/tickets', {
        userId: user.id,
        subject: subject.trim(),
        description: description.trim(),
        orderId: currentJob?.orderId,
        tripId: currentJob?.id
      });

      const createdTicketId =
        response.data && typeof (response.data as { id?: unknown }).id === 'string'
          ? String((response.data as { id: string }).id)
          : undefined;

      setSubject('');
      setDescription('');
      await loadTickets(false);

      if (createdTicketId) {
        await openTicket(createdTicketId);
      }
    } catch (createError: unknown) {
      Alert.alert(t('support.alert.genericTitle'), errorMessage(createError, t('support.alert.createTicket')));
    } finally {
      setBusy(false);
    }
  };

  const addReplyAttachment = async () => {
    if (!selectedTicketId) {
      Alert.alert(t('support.alert.genericTitle'), t('support.alert.openTicketFirst'));
      return;
    }

    if (replyAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      Alert.alert(
        t('support.alert.attachmentLimitTitle'),
        t('support.alert.attachmentLimitBody', { count: MAX_ATTACHMENTS_PER_MESSAGE })
      );
      return;
    }

    let picked: PickedImage | null = null;
    try {
      picked = await pickSupportImageFromLibrary();
    } catch (imageError: unknown) {
      const code = String((imageError as Error)?.message ?? '');
      if (code === 'PERMISSION_DENIED') {
        Alert.alert(t('support.alert.attachmentSetupTitle'), t('support.alert.imagePickerPermission'));
      } else {
        Alert.alert(t('support.alert.attachmentSetupTitle'), t('support.alert.imagePickerMissing'));
      }
      return;
    }

    if (!picked) {
      return;
    }

    setReplyAttachments((previous) => [
      ...previous,
      {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        uri: picked.uri,
        fileName: picked.fileName?.trim() || undefined,
        contentType: picked.mimeType?.trim() || 'image/jpeg',
        fileSizeBytes: typeof picked.fileSize === 'number' ? picked.fileSize : undefined
      }
    ]);
  };

  const removeReplyAttachment = (localId: string) => {
    setReplyAttachments((previous) => previous.filter((attachment) => attachment.localId !== localId));
  };

  const uploadReplyAttachments = async (ticketId: string, userId: string) => {
    const uploaded: Array<{
      fileKey: string;
      fileUrl: string;
      fileName?: string;
      contentType?: string;
      fileSizeBytes?: number;
    }> = [];

    for (let index = 0; index < replyAttachments.length; index += 1) {
      const attachment = replyAttachments[index];
      const requestedContentType = attachment.contentType || 'image/jpeg';
      const requestFileName = attachment.fileName || buildDraftFileName(index + 1);

      const uploadRequest = await api.post(`/support/tickets/${ticketId}/messages/upload-url`, {
        userId,
        fileName: requestFileName,
        contentType: requestedContentType
      });

      const uploadUrl = String(uploadRequest.data?.uploadUrl ?? '');
      const fileUrl = String(uploadRequest.data?.fileUrl ?? '');
      const fileKey = String(uploadRequest.data?.fileKey ?? '');
      const resolvedContentType = String(uploadRequest.data?.contentType ?? requestedContentType);

      if (!fileUrl || !fileKey) {
        throw new Error('Attachment upload metadata missing');
      }

      if (uploadUrl && !uploadUrl.startsWith('mock://')) {
        const fileResponse = await fetch(attachment.uri);
        const blob = await fileResponse.blob();
        const putResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': resolvedContentType
          },
          body: blob
        });

        if (!putResponse.ok) {
          throw new Error(t('support.alert.uploadImageFail'));
        }
      }

      uploaded.push({
        fileKey,
        fileUrl,
        fileName: requestFileName,
        contentType: resolvedContentType,
        fileSizeBytes: attachment.fileSizeBytes
      });
    }

    return uploaded;
  };

  const sendReply = async () => {
    if (!user?.id || !selectedTicketId || !reply.trim()) {
      return;
    }

    setBusy(true);
    try {
      const uploadedAttachments = await uploadReplyAttachments(selectedTicketId, user.id);

      await api.post(`/support/tickets/${selectedTicketId}/messages`, {
        userId: user.id,
        message: reply.trim(),
        attachments: uploadedAttachments
      });
      setReply('');
      setReplyAttachments([]);
      await Promise.all([loadTickets(false), openTicket(selectedTicketId, false)]);
    } catch (replyError: unknown) {
      Alert.alert(t('support.alert.genericTitle'), errorMessage(replyError, t('support.alert.sendReply')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshingList}
            onRefresh={() => {
              setRefreshingList(true);
              void loadTickets(false);
            }}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.title}>{t('support.title')}</Text>
          <Text style={styles.info}>{t('support.info.messageFirst', { hours: RESOLUTION_TARGET_HOURS })}</Text>
          <Text style={styles.info}>{t('support.info.callAfter', { hours: CALL_ESCALATION_HOURS })}</Text>
          {escalationEligible ? <Text style={styles.meta}>{t('support.info.supportLine', { phone: maskedSupportPhone })}</Text> : null}
          <Text style={[styles.meta, escalationEligible ? styles.metaReady : undefined]}>
            {escalationEligible ? t('support.info.callEnabled') : t('support.info.callLocked')}
          </Text>
          <Pressable
            style={styles.hiddenEscalationTrigger}
            onLongPress={() => void callSupport()}
            delayLongPress={ESCALATION_LONG_PRESS_MS}
          >
            <Text style={styles.callButtonText}>{t('support.button.callEscalate')}</Text>
          </Pressable>
        </View>

        {viewMode === 'inbox' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('support.createTitle')}</Text>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder={t('support.subjectPlaceholder')}
                placeholderTextColor="#94A3B8"
                style={styles.input}
                maxLength={140}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('support.descriptionPlaceholder')}
                placeholderTextColor="#94A3B8"
                style={[styles.input, styles.textArea]}
                multiline
                maxLength={2000}
              />
              <Text style={styles.meta}>
                {t('support.context', {
                  orderId: currentJob?.orderId ?? '--',
                  tripId: currentJob?.id ?? '--'
                })}
              </Text>
              <Pressable
                style={[styles.primaryButton, busy && styles.disabledButton]}
                onPress={() => void createTicket()}
                disabled={busy}
              >
                <Text style={styles.primaryButtonText}>{busy ? t('support.submitting') : t('support.submitTicket')}</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.ticketHeaderRow}>
                <Text style={styles.cardTitle}>{t('support.myTickets')}</Text>
                <Text style={styles.meta}>{t('support.total', { count: tickets.length })}</Text>
              </View>

              {loadingList ? <ActivityIndicator color={colors.secondary} style={{ marginTop: 10 }} /> : null}

              {tickets.map((ticket) => {
                const statusLabel = getStatusLabel(ticket.status, t);
                return (
                  <Pressable key={ticket.id} onPress={() => void openTicket(ticket.id)} style={styles.ticketRow}>
                    <View style={styles.ticketTopRow}>
                      <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          ticket.status === 'RESOLVED'
                            ? styles.statusResolved
                            : ticket.status === 'WAITING_FOR_USER'
                              ? styles.statusWaiting
                              : ticket.status === 'IN_PROGRESS'
                                ? styles.statusInProgress
                                : styles.statusOpen
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            ticket.status === 'RESOLVED'
                              ? styles.statusResolvedText
                              : ticket.status === 'WAITING_FOR_USER'
                                ? styles.statusWaitingText
                                : ticket.status === 'IN_PROGRESS'
                                  ? styles.statusInProgressText
                                  : styles.statusOpenText
                          ]}
                        >
                          {statusLabel}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.ticketMeta}>{t('support.updatedAt', { value: formatDate(ticket.updatedAt) })}</Text>
                    <Text style={styles.ticketMeta}>{t('support.messagesCount', { count: ticket.messageCount })}</Text>
                  </Pressable>
                );
              })}

              {!loadingList && tickets.length === 0 ? (
                <Text style={styles.info}>{t('support.noTickets')}</Text>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Pressable
              style={styles.backButton}
              onPress={() => {
                setViewMode('inbox');
                setReply('');
                setReplyAttachments([]);
              }}
            >
              <Text style={styles.backButtonText}>{`← ${t('support.backToList')}`}</Text>
            </Pressable>

            {loadingDetail || !selectedTicket ? (
              <ActivityIndicator color={colors.secondary} style={{ marginVertical: 14 }} />
            ) : (
              <>
                <View style={styles.ticketTopRow}>
                  <Text style={styles.cardTitle}>{selectedTicket.subject}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      selectedTicket.status === 'RESOLVED'
                        ? styles.statusResolved
                        : selectedTicket.status === 'WAITING_FOR_USER'
                          ? styles.statusWaiting
                          : selectedTicket.status === 'IN_PROGRESS'
                            ? styles.statusInProgress
                            : styles.statusOpen
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        selectedTicket.status === 'RESOLVED'
                          ? styles.statusResolvedText
                          : selectedTicket.status === 'WAITING_FOR_USER'
                            ? styles.statusWaitingText
                            : selectedTicket.status === 'IN_PROGRESS'
                              ? styles.statusInProgressText
                              : styles.statusOpenText
                      ]}
                    >
                      {getStatusLabel(selectedTicket.status, t)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.meta}>{t('support.openedAt', { value: formatDate(selectedTicket.createdAt) })}</Text>
                <Text style={styles.meta}>{t('support.updatedAtLabel', { value: formatDate(selectedTicket.updatedAt) })}</Text>
                <Text style={styles.meta}>
                  {t('support.orderTrip', {
                    orderId: selectedTicket.orderId ?? '--',
                    tripId: selectedTicket.tripId ?? '--'
                  })}
                </Text>

                <View style={styles.descriptionBox}>
                  <Text style={styles.descriptionTitle}>{t('support.issueSummary')}</Text>
                  <Text style={styles.descriptionText}>{selectedTicket.description || '--'}</Text>
                </View>

                <View style={styles.threadWrap}>
                  {selectedTicket.messages.length === 0 ? (
                    <Text style={styles.meta}>{t('support.noMessages')}</Text>
                  ) : (
                    selectedTicket.messages.map((message) => {
                      const userMessage = message.senderType === 'USER';
                      const systemMessage = message.senderType === 'SYSTEM';
                      return (
                        <View
                          key={message.id}
                          style={[
                            styles.messageBubble,
                            userMessage
                              ? styles.messageBubbleUser
                              : systemMessage
                                ? styles.messageBubbleSystem
                                : styles.messageBubbleAdmin
                          ]}
                        >
                          <Text style={styles.messageMeta}>
                            {getSenderTypeLabel(message.senderType, t)}
                            {message.senderUser?.name ? ` • ${message.senderUser.name}` : ''}
                          </Text>
                          <Text style={styles.messageText}>{message.message}</Text>

                          {message.attachments.length > 0 ? (
                            <View style={styles.messageAttachmentGrid}>
                              {message.attachments.map((attachment) => (
                                <View key={attachment.id} style={styles.messageAttachmentCard}>
                                  <Image source={{ uri: attachment.fileUrl }} style={styles.messageAttachmentImage} />
                                  <Text style={styles.messageAttachmentLabel} numberOfLines={1}>
                                    {attachment.fileName || t('support.attachmentImage')}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}

                          <Text style={styles.messageMeta}>{formatDate(message.createdAt)}</Text>
                        </View>
                      );
                    })
                  )}
                </View>

                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder={selectedTicket.status === 'RESOLVED' ? t('support.replyPlaceholderResolved') : t('support.replyPlaceholder')}
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, styles.textArea]}
                  multiline
                  maxLength={2000}
                />
                <Text style={styles.meta}>{t('support.replyHint')}</Text>

                <View style={styles.composeActionRow}>
                  <Pressable
                    style={[styles.secondaryButton, styles.composeAttachButton]}
                    onPress={() => void addReplyAttachment()}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryText}>{t('support.attachImage')}</Text>
                  </Pressable>
                  <Text style={styles.meta}>
                    {t('support.attachedCount', {
                      count: replyAttachments.length,
                      max: MAX_ATTACHMENTS_PER_MESSAGE
                    })}
                  </Text>
                </View>

                {replyAttachments.length > 0 ? (
                  <View style={styles.draftAttachmentGrid}>
                    {replyAttachments.map((attachment) => (
                      <View key={attachment.localId} style={styles.draftAttachmentCard}>
                        <Image source={{ uri: attachment.uri }} style={styles.draftAttachmentImage} />
                        <Pressable
                          style={styles.draftAttachmentRemove}
                          onPress={() => removeReplyAttachment(attachment.localId)}
                        >
                          <Text style={styles.draftAttachmentRemoveText}>{t('common.remove')}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  style={[styles.primaryButton, busy && styles.disabledButton]}
                  onPress={() => void sendReply()}
                  disabled={busy}
                >
                  <Text style={styles.primaryButtonText}>{busy ? t('support.sending') : t('support.sendMessage')}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingBottom: 120
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs
  },
  title: {
    fontFamily: typography.heading,
    color: colors.accent,
    fontSize: 28
  },
  cardTitle: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 16,
    flexShrink: 1
  },
  info: {
    fontFamily: typography.body,
    color: colors.mutedText,
    fontSize: 13
  },
  meta: {
    fontFamily: typography.body,
    color: '#64748B',
    fontSize: 12
  },
  metaReady: {
    color: colors.secondary
  },
  hiddenEscalationTrigger: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 4
  },
  callButtonText: {
    fontFamily: typography.body,
    color: '#94A3B8',
    fontSize: 11
  },
  input: {
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: radius.md,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 14
  },
  textArea: {
    minHeight: 84,
    textAlignVertical: 'top'
  },
  primaryButton: {
    marginTop: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    alignItems: 'center'
  },
  primaryButtonText: {
    fontFamily: typography.bodyBold,
    color: '#FFFFFF',
    fontSize: 14
  },
  disabledButton: {
    opacity: 0.6
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  ticketRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: '#F8FAFC',
    padding: spacing.sm,
    gap: 4
  },
  ticketTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  ticketSubject: {
    fontFamily: typography.bodyBold,
    color: colors.accent,
    fontSize: 14,
    flex: 1
  },
  ticketMeta: {
    fontFamily: typography.body,
    color: '#64748B',
    fontSize: 12
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: 6
  },
  backButtonText: {
    fontFamily: typography.bodyBold,
    color: '#1D4ED8',
    fontSize: 12
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1
  },
  statusBadgeText: {
    fontFamily: typography.bodyBold,
    fontSize: 11
  },
  statusOpen: {
    backgroundColor: '#F8FAFF',
    borderColor: '#93C5FD'
  },
  statusOpenText: {
    color: '#1E3A8A'
  },
  statusInProgress: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC'
  },
  statusInProgressText: {
    color: '#3730A3'
  },
  statusWaiting: {
    backgroundColor: '#EFF6FF',
    borderColor: '#67E8F9'
  },
  statusWaitingText: {
    color: '#1D4ED8'
  },
  statusResolved: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD'
  },
  statusResolvedText: {
    color: '#1E40AF'
  },
  descriptionBox: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: '#F8FAFC',
    padding: spacing.sm,
    gap: 4
  },
  descriptionTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 12,
    color: '#334155'
  },
  descriptionText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.accent
  },
  threadWrap: {
    marginTop: spacing.sm,
    gap: spacing.xs
  },
  messageBubble: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 6
  },
  messageBubbleUser: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFF'
  },
  messageBubbleAdmin: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF'
  },
  messageBubbleSystem: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC'
  },
  messageMeta: {
    fontFamily: typography.body,
    color: '#64748B',
    fontSize: 11
  },
  messageText: {
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 13
  },
  messageAttachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  messageAttachmentCard: {
    width: 112,
    gap: 4
  },
  messageAttachmentImage: {
    width: 112,
    height: 112,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#EFF6FF'
  },
  messageAttachmentLabel: {
    fontFamily: typography.body,
    fontSize: 11,
    color: '#475569'
  },
  composeActionRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs
  },
  composeAttachButton: {
    flex: 1,
    marginTop: 0
  },
  draftAttachmentGrid: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  draftAttachmentCard: {
    width: 112,
    gap: 4
  },
  draftAttachmentImage: {
    width: 112,
    height: 112,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFF'
  },
  draftAttachmentRemove: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    borderRadius: radius.sm,
    paddingVertical: 4,
    alignItems: 'center'
  },
  draftAttachmentRemoveText: {
    fontFamily: typography.bodyBold,
    color: '#B91C1C',
    fontSize: 11
  },
  secondaryButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.secondary,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: '#EFF6FF'
  },
  secondaryText: {
    fontFamily: typography.bodyBold,
    color: colors.secondary
  }
});
