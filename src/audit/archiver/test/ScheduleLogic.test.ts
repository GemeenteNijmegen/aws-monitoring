import { ScheduleLogic } from '../ScheduleLogic';

describe('ScheduleLogic', () => {
  const baseTime = new Date('2024-01-15T14:30:00.000Z'); // Monday 2:30 PM

  describe('shouldProcessMessage', () => {
    test('processes recent message when triggered during working hours', () => {
      const logic = new ScheduleLogic(baseTime);
      const timestamp = new Date('2024-01-15T13:00:00.000Z'); // 1.5 hours ago

      expect(logic.shouldProcessMessage(timestamp)).toBe(true);
    });

    test('skips recent message when triggrered outside working hours', () => {
      const nightTime = new Date('2024-01-15T22:30:00.000Z'); // 10:30 PM
      const logic = new ScheduleLogic(nightTime);
      const timestamp = new Date('2024-01-15T21:00:00.000Z'); // 1.5 hours ago

      expect(logic.shouldProcessMessage(timestamp)).toBe(false);
    });

    test('processes old message when trigered at noon during working hours', () => {
      const noon = new Date('2024-01-15T12:30:00.000Z'); // 12:30
      const logic = new ScheduleLogic(noon);
      const timestamp = new Date('2024-01-14T09:15:00.000Z'); // Yesterday at 9
      expect(logic.isWorkingHours()).toBe(true);
      expect(logic.isNoon()).toBe(true);
      expect(logic.isLessThen24HoursOld(timestamp)).toBe(false);
      expect(logic.shouldProcessMessage(timestamp)).toBe(true);
    });

    test('skips old message when triggered outside working hours', () => {
      const nightTime = new Date('2024-01-15T22:30:00.000Z'); // 22:30
      const logic = new ScheduleLogic(nightTime);
      const timestamp = new Date('2024-01-14T14:00:00.000Z'); // Yesterday at 14

      expect(logic.shouldProcessMessage(timestamp)).toBe(false);
    });

    test('skips old message when triggered not at noon', () => {
      const notNoon = new Date('2024-01-15T10:00:00.000Z');
      const logic = new ScheduleLogic(notNoon);
      const timestamp = new Date('2024-01-14T09:00:00.000Z'); // Yesterday at 10
      expect(logic.isWorkingHours()).toBe(true);
      expect(logic.isNoon()).toBe(false);
      expect(logic.isLessThen24HoursOld(timestamp)).toBe(false);

      expect(logic.shouldProcessMessage(timestamp)).toBe(false);
    });
  });

  describe('isWorkingHours', () => {
    test('returns true at 8 AM', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T08:00:00.000Z'));
      expect(logic.isWorkingHours()).toBe(true);
    });

    test('returns true at 2 PM', () => {
      const logic = new ScheduleLogic(baseTime);
      expect(logic.isWorkingHours()).toBe(true);
    });

    test('returns true at 8 PM', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T20:00:00.000Z'));
      expect(logic.isWorkingHours()).toBe(true);
    });

    test('returns false at 7 AM', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T07:59:00.000Z'));
      expect(logic.isWorkingHours()).toBe(false);
    });

    test('returns false at 9 PM', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T21:00:00.000Z'));
      expect(logic.isWorkingHours()).toBe(false);
    });
  });

  describe('isLessThen24HoursOld', () => {
    test('returns true for message 1 hour ago', () => {
      const logic = new ScheduleLogic(baseTime);
      const timestamp = new Date('2024-01-15T13:30:00.000Z');
      expect(logic.isLessThen24HoursOld(timestamp)).toBe(true);
    });

    test('returns true for message exactly 24 hours ago', () => {
      const logic = new ScheduleLogic(baseTime);
      const timestamp = new Date('2024-01-14T14:30:00.000Z');
      expect(logic.isLessThen24HoursOld(timestamp)).toBe(true);
    });

    test('returns false for message 25 hours ago', () => {
      const logic = new ScheduleLogic(baseTime);
      const timestamp = new Date('2024-01-14T13:30:00.000Z');
      expect(logic.isLessThen24HoursOld(timestamp)).toBe(false);
    });
  });

  describe('isNearNoon', () => {
    test('returns true for 12.00', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T12:00:00.000Z'));
      expect(logic.isNoon()).toBe(true);
    });

    test('returns false for 11.59', () => {
      const logic = new ScheduleLogic(new Date('2024-01-11:59:00.000Z'));
      expect(logic.isNoon()).toBe(false);
    });

    test('returns true for 12.59', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T12:59:00.000Z'));
      expect(logic.isNoon()).toBe(true);
    });

    test('returns false for 13.00', () => {
      const logic = new ScheduleLogic(new Date('2024-01-15T13:00:00.000Z'));
      expect(logic.isNoon()).toBe(false);
    });
  });
});