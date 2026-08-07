CREATE TABLE IF NOT EXISTS "networks" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sensors" (
    "thing_name" TEXT NOT NULL,
    "network_id" INTEGER NOT NULL,
    "location_name" TEXT NOT NULL,
    "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_seen_at" TIMESTAMPTZ,
    CONSTRAINT "sensors_pkey" PRIMARY KEY ("thing_name"),
    CONSTRAINT "sensors_network_id_fkey"
        FOREIGN KEY ("network_id") REFERENCES "networks"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sensor_readings" (
    "id" TEXT NOT NULL,
    "thing_name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sensor_readings_thing_name_fkey"
        FOREIGN KEY ("thing_name") REFERENCES "sensors"("thing_name")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sensor_events" (
    "id" TEXT NOT NULL,
    "thing_name" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "sensor_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sensor_events_thing_name_fkey"
        FOREIGN KEY ("thing_name") REFERENCES "sensors"("thing_name")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "activity_buckets" (
    "network_id" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "activity" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "activity_buckets_pkey" PRIMARY KEY ("network_id", "recorded_at"),
    CONSTRAINT "activity_buckets_network_id_fkey"
        FOREIGN KEY ("network_id") REFERENCES "networks"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "activity_buckets_activity_check"
        CHECK ("activity" >= 0 AND "activity" <= 1)
);

CREATE TABLE IF NOT EXISTS "data_imports" (
    "key" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "sensors_network_id_idx"
    ON "sensors"("network_id");
CREATE INDEX IF NOT EXISTS "sensor_readings_sensor_time_idx"
    ON "sensor_readings"("thing_name", "recorded_at");
CREATE INDEX IF NOT EXISTS "sensor_events_sensor_time_idx"
    ON "sensor_events"("thing_name", "recorded_at");
CREATE INDEX IF NOT EXISTS "activity_buckets_recorded_at_idx"
    ON "activity_buckets"("recorded_at");
