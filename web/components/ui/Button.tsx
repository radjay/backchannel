"use client";

import { ReactNode, ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "icon" | "retry";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "info-button",
  icon: "info-button",
  retry: "retry-button",
};

export default function Button({
  variant = "default",
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
