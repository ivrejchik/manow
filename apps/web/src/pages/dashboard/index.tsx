import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { bookings, meetingTypes, type Booking, type MeetingType } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateTime } from 'luxon';
import { Calendar, Clock, Copy, ExternalLink, Plus, Users } from 'lucide-react';
import { toast } from '@/components/ui/toaster';

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState({ total: 0, upcoming: 0, completed: 0, canceled: 0 });
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function loadData() {
      try {
        const [bookingsRes, statsRes, typesRes] = await Promise.all([
          bookings.getUpcoming(5),
          bookings.getStats(),
          meetingTypes.list(),
        ]);
        setUpcomingBookings(bookingsRes.bookings);
        setStats(statsRes.stats);
        setTypes(typesRes.meetingTypes);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [user]);

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  const copyBookingLink = (slug: string) => {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied!', description: 'Booking link copied to clipboard' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link to="/dashboard/meeting-types">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Meeting Type
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Bookings</CardDescription>
            <CardTitle className="text-4xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Upcoming</CardDescription>
            <CardTitle className="text-4xl text-primary">{stats.upcoming}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-4xl text-green-600">{stats.completed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Canceled</CardDescription>
            <CardTitle className="text-4xl text-muted-foreground">{stats.canceled}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Upcoming Bookings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : upcomingBookings.length === 0 ? (
              <div className="text-muted-foreground text-center py-8">
                No upcoming bookings
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <div className="font-medium">{booking.guestName}</div>
                      <div className="text-sm text-muted-foreground">
                        {booking.meetingType.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {DateTime.fromISO(booking.slotStart)
                          .setZone(user.timezone)
                          .toFormat('ccc, LLL d \'at\' h:mm a')}
                      </div>
                    </div>
                    <Link to={`/dashboard/bookings`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                ))}
                {upcomingBookings.length > 0 && (
                  <Link to="/dashboard/bookings" className="block">
                    <Button variant="outline" className="w-full">
                      View All Bookings
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meeting Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Your Meeting Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : types.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-4">
                  No meeting types yet
                </div>
                <Link to="/dashboard/meeting-types">
                  <Button>Create Your First Meeting Type</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {types.filter((t) => t.isActive).map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <div className="font-medium">{type.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {type.durationMinutes} min
                        {type.requiresNda && ' • NDA required'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyBookingLink(type.slug)}
                        title="Copy booking link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <a
                        href={`/book/${type.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="icon" title="Open booking page">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
                <Link to="/dashboard/meeting-types" className="block">
                  <Button variant="outline" className="w-full">
                    Manage Meeting Types
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
