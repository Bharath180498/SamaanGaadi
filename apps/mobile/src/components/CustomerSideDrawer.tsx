import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  subtitle: string;
  icon: string;
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
  { key: 'CustomerHome', label: 'Home', subtitle: 'Book and track rides', icon: '⌂' },
  { key: 'CustomerPayment', label: 'Payments', subtitle: 'Methods and pending dues', icon: '₹' },
  { key: 'CustomerRides', label: 'Ride History', subtitle: 'Past and active rides', icon: '⏱' },
  { key: 'CustomerProfile', label: 'Profile', subtitle: 'Account and preferences', icon: '☺' },
  { key: 'CustomerSupport', label: 'Support Center', subtitle: 'Tickets and help', icon: '?' }
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
          <LinearGradient
            colors={['#071B44', '#154FA4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Text style={styles.brand}>QARGO</Text>
            <Text style={styles.name}>{user?.name ?? 'Customer'}</Text>
            <Text style={styles.phone}>{user?.phone ?? ''}</Text>
            <Text style={styles.headerMeta}>Control Center</Text>
          </LinearGradient>

          <View style={styles.items}>
            <Text style={styles.menuTitle}>Quick Actions</Text>
            {DRAWER_ITEMS.map((item) => {
              const active = item.key === activeRoute;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.itemButton, active && styles.itemButtonActive]}
                  onPress={() => navigate(item.key)}
                >
                  <View style={[styles.itemIconWrap, active && styles.itemIconWrapActive]}>
                    <Text style={[styles.itemIcon, active && styles.itemIconActive]}>{item.icon}</Text>
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
                    <Text style={[styles.itemSubText, active && styles.itemSubTextActive]}>{item.subtitle}</Text>
                  </View>
                  <Text style={[styles.itemChevron, active && styles.itemChevronActive]}>{'>'}</Text>
                </Pressable>
              );
            })}

            {showTracking ? (
              <Pressable style={styles.itemButton} onPress={navigateTracking}>
                <View style={styles.itemIconWrap}>
                  <Text style={styles.itemIcon}>↗</Text>
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemText}>Active Trip</Text>
                  <Text style={styles.itemSubText}>Return to live tracking</Text>
                </View>
                <Text style={styles.itemChevron}>{'>'}</Text>
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
    width: 294,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingTop: 58,
    paddingHorizontal: 14,
    paddingBottom: 22,
    justifyContent: 'space-between'
  },
  header: {
    borderRadius: 16,
    padding: 12,
    gap: 3
  },
  brand: {
    fontFamily: 'Sora_700Bold',
    color: '#BFDBFE',
    fontSize: 18
  },
  name: {
    marginTop: 4,
    fontFamily: 'Manrope_700Bold',
    color: '#F8FAFC',
    fontSize: 14
  },
  phone: {
    fontFamily: 'Manrope_500Medium',
    color: '#DBEAFE',
    fontSize: 12
  },
  headerMeta: {
    marginTop: 4,
    color: '#93C5FD',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.7
  },
  items: {
    marginTop: 14,
    gap: 8
  },
  menuTitle: {
    color: '#475569',
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 2
  },
  itemButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FAFF',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  itemButtonActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#60A5FA'
  },
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemIconWrapActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA'
  },
  itemIcon: {
    fontFamily: 'Sora_700Bold',
    color: '#1E3A8A',
    fontSize: 15
  },
  itemIconActive: {
    color: '#0B3A91'
  },
  itemCopy: {
    flex: 1
  },
  itemText: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 13
  },
  itemTextActive: {
    color: '#0B3A91'
  },
  itemSubText: {
    marginTop: 1,
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 11
  },
  itemSubTextActive: {
    color: '#1E40AF'
  },
  itemChevron: {
    color: '#64748B',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13
  },
  itemChevronActive: {
    color: '#1D4ED8'
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
