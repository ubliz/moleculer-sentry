import { ServiceSchema, Context } from 'moleculer';

export interface SentrySettings {
  sentry: {
    /** DSN given by sentry */
    dsn: string | null;
    /** Name of event fired by "Event" exported in tracing */
    tracingEventName: string;
    /** Additional options for Sentry.init */
    options: Record<string, any>;
    /** Name of the meta containing user infos */
    userMetaKey: string | null;
  };
}

export interface SentryMixin extends ServiceSchema {
  name: 'sentry';
  settings: SentrySettings;
  events: {
    '**'(payload: any, sender: string, event: string): void;
  };
  methods: {
    getServiceName(metric: any): string;
    getSpanName(metric: any): string;
    getUserMetaKey(): string | null;
    getNormalizedStackTrace(stack: any): string[] | null;
    sendSentryError(metric: any): void;
    isSentryReady(): boolean;
    onTracingEvent(metrics: any[]): void;
    shouldReport?(metric: any): boolean;
  };
  started(): void;
  stopped(): Promise<void>;
}

declare const sentryMixin: SentryMixin;
export = sentryMixin;