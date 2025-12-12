"use client";

type EmptyStateProps = {
  message: string;
  className?: string;
};

export default function EmptyState({ message, className = "" }: EmptyStateProps) {
  return <div className={`empty-state ${className}`}>{message}</div>;
}
