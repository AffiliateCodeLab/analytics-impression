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
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
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

  // Analytics sending function
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

      // Remove response status check as GCP return status 0
      // if (!response.ok) {
      //   throw new Error(`HTTP error! status: ${response.status}`);
      // }
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
      this.impressionObserver = null;
      this.trackedImpressions = new WeakSet(); // Using WeakSet to track DOM elements
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

    initializeImpressionTracking(selectors, options = {}) {
      const defaultOptions = {
        threshold: 0.25, // 25% visibility required by default
        trackOnce: true, // Only track first impression by default
      };

      const config = { ...defaultOptions, ...options };

      this.impressionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            // Skip if already tracked and trackOnce is true
            if (config.trackOnce && this.trackedImpressions.has(entry.target)) {
              return;
            }

            if (entry.isIntersecting) {
              if (config.trackOnce) {
                this.trackedImpressions.add(entry.target);
              }

              sendGCPData("component_impression", {
                component_type: this.getMatchedSelectors(
                  entry.target,
                  selectors
                ),
                visibility_percentage: Math.round(
                  entry.intersectionRatio * 100
                ),
                time_on_page: this.calculateTimeOnPage(),
                viewport_data: {
                  boundingClientRect: entry.boundingClientRect,
                  intersectionRect: entry.intersectionRect,
                  rootBounds: entry.rootBounds,
                },
                component_metadata: {
                  classes: entry.target.className,
                  tag_name: entry.target.tagName.toLowerCase(),
                  data_attributes: this.getDataAttributes(entry.target),
                  text_content: entry.target.textContent
                    ?.trim()
                    .substring(0, 100), // First 100 chars
                  position: this.getElementPosition(entry.target),
                },
              });

              // If tracking once, stop observing after first impression
              if (config.trackOnce) {
                this.impressionObserver.unobserve(entry.target);
              }
            }
          });
        },
        {
          threshold: config.threshold,
          rootMargin: options.rootMargin || "0px",
        }
      );

      // Handle multiple selectors
      const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

      // Combine all selectors and get unique elements
      const elements = new Set();
      selectorArray.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          elements.add(element);
        });
      });

      // Start observing all matching elements
      elements.forEach((element) => {
        this.impressionObserver.observe(element);
      });
    }

    getMatchedSelectors(element, selectors) {
      const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
      return selectorArray
        .filter((selector) => element.matches(selector))
        .map((selector) => selector.replace(".", "")); // Remove the dot from class names
    }

    getElementPosition(element) {
      const rect = element.getBoundingClientRect();
      const scrollLeft =
        window.pageXOffset || document.documentElement.scrollLeft;
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;

      return {
        x: rect.left + scrollLeft,
        y: rect.top + scrollTop,
        width: rect.width,
        height: rect.height,
        viewport_x: rect.left,
        viewport_y: rect.top,
      };
    }

    getDataAttributes(element) {
      const dataAttributes = {};
      for (const key in element.dataset) {
        dataAttributes[key] = element.dataset[key];
      }
      return dataAttributes;
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
        if (this.impressionObserver) {
          this.impressionObserver.disconnect();
        }
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
  async function initAnalytics(config = {}) {
    // Merge provided config with defaults
    window.ANALYTICS_ENDPOINT = config.endpoint || window.ANALYTICS_ENDPOINT;
    // Initialize tracker
    window.analyticsTracker = new EventTracker();

    // Expose analytics API
    window.Analytics = {
      track: sendGCPData,
      getSessionId: getSessionId,
      getClientId: getClientId,
      ip_address: await getUserIP(),
      trackImpressions: (selectors, options) => {
        window.analyticsTracker.initializeImpressionTracking(
          selectors,
          options
        );
      },
    };

    window.analyticsTracker.initializeTracking();
  }

  // Expose initialization function
  window.initAnalytics = initAnalytics;

  document.addEventListener("DOMContentLoaded", async () => {
    if (window?.ANALYTICS_ENDPOINT) {
      await initAnalytics();
      if (window?.IMPRESSION_CONFIG) {
        window.analyticsTracker.initializeImpressionTracking(
          window?.IMPRESSION_CONFIG?.selectors,
          window?.IMPRESSION_CONFIG?.options
        );
      }
    }
  });
})();
