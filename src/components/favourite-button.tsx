"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFavourite } from "@/server/actions/customer";

export function FavouriteButton({
  itemType,
  itemId,
  isFavourite,
}: {
  itemType: "product" | "extra_service" | "consultation_type";
  itemId: string;
  isFavourite: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(isFavourite);
  const [, startTransition] = useTransition();
  return (
    <button
      aria-label={optimistic ? "Remove from favourites" : "Save to favourites"}
      aria-pressed={optimistic}
      className={`grid h-10 w-10 place-items-center rounded-full border text-lg ${
        optimistic
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-line bg-white text-brand-600"
      }`}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFavourite(itemType, itemId);
        })
      }
    >
      {optimistic ? "♥" : "♡"}
    </button>
  );
}
