import { createRoot } from 'react-dom/client';
import { AuthForm } from '@/components/auth-form';
import { RecoveryForm } from '@/components/recovery-form';
import { MobileApp } from './mobile-app';
import { installTransport } from './platform';
import './mobile.css';

installTransport();
const path = window.location.pathname;
createRoot(document.getElementById('root')!).render(
  path === '/sign-in' || path === '/sign-up'
    ? <AuthForm mode={path === '/sign-up' ? 'sign-up' : 'sign-in'} />
    : path === '/forgot-password' || path === '/reset-password'
      ? <RecoveryForm reset={path === '/reset-password'} />
      : <MobileApp />,
);
