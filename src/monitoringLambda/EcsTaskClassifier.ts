/** Scheduler startedBy prefixes that positively identify a Scheduled Task. */
export const SCHEDULER_PREFIXES = ['events-rule/', 'chronos-schedule/'];

export type EcsTaskType = 'service' | 'scheduled' | 'one-off';

/**
 * Classify an ECS task from its event detail.
 *
 * - service:*  group → Service Task
 * - known startedBy prefix → Scheduled Task
 * - family:*  with no known prefix → One-off Task (fail-safe: same handling as Scheduled)
 */
export function classifyEcsTask(detail: any): EcsTaskType {
  if (detail?.group?.startsWith('service:')) {
    return 'service';
  }
  const startedBy: string = detail?.startedBy ?? '';
  if (SCHEDULER_PREFIXES.some(prefix => startedBy.startsWith(prefix))) {
    return 'scheduled';
  }
  return 'one-off';
}
