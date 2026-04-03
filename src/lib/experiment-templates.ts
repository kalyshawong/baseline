export interface ExperimentTemplate {
  title: string;
  hypothesis: string;
  independentVariable: string;
  dependentVariable: string;
  dependentMetric: string;
  metricSource: string;
  lagDays: number;
  minDays: number;
}

export const experimentTemplates: ExperimentTemplate[] = [
  {
    title: "Lo-fi music & deep sleep",
    hypothesis: "Listening to lo-fi music in the 30 minutes before bed increases deep sleep duration",
    independentVariable: "Lo-fi music before bed",
    dependentVariable: "Deep sleep duration",
    dependentMetric: "deepSleepDuration",
    metricSource: "DailySleep",
    lagDays: 0,
    minDays: 14,
  },
  {
    title: "Box breathing & resting HR",
    hypothesis: "5 minutes of box breathing before stressful events reduces resting heart rate",
    independentVariable: "Box breathing session",
    dependentVariable: "Lowest heart rate",
    dependentMetric: "lowestHeartRate",
    metricSource: "DailySleep",
    lagDays: 0,
    minDays: 14,
  },
  {
    title: "Morning sunlight & HRV",
    hypothesis: "15+ minutes of morning sunlight within 1 hour of waking improves next-night HRV",
    independentVariable: "Morning sunlight exposure",
    dependentVariable: "Average HRV",
    dependentMetric: "averageHrv",
    metricSource: "DailySleep",
    lagDays: 1,
    minDays: 14,
  },
  {
    title: "Caffeine timing & deep sleep",
    hypothesis: "Consuming caffeine after 2 PM reduces deep sleep duration that night",
    independentVariable: "Afternoon caffeine",
    dependentVariable: "Deep sleep duration",
    dependentMetric: "deepSleepDuration",
    metricSource: "DailySleep",
    lagDays: 0,
    minDays: 14,
  },
  {
    title: "Meditation & readiness",
    hypothesis: "Evening meditation improves next-day Oura readiness score",
    independentVariable: "Evening meditation",
    dependentVariable: "Readiness score",
    dependentMetric: "score",
    metricSource: "DailyReadiness",
    lagDays: 1,
    minDays: 14,
  },
];
