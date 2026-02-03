import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { meetingTypes, type MeetingType, type CreateMeetingTypeInput, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toaster';
import { Copy, Edit, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';

export default function MeetingTypesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(0);
  const [location, setLocation] = useState('');
  const [requiresNda, setRequiresNda] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadMeetingTypes();
  }, [user]);

  const loadMeetingTypes = async () => {
    try {
      const res = await meetingTypes.list();
      setTypes(res.meetingTypes);
    } catch (error) {
      console.error('Failed to load meeting types:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSlug('');
    setDurationMinutes(30);
    setBufferBefore(0);
    setBufferAfter(0);
    setLocation('');
    setRequiresNda(false);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (type: MeetingType) => {
    setName(type.name);
    setSlug(type.slug);
    setDurationMinutes(type.durationMinutes);
    setBufferBefore(type.bufferBeforeMinutes);
    setBufferAfter(type.bufferAfterMinutes);
    setLocation(type.locationText || '');
    setRequiresNda(type.requiresNda);
    setEditingId(type.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const data: CreateMeetingTypeInput = {
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      durationMinutes,
      bufferBeforeMinutes: bufferBefore,
      bufferAfterMinutes: bufferAfter,
      locationText: location || undefined,
      requiresNda,
    };

    try {
      if (editingId) {
        await meetingTypes.update(editingId, data);
        toast({ title: 'Success', description: 'Meeting type updated' });
      } else {
        await meetingTypes.create(data);
        toast({ title: 'Success', description: 'Meeting type created' });
      }
      resetForm();
      loadMeetingTypes();
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.body as { message?: string };
        toast({
          title: 'Error',
          description: body.message || 'Failed to save meeting type',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this meeting type?')) return;

    try {
      await meetingTypes.delete(id);
      toast({ title: 'Deleted', description: 'Meeting type deleted' });
      loadMeetingTypes();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete meeting type',
        variant: 'destructive',
      });
    }
  };

  const copyBookingLink = (slug: string) => {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied!', description: 'Booking link copied to clipboard' });
  };

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Meeting Types</h1>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Meeting Type
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Meeting Type' : 'New Meeting Type'}</CardTitle>
            <CardDescription>
              Configure how guests can book time with you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="30 Minute Meeting"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="30-min"
                    pattern="[a-z0-9-]+"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    /book/{slug || 'your-slug'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                    min={5}
                    max={480}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Zoom link, office address, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bufferBefore">Buffer Before (minutes)</Label>
                  <Input
                    id="bufferBefore"
                    type="number"
                    value={bufferBefore}
                    onChange={(e) => setBufferBefore(parseInt(e.target.value))}
                    min={0}
                    max={120}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bufferAfter">Buffer After (minutes)</Label>
                  <Input
                    id="bufferAfter"
                    type="number"
                    value={bufferAfter}
                    onChange={(e) => setBufferAfter(parseInt(e.target.value))}
                    min={0}
                    max={120}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresNda"
                  checked={requiresNda}
                  onChange={(e) => setRequiresNda(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="requiresNda" className="font-normal">
                  Require NDA signing before booking
                </Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Update' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Meeting Types List */}
      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : types.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              No meeting types yet. Create one to start accepting bookings.
            </p>
            {!showForm && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Meeting Type
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {types.map((type) => (
            <Card key={type.id} className={!type.isActive ? 'opacity-50' : ''}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium text-lg">{type.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {type.durationMinutes} minutes
                    {type.locationText && ` • ${type.locationText}`}
                    {type.requiresNda && ' • NDA required'}
                    {!type.isActive && ' • Inactive'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    /book/{type.slug}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
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
                    <Button variant="outline" size="icon" title="Open booking page">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => startEdit(type)}
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDelete(type.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
