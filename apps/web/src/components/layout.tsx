import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Calendar, LogOut, Menu, User } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { user, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Calendar className="h-5 w-5 text-primary" />
            <span>Meeting Scheduler</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 ml-6">
            {user && (
              <>
                <Link to="/dashboard" className="text-sm font-medium hover:text-primary">
                  Dashboard
                </Link>
                <Link to="/dashboard/meeting-types" className="text-sm font-medium hover:text-primary">
                  Meeting Types
                </Link>
                <Link to="/dashboard/availability" className="text-sm font-medium hover:text-primary">
                  Availability
                </Link>
                <Link to="/dashboard/bookings" className="text-sm font-medium hover:text-primary">
                  Bookings
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2 ml-auto">
            {isLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : user ? (
              <>
                <span className="hidden md:inline text-sm text-muted-foreground">{user.name}</span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  <span className="hidden md:inline ml-2">Logout</span>
                </Button>
              </>
            ) : (
              <>
                <Link to="/auth/login">
                  <Button variant="ghost" size="sm">
                    Login
                  </Button>
                </Link>
                <Link to="/auth/register">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && user && (
          <div className="md:hidden border-t p-4">
            <nav className="flex flex-col gap-2">
              <Link
                to="/dashboard"
                className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/dashboard/meeting-types"
                className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Meeting Types
              </Link>
              <Link
                to="/dashboard/availability"
                className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Availability
              </Link>
              <Link
                to="/dashboard/bookings"
                className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                Bookings
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="container py-6">
        <Outlet />
      </main>
    </div>
  );
}
