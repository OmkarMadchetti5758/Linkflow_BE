## Docker Compose Architecture
Use Docker Compose to run all your services locally.

## Your development environment will contain:
Service	            Purpose
nginx	            Entry point and reverse proxy
api	                Express application
worker	            Kafka consumer and analytics processor
mongodb	            Primary database
redis	            Cache and rate-limiting store
kafka	            Event streaming broker

## Commands : 
docker compose up -d : start
docker compose down : stop
docker compose up -d --build : build/rebuild docker image  
docker compose ps : images
docker compose logs -f api : logs

## Kafka worker
npm run worker:analytics

## Click analytics backfill
The analytics worker stores normalized browser, operating-system, device, and
referrer-host fields for new click events. Existing click records can be
classified from their stored `userAgent` and `referrer` values; the backfill
does not infer geographic location or overwrite fields that already have a
value. Records without a stored user-agent remain `Unknown`, and missing
referrers are classified as `Direct`.

After configuring `MONGO_URI` for a non-production database, run:

```sh
npm run backfill:click-analytics
```

The script processes records in batches, can safely be rerun, and only fills
missing normalized fields.

## Per-link analytics API
`GET /api/urls/:shortCode/analytics` returns click totals and daily clicks.
The following endpoints return the selected range's distribution as
`{ shortCode, dateRange, totalClicks, distribution }`, where each distribution
item is `{ name, count, percentage }`:

- `GET /api/urls/:shortCode/analytics/browsers`
- `GET /api/urls/:shortCode/analytics/operating-systems`
- `GET /api/urls/:shortCode/analytics/devices`
- `GET /api/urls/:shortCode/analytics/referrers`

Each endpoint accepts optional `from` and `to` query parameters in
`YYYY-MM-DD` format, inclusive in UTC.

## API endpoint : 
http://localhost/
http://localhost/health
http://localhost/api/urls

`GET /api/urls` returns all shortened links, ordered newest first, including each link's click count.