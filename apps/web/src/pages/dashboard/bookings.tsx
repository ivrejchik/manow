import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { bookings, type Booking, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { DateTime } from 'luxon';
import { Calendar, Clock, Mail, MapPin, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'confirmed' | 'completed' | 'canceled';

export default function BookingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!user) return;
    loadBookings();
  }, [user]);

  const loadBookings = async () => {
    try {
      const res = await bookings.list({ limit: 100 });
      setAllBookings(res.bookings);
    } catch (error) {
      console.error('Failed to load bookings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
      await bookings.cancel(id);
      toast({ title: 'Canceled', description: 'Booking has been canceled' });
      loadBookings();
    } catch (error) {
      if (error instanceof ApiError) {
        toast({
          title: 'Error',
          description: 'Failed to cancel booking',
          variant: 'destructive',
        });
      }
    }
  };

  const filteredBookings =
    filter === 'all'
      ? allBookings
      : allBookings.filter((b) => b.status === filter);

  const getStatusBadge = (status: Booking['status']) => {
    const styles = {
      confirmed: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      canceled: 'bg-gray-100 text-gray-800',
      no_show: 'bg-red-100 text-red-800',
    };

    return (
      <span className={cn('px-2 py-1 text-xs rounded-full', styles[status])}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Bookings</h1>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'confirmed', 'completed', 'canceled'] as const).map((status) => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Bookings List */}
      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {filter === 'all'
                ? 'No bookings yet'
                : `No ${filter} bookings`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const startDt = DateTime.fromISO(booking.slotStart).setZone(user.timezone);
            const endDt = DateTime.fromISO(booking.slotEnd).setZone(user.timezone);
            const isPast = startDt < DateTime.now();

            return (
              <Card key={booking.id} className={cn(isPast && booking.status === 'confirmed' && 'border-yellow-300')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">
                          {booking.meetingType.name}
                        </span>
                        {getStatusBadge(booking.status)}
                      </div>

                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span>{booking.guestName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          <a href={`mailto:${booking.guestEmail}`} className="hover:underline">
                            {booking.guestEmail}
                          </a>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{startDt.toFormat('cccc, LLLL d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>
                            {startDt.toFormat('h:mm a')} - {endDt.toFormat('h:mm a')}
                            <span className="text-xs ml-1">({user.timezone})</span>
                          </span>
                        </div>
                        {booking.meetingType.locationText && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{booking.meetingType.locationText}</span>
                          </div>
                        )}
                      </div>

                      {booking.guestNotes && (
                        <div className="text-sm p-3 bg-muted rounded-md">
                          <span className="font-medium">Notes: </span>
                          {booking.guestNotes}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {booking.status === 'confirmed' && !isPast && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(booking.id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
