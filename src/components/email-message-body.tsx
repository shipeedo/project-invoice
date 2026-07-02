"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const EMAIL_BODY_SHELL = `
  :host {
    display: block;
  }
  .email-body-root {
    background: #ffffff;
    color: #171717;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.625;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .email-body-root img {
    max-width: 100%;
    height: auto;
  }
  .email-body-root table {
    max-width: 100%;
  }
  .email-body-root a {
    color: #2563eb;
    text-decoration: underline;
  }
`;

type EmailMessageBodyProps = {
  html: string;
  className?: string;
};

export function EmailMessageBody({ html, className }: EmailMessageBodyProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let shadow = host.shadowRoot;
    if (!shadow) {
      shadow = host.attachShadow({ mode: "open" });
    }

    shadow.innerHTML = `<style>${EMAIL_BODY_SHELL}</style><div class="email-body-root">${html}</div>`;
  }, [html]);

  return (
    <div
      ref={hostRef}
      className={cn("overflow-hidden", className)}
    />
  );
}
