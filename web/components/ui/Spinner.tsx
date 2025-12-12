"use client";

import { ReloadIcon } from "@radix-ui/react-icons";

type SpinnerProps = {
  size?: number;
  className?: string;
};

export default function Spinner({ size = 32, className = "" }: SpinnerProps) {
  const sizeClass = size >= 32 ? "w-8 h-8" : size >= 24 ? "w-6 h-6" : "w-4 h-4";
  return <ReloadIcon className={`${sizeClass} spinner ${className}`} />;
}
