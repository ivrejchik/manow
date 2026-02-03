import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, FileCheck, Shield } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="text-center py-20 px-4">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Schedule meetings
          <br />
          <span className="text-primary">effortlessly</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Share your booking link, let guests pick a time, sign NDAs if needed,
          and get calendar invites automatically. Real-time updates prevent
          double-booking.
        </p>
        <div className="flex gap-4 justify-center">
          {user ? (
            <Link to="/dashboard">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/auth/register">
                <Button size="lg">Get Started Free</Button>
              </Link>
              <Link to="/auth/login">
                <Button size="lg" variant="outline">
                  Sign In
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 py-20 w-full max-w-6xl">
        <div className="p-6 rounded-xl border bg-card">
          <Calendar className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-lg font-semibold mb-2">Smart Scheduling</h3>
          <p className="text-muted-foreground">
            Set your availability once, share a link, and let guests book
            directly into your calendar.
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card">
          <Clock className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-lg font-semibold mb-2">Real-time Updates</h3>
          <p className="text-muted-foreground">
            Slots update instantly across all viewers. No more double-booking or
            scheduling conflicts.
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card">
          <FileCheck className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-lg font-semibold mb-2">Built-in NDA Signing</h3>
          <p className="text-muted-foreground">
            Require guests to sign NDAs before booking. Documents are stored
            securely and sent to both parties.
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card">
          <Shield className="h-10 w-10 text-primary mb-4" />
          <h3 className="text-lg font-semibold mb-2">Enterprise Ready</h3>
          <p className="text-muted-foreground">
            Webhook support, API access, and audit logs. Perfect for teams that
            need compliance.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-20 px-4 bg-muted/50 rounded-2xl w-full max-w-4xl mb-20">
        <h2 className="text-3xl font-bold mb-4">Ready to simplify your scheduling?</h2>
        <p className="text-muted-foreground mb-8">
          Join thousands of professionals who save hours every week.
        </p>
        {!user && (
          <Link to="/auth/register">
            <Button size="lg">Start for Free</Button>
          </Link>
        )}
      </section>
    </div>
  );
}
