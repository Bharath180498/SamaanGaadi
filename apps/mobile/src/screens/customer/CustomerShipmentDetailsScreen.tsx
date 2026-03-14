import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import type { InsurancePlan } from '@porter/shared';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { useCustomerStore } from '../../store/useCustomerStore';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerShipmentDetails'>;

const INSURANCE_LABELS: Record<InsurancePlan, string> = {
  NONE: 'No insurance',
  BASIC: 'Basic cover',
  PREMIUM: 'Premium cover',
  HIGH_VALUE: 'High-value cover'
};

export function CustomerShipmentDetailsScreen({ navigation }: Props) {
  const {
    goodsDescription,
    goodsType,
    goodsValue,
    insuranceSelected,
    minDriverRating,
    gstin,
    hsnCode,
    invoiceValue,
    autoGenerateEwayBill,
    insuranceQuotes,
    insuranceLoading,
    setShipmentDetails,
    fetchInsuranceQuotes
  } = useCustomerStore();

  const [localDescription, setLocalDescription] = useState(goodsDescription);
  const [localType, setLocalType] = useState(goodsType);
  const [localValue, setLocalValue] = useState(String(goodsValue));
  const [localRating, setLocalRating] = useState(String(minDriverRating));
  const [localGstin, setLocalGstin] = useState(gstin);
  const [localHsn, setLocalHsn] = useState(hsnCode);
  const [localInvoice, setLocalInvoice] = useState(invoiceValue ? String(invoiceValue) : '');
  const [localInsurance, setLocalInsurance] = useState<InsurancePlan>(insuranceSelected);
  const [localAutoEway, setLocalAutoEway] = useState(autoGenerateEwayBill);

  useEffect(() => {
    void fetchInsuranceQuotes().catch(() => undefined);
  }, [fetchInsuranceQuotes]);

  const insuranceOptions = useMemo(() => {
    if (insuranceQuotes.length > 0) {
      return insuranceQuotes;
    }

    return [
      { plan: 'NONE' as InsurancePlan, premium: 0, coverage: Number(localValue || 0), deductible: 0 },
      {
        plan: 'BASIC' as InsurancePlan,
        premium: Number((Number(localValue || 0) * 0.008).toFixed(2)),
        coverage: Number(localValue || 0),
        deductible: Number((Number(localValue || 0) * 0.05).toFixed(2))
      },
      {
        plan: 'PREMIUM' as InsurancePlan,
        premium: Number((Number(localValue || 0) * 0.012).toFixed(2)),
        coverage: Number((Number(localValue || 0) * 1.1).toFixed(2)),
        deductible: Number((Number(localValue || 0) * 0.03).toFixed(2))
      }
    ];
  }, [insuranceQuotes, localValue]);

  const onApply = () => {
    const parsedValue = Math.max(100, Number(localValue || goodsValue));
    const parsedRating = Math.min(5, Math.max(0, Number(localRating || minDriverRating)));
    const parsedInvoice = localInvoice ? Number(localInvoice) : null;

    setShipmentDetails({
      goodsDescription: localDescription.trim() || goodsDescription,
      goodsType: localType.trim() || goodsType,
      goodsValue: parsedValue,
      minDriverRating: parsedRating,
      insuranceSelected: localInsurance,
      gstin: localGstin.trim(),
      hsnCode: localHsn.trim(),
      invoiceValue: parsedInvoice,
      autoGenerateEwayBill: localAutoEway
    });

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{'<'}</Text>
          </Pressable>
          <Text style={styles.heading}>Shipment Details</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          bounces={false}
          directionalLockEnabled
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Bharat-ready transport setup</Text>
            <Text style={styles.heroSub}>Configure goods, insurance, and GST compliance before booking.</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Goods Information</Text>
            <Text style={styles.label}>Goods category</Text>
            <TextInput value={localType} onChangeText={setLocalType} style={styles.input} placeholder="Electronics" />

            <Text style={styles.label}>Goods description</Text>
            <TextInput
              value={localDescription}
              onChangeText={setLocalDescription}
              style={[styles.input, styles.textArea]}
              placeholder="Cartons, appliances, retail inventory"
              multiline
            />

            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.label}>Declared value (INR)</Text>
                <TextInput
                  value={localValue}
                  onChangeText={setLocalValue}
                  style={styles.input}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Min driver rating</Text>
                <TextInput
                  value={localRating}
                  onChangeText={setLocalRating}
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.block}>
            <View style={styles.blockHeadingRow}>
              <Text style={styles.blockTitle}>Insurance Coverage</Text>
              {insuranceLoading ? <ActivityIndicator size="small" color="#1D4ED8" /> : null}
            </View>

            <View style={styles.insuranceGrid}>
              {insuranceOptions.map((option) => {
                const active = option.plan === localInsurance;
                return (
                  <Pressable
                    key={option.plan}
                    style={[styles.insuranceCard, active && styles.insuranceCardActive]}
                    onPress={() => setLocalInsurance(option.plan)}
                  >
                    <Text style={[styles.insurancePlan, active && styles.insurancePlanActive]}>
                      {INSURANCE_LABELS[option.plan]}
                    </Text>
                    <Text style={styles.insuranceText}>Premium: INR {option.premium.toFixed(0)}</Text>
                    <Text style={styles.insuranceText}>Cover: INR {option.coverage.toFixed(0)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.block}>
            <View style={styles.blockHeadingRow}>
              <Text style={styles.blockTitle}>GST & E-Way Bill</Text>
              <Switch value={localAutoEway} onValueChange={setLocalAutoEway} />
            </View>
            <Text style={styles.toggleNote}>Auto-generate e-way bill after booking</Text>

            <Text style={styles.label}>GSTIN</Text>
            <TextInput value={localGstin} onChangeText={setLocalGstin} style={styles.input} placeholder="29ABCDE1234F2Z5" autoCapitalize="characters" />

            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.label}>HSN code</Text>
                <TextInput value={localHsn} onChangeText={setLocalHsn} style={styles.input} placeholder="8471" keyboardType="numeric" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Invoice value (INR)</Text>
                <TextInput value={localInvoice} onChangeText={setLocalInvoice} style={styles.input} keyboardType="numeric" placeholder="45000" />
              </View>
            </View>
          </View>
        </ScrollView>

        <Pressable style={styles.applyButton} onPress={onApply}>
          <Text style={styles.applyText}>Apply details</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#EFF6FF'
  },
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2'
  },
  backText: {
    fontFamily: 'Manrope_700Bold',
    color: '#7C2D12',
    fontSize: 18
  },
  heading: {
    fontFamily: 'Sora_700Bold',
    color: '#7C2D12',
    fontSize: 18
  },
  scroll: {
    gap: 12,
    paddingTop: 10,
    paddingBottom: 12
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFF',
    padding: 14
  },
  heroTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#7C2D12',
    fontSize: 17
  },
  heroSub: {
    marginTop: 4,
    fontFamily: 'Manrope_500Medium',
    color: '#9A3412',
    fontSize: 13
  },
  block: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8
  },
  blockTitle: {
    fontFamily: 'Sora_700Bold',
    color: '#0F172A',
    fontSize: 15
  },
  blockHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  label: {
    fontFamily: 'Manrope_700Bold',
    color: '#334155',
    fontSize: 12
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    fontFamily: 'Manrope_500Medium',
    color: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  textArea: {
    minHeight: 68,
    textAlignVertical: 'top'
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  flex: {
    flex: 1
  },
  insuranceGrid: {
    gap: 8
  },
  insuranceCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10
  },
  insuranceCardActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF'
  },
  insurancePlan: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
    fontSize: 13
  },
  insurancePlanActive: {
    color: '#1E40AF'
  },
  insuranceText: {
    fontFamily: 'Manrope_500Medium',
    color: '#334155',
    fontSize: 12,
    marginTop: 2
  },
  toggleNote: {
    fontFamily: 'Manrope_500Medium',
    color: '#64748B',
    fontSize: 12
  },
  applyButton: {
    borderRadius: 14,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 6
  },
  applyText: {
    fontFamily: 'Sora_700Bold',
    color: '#EFF6FF',
    fontSize: 16
  }
});
