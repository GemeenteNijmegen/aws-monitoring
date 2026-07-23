import * as https from 'https';

export interface ClockDriftResult {
  /**
   * Milliseconds the lambda's own clock is ahead (positive) or behind
   * (negative) the reference time obtained over HTTPS. This is the
   * authoritative measurement an alert margin should be checked against.
   */
  driftMs: number;
  /**
   * Milliseconds the lambda's own clock differs from the time EventBridge
   * stamped on the triggering schedule event (if provided). This is a free
   * (no extra network call) diagnostic signal, useful to corroborate the
   * HTTPS-based measurement in case that measurement itself turns out to be
   * unreliable (e.g. a network hiccup) - the execution context's own clock
   * can't be trusted to judge that on its own.
   */
  eventBridgeDriftMs?: number;
  /**
   * The host that was queried for the reference time.
   */
  referenceHost: string;
}

export type ReferenceTimeFetcher = (host: string) => Promise<Date>;

/**
 * Default reference time fetcher: performs a HEAD request to a regional AWS
 * endpoint and reads the `Date` response header.
 *
 * AWS endpoints always return this header (even on an unauthenticated
 * request), AWS's edge infrastructure is NTP-synced, and this requires no
 * authentication, no extra IAM permission and no new dependency - making it
 * a reliable, self-contained "ground truth" clock to compare against.
 */
export function fetchReferenceTimeOverHttps(host: string): Promise<Date> {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, method: 'HEAD', path: '/', timeout: 5000 }, (res) => {
      res.resume(); // discard body, we only need the headers
      const header = res.headers.date;
      if (!header) {
        reject(new Error(`No Date header in response from ${host}`));
        return;
      }
      resolve(new Date(header));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timed out fetching reference time from ${host}`)));
    req.end();
  });
}

export interface CheckClockDriftProps {
  /**
   * Hostname of the AWS endpoint used as a time reference,
   * e.g. `sts.eu-central-1.amazonaws.com`.
   */
  referenceHost: string;
  /**
   * ISO8601 timestamp EventBridge stamped on the triggering event (`event.time`),
   * used for the free `eventBridgeDriftMs` diagnostic signal.
   * @default none, eventBridgeDriftMs is omitted
   */
  eventTime?: string;
  /**
   * Injectable for testing.
   * @default fetchReferenceTimeOverHttps
   */
  fetchReferenceTime?: ReferenceTimeFetcher;
  /**
   * Injectable for testing.
   * @default Date.now
   */
  now?: () => number;
}

/**
 * Compares this lambda's own execution-context clock (`Date.now()`) against
 * an independent reference time, to detect clock drift like the one that
 * caused a JWT `iat` claim to be ~20 minutes off from real time.
 */
export async function checkClockDrift(props: CheckClockDriftProps): Promise<ClockDriftResult> {
  const now = props.now ?? Date.now;
  const fetchReferenceTime = props.fetchReferenceTime ?? fetchReferenceTimeOverHttps;

  const before = now();
  const referenceTime = await fetchReferenceTime(props.referenceHost);
  const after = now();

  // The midpoint of before/after approximates the local time at the moment
  // the reference timestamp was captured, cancelling out (symmetric) network latency.
  const localTimeAtMeasurement = (before + after) / 2;
  const driftMs = Math.round(localTimeAtMeasurement - referenceTime.getTime());

  let eventBridgeDriftMs: number | undefined;
  if (props.eventTime) {
    eventBridgeDriftMs = Math.round(now() - new Date(props.eventTime).getTime());
  }

  return { driftMs, eventBridgeDriftMs, referenceHost: props.referenceHost };
}
