import { useState, useEffect, useMemo } from 'react';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AvailableSlot } from '@/lib/api-client';

interface SlotPickerProps {
  slots: AvailableSlot[];
  isLoading: boolean;
  timezone: string;
  durationMinutes: number;
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
  onDateRangeChange: (startDate: string, endDate: string) => void;
  blockedSlots?: Set<string>; // Slots blocked by real-time updates
}

export function SlotPicker({
  slots,
  isLoading,
  timezone,
  durationMinutes,
  selectedSlot,
  onSelectSlot,
  onDateRangeChange,
  blockedSlots = new Set(),
}: SlotPickerProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    DateTime.now().setZone(timezone).startOf('week')
  );

  // Update date range when week changes
  useEffect(() => {
    const startDate = currentWeekStart.toISODate()!;
    const endDate = currentWeekStart.plus({ days: 6 }).toISODate()!;
    onDateRangeChange(startDate, endDate);
  }, [currentWeekStart, onDateRangeChange]);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const grouped: Record<string, AvailableSlot[]> = {};

    for (const slot of slots) {
      const date = DateTime.fromISO(slot.start).setZone(timezone).toISODate()!;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(slot);
    }

    return grouped;
  }, [slots, timezone]);

  // Generate dates for the current week
  const weekDates = useMemo(() => {
    const dates: DateTime[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(currentWeekStart.plus({ days: i }));
    }
    return dates;
  }, [currentWeekStart]);

  const goToPreviousWeek = () => {
    setCurrentWeekStart((prev) => prev.minus({ weeks: 1 }));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart((prev) => prev.plus({ weeks: 1 }));
  };

  const isSlotBlocked = (slot: AvailableSlot) => {
    return blockedSlots.has(slot.start);
  };

  const formatTime = (isoString: string) => {
    return DateTime.fromISO(isoString).setZone(timezone).toFormat('h:mm a');
  };

  const isPastWeek = currentWeekStart < DateTime.now().setZone(timezone).startOf('week');

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPreviousWeek}
          disabled={isPastWeek}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-center">
          <div className="font-medium">
            {currentWeekStart.toFormat('LLLL yyyy')}
          </div>
          <div className="text-sm text-muted-foreground">
            {currentWeekStart.toFormat('LLL d')} -{' '}
            {currentWeekStart.plus({ days: 6 }).toFormat('LLL d')}
          </div>
        </div>

        <Button variant="outline" size="icon" onClick={goToNextWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Calendar grid */}
      {!isLoading && (
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((date) => {
            const dateStr = date.toISODate()!;
            const daySlots = slotsByDate[dateStr] || [];
            const availableSlots = daySlots.filter(
              (s) => s.available && !isSlotBlocked(s)
            );
            const isPast = date < DateTime.now().setZone(timezone).startOf('day');

            return (
              <div
                key={dateStr}
                className={cn(
                  'min-h-[200px] rounded-lg border p-2',
                  isPast && 'bg-muted/50 opacity-50'
                )}
              >
                <div className="text-center mb-2">
                  <div className="text-xs text-muted-foreground">
                    {date.toFormat('ccc')}
                  </div>
                  <div
                    className={cn(
                      'text-lg font-medium',
                      date.hasSame(DateTime.now().setZone(timezone), 'day') &&
                        'text-primary'
                    )}
                  >
                    {date.toFormat('d')}
                  </div>
                </div>

                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {availableSlots.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No slots
                    </div>
                  )}

                  {availableSlots.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => onSelectSlot(slot)}
                      className={cn(
                        'w-full text-xs px-2 py-1.5 rounded-md transition-colors',
                        selectedSlot?.start === slot.start
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary hover:bg-secondary/80'
                      )}
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected slot info */}
      {selectedSlot && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
          <Clock className="h-4 w-4 text-primary" />
          <div>
            <span className="font-medium">
              {DateTime.fromISO(selectedSlot.start)
                .setZone(timezone)
                .toFormat('cccc, LLLL d, yyyy')}
            </span>
            <span className="text-muted-foreground"> at </span>
            <span className="font-medium">{formatTime(selectedSlot.start)}</span>
            <span className="text-muted-foreground">
              {' '}
              ({durationMinutes} min)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
