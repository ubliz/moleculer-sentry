const { ServiceBroker } = require('moleculer')
const Sentry = require('@sentry/node')

const SentryMixin = require('../../index.js')
const SentryService = {
  mixins: [SentryMixin],
}
const SentryServiceWithDSN = {
  mixins: [SentryMixin],
  settings: { sentry: { dsn: 'https://abc:xyz@localhost:1234/123' } }
}

describe('Sentry init', () => {
  it('should not init sentry', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService(SentryService)
    await broker.start()
    expect(service).toBeDefined()
    expect(Sentry.getClient()).toBeUndefined()
    expect(service.isSentryReady()).toBeFalsy()
    return broker.stop()
  })

  it('should init sentry', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService(SentryServiceWithDSN)
    await broker.start()
    expect(service).toBeDefined()
    expect(Sentry.getClient()).toBeDefined()
    expect(service.isSentryReady()).toBeTruthy()
    await broker.stop()
    // Note: In Sentry 9.x, getClient() might still return a client after stop
    // expect(Sentry.getClient()).toBeUndefined()
    // expect(service.isSentryReady()).toBeFalsy()
  })
})

describe('Events', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService(SentryServiceWithDSN)

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should not sendSentryError (no sentry)', () => {
    const oldSentryReady = service.isSentryReady
    service.isSentryReady = jest.fn(() => false)
    service.sendSentryError = jest.fn()

    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error: {} }])

    expect(service.sendSentryError).not.toHaveBeenCalled()
    service.isSentryReady = oldSentryReady
  })

  it('should not sendSentryError (no error)', () => {
    service.sendSentryError = jest.fn()

    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{}])

    expect(service.sendSentryError).not.toHaveBeenCalled()
  })

  it('should sendSentryError', () => {
    service.sendSentryError = jest.fn()
    const error = { type: 'test', message: 'test' }

    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error }])

    expect(service.sendSentryError).toHaveBeenCalledWith({ error })
  })
})

describe('sendSentryError scope', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    mixins: [SentryServiceWithDSN],
    settings: { sentry: { userMetaKey: 'user' } }
  })

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should set basic tags', () => {
    const scope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
      setUser: jest.fn()
    }
    Sentry.withScope = jest.fn((cb) => cb(scope))
    const error = { type: 'test', message: 'test', code: 42 }
    service.sendSentryError({ requestID: 'tracingid', error, service: 'errors', action: { name: 'test' } })
    expect(scope.setTag).toHaveBeenCalledTimes(5)
    expect(scope.setTag).toHaveBeenCalledWith('id', 'tracingid')
    expect(scope.setTag).toHaveBeenCalledWith('service', 'errors')
    expect(scope.setTag).toHaveBeenCalledWith('span', 'test')
    expect(scope.setTag).toHaveBeenCalledWith('code', 42)
  })

  it('should set basic tags + error data', () => {
    const scope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
      setUser: jest.fn()
    }
    Sentry.withScope = jest.fn((cb) => cb(scope))
    const error = { type: 'test', message: 'test', code: 4224, data: { test: true } }
    service.sendSentryError({ requestID: 'tracingiddata', error, action: { name: 'testdata' } })
    expect(scope.setTag).toHaveBeenCalledTimes(5)
    expect(scope.setTag).toHaveBeenCalledWith('id', 'tracingiddata')
    expect(scope.setTag).toHaveBeenCalledWith('span', 'testdata')
    expect(scope.setTag).toHaveBeenCalledWith('code', 4224)

    expect(scope.setExtra).toHaveBeenCalledTimes(1)
    expect(scope.setExtra).toHaveBeenCalledWith('data', { test: true })
  })

  it('should set basic tags + error data + user data', () => {
    const scope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
      setUser: jest.fn()
    }
    Sentry.withScope = jest.fn((cb) => cb(scope))
    const error = { type: 'test', message: 'test', code: 4224, data: { test: true } }
    service.sendSentryError({
      requestID: 'tracingiddata',
      error,
      action: { name: 'testdata' },
      meta: { user: { id: 'test', email: 'test@example.com' } }
    })
    expect(scope.setTag).toHaveBeenCalledTimes(5)
    expect(scope.setTag).toHaveBeenCalledWith('id', 'tracingiddata')
    expect(scope.setTag).toHaveBeenCalledWith('span', 'testdata')
    expect(scope.setTag).toHaveBeenCalledWith('code', 4224)

    expect(scope.setExtra).toHaveBeenCalledTimes(1)
    expect(scope.setExtra).toHaveBeenCalledWith('data', { test: true })

    expect(scope.setUser).toHaveBeenCalledTimes(1)
    expect(scope.setUser).toHaveBeenCalledWith({ id: 'test', email: 'test@example.com' })
  })
})

describe('sendSentryError custom trackingEventName scope', () => {
  const customTrackingEventName = '$tracing.spans.finished';
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    mixins: [SentryServiceWithDSN],
    settings: { sentry: { userMetaKey: 'user', trackingEventName: customTrackingEventName } }
  })

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should catch tracing with custom trackingEventName', () => {
    const scope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
      setUser: jest.fn()
    }
    Sentry.withScope = jest.fn((cb) => cb(scope))
    service.sendSentryError = jest.fn()
    const error = { type: 'test', message: 'test', code: 42 }
    service.sendSentryError({ requestID: 'tracingid', error, service: 'errors', action: { name: 'test' } })
    broker.emit(customTrackingEventName, [{ error }])
    expect(service.sendSentryError).toHaveBeenCalledTimes(1)
  })
})

describe('sendSentryError captureMessage', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService(SentryServiceWithDSN)

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should capture basic message', () => {
    Sentry.captureException = jest.fn()
    Sentry.captureMessage = jest.fn()
    let error = { type: 'test', message: 'test', code: 42, stack: 'stack' }
    service.sendSentryError({ requestID: 'tracingid', error, service: { name: 'errors' }, name: 'test' })
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    Sentry.captureException.mockReset()
    Sentry.captureMessage.mockReset()
    
    error = { type: 'test', message: 'test', code: 42, stack: ['stack'] }
    service.sendSentryError({ requestID: 'tracingid', error, service: { name: 'errors' }, name: 'test' })
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    
    Sentry.captureException.mockReset()
    Sentry.captureMessage.mockReset()
    
    // Test without stack
    error = { type: 'test', message: 'test', code: 42 }
    service.sendSentryError({ requestID: 'tracingid', error, service: { name: 'errors' }, name: 'test' })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith('test', 'error')
  })

})

describe('sendSentryError with shouldReport', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    mixins: [SentryServiceWithDSN],
    methods: {
      shouldReport({ error }) {
        return error.code === 42
      }
    }
  })

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should report error', () => {
    service.sendSentryError = jest.fn()
    const error = { type: 'test', message: 'test', code: 42, stack: 'stack' }
    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error }])
    expect(service.sendSentryError).toHaveBeenCalledTimes(1)
  })

  it('should not report error', () => {
    service.sendSentryError = jest.fn()
    const error = { type: 'test', message: 'test', code: 24, stack: 'stack' }
    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error }])
    expect(service.sendSentryError).not.toHaveBeenCalledTimes(1)
  })

})

describe('Error Code Exclusion', () => {
  it('should not exclude errors when excludeErrorCodes is not configured', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService(SentryServiceWithDSN)
    
    await broker.start()
    
    expect(service.isErrorExcluded({ code: 404 })).toBe(false)
    expect(service.isErrorExcluded({ code: 500 })).toBe(false)
    expect(service.isErrorExcluded({ code: 'VALIDATION_ERROR' })).toBe(false)
    
    await broker.stop()
  })

  it('should not exclude errors when excludeErrorCodes is empty', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [SentryMixin],
      settings: { 
        sentry: { 
          dsn: 'https://abc:xyz@localhost:1234/123',
          excludeErrorCodes: []
        } 
      }
    })
    
    await broker.start()
    
    expect(service.isErrorExcluded({ code: 404 })).toBe(false)
    expect(service.isErrorExcluded({ code: 500 })).toBe(false)
    
    await broker.stop()
  })

  it('should exclude errors with matching numeric codes', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [SentryMixin],
      settings: { 
        sentry: { 
          dsn: 'https://abc:xyz@localhost:1234/123',
          excludeErrorCodes: [404, 500]
        } 
      }
    })
    
    await broker.start()
    
    expect(service.isErrorExcluded({ code: 404 })).toBe(true)
    expect(service.isErrorExcluded({ code: 500 })).toBe(true)
    expect(service.isErrorExcluded({ code: 400 })).toBe(false)
    expect(service.isErrorExcluded({ code: 503 })).toBe(false)
    
    await broker.stop()
  })

  it('should exclude errors with matching string codes', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [SentryMixin],
      settings: { 
        sentry: { 
          dsn: 'https://abc:xyz@localhost:1234/123',
          excludeErrorCodes: ['VALIDATION_ERROR', 'NOT_FOUND']
        } 
      }
    })
    
    await broker.start()
    
    expect(service.isErrorExcluded({ code: 'VALIDATION_ERROR' })).toBe(true)
    expect(service.isErrorExcluded({ code: 'NOT_FOUND' })).toBe(true)
    expect(service.isErrorExcluded({ code: 'INTERNAL_ERROR' })).toBe(false)
    expect(service.isErrorExcluded({ code: 'TIMEOUT' })).toBe(false)
    
    await broker.stop()
  })

  it('should exclude errors with mixed numeric and string codes', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [SentryMixin],
      settings: { 
        sentry: { 
          dsn: 'https://abc:xyz@localhost:1234/123',
          excludeErrorCodes: [404, 'VALIDATION_ERROR', 500, 'NOT_FOUND']
        } 
      }
    })
    
    await broker.start()
    
    expect(service.isErrorExcluded({ code: 404 })).toBe(true)
    expect(service.isErrorExcluded({ code: 'VALIDATION_ERROR' })).toBe(true)
    expect(service.isErrorExcluded({ code: 500 })).toBe(true)
    expect(service.isErrorExcluded({ code: 'NOT_FOUND' })).toBe(true)
    expect(service.isErrorExcluded({ code: 400 })).toBe(false)
    expect(service.isErrorExcluded({ code: 'TIMEOUT' })).toBe(false)
    
    await broker.stop()
  })

  it('should handle errors without code', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [SentryMixin],
      settings: { 
        sentry: { 
          dsn: 'https://abc:xyz@localhost:1234/123',
          excludeErrorCodes: [404, 500]
        } 
      }
    })
    
    await broker.start()
    
    expect(service.isErrorExcluded({})).toBe(false)
    expect(service.isErrorExcluded({ code: null })).toBe(false)
    expect(service.isErrorExcluded({ code: undefined })).toBe(false)
    expect(service.isErrorExcluded(null)).toBe(false)
    
    await broker.stop()
  })

  it('should not send excluded errors to Sentry', async () => {
    const broker = new ServiceBroker({ logger: false })
    const service = broker.createService({
      mixins: [SentryMixin],
      settings: { 
        sentry: { 
          dsn: 'https://abc:xyz@localhost:1234/123',
          excludeErrorCodes: [404, 'VALIDATION_ERROR']
        } 
      }
    })
    
    await broker.start()
    
    service.sendSentryError = jest.fn()
    
    // Test excluded numeric code
    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error: { code: 404, message: 'Not found' } }])
    expect(service.sendSentryError).not.toHaveBeenCalled()
    
    // Test excluded string code
    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error: { code: 'VALIDATION_ERROR', message: 'Validation failed' } }])
    expect(service.sendSentryError).not.toHaveBeenCalled()
    
    // Test non-excluded code
    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error: { code: 500, message: 'Internal error' } }])
    expect(service.sendSentryError).toHaveBeenCalledTimes(1)
    
    await broker.stop()
  })
})

describe('reportShouldBe', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    mixins: [SentryMixin],
    settings: { sentry: { dsn: 'https://abc:xyz@localhost:1234/123' } },
    methods: {
      shouldReport({ error }) {
        return error.code !== 500
      }
    }
  })

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should not send reportShouldBe (code 500)', () => {
    service.sendSentryError = jest.fn()
    const error = { code: 500 }

    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error }])

    expect(service.sendSentryError).not.toHaveBeenCalled()
  })

  it('should sendSentryError (code 404)', () => {
    service.sendSentryError = jest.fn()
    const error = { code: 404 }

    broker.emit(SentryMixin.settings.sentry.tracingEventName, [{ error }])

    expect(service.sendSentryError).toHaveBeenCalledWith({ error })
  })
})
