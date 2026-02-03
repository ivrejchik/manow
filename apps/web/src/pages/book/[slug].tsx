import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { publicBooking, type PublicMeetingType, type AvailableSlot, type ConfirmedBooking, ApiError } from '@/lib/api-client';
import { useRealtimeSlots } from '@/hooks/use-realtime-slots';
import { SlotPicker } from '@/components/slot-picker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { Calendar, Check, Clock, FileCheck, Loader2, MapPin, User } from 'lucide-react';

type BookingStep = 'select-slot' | 'enter-details' | 'nda-signing' | 'confirmed';

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [meetingType, setMeetingType] = useState<PublicMeetingType | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<BookingStep>('select-slot');
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Guest details
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Blocked slots from real-time updates
  const [blockedSlots, setBlockedSlots] = useState<Set<string>>(new Set());

  // Guest's timezone
  const guestTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Load meeting type
  useEffect(() => {
    if (!slug) return;

    async function loadMeetingType() {
      try {
        const res = await publicBooking.getMeetingType(slug);
        setMeetingType(res.meetingType);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setError('Meeting type not found');
        } else {
          setError('Failed to load meeting type');
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadMeetingType();
  }, [slug]);

  // Real-time slot updates
  const handleSlotHeld = useCallback((data: { slotStart: string }) => {
    setBlockedSlots((prev) => new Set([...prev, data.slotStart]));
    // If this was our selected slot, clear it
    if (selectedSlot?.start === data.slotStart && !holdId) {
      setSelectedSlot(null);
      toast({
        title: 'Slot taken',
        description: 'Someone else selected this slot. Please choose another.',
        variant: 'destructive',
      });
    }
  }, [selectedSlot, holdId]);

  const handleSlotReleased = useCallback((data: { slotStart: string }) => {
    setBlockedSlots((prev) => {
      const next = new Set(prev);
      next.delete(data.slotStart);
      return next;
    });
  }, []);

  useRealtimeSlots({
    meetingTypeId: meetingType?.id || '',
    onSlotHeld: handleSlotHeld,
    onSlotReleased: handleSlotReleased,
    enabled: !!meetingType,
  });

  // Load slots for date range
  const handleDateRangeChange = useCallback(
    async (startDate: string, endDate: string) => {
      if (!slug) return;

      setIsLoadingSlots(true);
      try {
        const res = await publicBooking.getSlots(slug, {
          startDate,
          endDate,
          timezone: guestTimezone,
        });
        setSlots(res.slots);
      } catch (error) {
        console.error('Failed to load slots:', error);
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [slug, guestTimezone]
  );

  // Handle slot selection
  const handleSelectSlot = async (slot: AvailableSlot) => {
    if (blockedSlots.has(slot.start)) {
      toast({
        title: 'Slot unavailable',
        description: 'This slot is no longer available',
        variant: 'destructive',
      });
      return;
    }

    setSelectedSlot(slot);
  };

  // Create hold and proceed to details
  const handleProceedToDetails = async () => {
    if (!selectedSlot || !slug) return;

    setIsSubmitting(true);
    try {
      const res = await publicBooking.createHold(slug, {
        slotStart: selectedSlot.start,
        slotEnd: selectedSlot.end,
        email: guestEmail || 'temp@example.com', // Will be updated on confirmation
        idempotencyKey: crypto.randomUUID(),
      });

      setHoldId(res.holdId);
      setHoldExpiresAt(new Date(res.expiresAt));
      setStep('enter-details');
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.body as { message?: string };
        toast({
          title: 'Slot unavailable',
          description: body.message || 'This slot is no longer available',
          variant: 'destructive',
        });
        setSelectedSlot(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdId || !slug) return;

    setIsSubmitting(true);
    try {
      const res = await publicBooking.confirmBooking(slug, {
        holdId,
        guestName,
        guestTimezone,
        guestNotes: guestNotes || undefined,
        idempotencyKey: crypto.randomUUID(),
      });

      setConfirmedBooking(res.booking);
      setStep('confirmed');
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.body as { message?: string };
        toast({
          title: 'Booking failed',
          description: body.message || 'Could not complete booking',
          variant: 'destructive',
        });

        if (body.message?.includes('expired')) {
          setStep('select-slot');
          setHoldId(null);
          setSelectedSlot(null);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hold countdown timer
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  useEffect(() => {
    if (!holdExpiresAt) return;

    const interval = setInterval(() => {
      const remaining = holdExpiresAt.getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemaining('Expired');
        clearInterval(interval);
        // Reset to slot selection
        setStep('select-slot');
        setHoldId(null);
        setSelectedSlot(null);
        toast({
          title: 'Hold expired',
          description: 'Your slot reservation has expired. Please select a new time.',
          variant: 'destructive',
        });
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !meetingType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Not Found</h2>
            <p className="text-muted-foreground">
              {error || 'This meeting type does not exist.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardDescription>{meetingType.hostName}</CardDescription>
                <CardTitle className="text-2xl">{meetingType.name}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {meetingType.durationMinutes} minutes
              </div>
              {meetingType.locationText && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {meetingType.locationText}
                </div>
              )}
              {meetingType.requiresNda && (
                <div className="flex items-center gap-1">
                  <FileCheck className="h-4 w-4" />
                  NDA required
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Step 1: Select Slot */}
        {step === 'select-slot' && (
          <Card>
            <CardHeader>
              <CardTitle>Select a Time</CardTitle>
              <CardDescription>
                Choose an available slot that works for you
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SlotPicker
                slots={slots}
                isLoading={isLoadingSlots}
                timezone={guestTimezone}
                durationMinutes={meetingType.durationMinutes}
                selectedSlot={selectedSlot}
                onSelectSlot={handleSelectSlot}
                onDateRangeChange={handleDateRangeChange}
                blockedSlots={blockedSlots}
              />

              {selectedSlot && (
                <div className="flex justify-end">
                  <Button onClick={handleProceedToDetails} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Continue
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Enter Details */}
        {step === 'enter-details' && selectedSlot && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Enter Your Details</CardTitle>
                  <CardDescription>
                    Complete your booking for{' '}
                    {DateTime.fromISO(selectedSlot.start)
                      .setZone(guestTimezone)
                      .toFormat("cccc, LLLL d 'at' h:mm a")}
                  </CardDescription>
                </div>
                {timeRemaining && (
                  <div className="text-sm text-muted-foreground">
                    Hold expires in: <span className="font-mono">{timeRemaining}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConfirmBooking} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input
                    id="name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <textarea
                    id="notes"
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    placeholder="Anything you'd like the host to know..."
                    className="w-full min-h-[100px] px-3 py-2 rounded-md border border-input bg-background text-sm"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStep('select-slot');
                      setHoldId(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirm Booking
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Confirmed */}
        {step === 'confirmed' && confirmedBooking && (
          <Card>
            <CardContent className="pt-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Booking Confirmed!</h2>
              <p className="text-muted-foreground mb-6">
                You'll receive a confirmation email with calendar invite.
              </p>

              <div className="bg-muted p-4 rounded-lg text-left space-y-2 mb-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {DateTime.fromISO(confirmedBooking.slotStart)
                      .setZone(guestTimezone)
                      .toFormat("cccc, LLLL d, yyyy 'at' h:mm a")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {confirmedBooking.hostName} ({confirmedBooking.hostEmail})
                  </span>
                </div>
                {confirmedBooking.locationText && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{confirmedBooking.locationText}</span>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setStep('select-slot');
                  setSelectedSlot(null);
                  setHoldId(null);
                  setConfirmedBooking(null);
                  setGuestName('');
                  setGuestEmail('');
                  setGuestNotes('');
                }}
              >
                Book Another Meeting
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
