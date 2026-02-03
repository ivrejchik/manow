import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/auth-context';
import { Toaster } from './components/ui/toaster';
import Layout from './components/layout';
import HomePage from './pages/home';
import LoginPage from './pages/auth/login';
import RegisterPage from './pages/auth/register';
import DashboardPage from './pages/dashboard';
import MeetingTypesPage from './pages/dashboard/meeting-types';
import AvailabilityPage from './pages/dashboard/availability';
import BookingsPage from './pages/dashboard/bookings';
import PublicBookingPage from './pages/book/[slug]';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="auth/login" element={<LoginPage />} />
            <Route path="auth/register" element={<RegisterPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="dashboard/meeting-types" element={<MeetingTypesPage />} />
            <Route path="dashboard/availability" element={<AvailabilityPage />} />
            <Route path="dashboard/bookings" element={<BookingsPage />} />
          </Route>
          <Route path="book/:slug" element={<PublicBookingPage />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
