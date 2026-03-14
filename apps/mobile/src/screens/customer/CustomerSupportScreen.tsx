import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import api, { SUPPORT_PHONE } from '../../services/api';
import { useSessionStore } from '../../store/useSessionStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerSupport'>;

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_USER' | 'RESOLVED';
const RESOLUTION_TARGET_HOURS = 6;
const CALL_ESCALATION_HOURS = 6;
const CALL_ESCALATION_MS = CALL_ESCALATION_HOURS * 60 * 60 * 1000;
const ESCALATION_LONG_PRESS_MS = 1800;

interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  orderId?: string | null;
  tripId?: string | null;
  messages: Array<{
    id: string;
    senderType: 'USER' | 'ADMIN' | 'SYSTEM';
    message: string;
    createdAt: string;
    senderUser?: {
      id: string;
      name: string;
      role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
    } | null;
  }>;
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

export function CustomerSupportScreen({ navigation }: Props) {
  const user = useSessionStore((state) => state.user);
  const activeOrderId = useCustomerStore((state) => state.activeOrderId);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>();
  const [activeTripId, setActiveTripId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId),
    [selectedTicketId, tickets]
  );
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

  const loadActiveTrip = useCallback(async () => {
    if (!activeOrderId) {
      setActiveTripId(undefined);
      return;
    }

    try {
      const response = await api.get(`/orders/${activeOrderId}`);
      const tripId = response.data?.trip?.id as string | undefined;
      setActiveTripId(tripId);
    } catch {
      setActiveTripId(undefined);
    }
  }, [activeOrderId]);

  const loadTickets = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await api.get('/support/tickets', {
          params: {
            userId: user.id
          }
        });

        const next = Array.isArray(response.data) ? (response.data as SupportTicket[]) : [];
        setTickets(next);

        if (!selectedTicketId && next.length > 0) {
          setSelectedTicketId(next[0].id);
        }

        if (selectedTicketId && !next.some((ticket) => ticket.id === selectedTicketId)) {
          setSelectedTicketId(next[0]?.id);
        }
      } catch (nextError: unknown) {
        Alert.alert('Support', errorMessage(nextError, 'Could not load support tickets.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedTicketId, user?.id]
  );

  useEffect(() => {
    void Promise.all([loadActiveTrip(), loadTickets()]);
  }, [loadActiveTrip, loadTickets]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadTickets(true);
    }, 15000);

    return () => clearInterval(timer);
  }, [loadTickets]);

  const placeSupportCall = async () => {
    const url = `tel:${SUPPORT_PHONE}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Support', `Please call ${SUPPORT_PHONE} for assistance.`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Support', `Please call ${SUPPORT_PHONE} for assistance.`);
    }
  };

  const callSupport = async () => {
    if (tickets.length === 0) {
      Alert.alert(
        'Message support first',
        `Please create a support ticket first and wait up to ${RESOLUTION_TARGET_HOURS} hours. We usually respond much faster.`
      );
      return;
    }

    if (!escalationEligible) {
      Alert.alert(
        'Please wait for support response',
        `Support is actively working on your ticket. Please allow up to ${RESOLUTION_TARGET_HOURS} hours for resolution before phone escalation unlocks.`
      );
      return;
    }

    Alert.alert(
      'Escalate via call?',
      `This issue has crossed ${CALL_ESCALATION_HOURS} hours without resolution. You can call support now.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: `Call ${SUPPORT_PHONE}`,
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
      await api.post('/support/tickets', {
        userId: user.id,
        subject: subject.trim(),
        description: description.trim(),
        orderId: activeOrderId,
        tripId: activeTripId
      });

      setSubject('');
      setDescription('');
      await loadTickets(true);
    } catch (createError: unknown) {
      Alert.alert('Support', errorMessage(createError, 'Could not create support ticket.'));
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!user?.id || !selectedTicketId || !reply.trim()) {
      return;
    }

    setBusy(true);
    try {
      await api.post(`/support/tickets/${selectedTicketId}/messages`, {
        userId: user.id,
        message: reply.trim()
      });
      setReply('');
      await loadTickets(true);
    } catch (replyError: unknown) {
      Alert.alert('Support', errorMessage(replyError, 'Could not send message.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{'‹'}</Text>
          </Pressable>
          <Text style={styles.title}>Support Center</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void loadTickets(true)} tintColor="#1D4ED8" />
          }
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Text support first</Text>
            <Text style={styles.info}>Please message us in this chat first.</Text>
            <Text style={styles.info}>
              Please wait up to {RESOLUTION_TARGET_HOURS} hours for a resolution update. We usually reply faster.
            </Text>
            <Text style={[styles.meta, escalationEligible ? styles.metaReady : undefined]}>
              {escalationEligible
                ? `Phone escalation is now unlocked.`
                : `Phone escalation stays hidden until ${CALL_ESCALATION_HOURS}h unresolved.`}
            </Text>
            <Pressable
              style={styles.hiddenEscalationTrigger}
              onLongPress={() => void callSupport()}
              delayLongPress={ESCALATION_LONG_PRESS_MS}
            >
              <Text style={styles.hiddenEscalationText}>Long-press here for phone escalation</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Ticket</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor="#94A3B8"
              style={styles.input}
              maxLength={140}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your issue"
              placeholderTextColor="#94A3B8"
              style={[styles.input, styles.textArea]}
              multiline
              maxLength={2000}
            />
            <Text style={styles.meta}>Type in any language. Our support team will review your message directly.</Text>
            <Text style={styles.meta}>
              Context: Order {activeOrderId ?? '--'} • Trip {activeTripId ?? '--'}
            </Text>
            <Pressable
              style={[styles.primaryButton, busy && styles.disabledButton]}
              onPress={() => void createTicket()}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>{busy ? 'Submitting...' : 'Submit Ticket'}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Tickets</Text>
            {loading ? <ActivityIndicator color="#1D4ED8" style={{ marginTop: 10 }} /> : null}

            {(tickets ?? []).map((ticket) => {
              const active = ticket.id === selectedTicketId;
              return (
                <Pressable
                  key={ticket.id}
                  onPress={() => setSelectedTicketId(ticket.id)}
                  style={[styles.ticketRow, active && styles.ticketRowActive]}
                >
                  <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                  <Text style={styles.ticketMeta}>
                    {ticket.status} • {formatDate(ticket.updatedAt)}
                  </Text>
                </Pressable>
              );
            })}

            {!loading && tickets.length === 0 ? (
              <Text style={styles.info}>No tickets yet. Create one above.</Text>
            ) : null}
          </View>

          {selectedTicket ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ticket Thread</Text>
              <Text style={styles.meta}>Status: {selectedTicket.status}</Text>
              <Text style={styles.meta}>Opened: {formatDate(selectedTicket.createdAt)}</Text>

              <View style={styles.threadWrap}>
                {selectedTicket.messages.map((message) => (
                  <View key={message.id} style={styles.messageBubble}>
                    <Text style={styles.messageMeta}>
                      {message.senderType}
                      {message.senderUser?.name ? ` • ${message.senderUser.name}` : ''}
                    </Text>
                    <Text style={styles.messageText}>{message.message}</Text>
                    <Text style={styles.messageMeta}>{formatDate(message.createdAt)}</Text>
                  </View>
                ))}
              </View>

              <TextInput
                value={reply}
                onChangeText={setReply}
                placeholder="Add follow-up message"
                placeholderTextColor="#94A3B8"
                style={[styles.input, styles.textArea]}
                multiline
                maxLength={2000}
              />
              <Text style={styles.meta}>Type in any language. Our support team will review your message directly.</Text>
              <Pressable
                style={[styles.primaryButton, busy && styles.disabledButton]}
                onPress={() => void sendReply()}
                disabled={busy}
              >
                <Text style={styles.primaryButtonText}>{busy ? 'Sending...' : 'Send Message'}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFF6FF' },
  container: { flex: 1, alignItems: 'center' },
  headerRow: {
    width: '100%',
    maxWidth: 460,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  backText: {
    color: '#FFF',
    fontSize: 24,
    marginTop: -2,
    fontFamily: 'Manrope_700Bold'
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    color: '#7C2D12'
  },
  headerSpacer: { width: 36, height: 36 },
  scroll: { width: '100%' },
  scrollContent: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 14
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    padding: 14,
    gap: 8
  },
  cardTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    color: '#7C2D12'
  },
  info: {
    fontFamily: 'Manrope_500Medium',
    color: '#475569',
    fontSize: 13
  },
  meta: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  metaReady: {
    color: '#1D4ED8'
  },
  hiddenEscalationTrigger: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 4
  },
  hiddenEscalationText: {
    fontFamily: 'Manrope_500Medium',
    color: '#94A3B8',
    fontSize: 11
  },
  input: {
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Manrope_500Medium',
    color: '#0F172A',
    fontSize: 14
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    paddingVertical: 10
  },
  disabledButton: {
    opacity: 0.6
  },
  primaryButtonText: {
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
    fontSize: 14
  },
  ticketRow: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    padding: 10,
    gap: 2
  },
  ticketRowActive: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FAFF'
  },
  ticketSubject: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 14
  },
  ticketMeta: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  threadWrap: {
    gap: 8
  },
  messageBubble: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    padding: 10,
    gap: 4
  },
  messageMeta: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 11
  },
  messageText: {
    fontFamily: 'Manrope_500Medium',
    color: '#0F172A',
    fontSize: 13
  }
});
