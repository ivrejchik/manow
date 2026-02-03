-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create enums
DO $$ BEGIN
    CREATE TYPE hold_status AS ENUM ('active', 'converted', 'expired', 'released');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM ('confirmed', 'canceled', 'completed', 'no_show');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE document_status AS ENUM ('pending', 'sent', 'signed', 'expired', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    password_hash VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    google_id VARCHAR(255) UNIQUE,
    github_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Magic Link Tokens
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Meeting Types
CREATE TABLE IF NOT EXISTS meeting_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
    buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
    location_text TEXT,
    requires_nda BOOLEAN NOT NULL DEFAULT FALSE,
    nda_template_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, slug)
);

-- Availability Rules
CREATE TABLE IF NOT EXISTS availability_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meeting_type_id UUID REFERENCES meeting_types(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- Blackout Dates
CREATE TABLE IF NOT EXISTS blackout_dates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blackout_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(500),
    is_recurring_yearly BOOLEAN NOT NULL DEFAULT FALSE
);

-- Slot Holds
CREATE TABLE IF NOT EXISTS slot_holds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_type_id UUID NOT NULL REFERENCES meeting_types(id),
    slot_start TIMESTAMPTZ NOT NULL,
    slot_end TIMESTAMPTZ NOT NULL,
    held_by_email VARCHAR(255) NOT NULL,
    held_by_name VARCHAR(255),
    status hold_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL,
    idempotency_key UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL: Exclusion constraint prevents overlapping active holds
ALTER TABLE slot_holds DROP CONSTRAINT IF EXISTS no_overlapping_active_holds;
ALTER TABLE slot_holds ADD CONSTRAINT no_overlapping_active_holds
    EXCLUDE USING GIST (
        meeting_type_id WITH =,
        tstzrange(slot_start, slot_end, '[)') WITH &&
    ) WHERE (status = 'active');

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_type_id UUID NOT NULL REFERENCES meeting_types(id),
    host_user_id UUID NOT NULL REFERENCES users(id),
    slot_start TIMESTAMPTZ NOT NULL,
    slot_end TIMESTAMPTZ NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_name VARCHAR(255) NOT NULL,
    guest_timezone VARCHAR(100) NOT NULL,
    guest_notes TEXT,
    status booking_status NOT NULL DEFAULT 'confirmed',
    nda_document_id UUID,
    nda_signed_at TIMESTAMPTZ,
    idempotency_key UUID NOT NULL UNIQUE,
    from_hold_id UUID REFERENCES slot_holds(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL: Exclusion constraint prevents double-booking
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_double_booking;
ALTER TABLE bookings ADD CONSTRAINT no_double_booking
    EXCLUDE USING GIST (
        meeting_type_id WITH =,
        tstzrange(slot_start, slot_end, '[)') WITH &&
    ) WHERE (status = 'confirmed');

-- Documents (NDAs)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hold_id UUID REFERENCES slot_holds(id),
    booking_id UUID REFERENCES bookings(id),
    status document_status NOT NULL DEFAULT 'pending',
    storage_url TEXT,
    signed_storage_url TEXT,
    signer_email VARCHAR(255) NOT NULL,
    signer_name VARCHAR(255),
    external_envelope_id VARCHAR(255),
    sent_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    signer_ip_address INET,
    audit_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook Idempotency
CREATE TABLE IF NOT EXISTS processed_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    response_body JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE (provider, webhook_id)
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user_id ON magic_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_meeting_types_owner_id ON meeting_types(owner_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_user_id ON availability_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_blackout_dates_user_id ON blackout_dates(user_id);
CREATE INDEX IF NOT EXISTS idx_slot_holds_meeting_type_id ON slot_holds(meeting_type_id);
CREATE INDEX IF NOT EXISTS idx_slot_holds_status ON slot_holds(status);
CREATE INDEX IF NOT EXISTS idx_slot_holds_expires_at ON slot_holds(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bookings_meeting_type_id ON bookings(meeting_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_host_user_id ON bookings(host_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_documents_hold_id ON documents(hold_id);
CREATE INDEX IF NOT EXISTS idx_documents_booking_id ON documents(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
