# Oura Ring API V2 — Research Notes

**Last Updated:** 2026-04-02
**API Version:** V2
**Base URL:** `https://api.ouraring.com/v2/usercollection/`

---

## Authentication

**Method:** OAuth2 Authorization Code Flow

**Flow:**

1. Redirect user to `https://cloud.ouraring.com/oauth/authorize` with:
   - `client_id` — from Oura developer portal
   - `redirect_uri` — your callback URL
   - `response_type=code`
   - `scope` — space-separated list (see below)
   - `state` — CSRF protection token
2. User grants access on Oura's consent screen.
3. Oura redirects to your `redirect_uri` with `?code=AUTH_CODE`.
4. Exchange code for tokens via POST to `https://api.ouraring.com/oauth/token`:
   - `grant_type=authorization_code`
   - `code=AUTH_CODE`
   - `client_id`
   - `client_secret`
   - `redirect_uri`
5. Receive `access_token` and `refresh_token`.
6. Use `access_token` in `Authorization: Bearer <token>` header for all API calls.
7. Refresh via POST to token endpoint with `grant_type=refresh_token`.

**Scopes:**

- `daily` — daily summaries (readiness, sleep, activity)
- `heartrate` — heart rate data
- `personal` — personal info (age, weight, email)
- `session` — session/workout data
- `workout` — workout data

**Token lifetime:** Access tokens expire (typically 24h). Refresh tokens are long-lived — store securely and implement auto-refresh.

---

## Rate Limits

- **5,000 requests per 5-minute window**
- Rate limit headers returned on every response:
  - `X-RateLimit-Limit` — max requests in window
  - `X-RateLimit-Remaining` — remaining requests
  - `X-RateLimit-Reset` — seconds until window resets
- On exceeding: HTTP 429 Too Many Requests
- **Strategy for Baseline:** Daily sync job with backfill = ~10–20 requests/day. Rate limits are a non-issue for single-user use.

---

## Endpoints

### 1. Daily Readiness

**URL:** `GET /v2/usercollection/daily_readiness`

**Query params:** `start_date`, `end_date` (YYYY-MM-DD)

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date (YYYY-MM-DD) |
| `score` | integer | Overall readiness score (0–100) |
| `temperature_deviation` | float | Body temp deviation from baseline (°C) |
| `temperature_trend_deviation` | float | Temp trend vs personal baseline |
| `timestamp` | string | ISO 8601 timestamp |
| `contributors` | object | Breakdown: `activity_balance`, `body_temperature`, `hrv_balance`, `previous_day_activity`, `previous_night`, `recovery_index`, `resting_heart_rate`, `sleep_balance` |

**Baseline usage:** Primary input for training intensity adjustment. Temperature deviation feeds cycle phase proxy.

---

### 2. Daily Sleep

**URL:** `GET /v2/usercollection/daily_sleep`

**Query params:** `start_date`, `end_date`

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date |
| `score` | integer | Overall sleep score (0–100) |
| `timestamp` | string | ISO 8601 |
| `contributors` | object | `deep_sleep`, `efficiency`, `latency`, `rem_sleep`, `restfulness`, `timing`, `total_sleep` |

**Detailed sleep data** (via `sleep` endpoint for per-period granularity):

| Field | Type | Description |
|---|---|---|
| `total_sleep_duration` | integer | Total sleep in seconds |
| `rem_sleep_duration` | integer | REM sleep in seconds |
| `deep_sleep_duration` | integer | Deep sleep in seconds |
| `light_sleep_duration` | integer | Light sleep in seconds |
| `awake_time` | integer | Time awake in seconds |
| `sleep_efficiency` | integer | Percentage of time in bed actually asleep |
| `latency` | integer | Time to fall asleep in seconds |
| `average_heart_rate` | float | Average HR during sleep |
| `lowest_heart_rate` | integer | Lowest HR during sleep |
| `average_hrv` | integer | Average HRV (RMSSD) during sleep |
| `hr_5min` | array | 5-minute HR samples through the night |
| `hrv` | object | HRV samples |

**Baseline usage:** Recovery context, sleep quality trends, HRV baseline for Mind Mode experiments.

---

### 3. Daily Activity

**URL:** `GET /v2/usercollection/daily_activity`

**Query params:** `start_date`, `end_date`

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date |
| `score` | integer | Activity score (0–100) |
| `active_calories` | integer | Calories burned from activity |
| `total_calories` | integer | Total calories (active + BMR) |
| `steps` | integer | Step count |
| `equivalent_walking_distance` | integer | Meters |
| `high_activity_time` | integer | High-intensity minutes (seconds) |
| `medium_activity_time` | integer | Medium-intensity minutes (seconds) |
| `low_activity_time` | integer | Low-intensity minutes (seconds) |
| `sedentary_time` | integer | Sedentary time (seconds) |
| `met` | object | MET level samples |
| `contributors` | object | `meet_daily_targets`, `move_every_hour`, `recovery_time`, `stay_active`, `training_frequency`, `training_volume` |

**Baseline usage:** Activity baseline, non-exercise activity tracking, rest day verification.

---

### 4. Heart Rate

**URL:** `GET /v2/usercollection/heartrate`

**Query params:** `start_datetime`, `end_datetime` (ISO 8601)

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `bpm` | integer | Beats per minute |
| `source` | string | `awake`, `rest`, `sleep`, `workout` |
| `timestamp` | string | ISO 8601 |

**Note:** This returns granular 5-minute samples. Can produce large payloads over multi-day ranges. Use narrow date ranges.

**Baseline usage:** Resting HR trend, HRV proxy, workout HR context.

---

### 5. Daily Stress

**URL:** `GET /v2/usercollection/daily_stress`

**Query params:** `start_date`, `end_date`

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date |
| `stress_high` | integer | Time in high stress (seconds) |
| `recovery_high` | integer | Time in high recovery (seconds) |
| `day_summary` | string | `restored`, `normal`, `stressful` |

**Baseline usage:** Mental load tracking for Mind Mode, recovery context for Body Mode.

---

### 6. Daily Resilience

**URL:** `GET /v2/usercollection/daily_resilience`

**Query params:** `start_date`, `end_date`

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date |
| `level` | string | `limited`, `adequate`, `solid`, `strong`, `exceptional` |
| `contributors` | object | `sleep_recovery`, `daytime_recovery`, `stress` |

**Note:** Resilience is a newer Oura metric. Requires Gen 3 ring and may not be available for all users.

**Baseline usage:** Longitudinal fitness/recovery capacity trend. Higher-level signal than daily readiness.

---

### 7. VO2 Max

**URL:** `GET /v2/usercollection/vo2_max`

**Query params:** `start_date`, `end_date`

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date |
| `vo2_max` | float | Estimated VO2 max (mL/kg/min) |

**Note:** VO2 max estimates are updated periodically, not daily. Based on night-time HRV and profile data.

**Baseline usage:** Aerobic capacity trend, Hyrox race readiness (V2).

---

## Data Sync Strategy for Baseline

**Daily sync job (recommended):**

1. Run once daily (e.g., 6:00 AM local time, after ring sync).
2. Query each endpoint for `start_date=yesterday`, `end_date=today`.
3. Upsert into local PostgreSQL — use `id` as unique key to avoid duplicates.
4. On first run or recovery: backfill last 90 days.

**Token management:**

- Store `refresh_token` encrypted in DB or env.
- Auto-refresh `access_token` before expiry.
- Handle 401 by triggering re-auth flow.

**Error handling:**

- Retry on 5xx with exponential backoff (max 3 retries).
- Log and alert on persistent failures.
- Gracefully degrade UI if today's data is unavailable (show last available).

---

## References

- [Oura API V2 Docs](https://cloud.ouraring.com/v2/docs)
- [Oura Developer Portal](https://cloud.ouraring.com/oauth/applications)
- [OAuth2 Spec (RFC 6749)](https://tools.ietf.org/html/rfc6749)
