/*
 * moleculer-sentry
 * Copyright (c) 2022 LuxChan S.A R.L.-S (https://github.com/LuxChanLu/moleculer-sentry)
 * MIT Licensed
 */

'use strict'

const Sentry = require('@sentry/node')

module.exports = {
  name: 'sentry',

  /**
   * Default settings
   */
  settings: {
    /** @type {Object?} Sentry configuration wrapper. */
    sentry: {
      /** @type {String} DSN given by sentry. */
      dsn: null,
      /** @type {String} Name of event fired by "Event" exported in tracing. */
      tracingEventName: '$tracing.spans',
      /** @type {Object} Additional options for `Sentry.init`. */
      options: {},
      /** @type {String?} Name of the meta containing user infos. */
      userMetaKey: null,
      /** @type {Array<Number|String>?} Array of error codes to exclude from reporting. */
      excludeErrorCodes: null,
    }
  },

  /**
   * Events
   */
  events: {
    // bind event listeners
    '**'(payload, _, event) {
      // only listen to specifig tracing event
      if (event !== this.settings.sentry.tracingEventName) {
        return
      }

      this.onTracingEvent(payload)
    },
  },

  /**
   * Methods
   */
  methods: {
    /**
     * Get service name from metric event (Imported from moleculer-jaeger)
     *
     * @param {Object} metric
     * @returns {String}
     */
    getServiceName(metric) {
      if (!metric.service && metric.action) {
        const parts = metric.action.name.split('.')
        parts.pop()
        return parts.join('.')
      }
      return metric.service && metric.service.name ? metric.service.name : metric.service
    },

    /**
     * Get span name from metric event. By default it returns the action name (Imported from moleculer-jaeger)
     *
     * @param {Object} metric
     * @returns  {String}
     */
    getSpanName(metric) {
      return metric.action ? metric.action.name : metric.name
    },

    /**
     * Get object key under which user is stored in service meta
     *
     * @returns  {String}
     */
    getUserMetaKey() {
      return this.settings.sentry.userMetaKey
    },

    /**
     * Check if an error should be excluded based on its code
     *
     * @param {Object} error
     * @returns {Boolean}
     */
    isErrorExcluded(error) {
      const excludeErrorCodes = this.settings.sentry.excludeErrorCodes
      
      if (!excludeErrorCodes || !Array.isArray(excludeErrorCodes) || excludeErrorCodes.length === 0) {
        return false
      }

      if (!error || error.code === undefined || error.code === null) {
        return false
      }

      return excludeErrorCodes.includes(error.code)
    },

    /**
     * We need to normalize the stack trace, since Sentry will throw an error unless it's a valid raw stack trace
     *
     * @param stack
     * @returns {null|*[]|*}
     */
    getNormalizedStackTrace(stack) {
      // empty stack trace is not parseable by sentry,
      if (!stack) {
        return null
      }

      // if stacktrace is present as a string, wrap it into an array
      if (!Array.isArray(stack)) {
        return [stack];
      }

      return stack;
    },

    /**
     * Send error to sentry, based on the metric error
     *
     * @param {Object} metric
     */
    sendSentryError(metric) {
      Sentry.withScope((scope) => {
        scope.setTag('id', metric.requestID)
        scope.setTag('service', this.getServiceName(metric))
        scope.setTag('span', this.getSpanName(metric))
        scope.setTag('type', metric.error.type)
        scope.setTag('code', metric.error.code)

        if (metric.error.data) {
          scope.setExtra('data', metric.error.data)
        }

        const userMetaKey = this.getUserMetaKey()

        if (userMetaKey && metric.meta && metric.meta[userMetaKey]) {
          scope.setUser(metric.meta[userMetaKey])
        }

        // In Sentry 9.x, we should use captureException for errors with stack traces
        // or captureMessage for simple messages
        const error = new Error(metric.error.message)
        error.name = metric.error.name;
        if (metric.error.stack) {
          error.stack = Array.isArray(metric.error.stack) 
            ? metric.error.stack.join('\n') 
            : metric.error.stack
        }
        Sentry.captureException(error)
      })
    },

    /**
     * Check if sentry is configured or not
     */
    isSentryReady() {
      return Sentry.getClient() !== undefined
    },

    /**
     * Get the Sentry instance for other mixins to use
     * 
     * @returns {Object} The Sentry instance
     */
    getSentryInstance() {
      return Sentry;
    },

    /**
     * Tracing event handler
     *
     * @param metrics
     * @return void
     */
    onTracingEvent(metrics) {
      metrics.forEach((metric) => {
        if (metric.error && this.isSentryReady() && !this.isErrorExcluded(metric.error) && (!this.shouldReport || this.shouldReport(metric) == true)) {
          this.sendSentryError(metric)
        }
      })
    }
  },

  async created() {
    const dsn = this.settings.sentry.dsn
    const options = this.settings.sentry.options
    if (dsn) {
      await Sentry.init({ dsn, ...options })
    }
  },

  async stopped() {
    if (this.isSentryReady()) {
      await Sentry.flush()
      // In Sentry 9.x, we can use close() instead of manually clearing the global object
      await Sentry.close()
    }
  }
}
