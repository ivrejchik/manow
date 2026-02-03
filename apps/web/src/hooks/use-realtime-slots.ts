import { useState, useEffect, useCallback, useRef } from 'react';

interface SlotEvent {
  holdId: string;
  meetingTypeId: string;
  slotStart: string;
  slotEnd: string;
  reason?: string;
}

interface UseRealtimeSlotsOptions {
  meetingTypeId: string;
  onSlotHeld?: (data: SlotEvent) => void;
  onSlotReleased?: (data: SlotEvent) => void;
  onBookingConfirmed?: (data: SlotEvent & { bookingId: string }) => void;
  enabled?: boolean;
}

export function useRealtimeSlots({
  meetingTypeId,
  onSlotHeld,
  onSlotReleased,
  onBookingConfirmed,
  enabled = true,
}: UseRealtimeSlotsOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled || !meetingTypeId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/realtime/slots/${meetingTypeId}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('SSE connected');
    };

    eventSource.onerror = (e) => {
      console.error('SSE error:', e);
      setIsConnected(false);
      setError(new Error('Connection lost'));

      // Reconnect after delay
      eventSource.close();
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    eventSource.addEventListener('connected', (e) => {
      console.log('SSE stream started:', JSON.parse(e.data));
    });

    eventSource.addEventListener('slot.held', (e) => {
      const data = JSON.parse(e.data) as SlotEvent;
      console.log('Slot held:', data);
      onSlotHeld?.(data);
    });

    eventSource.addEventListener('slot.released', (e) => {
      const data = JSON.parse(e.data) as SlotEvent;
      console.log('Slot released:', data);
      onSlotReleased?.(data);
    });

    eventSource.addEventListener('booking.confirmed', (e) => {
      const data = JSON.parse(e.data) as SlotEvent & { bookingId: string };
      console.log('Booking confirmed:', data);
      onBookingConfirmed?.(data);
    });
  }, [enabled, meetingTypeId, onSlotHeld, onSlotReleased, onBookingConfirmed]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    connect();
  }, [connect]);

  return {
    isConnected,
    error,
    reconnect,
  };
}
