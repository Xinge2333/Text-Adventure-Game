import winston from 'winston';
import type { AppConfig } from '../config';

export type TelemetryOutcome = 'success' | 'handled_error' | 'moderated';

export interface TurnTelemetry {
  sessionIdHash: string;
  themeId: string;
  turnIndex: number;
  latencyMs: number;
  outcome: TelemetryOutcome;
  timestamp: string;
}

export interface RecommendationTelemetry {
  userIdHash: string;
  themeId: string;
  action: 'exposure' | 'click' | 'skip';
  recSetId?: string;
  position?: number;
  reason?: string;
  timestamp: string;
}

export interface TelemetryClient {
  recordTurn(telemetry: TurnTelemetry): Promise<void>;
  recordRecommendation(telemetry: RecommendationTelemetry): Promise<void>;
}

class NoopTelemetry implements TelemetryClient {
  async recordTurn(): Promise<void> {
    // no-op when telemetry disabled
  }

  async recordRecommendation(): Promise<void> {
    // no-op when telemetry disabled
  }
}

class HttpTelemetry implements TelemetryClient {
  constructor(private readonly endpoint: string, private readonly logger: winston.Logger) {}

  async recordTurn(telemetry: TurnTelemetry): Promise<void> {
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'turn', ...telemetry })
      });
      this.logger.info('turn-telemetry', telemetry);
    } catch (error) {
      this.logger.warn('telemetry-submit-failed', { error: (error as Error).message, telemetry });
    }
  }

  async recordRecommendation(telemetry: RecommendationTelemetry): Promise<void> {
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'recommendation', ...telemetry })
      });
      this.logger.info('recommendation-telemetry', telemetry);
    } catch (error) {
      this.logger.warn('telemetry-submit-failed', { error: (error as Error).message, telemetry });
    }
  }
}

let client: TelemetryClient | null = null;
let logger: winston.Logger | null = null;

const createLogger = () => {
  if (logger) return logger;
  logger = winston.createLogger({
    level: 'info',
    transports: [new winston.transports.Console({})],
    format: winston.format.combine(winston.format.timestamp(), winston.format.json())
  });
  return logger;
};

export const configureTelemetry = (appConfig: AppConfig) => {
  if (client) return;
  const telemetryLogger = createLogger();
  if (!appConfig.telemetry.enabled) {
    client = new NoopTelemetry();
    telemetryLogger.info('telemetry-disabled');
    return;
  }
  client = new HttpTelemetry(appConfig.telemetry.endpoint, telemetryLogger);
  telemetryLogger.info('telemetry-configured', {
    endpoint: appConfig.telemetry.endpoint,
    sla: {
      latencyP95Ms: 2000,
      errorRate: '<1%'
    }
  });
};

export const getTelemetryClient = (): TelemetryClient => {
  if (!client) {
    client = new NoopTelemetry();
  }
  return client;
};

export const resetTelemetryClient = () => {
  client = null;
};
