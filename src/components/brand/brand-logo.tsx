"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BrandLogoProps {
  /** Size variant */
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional custom class name for the wrapper */
  className?: string;
  /** Optional custom class name for the image element */
  imgClassName?: string;
  /** Optional direct image URL override */
  src?: string;
  /** Alt text for accessibility */
  alt?: string;
}

const DEFAULT_SOURCES: string[] = [
  ...(process.env.NEXT_PUBLIC_APP_LOGO ? [process.env.NEXT_PUBLIC_APP_LOGO] : []),
  "/logo.png",
  "/logo.svg",
  "/logo.webp",
  "/logo.jpg",
];

export function BrandLogo({
  size = "sm",
  className,
  imgClassName,
  src,
  alt = "CRM Logo",
}: BrandLogoProps) {
  const sources = src ? [src] : DEFAULT_SOURCES;
  const [sourceIndex, setSourceIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    sm: {
      wrapper: "h-8 w-8 min-w-8",
      icon: "h-4 w-4",
    },
    md: {
      wrapper: "h-10 w-10 min-w-10",
      icon: "h-5 w-5",
    },
    lg: {
      wrapper: "h-12 w-12 min-w-12",
      icon: "h-6 w-6",
    },
    xl: {
      wrapper: "h-16 w-16 min-w-16",
      icon: "h-8 w-8",
    },
  }[size];

  const handleImageError = () => {
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((prev) => prev + 1);
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
          sizeClasses.wrapper,
          className,
        )}
      >
        <MessageSquare className={sizeClasses.icon} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
        sizeClasses.wrapper,
        className,
      )}
    >
      <img
        key={sources[sourceIndex]}
        src={sources[sourceIndex]}
        alt={alt}
        className={cn("h-full w-full object-contain", imgClassName)}
        onError={handleImageError}
      />
    </div>
  );
}
