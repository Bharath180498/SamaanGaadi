import { forwardRef } from 'react';
import { Platform } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type MapViewProps,
  type Region
} from 'react-native-maps';
import { QARGO_MAP_STYLE } from './mapStyle';

const QargoMapView = forwardRef<MapView, MapViewProps>(function QargoMapView(props, ref) {
  const {
    provider,
    customMapStyle,
    mapType,
    showsTraffic,
    showsCompass,
    showsBuildings,
    showsIndoors,
    showsPointsOfInterest,
    userInterfaceStyle,
    pitchEnabled,
    rotateEnabled,
    toolbarEnabled,
    ...rest
  } = props;
  const resolvedProvider = provider ?? (Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined);

  return (
    <MapView
      ref={ref}
      provider={resolvedProvider}
      customMapStyle={customMapStyle ?? (resolvedProvider === PROVIDER_GOOGLE ? QARGO_MAP_STYLE : undefined)}
      mapType={mapType ?? (Platform.OS === 'ios' ? 'mutedStandard' : 'standard')}
      showsTraffic={showsTraffic ?? false}
      showsCompass={showsCompass ?? false}
      showsBuildings={showsBuildings ?? false}
      showsIndoors={showsIndoors ?? false}
      showsPointsOfInterest={showsPointsOfInterest ?? false}
      userInterfaceStyle={userInterfaceStyle ?? (Platform.OS === 'ios' ? 'dark' : undefined)}
      pitchEnabled={pitchEnabled ?? false}
      rotateEnabled={rotateEnabled ?? false}
      toolbarEnabled={toolbarEnabled ?? false}
      {...rest}
    />
  );
});

export type { Region };
export type MapViewRef = MapView;
export { Marker, Polyline };
export default QargoMapView;
