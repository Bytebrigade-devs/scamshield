// Shared outline icons — one style, 2px stroke (docs/THEME-AND-TYPOGRAPHY.md §5).
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 3 18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-2.8 3.5M6.1 6.1A16 16 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
);

export const PaymentCardIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M2 9h20M6 15h4" /></Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Svg>
);

export const AlertTriangleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </Svg>
);

export const AlertCircleIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z" /></Svg>
);
