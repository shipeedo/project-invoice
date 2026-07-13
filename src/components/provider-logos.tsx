// Inline brand marks for the email providers on the Connections page. Kept as
// local SVGs so we don't pull in a brand-icon dependency. Multicolor logos use
// fixed brand colors; monochrome marks inherit currentColor.

type LogoProps = {
  className?: string;
};

export function MicrosoftLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function GmailLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 52 40" className={className} aria-hidden="true">
      <path
        fill="#4285f4"
        d="M3.545 40h8.181V20.182L0 10.909v25.454C0 38.378 1.622 40 3.545 40z"
      />
      <path
        fill="#34a853"
        d="M40.273 40h8.182c1.922 0 3.545-1.622 3.545-3.636V10.909l-11.727 9.273z"
      />
      <path
        fill="#fbbc04"
        d="M40.273 3.636v16.546L52 10.909V5.455c0-5.054-5.77-7.937-9.818-4.909z"
      />
      <path
        fill="#ea4335"
        d="M11.727 20.182V3.636L26 14.318 40.273 3.636v16.546L26 30.864z"
      />
      <path
        fill="#c5221f"
        d="M0 5.455v5.454l11.727 8.773V3.636L9.818.727C5.77-2.301 0 .4 0 5.455z"
      />
    </svg>
  );
}

export function ExchangeLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#0072c6" />
      <path
        fill="#fff"
        d="M7.2 12c0-2.65 2.15-4.8 4.8-4.8 2.4 0 4.4 1.76 4.74 4.06.05.3-.19.54-.49.54H10.1v1.4h6.15c-.55 2.06-2.43 3.6-4.66 3.6-2.65 0-4.8-2.15-4.8-4.8zm2.9-1.1h4.55a3.4 3.4 0 0 0-2.65-1.3 3.4 3.4 0 0 0-1.9.58z"
      />
    </svg>
  );
}

export function YahooLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#5f01d1" />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Helvetica, Arial, sans-serif"
        fontSize="15"
        fontWeight="700"
      >
        y!
      </text>
    </svg>
  );
}

export function AppleLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.9-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.78 1.3 10.32.86 1.24 1.89 2.63 3.24 2.58 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.26 3.15-2.51.99-1.44 1.4-2.83 1.42-2.9-.03-.01-2.73-1.05-2.76-4.16zM14.47 4.6c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.55-.66.76-1.24 1.99-1.09 3.16 1.15.09 2.32-.58 3.04-1.43z" />
    </svg>
  );
}
