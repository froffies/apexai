import { goalLabel } from "@/lib/fitnessDefaults"

export const localeChoices = [
  { value: "AU", label: "Australia", description: "Default FSANZ nutrition data" },
  { value: "US", label: "United States", description: "Imperial units" },
  { value: "UK", label: "United Kingdom", description: "Metric units" },
  { value: "CA", label: "Canada", description: "Metric units" },
  { value: "NZ", label: "New Zealand", description: "Metric units" },
]

export const genderChoices = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other / prefer not to say" },
]

export const goalChoices = ["fat_loss", "muscle_gain", "strength", "athletic_performance"].map((goal) => ({
  value: goal,
  label: goalLabel(goal),
}))

export const activityLevelChoices = [
  { value: "lightly_active", label: "Lightly active", description: "A few active sessions a week" },
  { value: "moderately_active", label: "Moderately active", description: "Regular training and decent steps" },
  { value: "very_active", label: "Very active", description: "Hard training or active job" },
]

export const splitChoices = [
  { value: "full_body", label: "Full body" },
  { value: "upper_lower", label: "Upper / lower" },
  { value: "ppl", label: "Push / pull / legs" },
  { value: "custom", label: "Custom" },
]
