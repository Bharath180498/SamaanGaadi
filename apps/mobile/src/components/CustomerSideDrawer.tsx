import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '../types/navigation';
import { useSessionStore } from '../store/useSessionStore';

type DrawerRoute =
  | 'CustomerHome'
  | 'CustomerPayment'
  | 'CustomerRides'
  | 'CustomerProfile'
  | 'CustomerSupport';

interface DrawerItem {
  key: DrawerRoute;
  label: string;
}

interface CustomerSideDrawerProps {
  visible: boolean;
  activeRoute: DrawerRoute;
  onClose: () => void;
  onNavigate: (route: DrawerRoute) => void;
  showTracking?: boolean;
  onNavigateTracking?: () => void;
}

const DRAWER_ITEMS: DrawerItem[] = [
  { key: 'CustomerHome', label: 'Home' },
  { key: 'CustomerPayment', label: 'Payments' },
  { key: 'CustomerRides', label: 'Ride History' },
  { key: 'CustomerProfile', label: 'Profile' },
  { key: 'CustomerSupport', label: 'Support Center' }
];

export function CustomerSideDrawer({
  visible,
  activeRoute,
  onClose,
  onNavigate,
  showTracking,
  onNavigateTracking
}: CustomerSideDrawerProps) {
  const user = useSessionStore((state) => state.user);

  const navigate = (route: DrawerRoute) => {
    onClose();
    onNavigate(route);
  };

  const navigateTracking = () => {
    onClose();
    onNavigateTracking?.();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.drawer}>
          <View style={styles.header}>
            <Text style={styles.brand}>QARGO</Text>
            <Text style={styles.name}>{user?.name ?? 'Customer'}</Text>
            <Text style={styles.phone}>{user?.phone ?? ''}</Text>
          </View>

          <View style={styles.items}>
            {DRAWER_ITEMS.map((item) => {
              const active = item.key === activeRoute;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.itemButton, active && styles.itemButtonActive]}
                  onPress={() => navigate(item.key)}
                >
                  <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}

            {showTracking ? (
              <Pressable style={styles.itemButton} onPress={navigateTracking}>
                <Text style={styles.itemText}>Active Trip</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        <Pressable style={styles.backdrop} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row'
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.36)'
  },
  drawer: {
    width: 280,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingTop: 58,
    paddingHorizontal: 14,
    paddingBottom: 22,
    justifyContent: 'space-between'
  },
  header: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    padding: 12,
    gap: 2
  },
  brand: {
    fontFamily: 'Sora_700Bold',
    color: '#1E40AF',
    fontSize: 18
  },
  name: {
    marginTop: 4,
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 14
  },
  phone: {
    fontFamily: 'Manrope_500Medium',
    color: '#475569',
    fontSize: 12
  },
  items: {
    marginTop: 14,
    gap: 8
  },
  itemButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  itemButtonActive: {
    backgroundColor: '#F8FAFF',
    borderColor: '#93C5FD'
  },
  itemText: {
    fontFamily: 'Manrope_700Bold',
    color: '#334155',
    fontSize: 14
  },
  itemTextActive: {
    color: '#9A3412'
  },
  itemButtonDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0'
  },
  itemTextDisabled: {
    color: '#64748B'
  },
  closeButton: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    paddingVertical: 11
  },
  closeButtonText: {
    fontFamily: 'Manrope_700Bold',
    color: '#F8FAFC',
    fontSize: 13
  }
});

export type { DrawerRoute };
