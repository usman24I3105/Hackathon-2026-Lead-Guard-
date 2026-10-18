import type { Availability } from "../../mock/types";

export function availabilityText(value: Availability) {
  if (value === "leave" || value === "offline") return "Away";
  return value === "busy" ? "Busy" : "Available";
}
