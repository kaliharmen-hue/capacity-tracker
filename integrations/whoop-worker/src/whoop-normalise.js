const minutes = (value) => typeof value === 'number' && Number.isFinite(value) ? value / 60000 : null;

export function sleepDetails(sleep) {
  const score = sleep.score_state && sleep.score_state !== 'SCORED' ? null : sleep.score;
  const stages = score?.stage_summary;
  const need = score?.sleep_needed;
  const remSleepMinutes = minutes(stages?.total_rem_sleep_time_milli);
  const deepSleepMinutes = minutes(stages?.total_slow_wave_sleep_time_milli);
  const lightSleepMinutes = minutes(stages?.total_light_sleep_time_milli);
  const components = [need?.baseline_milli, need?.need_from_sleep_debt_milli, need?.need_from_recent_strain_milli, need?.need_from_recent_nap_milli];
  return {
    sleepScoreState: sleep.score_state ?? null,
    sleepHours: [remSleepMinutes, deepSleepMinutes, lightSleepMinutes].every(value => value !== null)
      ? (remSleepMinutes + deepSleepMinutes + lightSleepMinutes) / 60 : null,
    remSleepMinutes,
    deepSleepMinutes,
    lightSleepMinutes,
    awakeMinutes: minutes(stages?.total_awake_time_milli),
    timeInBedMinutes: minutes(stages?.total_in_bed_time_milli),
    noDataMinutes: minutes(stages?.total_no_data_time_milli),
    sleepCycleCount: stages?.sleep_cycle_count ?? null,
    // WHOOP reports need before this sleep, not debt remaining after waking.
    sleepDebtMinutes: minutes(need?.need_from_sleep_debt_milli),
    sleepNeedBaselineMinutes: minutes(need?.baseline_milli),
    sleepNeedFromStrainMinutes: minutes(need?.need_from_recent_strain_milli),
    sleepNeedFromNapMinutes: minutes(need?.need_from_recent_nap_milli),
    sleepNeededMinutes: components.every(value => typeof value === 'number' && Number.isFinite(value))
      ? minutes(components.reduce((sum, value) => sum + value, 0)) : null
  };
}

export function workoutDetails(workout) {
  const score = workout.score_state && workout.score_state !== 'SCORED' ? null : workout.score;
  const zones = ['zero', 'one', 'two', 'three', 'four', 'five'];
  return {
    scoreState: workout.score_state ?? null,
    kilojoule: score?.kilojoule ?? null,
    percentRecorded: score?.percent_recorded ?? null,
    distanceMeters: score?.distance_meter ?? null,
    altitudeGainMeters: score?.altitude_gain_meter ?? null,
    altitudeChangeMeters: score?.altitude_change_meter ?? null,
    zoneDurationMinutes: Object.fromEntries(zones.map((zone, index) => [String(index), minutes(score?.zone_durations?.[`zone_${zone}_milli`])]))
  };
}
