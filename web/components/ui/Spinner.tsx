"use client";

import { Loader2 } from "lucide-react";

type SpinnerProps = {
  size?: number;
  className?: string;
};

export default function Spinner({ size = 32, className = "" }: SpinnerProps) {
  return <Loader2 size={size} className={`spinner ${className}`} />;
}
