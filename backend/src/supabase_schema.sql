-- ====================================================================
-- IDEA HOLIDAY SUPABASE / POSTGRESQL MASTER DATABASE SCHEMA
-- Tailored for Transfers, Sightseeing, Multi-Day Packages & 4 Role Ecosystem
-- ====================================================================

-- Enable PostGIS extension if available for geo-spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. VEHICLE TAXONOMIES (India Market Standard Taxonomy)
CREATE TABLE IF NOT EXISTS vehicle_taxonomies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_code VARCHAR(50) UNIQUE NOT NULL, -- 'HATCHBACK', 'SEDAN', 'SUV', 'PREMIUM_MUV', 'LUXURY', 'GROUP_TEMPO'
    display_name VARCHAR(100) NOT NULL,
    example_models VARCHAR(255) NOT NULL,
    max_pax INT NOT NULL,
    max_bags INT NOT NULL,
    base_per_km_rate DECIMAL(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. SUPPLIERS TABLE (Tour Operators & Fleet Vendors)
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_code TEXT UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    gstin VARCHAR(15),
    pan_number VARCHAR(10),
    kyb_status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    commission_rate DECIMAL(5, 2) DEFAULT 18.00, -- 18% platform commission
    payout_bank_details JSONB DEFAULT '{}', -- { account_number, ifsc, bank_name, upi_id }
    rating DECIMAL(3, 2) DEFAULT 4.8,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. KYB DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS kyb_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL, -- 'AADHAAR', 'PAN', 'GSTIN', 'COMMERCIAL_PERMIT'
    doc_number VARCHAR(100),
    doc_url TEXT,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    rejection_reason TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. GEO-FENCES TABLE (Operational Zones for Transfer Suppliers)
CREATE TABLE IF NOT EXISTS geo_fences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    zone_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    center_lat DECIMAL(10, 7) NOT NULL,
    center_lng DECIMAL(10, 7) NOT NULL,
    radius_km DECIMAL(6, 2) NOT NULL DEFAULT 30.00,
    polygon_coordinates JSONB DEFAULT '[]', -- Array of [lat, lng] points for complex zones
    is_active BOOLEAN DEFAULT false,
    approval_status VARCHAR(50) DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, APPROVED, REJECTED, SUSPENDED
    review_note TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(255),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. PRODUCTS MASTER TABLE (Transfers, Sightseeing, Multi-Day Packages)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_code TEXT UNIQUE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    product_type VARCHAR(50) NOT NULL, -- 'TRANSFER', 'DAY_TOUR', 'MULTI_DAY_PACKAGE'
    title VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    short_desc TEXT,
    full_desc TEXT,
    inclusions TEXT[] DEFAULT '{}',
    exclusions TEXT[] DEFAULT '{}',
    cancellation_policy JSONB DEFAULT '{"type": "FLEXIBLE", "free_cancellation_hours": 24}',
    is_instant_booking BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'PUBLISHED', -- 'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'
    rating DECIMAL(3, 2) DEFAULT 4.5,
    review_count INT DEFAULT 0,
    bestseller BOOLEAN DEFAULT false,
    hero_image TEXT,
    gallery_images TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. TRANSFER ROUTES METADATA (Product Type A: Transfers)
CREATE TABLE IF NOT EXISTS canonical_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    iata_code VARCHAR(10),
    location_type VARCHAR(50) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(50) DEFAULT 'India',
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    radius_km DECIMAL(6, 2) DEFAULT 5.0,
    aliases JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_location_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    rule_side VARCHAR(10) NOT NULL,
    rule_mode VARCHAR(30) NOT NULL,
    fixed_location_id UUID REFERENCES canonical_locations(id),
    allowed_location_types TEXT[] DEFAULT '{}',
    center_lat DECIMAL(10, 7),
    center_lng DECIMAL(10, 7),
    radius_km DECIMAL(6, 2),
    allowed_state VARCHAR(100),
    allowed_city VARCHAR(100),
    polygon_coordinates JSONB DEFAULT '[]',
    error_message TEXT,
    suggestion TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, rule_side)
);

CREATE TABLE IF NOT EXISTS transfer_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    route_type VARCHAR(50) NOT NULL DEFAULT 'POINT_TO_POINT', -- 'AIRPORT_PICKUP', 'AIRPORT_DROP', 'CITY_TO_CITY'
    origin_name VARCHAR(255) NOT NULL,
    origin_lat DECIMAL(10, 7) NOT NULL,
    origin_lng DECIMAL(10, 7) NOT NULL,
    origin_radius_km DECIMAL(6, 2) DEFAULT 25.00,
    origin_iata VARCHAR(10),
    origin_location_id UUID REFERENCES canonical_locations(id),
    dest_name VARCHAR(255) NOT NULL,
    dest_lat DECIMAL(10, 7) NOT NULL,
    dest_lng DECIMAL(10, 7) NOT NULL,
    dest_radius_km DECIMAL(6, 2) DEFAULT 25.00,
    dest_iata VARCHAR(10),
    dest_location_id UUID REFERENCES canonical_locations(id),
    distance_km DECIMAL(8, 2) NOT NULL DEFAULT 35.00,
    duration_mins INT NOT NULL DEFAULT 45,
    vehicle_category VARCHAR(50) NOT NULL REFERENCES vehicle_taxonomies(category_code),
    max_passengers INT NOT NULL,
    max_luggage INT NOT NULL,
    free_waiting_mins INT DEFAULT 60, -- 60 mins free waiting for airport
    toll_included BOOLEAN DEFAULT true,
    state_tax_included BOOLEAN DEFAULT true,
    interstate_permit_tax BOOLEAN DEFAULT false,
    night_allowance_inr DECIMAL(10, 2) DEFAULT 300.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. DAY TOURS METADATA (Product Type B: Sightseeing)
CREATE TABLE IF NOT EXISTS day_tours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    duration_hours DECIMAL(4, 1) NOT NULL, -- e.g., 4.0 or 8.0
    distance_km_limit INT DEFAULT 80,
    available_time_slots TEXT[] DEFAULT '{"09:00 AM", "02:00 PM"}',
    group_type VARCHAR(50) DEFAULT 'PRIVATE', -- 'PRIVATE', 'SHARED'
    places_covered JSONB DEFAULT '[]', -- [{"name": "India Gate", "order": 1, "duration_mins": 45}]
    vehicle_rules JSONB DEFAULT '[{"pax_max": 3, "category": "SEDAN"}, {"pax_max": 6, "category": "SUV"}]',
    pickup_service_type VARCHAR(100) DEFAULT 'HOTEL_PICKUP_ANYWHERE',
    advance_booking_cutoff_hours DECIMAL(6, 2) DEFAULT 4.0,
    operating_start_time VARCHAR(20) DEFAULT '06:00',
    operating_end_time VARCHAR(20) DEFAULT '22:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. PACKAGE ITINERARIES (Product Type C: Multi-Day Packages)
CREATE TABLE IF NOT EXISTS package_itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    total_days INT NOT NULL,
    total_nights INT NOT NULL,
    day_wise_details JSONB NOT NULL DEFAULT '[]', -- [{"day": 1, "title": "Arrival & City Hop", "activities": ["Airport Pick-up", "Hotel Check-in"]}]
    has_hotel_option BOOLEAN DEFAULT true,
    hotel_categories TEXT[] DEFAULT '{"3_STAR", "4_STAR", "5_STAR"}',
    start_city VARCHAR(100) NOT NULL,
    end_city VARCHAR(100) NOT NULL,
    vehicle_category VARCHAR(50) NOT NULL REFERENCES vehicle_taxonomies(category_code),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. DYNAMIC PRICING & INVENTORY TABLE
CREATE TABLE IF NOT EXISTS product_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(100) NOT NULL, -- 'Swift Dzire Private', 'Innova Crysta', 'Cab Only', '3-Star Hotel Combo'
    pricing_model VARCHAR(50) DEFAULT 'FIXED', -- 'FIXED', 'PER_KM', 'PER_PERSON'
    base_price DECIMAL(10, 2) NOT NULL,
    strike_price DECIMAL(10, 2),
    per_km_rate DECIMAL(10, 2) DEFAULT 0.00,
    estimated_fastag_tolls DECIMAL(10, 2) DEFAULT 0.00,
    estimated_state_tax DECIMAL(10, 2) DEFAULT 0.00,
    tax_percentage DECIMAL(5, 2) DEFAULT 5.00, -- 5% GST
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_to DATE DEFAULT '2030-12-31',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'TRAVELER', -- 'TRAVELER', 'ADMIN', 'STAFF', 'SUPPLIER'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. BOOKINGS MASTER TABLE
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_ref VARCHAR(20) UNIQUE NOT NULL, -- e.g. 'IH-9A82B1'
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    product_code TEXT,
    supplier_code TEXT,
    product_type VARCHAR(50) NOT NULL,
    variant_name VARCHAR(100),
    travel_date DATE NOT NULL,
    pickup_time VARCHAR(20),
    pickup_location VARCHAR(255) NOT NULL,
    pickup_instructions VARCHAR(255),
    drop_location VARCHAR(255),
    drop_instructions VARCHAR(255),
    pickup_lat DECIMAL(10, 7),
    pickup_lng DECIMAL(10, 7),
    drop_lat DECIMAL(10, 7),
    drop_lng DECIMAL(10, 7),
    flight_number VARCHAR(20),
    flight_arrival_time VARCHAR(20),
    flight_departure_time VARCHAR(20),
    terminal_gate VARCHAR(100),
    location_validation_snapshot JSONB DEFAULT '{}',
    location_ops_review BOOLEAN DEFAULT false,
    pax_adults INT DEFAULT 1,
    pax_children INT DEFAULT 0,
    luggage_bags INT DEFAULT 0,
    vehicle_category VARCHAR(50),
    base_amount DECIMAL(10, 2) NOT NULL,
    tolls_and_tax_amount DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    commission_amount DECIMAL(10, 2) NOT NULL,
    supplier_payout_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'UPI', -- 'UPI', 'CARD', 'NETBANKING', 'BNPL'
    payment_status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'REFUNDED'
    booking_status VARCHAR(50) DEFAULT 'PENDING_PAYMENT',
    supplier_assignment_status VARCHAR(50) DEFAULT 'UNASSIGNED',
    supplier_assignment_method VARCHAR(50),
    supplier_assignment_score DECIMAL(5, 2),
    supplier_assignment_reason TEXT,
    assigned_supplier_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    supplier_assigned_at TIMESTAMP WITH TIME ZONE,
    supplier_response_status VARCHAR(50) DEFAULT 'NOT_STARTED',
    supplier_response_deadline TIMESTAMP WITH TIME ZONE,
    supplier_responded_at TIMESTAMP WITH TIME ZONE,
    supplier_response_note TEXT,
    assignment_round INT DEFAULT 1,
    client_request_id UUID UNIQUE,
    otp_hash VARCHAR(64),
    otp_encrypted TEXT,
    otp_expires_at TIMESTAMP WITH TIME ZONE,
    otp_attempts INT NOT NULL DEFAULT 0,
    otp_verified_at TIMESTAMP WITH TIME ZONE,
    traveler_name VARCHAR(100) NOT NULL,
    traveler_phone VARCHAR(20) NOT NULL,
    traveler_email VARCHAR(255) NOT NULL,
    special_requests TEXT,
    promo_code VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. SUPPLIER ASSIGNMENT DECISION AUDIT
CREATE TABLE IF NOT EXISTS supplier_assignment_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    candidate_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    coverage_zone_id UUID REFERENCES geo_fences(id) ON DELETE SET NULL,
    decision VARCHAR(50) NOT NULL,
    score DECIMAL(5, 2) DEFAULT 0,
    candidate_price DECIMAL(10, 2) DEFAULT 0,
    vehicle_category VARCHAR(50),
    assignment_round INT DEFAULT 1,
    response_status VARCHAR(50) DEFAULT 'NOT_STARTED',
    response_at TIMESTAMP WITH TIME ZONE,
    response_note TEXT,
    rejection_reasons JSONB DEFAULT '[]',
    score_breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. DRIVER & FLEET ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS driver_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    driver_name VARCHAR(100) NOT NULL,
    driver_phone VARCHAR(20) NOT NULL,
    vehicle_model VARCHAR(100) NOT NULL,
    vehicle_number VARCHAR(20) NOT NULL,
    assignment_status VARCHAR(50) DEFAULT 'ASSIGNED', -- 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'FALLBACK_TRIGGERED'
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. PAYOUTS TABLE (RazorpayX / Cashfree Integration Track)
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    gross_amount DECIMAL(10, 2) NOT NULL,
    commission_amount DECIMAL(10, 2) NOT NULL,
    net_payout DECIMAL(10, 2) NOT NULL,
    gateway_reference VARCHAR(100),
    payout_status VARCHAR(50) DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'PROCESSED', 'FAILED'
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. STAFF OPERATIONS TASKS TABLE
CREATE TABLE IF NOT EXISTS staff_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type VARCHAR(50) NOT NULL, -- 'DISPUTE_RESOLUTION', 'FALLBACK_DISPATCH', 'CONTENT_MODERATION'
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    assigned_staff_name VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    status VARCHAR(50) DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'RESOLVED'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. REVIEWS & RATINGS TABLE
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SECURITY AND OPERATIONAL AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_role VARCHAR(30),
    resource_type VARCHAR(60) NOT NULL,
    resource_id TEXT,
    request_id VARCHAR(100),
    ip_address VARCHAR(100),
    user_agent VARCHAR(300),
    outcome VARCHAR(30) NOT NULL DEFAULT 'SUCCEEDED',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id, created_at DESC);
-- 16. TRAVELER ITINERARIES & CIRCUITS TABLE
CREATE TABLE IF NOT EXISTS traveler_itineraries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    destination TEXT,
    start_date TEXT,
    travel_date TEXT,
    end_date TEXT,
    days_count INT DEFAULT 3,
    adults_count INT DEFAULT 2,
    children_count INT DEFAULT 0,
    items JSONB DEFAULT '[]',
    is_public INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traveler_itineraries_user ON traveler_itineraries(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS circuit_quotes (
    id TEXT PRIMARY KEY,
    itinerary_id TEXT NOT NULL REFERENCES traveler_itineraries(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    adults_count INT NOT NULL DEFAULT 1,
    children_count INT NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT,
    base_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    taxes_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    line_items JSONB NOT NULL DEFAULT '[]',
    issues JSONB NOT NULL DEFAULT '[]',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    circuit_order_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuit_quotes_itinerary ON circuit_quotes(itinerary_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_quotes_user ON circuit_quotes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS circuit_orders (
    id TEXT PRIMARY KEY,
    order_ref TEXT NOT NULL UNIQUE,
    quote_id TEXT NOT NULL UNIQUE REFERENCES circuit_quotes(id),
    itinerary_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    currency TEXT NOT NULL DEFAULT 'INR',
    adults_count INT NOT NULL DEFAULT 1,
    children_count INT NOT NULL DEFAULT 0,
    traveler_name TEXT NOT NULL,
    traveler_email TEXT NOT NULL,
    traveler_phone TEXT NOT NULL,
    base_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    taxes_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    payment_reference TEXT,
    payment_provider TEXT,
    payment_order_id TEXT,
    payment_session_id TEXT,
    payment_id TEXT,
    payment_signature TEXT,
    payment_status TEXT DEFAULT 'PENDING',
    payment_order_status TEXT DEFAULT 'NOT_STARTED',
    payment_verified_at TIMESTAMP WITH TIME ZONE,
    payment_failed_at TIMESTAMP WITH TIME ZONE,
    payment_failure_code TEXT,
    management_status TEXT DEFAULT 'NONE',
    refunded_amount DECIMAL(12, 2) DEFAULT 0,
    cancellation_fee_amount DECIMAL(12, 2) DEFAULT 0,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    rescheduled_at TIMESTAMP WITH TIME ZONE,
    reconfirmation_status TEXT DEFAULT 'NOT_REQUIRED',
    reconfirmation_deadline TIMESTAMP WITH TIME ZONE,
    reconfirmed_at TIMESTAMP WITH TIME ZONE,
    refund_reconciliation_status TEXT DEFAULT 'NOT_REQUIRED',
    refund_reconciled_at TIMESTAMP WITH TIME ZONE,
    hold_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS circuit_order_items (
    id TEXT PRIMARY KEY,
    circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
    quote_line_item_id TEXT NOT NULL,
    booking_id TEXT NOT NULL UNIQUE,
    sequence_number INT NOT NULL,
    product_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    activity_date DATE NOT NULL,
    pickup_time TEXT NOT NULL,
    vehicle_category TEXT,
    variant_name TEXT,
    status TEXT NOT NULL DEFAULT 'HELD_PENDING_PAYMENT',
    reconfirmation_status TEXT DEFAULT 'NOT_REQUIRED',
    reconfirmation_deadline TIMESTAMP WITH TIME ZONE,
    reconfirmed_at TIMESTAMP WITH TIME ZONE,
    base_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    taxes_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(circuit_order_id, quote_line_item_id)
);

CREATE TABLE IF NOT EXISTS inventory_holds (
    id TEXT PRIMARY KEY,
    circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
    circuit_order_item_id TEXT NOT NULL REFERENCES circuit_order_items(id) ON DELETE CASCADE,
    booking_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    activity_date DATE NOT NULL,
    pickup_time TEXT NOT NULL,
    vehicle_category TEXT,
    units INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;

CREATE TABLE IF NOT EXISTS circuit_payment_events (
    id TEXT PRIMARY KEY,
    circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    provider_order_id TEXT,
    provider_payment_id TEXT,
    status TEXT NOT NULL,
    amount DECIMAL(12, 2),
    failure_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS circuit_management_requests (
    id TEXT PRIMARY KEY,
    request_ref TEXT NOT NULL UNIQUE,
    circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reason TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    requested_changes TEXT NOT NULL DEFAULT '{}',
    policy_snapshot TEXT NOT NULL DEFAULT '{}',
    refund_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    cancellation_fee_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    gateway_refund_id TEXT,
    gateway_status TEXT,
    failure_code TEXT,
    resolution TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    orchestration_status TEXT DEFAULT 'NOT_STARTED',
    refund_expected_status TEXT,
    refund_reconciled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(circuit_order_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS circuit_orchestration_events (
    id TEXT PRIMARY KEY,
    circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
    management_request_id TEXT REFERENCES circuit_management_requests(id) ON DELETE SET NULL,
    event_key TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    booking_id TEXT,
    supplier_id TEXT,
    status TEXT NOT NULL,
    provider TEXT,
    provider_reference TEXT,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS circuit_order_item_id TEXT;
ALTER TABLE staff_tasks ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_orders_user_idempotency ON circuit_orders(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_circuit_orders_user_status ON circuit_orders(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_order_items_order ON circuit_order_items(circuit_order_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_availability ON inventory_holds(product_id, supplier_id, activity_date, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_order ON inventory_holds(circuit_order_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_orders_payment_order ON circuit_orders(payment_order_id) WHERE payment_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_circuit_orders_payment_status ON circuit_orders(payment_status, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_management_order ON circuit_management_requests(circuit_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_management_queue ON circuit_management_requests(status, request_type, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_circuit ON staff_tasks(circuit_order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_payment_events_order ON circuit_payment_events(circuit_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_orchestration_order ON circuit_orchestration_events(circuit_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_reconfirmation_sla ON circuit_order_items(reconfirmation_status, reconfirmation_deadline);
CREATE INDEX IF NOT EXISTS idx_circuit_refund_reconciliation ON circuit_orders(refund_reconciliation_status, updated_at DESC);

-- 15. OPTION-SCOPED LOGISTICS AND BOOKING OPERATIONS
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_confirmation_type TEXT DEFAULT 'INSTANT_THEN_MANUAL';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS product_option_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_type TEXT DEFAULT 'INSTANT_THEN_MANUAL';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'PENDING_PAYMENT';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS logistics_snapshot JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS product_options (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, option_code TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT, pickup_option_type TEXT NOT NULL DEFAULT 'PICKUP_EVERYONE',
    confirmation_type TEXT NOT NULL DEFAULT 'INSTANT_THEN_MANUAL',
    supported_arrival_modes JSONB NOT NULL DEFAULT '["AIR","RAIL","SEA","OTHER"]',
    supported_departure_modes JSONB NOT NULL DEFAULT '["AIR","RAIL","SEA","OTHER"]',
    available_start_times JSONB NOT NULL DEFAULT '["09:00"]', capacity INT,
    allow_custom_traveler_pickup BOOLEAN NOT NULL DEFAULT false, pickup_window_minutes INT NOT NULL DEFAULT 30,
    waiting_time_minutes INT NOT NULL DEFAULT 30, no_show_policy TEXT, service_hours_start TEXT, service_hours_end TEXT,
    supplier_confirmation_sla_minutes INT NOT NULL DEFAULT 10, meeting_point_ref TEXT, end_point TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(product_id, option_code)
);
CREATE TABLE IF NOT EXISTS product_option_locations (
    id TEXT PRIMARY KEY, option_id TEXT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
    location_ref TEXT, provider TEXT DEFAULT 'IDEA_HOLIDAY', external_ref TEXT, pickup_type TEXT NOT NULL DEFAULT 'LOCATION',
    mode TEXT, display_label TEXT NOT NULL, address TEXT, city TEXT, state TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    is_meeting_point BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true, sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS booking_question_definitions (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, answer_type TEXT NOT NULL DEFAULT 'TEXT',
    scope TEXT NOT NULL DEFAULT 'PER_BOOKING', required BOOLEAN NOT NULL DEFAULT false, unit TEXT, help_text TEXT,
    allowed_answers JSONB NOT NULL DEFAULT '[]', condition_json JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_option_questions (option_id TEXT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE, question_id TEXT NOT NULL REFERENCES booking_question_definitions(id) ON DELETE CASCADE, sort_order INT NOT NULL DEFAULT 0, required_override BOOLEAN, PRIMARY KEY(option_id, question_id));
CREATE TABLE IF NOT EXISTS booking_question_answers (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, question_code TEXT NOT NULL, traveler_num INT, answer TEXT, unit TEXT, answer_source TEXT DEFAULT 'GUEST', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(booking_id, question_code, traveler_num));
CREATE TABLE IF NOT EXISTS booking_logistics (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE, option_id TEXT, pickup_mode TEXT, pickup_type TEXT, pickup_location_ref TEXT, pickup_location_provider TEXT, pickup_location TEXT, pickup_address TEXT, pickup_city TEXT, pickup_state TEXT, pickup_lat DOUBLE PRECISION, pickup_lng DOUBLE PRECISION, drop_type TEXT, drop_location_ref TEXT, drop_location TEXT, drop_address TEXT, drop_city TEXT, drop_state TEXT, drop_lat DOUBLE PRECISION, drop_lng DOUBLE PRECISION, meeting_point_ref TEXT, meeting_point_label TEXT, pickup_window_start TEXT, pickup_window_end TEXT, waiting_time_minutes INT, status TEXT NOT NULL DEFAULT 'PICKUP_REQUESTED', custom_pickup BOOLEAN NOT NULL DEFAULT false, needs_ops_review BOOLEAN NOT NULL DEFAULT false, pending_supplier BOOLEAN NOT NULL DEFAULT false, snapshot JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS booking_logistics_events (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, event_type TEXT NOT NULL, status TEXT, payload JSONB NOT NULL DEFAULT '{}', actor_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS booking_logistics_stops (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, itinerary_day INT NOT NULL, city TEXT, location_ref TEXT, location TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, status TEXT NOT NULL DEFAULT 'REQUIRES_CONFIRMATION', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(booking_id, itinerary_day));
CREATE TABLE IF NOT EXISTS booking_holds (id TEXT PRIMARY KEY, booking_id TEXT, client_request_id TEXT UNIQUE, product_id TEXT NOT NULL, product_option_id TEXT, activity_date DATE NOT NULL, adults INT NOT NULL DEFAULT 1, children INT NOT NULL DEFAULT 0, amount_inr NUMERIC(12,2) NOT NULL, quote_snapshot JSONB NOT NULL DEFAULT '{}', logistics_snapshot JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'ACTIVE', expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, consumed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS booking_amendment_requests (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, amendment_type TEXT NOT NULL, current_snapshot JSONB NOT NULL DEFAULT '{}', proposed_snapshot JSONB NOT NULL DEFAULT '{}', quoted_delta_inr NUMERIC(12,2), cutoff_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'REQUESTED', reason TEXT, reviewed_by TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(booking_id, idempotency_key));

-- INITIAL SEED FOR VEHICLE TAXONOMIES
INSERT INTO vehicle_taxonomies (category_code, display_name, example_models, max_pax, max_bags, base_per_km_rate, description)
VALUES 
('HATCHBACK', 'Hatchback', 'WagonR, Tata Tiago', 3, 2, 11.50, 'Budget compact AC cab for city transfers'),
('SEDAN', 'Sedan (Dzire / Etios)', 'Swift Dzire, Toyota Etios', 4, 3, 13.50, 'Comfortable AC sedan ideal for airport & city travel'),
('SUV', 'SUV / MUV (Ertiga)', 'Maruti Ertiga, Mahindra Marazzo', 6, 4, 17.50, 'Spacious family cab with ample luggage space'),
('PREMIUM_MUV', 'Premium MUV (Innova Crysta)', 'Toyota Innova Crysta, Hycross', 6, 5, 23.00, 'Top-rated comfortable long-distance luxury MPV'),
('LUXURY', 'Luxury Class', 'Mercedes E-Class, BMW 5 Series, Audi A6', 3, 3, 65.00, 'Premium luxury vehicle for VIP & executive travel'),
('GROUP_TEMPO', 'Tempo Traveller (12-26 Seater)', 'Force Tempo Traveller 12/17/26 Seater', 26, 20, 32.00, 'High-capacity minibuses for group sightseeing & multi-day tours')
ON CONFLICT (category_code) DO NOTHING;
