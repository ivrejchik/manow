import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { availability, type AvailabilityRule, type BlackoutDate, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AvailabilityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rule form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleDayOfWeek, setRuleDayOfWeek] = useState(1);
  const [ruleStartTime, setRuleStartTime] = useState('09:00');
  const [ruleEndTime, setRuleEndTime] = useState('17:00');

  // Blackout form
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');
  const [blackoutRecurring, setBlackoutRecurring] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [rulesRes, blackoutsRes] = await Promise.all([
        availability.getRules(),
        availability.getBlackouts(),
      ]);
      setRules(rulesRes.rules);
      setBlackouts(blackoutsRes.blackouts);
    } catch (error) {
      console.error('Failed to load availability data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await availability.createRule({
        dayOfWeek: ruleDayOfWeek,
        startTime: ruleStartTime,
        endTime: ruleEndTime,
      });
      toast({ title: 'Success', description: 'Availability rule added' });
      setShowRuleForm(false);
      loadData();
    } catch (error) {
      if (error instanceof ApiError) {
        toast({
          title: 'Error',
          description: 'Failed to add rule',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await availability.deleteRule(id);
      toast({ title: 'Deleted', description: 'Rule removed' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete rule',
        variant: 'destructive',
      });
    }
  };

  const handleAddBlackout = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await availability.createBlackout({
        blackoutDate,
        reason: blackoutReason || undefined,
        isRecurringYearly: blackoutRecurring,
      });
      toast({ title: 'Success', description: 'Blackout date added' });
      setShowBlackoutForm(false);
      setBlackoutDate('');
      setBlackoutReason('');
      setBlackoutRecurring(false);
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add blackout date',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBlackout = async (id: string) => {
    try {
      await availability.deleteBlackout(id);
      toast({ title: 'Deleted', description: 'Blackout date removed' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete blackout',
        variant: 'destructive',
      });
    }
  };

  // Group rules by day of week
  const rulesByDay = DAYS_OF_WEEK.map((day, index) => ({
    day,
    index,
    rules: rules.filter((r) => r.dayOfWeek === index),
  }));

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Availability</h1>

      {/* Weekly Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>Set your recurring availability for each day</CardDescription>
          </div>
          <Button onClick={() => setShowRuleForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Hours
          </Button>
        </CardHeader>
        <CardContent>
          {showRuleForm && (
            <form onSubmit={handleAddRule} className="mb-6 p-4 border rounded-lg space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <select
                    value={ruleDayOfWeek}
                    onChange={(e) => setRuleDayOfWeek(parseInt(e.target.value))}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background"
                  >
                    {DAYS_OF_WEEK.map((day, i) => (
                      <option key={day} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={ruleStartTime}
                    onChange={(e) => setRuleStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={ruleEndTime}
                    onChange={(e) => setRuleEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowRuleForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-4">
              {rulesByDay.map(({ day, index, rules: dayRules }) => (
                <div key={day} className="flex items-start gap-4 py-2 border-b last:border-0">
                  <div className="w-24 font-medium">{day}</div>
                  <div className="flex-1">
                    {dayRules.length === 0 ? (
                      <span className="text-muted-foreground">Unavailable</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {dayRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center gap-2 px-3 py-1 bg-secondary rounded-md"
                          >
                            <span>
                              {rule.startTime.slice(0, 5)} - {rule.endTime.slice(0, 5)}
                            </span>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blackout Dates */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Blackout Dates</CardTitle>
            <CardDescription>Block specific dates when you're unavailable</CardDescription>
          </div>
          <Button onClick={() => setShowBlackoutForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Blackout
          </Button>
        </CardHeader>
        <CardContent>
          {showBlackoutForm && (
            <form onSubmit={handleAddBlackout} className="mb-6 p-4 border rounded-lg space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={blackoutDate}
                    onChange={(e) => setBlackoutDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reason (optional)</Label>
                  <Input
                    value={blackoutReason}
                    onChange={(e) => setBlackoutReason(e.target.value)}
                    placeholder="Vacation, holiday, etc."
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={blackoutRecurring}
                  onChange={(e) => setBlackoutRecurring(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="recurring" className="font-normal">
                  Repeat every year
                </Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowBlackoutForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : blackouts.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              No blackout dates set
            </div>
          ) : (
            <div className="space-y-2">
              {blackouts.map((blackout) => (
                <div
                  key={blackout.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{blackout.blackoutDate}</div>
                    <div className="text-sm text-muted-foreground">
                      {blackout.reason || 'No reason specified'}
                      {blackout.isRecurringYearly && ' (repeats yearly)'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteBlackout(blackout.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
