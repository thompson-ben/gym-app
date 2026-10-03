/**
 * Starter splits offered on first run. Plain, widely used templates built only from catalogue
 * exercises; users can rename, reorder or replace anything afterwards. Targets are starting
 * points, not prescriptions.
 */
export type StarterExercise = { slug: string; sets: number; rep_min: number; rep_max: number; rest_seconds: number };
export type StarterPlan = {
  key: string;
  name: string;
  description: string;
  summary: string;
  workouts: { name: string; exercises: StarterExercise[] }[];
};

const ex = (slug: string, sets: number, rep_min: number, rep_max: number, rest_seconds: number): StarterExercise => ({ slug, sets, rep_min, rep_max, rest_seconds });

export const STARTERS: StarterPlan[] = [
  {
    key: "full-body",
    name: "Full Body (3 days)",
    description: "Two full-body workouts, alternated across three days a week. A starting point: edit anything.",
    summary: "3 days a week · 2 workouts · good for getting started",
    workouts: [
      {
        name: "Full Body A",
        exercises: [
          ex("back-squat", 3, 6, 10, 150),
          ex("barbell-bench-press", 3, 6, 10, 150),
          ex("seated-cable-row", 3, 8, 12, 120),
          ex("lying-leg-curl", 2, 10, 15, 90),
          ex("dumbbell-lateral-raise", 2, 12, 15, 60),
        ],
      },
      {
        name: "Full Body B",
        exercises: [
          ex("barbell-romanian-deadlift", 3, 6, 10, 150),
          ex("seated-dumbbell-shoulder-press", 3, 8, 12, 120),
          ex("lat-pulldown", 3, 8, 12, 120),
          ex("leg-press", 2, 10, 15, 120),
          ex("cable-curl", 2, 10, 15, 60),
        ],
      },
    ],
  },
  {
    key: "upper-lower",
    name: "Upper / Lower (4 days)",
    description: "Upper and lower body on alternating days, four days a week. A starting point: edit anything.",
    summary: "4 days a week · 4 workouts",
    workouts: [
      {
        name: "Upper A",
        exercises: [
          ex("barbell-bench-press", 3, 6, 10, 150),
          ex("barbell-row", 3, 6, 10, 150),
          ex("seated-dumbbell-shoulder-press", 2, 8, 12, 120),
          ex("lat-pulldown", 2, 8, 12, 120),
          ex("triceps-pushdown", 2, 10, 15, 60),
        ],
      },
      {
        name: "Lower A",
        exercises: [
          ex("back-squat", 3, 6, 10, 180),
          ex("barbell-romanian-deadlift", 3, 8, 10, 150),
          ex("leg-extension", 2, 10, 15, 90),
          ex("standing-calf-raise", 3, 10, 15, 60),
        ],
      },
      {
        name: "Upper B",
        exercises: [
          ex("incline-dumbbell-press", 3, 8, 12, 120),
          ex("chest-supported-machine-row", 3, 8, 12, 120),
          ex("cable-lateral-raise", 3, 12, 15, 60),
          ex("pull-up", 2, 6, 10, 120),
          ex("ez-bar-curl", 2, 10, 15, 60),
        ],
      },
      {
        name: "Lower B",
        exercises: [
          ex("leg-press", 3, 8, 12, 150),
          ex("lying-leg-curl", 3, 10, 15, 90),
          ex("bulgarian-split-squat", 2, 8, 12, 90),
          ex("seated-calf-raise", 3, 12, 15, 60),
        ],
      },
    ],
  },
  {
    key: "push-pull-legs",
    name: "Push / Pull / Legs",
    description: "Pushing, pulling and leg workouts in rotation, three or six days a week. A starting point: edit anything.",
    summary: "3–6 days a week · 3 workouts",
    workouts: [
      {
        name: "Push",
        exercises: [
          ex("barbell-bench-press", 3, 6, 10, 150),
          ex("seated-dumbbell-shoulder-press", 3, 8, 12, 120),
          ex("incline-dumbbell-press", 2, 8, 12, 120),
          ex("cable-lateral-raise", 3, 12, 15, 60),
          ex("triceps-pushdown", 2, 10, 15, 60),
        ],
      },
      {
        name: "Pull",
        exercises: [
          ex("lat-pulldown", 3, 8, 12, 120),
          ex("barbell-row", 3, 6, 10, 150),
          ex("face-pull", 2, 12, 15, 60),
          ex("ez-bar-curl", 2, 8, 12, 60),
          ex("hammer-curl", 2, 10, 15, 60),
        ],
      },
      {
        name: "Legs",
        exercises: [
          ex("back-squat", 3, 6, 10, 180),
          ex("barbell-romanian-deadlift", 3, 8, 10, 150),
          ex("leg-extension", 2, 10, 15, 90),
          ex("lying-leg-curl", 2, 10, 15, 90),
          ex("standing-calf-raise", 3, 10, 15, 60),
        ],
      },
    ],
  },
];
