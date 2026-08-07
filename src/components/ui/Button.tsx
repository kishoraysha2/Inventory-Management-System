import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'icon';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Base styles with smooth transitions, touch target accessibility, and focus rings
    const baseStyles =
      'inline-flex items-center justify-center font-sans font-bold transition-all duration-150 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none select-none active:scale-[0.98] cursor-pointer';

    // Size mappings
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[32px]',
      md: 'px-4 py-2 text-xs sm:text-sm gap-2 min-h-[40px]',
      lg: 'px-5 py-2.5 text-sm sm:text-base gap-2.5 min-h-[48px]',
    };

    // Variant mappings
    const variantStyles = {
      primary:
        'bg-blue-600 text-white hover:bg-blue-700 shadow-xs hover:shadow-md border border-blue-600 active:bg-blue-800',
      secondary:
        'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 shadow-2xs',
      outline:
        'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 shadow-2xs',
      ghost:
        'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent',
      danger:
        'bg-rose-600 text-white hover:bg-rose-700 shadow-xs hover:shadow-md border border-rose-600 active:bg-rose-800',
      success:
        'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs hover:shadow-md border border-emerald-600 active:bg-emerald-800',
      icon:
        'p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl shadow-2xs aspect-square',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
