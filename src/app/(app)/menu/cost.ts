import "server-only";
import { recipeCosts } from "@/lib/reports";

/** Recipe cost (paise) per item for this outlet, used to show food-cost % in the menu list. */
export async function costOfItems(outletId: number) {
  return recipeCosts([outletId]);
}
