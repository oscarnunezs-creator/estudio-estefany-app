import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// BUTTON (tactile pill-shaped design with micro-animations)
// ============================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold tracking-wide transition-all duration-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 select-none font-sans';

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-container shadow-sm hover:shadow-md hover:shadow-primary/15',
    ghost: 'bg-transparent text-primary border border-outline-variant hover:border-primary hover:bg-surface-container-low',
    subtle: 'bg-transparent text-on-surface-variant hover:text-primary',
    danger: 'bg-error text-white hover:bg-[#a61717] shadow-sm hover:shadow-md',
  };

  const sizes = {
    sm: 'text-xs px-5 py-2.5 rounded-full',
    md: 'text-sm px-6 py-3 rounded-full',
    lg: 'text-base px-8 py-4 rounded-full',
  };

  return (
    <button
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

// ============================================================
// CARD (ultra-rounded, soft borders & subtle multi-layered shadow)
// ============================================================
interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'white' | 'cream' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className, variant = 'white', padding = 'md' }: CardProps) {
  const variants = {
    white: 'bg-white border border-outline-variant/30',
    cream: 'bg-surface-container-low border border-outline-variant/30',
    glass: 'glass-card',
  };
  const paddings = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  return (
    <div className={cn('rounded-[2rem] shadow-[0_12px_32px_-8px_rgba(35,26,19,0.02)] hover:shadow-[0_20px_40px_-10px_rgba(35,26,19,0.04)] transition-all duration-300', variants[variant], paddings[padding], className)}>
      {children}
    </div>
  );
}

// ============================================================
// INPUT (tactile pill-shape, soft-touch background & elegant label)
// ============================================================
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] px-2 font-sans">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full bg-surface-container-low border border-transparent rounded-full px-6 py-3.5 text-sm text-on-surface placeholder:text-outline/70',
          'focus:outline-none focus:border-primary focus:bg-surface-container-low/50 transition-all duration-300 font-sans',
          error && 'border-error/60 bg-error-container/20 focus:border-error',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-error font-medium px-2 mt-0.5">{error}</p>}
      {helper && !error && <p className="text-xs text-on-surface-variant/60 px-2 mt-0.5">{helper}</p>}
    </div>
  );
}

// ============================================================
// SELECT (matching pill-shape, organic look & feeling)
// ============================================================
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, className, id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={selectId} className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-[0.2em] px-2 font-sans">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full bg-surface-container-low border border-transparent rounded-full px-6 py-3.5 text-sm text-on-surface focus:outline-none focus:border-primary transition-all duration-300 appearance-none cursor-pointer font-sans',
            error && 'border-error/60 focus:border-error',
            className
          )}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
          <span className="material-symbols-outlined text-[20px] select-none">unfold_more</span>
        </div>
      </div>
      {error && <p className="text-xs text-error font-medium px-2 mt-0.5">{error}</p>}
    </div>
  );
}

// ============================================================
// BADGE (Studio Spa Minimalist Pill Badges)
// ============================================================
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'peach' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/30',
    peach: 'bg-primary-fixed text-on-primary-fixed-variant border border-outline-variant/10',
    success: 'bg-secondary-fixed/50 text-on-secondary-fixed-variant border border-secondary-fixed-dim/20',
    warning: 'bg-primary-fixed/50 text-on-primary-fixed-variant border border-outline-variant/10',
    danger: 'bg-error-container/40 text-on-error-container border border-error-container/20',
    info: 'bg-tertiary-fixed/50 text-on-tertiary-fixed-variant border border-tertiary-fixed-dim/20',
  };
  return (
    <span className={cn('inline-flex items-center px-4 py-1.5 text-xs font-semibold rounded-full select-none font-sans tracking-wide', variants[variant], className)}>
      {children}
    </span>
  );
}

// ============================================================
// MODAL (Ultra-luxury glassmorphic design)
// ============================================================
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-on-background/20 backdrop-blur-xl transition-all" />
      <div
        className={cn(
          'relative w-full glass-modal rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in',
          sizes[size]
        )}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant/20 flex-shrink-0 bg-surface/40">
            <h2 className="text-xl font-headline-sm text-on-surface tracking-wide">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-all rounded-full active:scale-90"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[20px] select-none">close</span>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 px-8 py-6 border-t border-outline-variant/20 flex-shrink-0 bg-surface/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STAT CARD (Dashboard Boutique KPI Layout with Playfair serif)
// ============================================================
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('flex flex-col gap-4 relative overflow-hidden group hover:scale-[1.01] active:scale-[0.99] cursor-default bg-white border-outline-variant/30', className)}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-[0.2em] font-sans">{title}</p>
        {icon && (
          <div className="text-primary bg-surface-container-low p-3 rounded-2xl group-hover:bg-surface-container group-hover:text-primary-container transition-all duration-300 shadow-sm">
            {icon}
          </div>
        )}
      </div>
      <div>
        <p className="text-4xl font-headline-md text-on-surface tracking-tight leading-none">{value}</p>
        {subtitle && <p className="text-xs text-on-surface-variant/60 mt-2 font-medium tracking-wide">{subtitle}</p>}
      </div>
      {trend && (
        <div className={cn('flex items-center gap-1.5 text-xs font-bold px-1 mt-1 select-none', trend.value >= 0 ? 'text-secondary' : 'text-error')}>
          <span className="material-symbols-outlined text-[16px] leading-none">
            {trend.value >= 0 ? 'trending_up' : 'trending_down'}
          </span>
          <span>{Math.abs(trend.value)}%</span>
          <span className="text-on-surface-variant/50 font-medium">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// SPINNER (Custom elegant gold spinner)
// ============================================================
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4 border-[2px]', md: 'w-8 h-8 border-[3px]', lg: 'w-12 h-12 border-[4px]' };
  return (
    <div className={cn('border-surface-container-highest border-t-primary rounded-full animate-spin', sizes[size])} />
  );
}

// ============================================================
// EMPTY STATE (Polished spa empty state)
// ============================================================
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center bg-surface-container-low/40 rounded-[2rem] border border-dashed border-outline-variant/60 animate-fade-in">
      {icon && <div className="text-outline/50 mb-4 scale-110">{icon}</div>}
      <p className="text-lg font-headline-sm text-on-surface mb-2">{title}</p>
      {description && <p className="text-sm text-on-surface-variant/70 mb-6 max-w-sm font-sans leading-relaxed">{description}</p>}
      {action && <div className="active:scale-95 transition-transform">{action}</div>}
    </div>
  );
}

// ============================================================
// ERROR STATE (Retry-capable error display)
// ============================================================
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'No se pudo cargar la información.', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center bg-error-container/10 rounded-[2rem] border border-dashed border-error/20 animate-fade-in">
      <span className="material-symbols-outlined text-[48px] text-error/50 mb-4">wifi_off</span>
      <p className="text-lg font-headline-sm text-on-surface mb-2">Error de carga</p>
      <p className="text-sm text-on-surface-variant/70 mb-6 max-w-sm font-sans leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Reintentar
        </button>
      )}
    </div>
  );
}

// ============================================================
// PAGINATION (Elegant, minimal boutique pagination)
// ============================================================
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className={cn('flex items-center justify-center gap-2 py-6 select-none', className)}>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="p-2 rounded-full border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
      >
        <span className="material-symbols-outlined text-[20px]">chevron_left</span>
      </button>

      <div className="flex items-center gap-1.5 mx-2">
        {getPages().map(page => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={cn(
              'w-9 h-9 rounded-full text-sm font-bold transition-all duration-300',
              currentPage === page
                ? 'bg-primary text-white shadow-md shadow-primary/20 scale-110'
                : 'text-on-surface-variant/60 hover:bg-surface-container hover:text-on-surface'
            )}
          >
            {page}
          </button>
        ))}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="p-2 rounded-full border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
      >
        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
      </button>
    </div>
  );
}
