// Self-executing function to avoid global scope pollution
(function () {
  // Constants
  const ANALYTICS_ENDPOINT = window.ANALYTICS_ENDPOINT || null;

  // Utility functions
  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
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

  function parseCookies() {
    return document.cookie.split(";").reduce((cookies, cookie) => {
      const [name, value] = cookie.trim().split("=");
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
  }

  // Analytics sending function
  async function sendGCPData(eventName = "page_viewed", additionalData = {}) {
    if (!ANALYTICS_ENDPOINT || typeof window === "undefined") return;

    const cookies = parseCookies();
    const client_id = cookies["clientId"];
    const ga_cookie_id = cookies["_ga"];
    const fullstory_id = cookies["_fsuid"];
    const cart_id = cookies["cartId"];

    try {
      const event = {
        event_id: uuidv4(),
        event_name: eventName,
        event_type: "custom",
        client_id,
        session_id: getSessionId(),
        cart_token: cart_id,
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

  // Event Tracker Class
  class EventTracker {
    constructor() {
      this.startTime = Date.now();
      this.totalTimeOnPage = 0;
      this.isHidden = false;
      this.lastVisibilityChange = Date.now();
      this.maxScrollDepth = 0;
      this.scrollTimeout = null;

      this.initializeTracking();
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
        sendGCPData("page_hidden", {
          time_on_page: this.calculateTimeOnPage(),
        });
      } else {
        this.isHidden = false;
        this.lastVisibilityChange = Date.now();
        sendGCPData("page_visible", {
          time_on_page: this.calculateTimeOnPage(),
        });
      }
    }

    handleClick(event) {
      const clickedElement = event.target.closest("a");
      if (clickedElement) {
        sendGCPData("clicked", {
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
          sendGCPData("scroll_depth", {
            depth_percentage: scrollDepth,
            scroll_position: scrollPosition,
            time_on_page: this.calculateTimeOnPage(),
          });
        }
      }, 500);
    }

    initializeTracking() {
      // Track initial page view
      sendGCPData("page_viewed", {
        initial_referrer: document.referrer,
        page_title: document.title,
      });

      // Set up event listeners
      document.addEventListener("visibilitychange", () =>
        this.handleVisibilityChange()
      );
      document.addEventListener("click", (e) => this.handleClick(e));
      window.addEventListener("scroll", () => this.handleScroll());

      // Track time on page when leaving
      window.addEventListener("beforeunload", () => {
        const timeSpent = this.calculateTimeOnPage();
        sendGCPData("total_time_on_page", {
          duration_seconds: timeSpent,
          session_duration: Date.now() - this.startTime,
          max_scroll_depth: this.maxScrollDepth,
        });
      });
    }
  }

  // Initialize analytics
  function initAnalytics(config = {}) {
    // Merge provided config with defaults
    window.ANALYTICS_ENDPOINT = config.endpoint || window.ANALYTICS_ENDPOINT;

    // Initialize tracker
    window.analyticsTracker = new EventTracker();

    // Expose analytics API
    window.Analytics = {
      track: sendGCPData,
      getSessionId: getSessionId,
    };
  }

  // Expose initialization function
  window.initAnalytics = initAnalytics;

  // Auto-initialize if configuration is already present
  if (window.ANALYTICS_ENDPOINT) {
    initAnalytics();
  }
})();
