# Analytics Impression - Dual Tracking (GCP + Jitsu)

## Overview

This is a production-ready analytics tracking library that sends events to **BOTH** Google Cloud Platform (GCP) and Jitsu in parallel for data parity verification. Built for 11ty static sites and affiliate platforms (RAs).

## Features

- ✅ **Parallel Tracking**: Fires events to GCP and Jitsu simultaneously
- ✅ **ITP Mitigation**: Server-side cookie sync via `/api/jitsu-id` endpoint
- ✅ **Session Management**: 30-minute session TTL with auto-refresh
- ✅ **Identity Tracking**: Captures `amp_device_id`, `email_address`, `phone_number`, `app.client.id`
- ✅ **Rich Event Data**: Tracks page views, clicks, scroll depth, time on page, visibility changes
- ✅ **Queue System**: Events queued until Jitsu SDK loads
- ✅ **Consent Management**: Configurable consent check
- ✅ **Zero Dependencies**: Pure vanilla JavaScript

## Quick Start

### 1. Add to Your HTML

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Configure GCP endpoint BEFORE loading script -->
    <script>
      window.ANALYTICS_ENDPOINT = "YOUR_GCP_ENDPOINT_HERE";
    </script>

    <!-- Load analytics script -->
    <script src="https://your-cdn.com/analytics.js"></script>
  </head>
  <body>
    <!-- Your content -->
  </body>
</html>
```

### 2. Set Up Required Backend Endpoint

**CRITICAL**: You must implement the `/api/jitsu-id` endpoint for ITP mitigation.

See `jitsu-id-endpoint.js` for reference implementations:

- Netlify Functions
- Vercel Serverless
- Express.js
- Any Node.js server

## Configuration

### Basic (Auto-Init)

```html
<script>
  window.ANALYTICS_ENDPOINT = "https://your-gcp-endpoint.com";
</script>
<script src="analytics.js"></script>
```

### Manual Initialization

```html
<script src="analytics.js"></script>
<script>
  window.initAnalytics({
    endpoint: "https://your-gcp-endpoint.com",
  });
</script>
```

## API Reference

Once initialized, `window.Analytics` provides:

```javascript
// Track custom events (sends to BOTH GCP and Jitsu)
window.Analytics.track("button_clicked", {
  button_id: "cta-button",
  page: "homepage",
});

// Track to GCP only
window.Analytics.trackGCP("event_name", { data });

// Track to Jitsu only
window.Analytics.trackJitsu("event_name", { data });

// Manually trigger identify
window.Analytics.identify();

// Update user identity with email/phone
window.Analytics.updateIdentity({
  email_address: "user@example.com",
  phone_number: "+1234567890",
});

// Get IDs
window.Analytics.getClientId();
window.Analytics.getSessionId();
window.Analytics.getJitsuSessionId();
```

## Automatic Events

The following events are tracked automatically:

| Event Name           | Description          | Payload                                                          |
| -------------------- | -------------------- | ---------------------------------------------------------------- |
| `page_viewed`        | Initial page load    | `initial_referrer`, `page_title`                                 |
| `clicked`            | Link clicks          | `link_url`, `link_text`, `link_id`, `link_class`, `time_on_page` |
| `scroll_depth`       | Scroll progress      | `depth_percentage`, `scroll_position`, `time_on_page`            |
| `page_hidden`        | Tab hidden/minimized | `time_on_page`                                                   |
| `page_visible`       | Tab visible again    | `time_on_page`                                                   |
| `total_time_on_page` | Before page unload   | `duration_seconds`, `session_duration`, `max_scroll_depth`       |

## Identity Resolution

The script automatically identifies users when ANY of these become available:

- `amp_device_id` (from URL query param or localStorage)
- `email_address` (via `updateIdentity()`)
- `phone_number` (via `updateIdentity()`)
- `app.client.id` (from cookie or auto-generated)

It checks every 5 seconds and only sends identify when data changes.

## Data Sent to Each Platform

### GCP (Full Context)

- Complete document/window/navigator objects
- Device dimensions, scroll position
- User agent, IP address
- All cookies (GA, FullStory)
- Custom event data

### Jitsu (Streamlined)

- Event name and custom properties
- Jitsu session ID (30-min TTL)
- User identity traits
- Automatic context from Jitsu SDK

## Example: Full Implementation

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Site</title>

    <!-- Configure GCP Endpoint -->
    <script>
      window.ANALYTICS_ENDPOINT =
        "https://us-central1-my-project.cloudfunctions.net/analytics";
    </script>

    <!-- Load Analytics (auto-initializes) -->
    <script src="https://cdn.example.com/analytics.js"></script>
  </head>
  <body>
    <h1>Welcome</h1>

    <button id="signup-btn">Sign Up</button>

    <script>
      // Track custom events
      document.getElementById("signup-btn").addEventListener("click", () => {
        window.Analytics.track("signup_clicked", {
          source: "homepage",
          timestamp: Date.now(),
        });
      });

      // Update identity when user logs in
      function onUserLogin(email, phone) {
        window.Analytics.updateIdentity({
          email_address: email,
          phone_number: phone,
        });
      }
    </script>
  </body>
</html>
```

## Deployment Checklist

### Client-Side (This Script)

- ✅ Add `analytics.js` to your site
- ✅ Configure `window.ANALYTICS_ENDPOINT`
- ✅ Test in browser console: `window.Analytics`

### Server-Side (Required)

- ✅ Implement `/api/jitsu-id` endpoint (see `jitsu-id-endpoint.js`)
- ✅ Deploy to Netlify/Vercel/your server
- ✅ Test endpoint: `curl https://yoursite.com/api/jitsu-id`
- ✅ Verify cookies are set with HttpOnly flag

### Verification

- ✅ Open browser DevTools → Network tab
- ✅ Look for requests to:
  - `YOUR_GCP_ENDPOINT` (GCP events)
  - `https://ingest.34.71.52.102.nip.io/api/v1/event` (Jitsu events)
  - `/api/jitsu-id` (ITP mitigation)
- ✅ Check cookies: `jitsu_session_id`, `__eventn_id`, `__eventn_uid`
- ✅ Check localStorage: `analytics_client_id`, `amp_device_id`

## Credentials

**Already configured in script:**

- Jitsu Collector Host: `https://ingest.34.71.52.102.nip.io`
- Client Write Key: `O3fXfexlcgjP8ZDGbrwTO8qy05xv8vqK:Kb511Y2CY7fUlnFiybDEZWyMM94NASsZ`

**Server Write Key** (for backend use only):

- `yjFTWTpxsJ4jTyeZ15FxP2yqXsPHuHZu:bESOg8xmX2XuXF8Sly0JTQ0D9BbJxaAk`

## Cleanup

To stop tracking and cleanup intervals:

```javascript
window.cleanupAnalytics();
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any browser with `crypto.getRandomValues` and `fetch` support

## File Structure

```
analytics-impression/
├── analytics.js                 # Main tracking script (THIS IS WHAT YOU USE)
├── jitsu-id-endpoint.js        # Server endpoint reference implementation
├── example-implementation.html # Full working example
├── IMPLEMENTATION_GUIDE.md     # Detailed setup guide
└── README.md                   # This file
```

## Troubleshooting

### Jitsu Events Not Firing

1. Check DevTools console for errors
2. Verify `/api/jitsu-id` returns 200 OK
3. Confirm `window.__jitsu` exists after load
4. Check Network tab for `p.js` script load

### GCP Events Not Firing

1. Verify `window.ANALYTICS_ENDPOINT` is set
2. Check CORS settings on your GCP endpoint
3. Look for fetch errors in console

### Identity Not Updating

1. Check if `amp_device_id` is in URL or localStorage
2. Call `window.Analytics.updateIdentity()` with traits
3. Verify `window.__jitsu.identify` is a function

## Support

For issues specific to:

- **GCP endpoint**: Check your Cloud Functions logs
- **Jitsu collector**: Check Jitsu dashboard
- **This script**: Review browser console errors

## License

Internal use only - Puffy.com and affiliate sites
