"use client";

import { useEffect } from "react";
import { syncTrainingReminders } from "@/lib/native-reminders";

/**
 * In the iOS app, refreshes the training-day notifications each time the app opens, so they
 * follow changes made on the website (days, active split). Never asks for permission here.
 */
export function TrainingReminderSync({ userId }: { userId: string }) {
  useEffect(() => {
    void syncTrainingReminders(userId);
  }, [userId]);
  return null;
}
