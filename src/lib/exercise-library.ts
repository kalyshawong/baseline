export interface ExerciseSeed {
  name: string;
  muscleGroup: string;
  secondaryMuscle?: string;
  movementPattern: string;
  equipment: string;
  isCompound: boolean;
  defaultSets: number;
  defaultReps: number;
}

export const exerciseLibrary: ExerciseSeed[] = [
  // --- Barbell compounds ---
  { name: "Back Squat", muscleGroup: "quads", secondaryMuscle: "glutes", movementPattern: "squat", equipment: "barbell", isCompound: true, defaultSets: 4, defaultReps: 5 },
  { name: "Front Squat", muscleGroup: "quads", movementPattern: "squat", equipment: "barbell", isCompound: true, defaultSets: 4, defaultReps: 5 },
  { name: "Conventional Deadlift", muscleGroup: "hamstrings", secondaryMuscle: "back", movementPattern: "hinge", equipment: "barbell", isCompound: true, defaultSets: 3, defaultReps: 5 },
  { name: "Sumo Deadlift", muscleGroup: "quads", secondaryMuscle: "glutes", movementPattern: "hinge", equipment: "barbell", isCompound: true, defaultSets: 3, defaultReps: 5 },
  { name: "Romanian Deadlift", muscleGroup: "hamstrings", secondaryMuscle: "glutes", movementPattern: "hinge", equipment: "barbell", isCompound: true, defaultSets: 3, defaultReps: 8 },
  { name: "Bench Press", muscleGroup: "chest", secondaryMuscle: "triceps", movementPattern: "push", equipment: "barbell", isCompound: true, defaultSets: 4, defaultReps: 5 },
  { name: "Incline Bench Press", muscleGroup: "chest", secondaryMuscle: "shoulders", movementPattern: "push", equipment: "barbell", isCompound: true, defaultSets: 3, defaultReps: 8 },
  { name: "Overhead Press", muscleGroup: "shoulders", secondaryMuscle: "triceps", movementPattern: "push", equipment: "barbell", isCompound: true, defaultSets: 4, defaultReps: 5 },
  { name: "Barbell Row", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "barbell", isCompound: true, defaultSets: 4, defaultReps: 8 },
  { name: "Pendlay Row", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "barbell", isCompound: true, defaultSets: 4, defaultReps: 5 },
  { name: "Hip Thrust", muscleGroup: "glutes", secondaryMuscle: "hamstrings", movementPattern: "hinge", equipment: "barbell", isCompound: true, defaultSets: 3, defaultReps: 10 },
  { name: "Power Clean", muscleGroup: "quads", secondaryMuscle: "back", movementPattern: "olympic", equipment: "barbell", isCompound: true, defaultSets: 5, defaultReps: 3 },

  // --- Dumbbell / bodyweight compounds ---
  { name: "Dumbbell Bench Press", muscleGroup: "chest", secondaryMuscle: "triceps", movementPattern: "push", equipment: "dumbbell", isCompound: true, defaultSets: 3, defaultReps: 10 },
  { name: "Dumbbell Shoulder Press", muscleGroup: "shoulders", secondaryMuscle: "triceps", movementPattern: "push", equipment: "dumbbell", isCompound: true, defaultSets: 3, defaultReps: 10 },
  { name: "Dumbbell Row", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "dumbbell", isCompound: true, defaultSets: 3, defaultReps: 10 },
  { name: "Goblet Squat", muscleGroup: "quads", secondaryMuscle: "glutes", movementPattern: "squat", equipment: "dumbbell", isCompound: true, defaultSets: 3, defaultReps: 10 },
  { name: "Bulgarian Split Squat", muscleGroup: "quads", secondaryMuscle: "glutes", movementPattern: "squat", equipment: "dumbbell", isCompound: true, defaultSets: 3, defaultReps: 8 },
  { name: "Pull-Up", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "bodyweight", isCompound: true, defaultSets: 4, defaultReps: 8 },
  { name: "Chin-Up", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "bodyweight", isCompound: true, defaultSets: 4, defaultReps: 8 },
  { name: "Dip", muscleGroup: "chest", secondaryMuscle: "triceps", movementPattern: "push", equipment: "bodyweight", isCompound: true, defaultSets: 3, defaultReps: 10 },
  { name: "Push-Up", muscleGroup: "chest", secondaryMuscle: "triceps", movementPattern: "push", equipment: "bodyweight", isCompound: true, defaultSets: 3, defaultReps: 15 },
  { name: "Inverted Row", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "bodyweight", isCompound: true, defaultSets: 3, defaultReps: 12 },
  { name: "Kettlebell Swing", muscleGroup: "hamstrings", secondaryMuscle: "glutes", movementPattern: "hinge", equipment: "kettlebell", isCompound: true, defaultSets: 4, defaultReps: 15 },

  // --- Machine / cable compounds ---
  { name: "Leg Press", muscleGroup: "quads", secondaryMuscle: "glutes", movementPattern: "squat", equipment: "machine", isCompound: true, defaultSets: 3, defaultReps: 12 },
  { name: "Lat Pulldown", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "cable", isCompound: true, defaultSets: 3, defaultReps: 12 },
  { name: "Seated Cable Row", muscleGroup: "back", secondaryMuscle: "biceps", movementPattern: "pull", equipment: "cable", isCompound: true, defaultSets: 3, defaultReps: 12 },
  { name: "Hack Squat", muscleGroup: "quads", movementPattern: "squat", equipment: "machine", isCompound: true, defaultSets: 3, defaultReps: 10 },

  // --- Isolation / accessories ---
  { name: "Bicep Curl", muscleGroup: "biceps", movementPattern: "isolation", equipment: "dumbbell", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Hammer Curl", muscleGroup: "biceps", movementPattern: "isolation", equipment: "dumbbell", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Preacher Curl", muscleGroup: "biceps", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Tricep Pushdown", muscleGroup: "triceps", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Overhead Tricep Extension", muscleGroup: "triceps", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Skull Crusher", muscleGroup: "triceps", movementPattern: "isolation", equipment: "barbell", isCompound: false, defaultSets: 3, defaultReps: 10 },
  { name: "Lateral Raise", muscleGroup: "shoulders", movementPattern: "isolation", equipment: "dumbbell", isCompound: false, defaultSets: 4, defaultReps: 15 },
  { name: "Rear Delt Fly", muscleGroup: "shoulders", movementPattern: "isolation", equipment: "dumbbell", isCompound: false, defaultSets: 3, defaultReps: 15 },
  { name: "Face Pull", muscleGroup: "shoulders", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 15 },
  { name: "Cable Fly", muscleGroup: "chest", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Leg Extension", muscleGroup: "quads", movementPattern: "isolation", equipment: "machine", isCompound: false, defaultSets: 3, defaultReps: 15 },
  { name: "Lying Leg Curl", muscleGroup: "hamstrings", movementPattern: "isolation", equipment: "machine", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Seated Leg Curl", muscleGroup: "hamstrings", movementPattern: "isolation", equipment: "machine", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Calf Raise", muscleGroup: "calves", movementPattern: "isolation", equipment: "machine", isCompound: false, defaultSets: 4, defaultReps: 15 },
  { name: "Cable Crunch", muscleGroup: "core", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 15 },
  { name: "Ab Wheel Rollout", muscleGroup: "core", movementPattern: "isolation", equipment: "bodyweight", isCompound: false, defaultSets: 3, defaultReps: 10 },
  { name: "Plank", muscleGroup: "core", movementPattern: "isolation", equipment: "bodyweight", isCompound: false, defaultSets: 3, defaultReps: 60 },
  { name: "Hanging Leg Raise", muscleGroup: "core", movementPattern: "isolation", equipment: "bodyweight", isCompound: false, defaultSets: 3, defaultReps: 12 },
  { name: "Back Extension", muscleGroup: "hamstrings", secondaryMuscle: "glutes", movementPattern: "isolation", equipment: "bodyweight", isCompound: false, defaultSets: 3, defaultReps: 15 },
  { name: "Glute Kickback", muscleGroup: "glutes", movementPattern: "isolation", equipment: "cable", isCompound: false, defaultSets: 3, defaultReps: 15 },
];

// --- Pre-built workout templates ---
export interface TemplateExercise {
  name: string;
  targetSets: number;
  targetReps: number;
}

export interface WorkoutTemplateDef {
  name: string;
  split: string;
  exercises: TemplateExercise[];
}

export const workoutTemplates: WorkoutTemplateDef[] = [
  {
    name: "Push Day",
    split: "PPL",
    exercises: [
      { name: "Bench Press", targetSets: 4, targetReps: 6 },
      { name: "Overhead Press", targetSets: 3, targetReps: 8 },
      { name: "Incline Bench Press", targetSets: 3, targetReps: 10 },
      { name: "Lateral Raise", targetSets: 4, targetReps: 15 },
      { name: "Tricep Pushdown", targetSets: 3, targetReps: 12 },
      { name: "Overhead Tricep Extension", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: "Pull Day",
    split: "PPL",
    exercises: [
      { name: "Conventional Deadlift", targetSets: 3, targetReps: 5 },
      { name: "Pull-Up", targetSets: 4, targetReps: 8 },
      { name: "Barbell Row", targetSets: 3, targetReps: 8 },
      { name: "Seated Cable Row", targetSets: 3, targetReps: 12 },
      { name: "Face Pull", targetSets: 3, targetReps: 15 },
      { name: "Bicep Curl", targetSets: 3, targetReps: 12 },
      { name: "Hammer Curl", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: "Leg Day",
    split: "PPL",
    exercises: [
      { name: "Back Squat", targetSets: 4, targetReps: 5 },
      { name: "Romanian Deadlift", targetSets: 3, targetReps: 8 },
      { name: "Bulgarian Split Squat", targetSets: 3, targetReps: 10 },
      { name: "Leg Extension", targetSets: 3, targetReps: 15 },
      { name: "Lying Leg Curl", targetSets: 3, targetReps: 12 },
      { name: "Calf Raise", targetSets: 4, targetReps: 15 },
    ],
  },
  {
    name: "Upper Body",
    split: "Upper/Lower",
    exercises: [
      { name: "Bench Press", targetSets: 4, targetReps: 6 },
      { name: "Barbell Row", targetSets: 4, targetReps: 8 },
      { name: "Overhead Press", targetSets: 3, targetReps: 8 },
      { name: "Pull-Up", targetSets: 3, targetReps: 8 },
      { name: "Lateral Raise", targetSets: 3, targetReps: 15 },
      { name: "Bicep Curl", targetSets: 3, targetReps: 12 },
      { name: "Tricep Pushdown", targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: "Lower Body",
    split: "Upper/Lower",
    exercises: [
      { name: "Back Squat", targetSets: 4, targetReps: 5 },
      { name: "Romanian Deadlift", targetSets: 3, targetReps: 8 },
      { name: "Hip Thrust", targetSets: 3, targetReps: 10 },
      { name: "Leg Press", targetSets: 3, targetReps: 12 },
      { name: "Seated Leg Curl", targetSets: 3, targetReps: 12 },
      { name: "Calf Raise", targetSets: 4, targetReps: 15 },
      { name: "Plank", targetSets: 3, targetReps: 60 },
    ],
  },
];
