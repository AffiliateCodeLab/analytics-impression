// Self-executing function to avoid global scope pollution
(function () {
  const ALPHABET =
    "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  const nanoid = (size = 21) => {
    let id = "";
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    for (let i = 0; i < size; i++) {
      id += ALPHABET[63 & bytes[i]];
    }
    return id;
  };

  // Constants
  const ANALYTICS_ENDPOINT = window.ANALYTICS_ENDPOINT || null;
  const JITSU_COLLECTOR_HOST = "https://ingest.34.71.52.102.nip.io";
  const JITSU_WRITE_KEY_CLIENT =
    "O3fXfexlcgjP8ZDGbrwTO8qy05xv8vqK:Kb511Y2CY7fUlnFiybDEZWyMM94NASsZ";

  // Utility functions
  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  function getSessionId() {
    let sessionId = sessionStorage.getItem("analytics_session_id");
    if (!sessionId) {
      sessionId = uuidv4();
      sessionStorage.setItem("analytics_session_id", sessionId);
    }
    return sessionId;
  }

  function getClientId() {
    let clientId = localStorage.getItem("analytics_client_id");
    if (!clientId) {
      clientId = `${Math.floor(Date.now() / 1000)}-${nanoid(12)}`;
      localStorage.setItem("analytics_client_id", clientId);
    }
    return clientId;
  }

  function parseCookies() {
    return document.cookie.split(";").reduce((cookies, cookie) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value !== undefined) {
        cookies[name] = decodeURIComponent(value);
      }
      return cookies;
    }, {});
  }

  function setCookie(name, value, options = {}) {
    let cookieString = `${name}=${encodeURIComponent(value)}`;

    if (options.maxAge) {
      cookieString += `; Max-Age=${options.maxAge}`;
    }
    if (options.path) {
      cookieString += `; Path=${options.path}`;
    }
    if (options.domain) {
      cookieString += `; Domain=${options.domain}`;
    }
    if (options.secure) {
      cookieString += "; Secure";
    }
    if (options.sameSite) {
      cookieString += `; SameSite=${options.sameSite}`;
    }
    if (options.httpOnly) {
      // Note: HttpOnly can't be set via JavaScript, only server-side
      console.warn("HttpOnly flag cannot be set via document.cookie");
    }

    document.cookie = cookieString;
  }

  async function getUserIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("Failed to fetch IP:", error);
      return null;
    }
  }

  // Jitsu Session Management (30 minutes TTL)
  function generateJitsuSessionId() {
    const random = () => Math.random().toString(36).slice(2, 10);
    return `js_${random()}${random()}`;
  }

  function getJitsuSessionId() {
    const cookies = parseCookies();
    let sessionId = cookies["jitsu_session_id"];

    if (!sessionId) {
      sessionId = generateJitsuSessionId();
    }

    // Refresh TTL to 30 minutes on every call
    const isSecure = window.location.protocol === "https:";
    setCookie("jitsu_session_id", sessionId, {
      maxAge: 30 * 60, // 30 minutes
      path: "/",
      secure: isSecure,
      sameSite: isSecure ? "None" : "Lax",
    });

    return sessionId;
  }

  // ITP Mitigation: Server-side cookie sync
  async function syncJitsuIdentity() {
    try {
      const response = await fetch("/api/jitsu-id", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        return {
          anonymousId: data.anonymousId,
          userId: data.userId,
        };
      }
    } catch (error) {
      console.warn("Failed to sync Jitsu identity:", error);
    }
    return null;
  }

  // Get amp_device_id from URL or localStorage
  function getAmpDeviceId() {
    if (typeof window === "undefined") return "";

    const searchValue = new URLSearchParams(window.location.search).get(
      "amp_device_id",
    );
    if (searchValue) {
      window.localStorage?.setItem?.("amp_device_id", searchValue);
    }

    return searchValue || window.localStorage?.getItem?.("amp_device_id") || "";
  }

  // Build base identify payload from cookies/localStorage
  function buildJitsuIdentifyPayload() {
    const cookies = parseCookies();
    const userId =
      cookies["app.client.id"] || cookies["__eventn_uid"] || getClientId();
    const ampDeviceId = getAmpDeviceId();

    const traits = {};

    if (ampDeviceId) traits.amp_device_id = ampDeviceId;
    if (userId) traits["app.client.id"] = userId;

    return {
      userId: userId || traits["app.client.id"] || undefined,
      traits: traits,
    };
  }

  // Build traits from explicit input parameters
  function buildIdentifyTraitsFromInput(input) {
    const traits = {};

    if (input?.ampDeviceId) traits.amp_device_id = input.ampDeviceId;
    if (input?.clientId) traits["app.client.id"] = input.clientId;
    if (input?.email) traits.email_address = input.email;
    if (input?.phone) traits.phone_number = input.phone;

    return traits;
  }

  // Build final identify arguments (merges base + input + custom traits)
  function buildIdentifyArgs(input) {
    const base = buildJitsuIdentifyPayload();
    const inputTraits = buildIdentifyTraitsFromInput(input);
    const traits = { ...base.traits, ...inputTraits, ...(input?.traits || {}) };

    // Prefer a stable, non-PII identifier when available.
    // Priority order: clientId > ampDeviceId > email > phone
    const resolvedUserId =
      input?.clientId ||
      base.userId ||
      traits["app.client.id"] ||
      input?.ampDeviceId ||
      input?.email ||
      input?.phone ||
      undefined;

    return { userId: resolvedUserId, traits };
  }

  // Analytics sending function (GCP - EXISTING, DO NOT MODIFY)
  async function sendGCPData(eventName = "page_viewed", additionalData = {}) {
    if (!ANALYTICS_ENDPOINT || typeof window === "undefined") return;

    const cookies = parseCookies();
    const ga_cookie_id = cookies["_ga"];
    const fullstory_id = cookies["_fsuid"];

    try {
      const event = {
        event_id: uuidv4(),
        event_name: eventName,
        event_type: "custom",
        client_id: getClientId(),
        session_id: getSessionId(),
        event_timestamp: new Date().toISOString(),
        document: {
          location: {
            href: document.location.href,
            hash: document.location.hash,
            host: document.location.host,
            hostname: document.location.hostname,
            origin: document.location.origin,
            pathname: document.location.pathname,
            port: document.location.port,
            protocol: document.location.protocol,
            search: document.location.search,
          },
          referrer: document.referrer,
          characterSet: document.characterSet,
          title: document.title,
        },
        navigator: {
          language: navigator.language,
          languages: navigator.languages,
          userAgent: navigator.userAgent,
          ga_cookie_id: ga_cookie_id,
          ip_address: window?.Analytics?.ip_address || (await getUserIP()),
        },
        window: {
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
          outerHeight: window.outerHeight,
          outerWidth: window.outerWidth,
          pageXOffset: window.scrollX,
          pageYOffset: window.scrollY,
          location: {
            href: window.location.href,
            hash: window.location.hash,
            host: window.location.host,
            hostname: window.location.hostname,
            origin: window.location.origin,
            pathname: window.location.pathname,
            port: window.location.port,
            protocol: window.location.protocol,
            search: window.location.search,
          },
          origin: window.origin,
          screen: {
            height: window.screen.height,
            width: window.screen.width,
          },
          screenX: window.screenX,
          screenY: window.screenY,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
      };

      // Merge additional data if provided
      const finalEvent = additionalData
        ? { ...event, event_data: additionalData }
        : event;

      const response = await fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors",
        body: JSON.stringify(finalEvent),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to send analytics:", error);
    }
  }

  // Jitsu tracking function (NEW - PARALLEL IMPLEMENTATION)
  async function sendJitsuData(eventName, additionalData = {}) {
    try {
      if (typeof window === "undefined") return;

      const jitsu = window.__jitsu || window.jitsu;

      // Add Jitsu session to payload
      const sessionId = getJitsuSessionId();
      const payload = {
        ...additionalData,
        jitsu_session_id: sessionId,
      };

      const invoke = (instance) => {
        try {
          instance.track(eventName, payload);
        } catch (error) {
          console.error("Failed to send Jitsu data:", error);
        }
      };

      if (jitsu && typeof jitsu.track === "function") {
        invoke(jitsu);
        return;
      }

      // Queue if Jitsu isn't ready yet
      window.jitsuQ = window.jitsuQ || [];
      window.jitsuQ.push((instance) => invoke(instance));
    } catch (error) {
      console.error("Failed to send Jitsu data:", error);
    }
  }

  // Unified tracking function - sends to BOTH GCP and Jitsu
  async function trackEvent(eventName, additionalData = {}) {
    // Send to GCP (existing)
    await sendGCPData(eventName, additionalData);

    // Send to Jitsu (new, parallel)
    // await sendJitsuData(eventName, additionalData);
  }

  // Event Tracker Class
  class EventTracker {
    constructor() {
      this.startTime = Date.now();
      this.totalTimeOnPage = 0;
      this.isHidden = false;
      this.lastVisibilityChange = Date.now();
      this.maxScrollDepth = 0;
      this.scrollTimeout = null;
    }

    calculateTimeOnPage() {
      const currentTime = Date.now();
      if (!this.isHidden) {
        this.totalTimeOnPage += currentTime - this.lastVisibilityChange;
      }
      this.lastVisibilityChange = currentTime;
      return Math.floor(this.totalTimeOnPage / 1000);
    }

    handleVisibilityChange() {
      if (document.hidden) {
        this.isHidden = true;
        trackEvent("page_hidden", {
          time_on_page: this.calculateTimeOnPage(),
        });
      } else {
        this.isHidden = false;
        this.lastVisibilityChange = Date.now();
        trackEvent("page_visible", {
          time_on_page: this.calculateTimeOnPage(),
        });
      }
    }

    handleClick(event) {
      const clickedElement = event.target.closest("a");
      if (clickedElement) {
        trackEvent("clicked", {
          link_url: clickedElement.href,
          link_text: clickedElement.textContent?.trim(),
          link_id: clickedElement.id,
          link_class: clickedElement.className,
          time_on_page: this.calculateTimeOnPage(),
        });
      }
    }

    handleScroll() {
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
      }

      this.scrollTimeout = setTimeout(() => {
        const scrollHeight =
          document.documentElement.scrollHeight - window.innerHeight;
        const scrollPosition = window.scrollY;
        const scrollDepth = Math.round((scrollPosition / scrollHeight) * 100);

        if (scrollDepth > this.maxScrollDepth) {
          this.maxScrollDepth = scrollDepth;
          trackEvent("scroll_depth", {
            depth_percentage: scrollDepth,
            scroll_position: scrollPosition,
            time_on_page: this.calculateTimeOnPage(),
          });
        }
      }, 500);
    }

    initializeTracking() {
      // Track initial page view
      trackEvent("page_viewed", {
        initial_referrer: document.referrer,
        page_title: document.title,
      });

      // Set up event listeners
      document.addEventListener("visibilitychange", () =>
        this.handleVisibilityChange(),
      );
      document.addEventListener("click", (e) => this.handleClick(e));
      window.addEventListener("scroll", () => this.handleScroll());

      // Track time on page when leaving
      window.addEventListener("beforeunload", () => {
        const timeSpent = this.calculateTimeOnPage();
        trackEvent("total_time_on_page", {
          duration_seconds: timeSpent,
          session_duration: Date.now() - this.startTime,
          max_scroll_depth: this.maxScrollDepth,
        });
      });
    }
  }

  // Track last identify payload to prevent duplicates
  let lastIdentifyPayloadKey = null;

  // Jitsu identify function - triggers when identity data is available
  // Parameters (all optional):
  //   input.email - User email address
  //   input.phone - User phone number
  //   input.ampDeviceId - Amplitude device ID
  //   input.clientId - App client ID
  //   input.traits - Additional custom traits
  function identifyJitsu(input) {
    if (typeof window === "undefined") return;

    const invoke = (instance) => {
      try {
        const { userId, traits } = buildIdentifyArgs(input);
        const hasTraits = Object.keys(traits).length > 0;
        if (!userId && !hasTraits) return;

        // Prevent duplicate identify calls with same payload
        const payloadKey = JSON.stringify({ userId, traits });
        if (lastIdentifyPayloadKey === payloadKey) return;

        lastIdentifyPayloadKey = payloadKey;
        instance.identify(userId, traits);
      } catch (error) {
        console.error("Failed to identify Jitsu user:", error);
      }
    };

    const jitsu = window.__jitsu || window.jitsu;
    if (jitsu && typeof jitsu.identify === "function") {
      invoke(jitsu);
      return;
    }

    // Queue if Jitsu isn't ready yet
    window.jitsuQ = window.jitsuQ || [];
    window.jitsuQ.push((instance) => {
      window.__jitsu = instance;
      invoke(instance);
    });
  }

  // Load Jitsu script dynamically
  function loadJitsuScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${JITSU_COLLECTOR_HOST}/p.js`;
      script.async = true;
      script.type = "text/javascript";
      script.setAttribute("data-write-key", JITSU_WRITE_KEY_CLIENT);
      script.setAttribute("data-tracking-host", JITSU_COLLECTOR_HOST);
      script.setAttribute("data-id-endpoint", "/api/jitsu-id");

      script.onload = () => {
        // Store Jitsu instance first
        window.__jitsu = window.jitsu || window.__jitsu;

        // Set up processing queue
        if (window.jitsuQ && Array.isArray(window.jitsuQ)) {
          window.jitsuQ.forEach((callback) => {
            if (typeof callback === "function") {
              callback(window.__jitsu);
            }
          });
        }

        // Try to identify user
        identifyJitsu();

        resolve(window.__jitsu);
      };

      script.onerror = () => {
        console.error("Failed to load Jitsu script");
        reject(new Error("Jitsu script load failed"));
      };

      document.head.appendChild(script);
    });
  }

  // Initialize analytics
  async function initAnalytics(config = {}) {
    // Merge provided config with defaults
    window.ANALYTICS_ENDPOINT = config.endpoint || window.ANALYTICS_ENDPOINT;

    // Initialize ITP mitigation (server-side identity sync)
    // try {
    //   const identity = await syncJitsuIdentity();
    //   if (identity) {
    //     console.log("Jitsu identity synced:", identity);
    //   }
    // } catch (error) {
    //   console.error("Failed to sync Jitsu identity:", error);
    // }

    // Load Jitsu script
    try {
      await loadJitsuScript();
      console.log("Jitsu loaded successfully");
    } catch (error) {
      console.error("Failed to initialize Jitsu:", error);
    }

    // Initialize tracker
    window.analyticsTracker = new EventTracker();

    // Expose analytics API
    window.Analytics = {
      track: trackEvent, // Now sends to both GCP and Jitsu
      trackGCP: sendGCPData, // Direct GCP access if needed
      trackJitsu: sendJitsuData, // Direct Jitsu access if needed
      identify: identifyJitsu, // Manual identify trigger (accepts optional parameters)
      updateIdentity: (input) => {
        // Allow manual identity updates with email, phone, etc.
        // Can pass: { email, phone, ampDeviceId, clientId, traits }
        identifyJitsu(input);
      },
      getSessionId: getSessionId,
      getClientId: getClientId,
      getJitsuSessionId: getJitsuSessionId,
      ip_address: await getUserIP(),
    };

    window.analyticsTracker.initializeTracking();
  }

  // Expose initialization function
  window.initAnalytics = initAnalytics;

  // Auto-initialize if configuration is already present
  if (window.ANALYTICS_ENDPOINT) {
    initAnalytics();
  }
})();
