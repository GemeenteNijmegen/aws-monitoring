

export class ScheduleLogic {

  constructor(private readonly now: Date = new Date()) {
  }

  shouldProcessMessage(timestamp: Date) {
    const isWorkingHours = this.isWorkingHours();
    const isLessThen24HoursOld = this.isLessThen24HoursOld(timestamp);
    const isNearNoon = this.isNoon();
    return isWorkingHours && (isLessThen24HoursOld || isNearNoon);
  }


  isWorkingHours() {
    return 8 <= this.now.getUTCHours() && this.now.getUTCHours() <= 20;
  }

  isLessThen24HoursOld(timestamp: Date) {
    const messageAge = this.now.getTime() - timestamp.getTime();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    return messageAge <= oneDay;
  }

  isNoon() {
    const hoursSinceLastMidnight = this.now.getUTCHours();
    return hoursSinceLastMidnight === 12;
  }

}