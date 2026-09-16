import CareDashboard from '@/components/care-dashboard';
import { native, nativeVoice, publicOrigin, shareExport } from './platform';

export function MobileApp() {
  return <CareDashboard mobile photoCapture voiceAdapter={nativeVoice} publicOrigin={native ? publicOrigin : undefined} saveExport={native ? shareExport : undefined} />;
}
